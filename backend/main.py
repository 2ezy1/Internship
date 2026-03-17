from fastapi import FastAPI, Depends, HTTPException, Header, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from database import engine, get_db, Base
from models import Device as DeviceModel, User as UserModel, SensorReading as SensorReadingModel, VFDReading as VFDReadingModel
from schemas import (
    Device, DeviceCreate, DeviceUpdate, HealthCheck, DeviceStatus,
    UserLogin, LoginResponse, UserBase, UserWithDevices,
    SensorReading, SensorReadingCreate,
    VFDReading, VFDReadingCreate
)
from typing import Dict, List, Optional
import hashlib
import os
import jwt
from datetime import datetime, timedelta, timezone
import json
import asyncio
import uuid
import uvicorn
from modbus_polling import ModbusPoller

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Device Management API", version="1.0.0")

HEARTBEAT_CHECK_INTERVAL_SECONDS = int(os.getenv("HEARTBEAT_CHECK_INTERVAL_SECONDS", "15"))
HEARTBEAT_WARNING_SECONDS = int(os.getenv("HEARTBEAT_WARNING_SECONDS", "60"))
HEARTBEAT_OFFLINE_SECONDS = int(os.getenv("HEARTBEAT_OFFLINE_SECONDS", "120"))

MODBUS_ENABLED = os.getenv("MODBUS_ENABLED", "0").lower() in {"1", "true", "yes", "on"}
MODBUS_PORT = os.getenv("MODBUS_PORT", "COM5" if os.name == "nt" else "/dev/ttyUSB0")
MODBUS_BAUDRATE = int(os.getenv("MODBUS_BAUDRATE", "9600"))
MODBUS_SLAVE_ID = int(os.getenv("MODBUS_SLAVE_ID", "1"))
MODBUS_POLL_INTERVAL_MS = int(os.getenv("MODBUS_POLL_INTERVAL_MS", "1000"))
MODBUS_BRAND = os.getenv("MODBUS_BRAND", "teco")
MODBUS_DEVICE_ID = os.getenv("MODBUS_DEVICE_ID")
MODBUS_DEVICE_ID = int(MODBUS_DEVICE_ID) if MODBUS_DEVICE_ID else None
MODBUS_REGISTER_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "vfd_brand_model_registers.json")
)

# Static ESP32 test device configuration (kept in sync with ESP32 firmware)
TEST_ESP32_DEVICE_ID = 1
TEST_ESP32_DEVICE_NAME = "Testing"
TEST_ESP32_DEVICE_IP = "172.20.10.10"
TEST_ESP32_DEVICE_KEY = "69ced61b-5521-4ef7-ab17-19a2cdf14af8"
TEST_ESP32_DEVICE_MAC = "A0:B7:65:29:3D:28"

# JWT Configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 365 * 10  # 10 years (never expires)

def parse_allowed_origins() -> list[str]:
    """Parse comma-separated CORS origins from environment."""
    raw_origins = os.getenv("CORS_ALLOWED_ORIGINS", "").strip()
    if not raw_origins:
        return [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]
    origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
    return origins or ["http://localhost:5173"]


cors_allowed_origins = parse_allowed_origins()
allow_all_origins = cors_allowed_origins == ["*"]

# Allow frontend to access this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allowed_origins,
    allow_credentials=not allow_all_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== WebSocket Connection Manager ====================
class ConnectionManager:
    """Manages WebSocket connections for real-time data streaming"""
    def __init__(self):
        # Store active connections: {device_id: [websocket1, websocket2, ...]}
        self.active_connections: dict[int, List[WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, device_id: int):
        """Accept and register a new WebSocket connection"""
        await websocket.accept()
        if device_id not in self.active_connections:
            self.active_connections[device_id] = []
        self.active_connections[device_id].append(websocket)
        print(f"✅ WebSocket connected for device {device_id}. Total connections: {len(self.active_connections[device_id])}")
    
    def disconnect(self, websocket: WebSocket, device_id: int):
        """Remove a WebSocket connection"""
        if device_id in self.active_connections:
            if websocket in self.active_connections[device_id]:
                self.active_connections[device_id].remove(websocket)
                print(f"❌ WebSocket disconnected for device {device_id}. Remaining: {len(self.active_connections[device_id])}")
            if len(self.active_connections[device_id]) == 0:
                del self.active_connections[device_id]
    
    async def broadcast_to_device(self, device_id: int, message: dict):
        """Send a message to all clients watching a specific device"""
        if device_id in self.active_connections:
            disconnected = []
            for connection in self.active_connections[device_id]:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    print(f"⚠️ Error sending to client: {e}")
                    disconnected.append(connection)
            
            # Clean up disconnected clients
            for conn in disconnected:
                self.disconnect(conn, device_id)


manager = ConnectionManager()

# Track active ESP32 WebSocket sessions per device to avoid false offline flips
# when a stale socket closes right after a successful reconnect.
esp32_connection_counts: Dict[int, int] = {}
esp32_connection_lock = asyncio.Lock()


def mark_device_online(device: DeviceModel) -> None:
    """Set online state and refresh heartbeat timestamp."""
    device.is_online = True
    device.last_heartbeat = datetime.now(timezone.utc)


def heartbeat_age_seconds(last_heartbeat: Optional[datetime]) -> float:
    """Return elapsed seconds from heartbeat, tolerant of naive/aware datetimes."""
    if last_heartbeat is None:
        return float("inf")

    now_utc = datetime.now(timezone.utc)
    hb = last_heartbeat
    if hb.tzinfo is None:
        hb = hb.replace(tzinfo=timezone.utc)
    return (now_utc - hb).total_seconds()


async def register_esp32_connection(device_id: int) -> int:
    """Increment and return active WebSocket connection count for a device."""
    async with esp32_connection_lock:
        esp32_connection_counts[device_id] = esp32_connection_counts.get(device_id, 0) + 1
        return esp32_connection_counts[device_id]


async def unregister_esp32_connection(device_id: int) -> int:
    """Decrement and return active WebSocket connection count for a device."""
    async with esp32_connection_lock:
        current = esp32_connection_counts.get(device_id, 0)
        if current <= 1:
            esp32_connection_counts.pop(device_id, None)
            return 0
        esp32_connection_counts[device_id] = current - 1
        return esp32_connection_counts[device_id]


def hash_password(password: str) -> str:
    salt = os.getenv("AUTH_SALT", "device-mgmt-salt")
    return hashlib.sha256(f"{salt}:{password}".encode("utf-8")).hexdigest()

def verify_password(password: str, hashed_password: str) -> bool:
    return hash_password(password) == hashed_password

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create JWT access token with very long expiration (10 years)"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        # Default to 10 years if not specified
        expire = datetime.utcnow() + timedelta(days=365 * 10)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)) -> UserModel:
    """Get current authenticated user from JWT token"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    token = authorization.replace("Bearer ", "")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.JWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")
    
    user = db.query(UserModel).filter(UserModel.username == username).first()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def get_admin_user(current_user: UserModel = Depends(get_current_user)) -> UserModel:
    """Compatibility dependency: all authenticated users are allowed."""
    return current_user

@app.on_event("startup")
def ensure_default_user():
    """Create user and admin accounts on startup"""
    db = next(get_db())
    try:
        # Create regular user account
        user_username = "user"
        user_password = "user123"
        existing_user = db.query(UserModel).filter(UserModel.username == user_username).first()
        if not existing_user:
            regular_user = UserModel(
                username=user_username,
                hashed_password=hash_password(user_password),
                role="user"
            )
            db.add(regular_user)
            db.commit()
            print(f"✅ User account '{user_username}' created (password: {user_password})")
        else:
            print(f"ℹ️  User account '{user_username}' already exists")
        
        # Create BITSOJT admin account
        admin_username = "BITSOJT"
        admin_password = "BITS2026"
        existing_admin = db.query(UserModel).filter(UserModel.username == admin_username).first()
        if not existing_admin:
            admin_user = UserModel(
                username=admin_username,
                hashed_password=hash_password(admin_password),
                role="admin"
            )
            db.add(admin_user)
            db.commit()
            print(f"✅ Admin account '{admin_username}' created (password: {admin_password})")
        else:
            print(f"ℹ️  Admin account '{admin_username}' already exists")
    finally:
        db.close()

    if MODBUS_ENABLED:
        poller = ModbusPoller(
            port=MODBUS_PORT,
            baudrate=MODBUS_BAUDRATE,
            slave_id=MODBUS_SLAVE_ID,
            poll_interval_ms=MODBUS_POLL_INTERVAL_MS,
            register_source_path=MODBUS_REGISTER_PATH,
            brand_key=MODBUS_BRAND,
            device_id=MODBUS_DEVICE_ID,
        )
        poller.start()
        app.state.modbus_poller = poller
        print(f"✅ Modbus poller enabled on port {MODBUS_PORT}")
    else:
        print("ℹ️ Modbus poller disabled (set MODBUS_ENABLED=1 to enable)")


@app.on_event("startup")
def ensure_testing_device():
    """
    Ensure a static ESP32 test device exists with a predictable name so it
    always appears in the frontend as 'Testing' and matches the ESP32 config.
    """
    db = next(get_db())
    try:
        # Prefer assigning the device to the BITSOJT admin if available
        owner = db.query(UserModel).filter(UserModel.username == "BITSOJT").first()
        if not owner:
            owner = db.query(UserModel).first()

        device = db.query(DeviceModel).filter(DeviceModel.id == TEST_ESP32_DEVICE_ID).first()

        if device:
            updated = False
            if device.device_name != TEST_ESP32_DEVICE_NAME:
                device.device_name = TEST_ESP32_DEVICE_NAME
                updated = True
            if device.ip_address != TEST_ESP32_DEVICE_IP:
                device.ip_address = TEST_ESP32_DEVICE_IP
                updated = True
            if device.device_key != TEST_ESP32_DEVICE_KEY:
                device.device_key = TEST_ESP32_DEVICE_KEY
                updated = True
            if device.mac_address != TEST_ESP32_DEVICE_MAC:
                device.mac_address = TEST_ESP32_DEVICE_MAC
                updated = True
            if owner and device.user_id != owner.id:
                device.user_id = owner.id
                updated = True

            if updated:
                db.commit()
                print(f"✅ Updated test ESP32 device {TEST_ESP32_DEVICE_ID} -> name='{TEST_ESP32_DEVICE_NAME}'")
            else:
                print(f"ℹ️  Test ESP32 device {TEST_ESP32_DEVICE_ID} already up to date")
        else:
            # Create the test device if it does not exist
            new_device = DeviceModel(
                id=TEST_ESP32_DEVICE_ID,
                device_name=TEST_ESP32_DEVICE_NAME,
                ip_address=TEST_ESP32_DEVICE_IP,
                type="ESP32_Master",
                user_id=owner.id if owner else None,
                device_key=TEST_ESP32_DEVICE_KEY,
                mac_address=TEST_ESP32_DEVICE_MAC,
                is_online=False,
            )
            db.add(new_device)
            db.commit()
            print(f"✅ Created test ESP32 device {TEST_ESP32_DEVICE_ID} with name='{TEST_ESP32_DEVICE_NAME}'")
    except Exception as e:
        print(f"⚠️ Failed to ensure test ESP32 device: {e}")
    finally:
        db.close()


@app.on_event("shutdown")
def stop_modbus_poller():
    poller = getattr(app.state, "modbus_poller", None)
    if poller:
        poller.stop()


async def check_device_heartbeats():
    """Background task to mark devices offline when heartbeat becomes stale."""
    while True:
        try:
            await asyncio.sleep(HEARTBEAT_CHECK_INTERVAL_SECONDS)

            db = next(get_db())
            devices = db.query(DeviceModel).filter(DeviceModel.last_heartbeat.isnot(None)).all()
            has_changes = False

            for device in devices:
                if device.last_heartbeat is None:
                    continue

                seconds_since_heartbeat = heartbeat_age_seconds(device.last_heartbeat)

                if seconds_since_heartbeat > HEARTBEAT_OFFLINE_SECONDS and device.is_online:
                    device.is_online = False
                    has_changes = True
                    print(
                        f"⚠️ Device {device.id} marked offline "
                        f"(no heartbeat for {seconds_since_heartbeat:.0f}s)"
                    )

            if has_changes:
                db.commit()

            db.close()
        except Exception as e:
            print(f"❌ Error in heartbeat check task: {e}")
            await asyncio.sleep(HEARTBEAT_CHECK_INTERVAL_SECONDS)


# Start background heartbeat checker when app starts
@app.on_event("startup")
async def startup_background_tasks():
    """Create background task for device heartbeat monitoring"""
    asyncio.create_task(check_device_heartbeats())


# Health check endpoint
@app.get("/health", response_model=HealthCheck)
def health_check():
    """Check API health status"""
    return HealthCheck(status="healthy", message="API is running")

# Public static file needed by frontend builds
@app.get("/vfd_brand_model_registers.json", include_in_schema=False)
def vfd_brand_model_registers_json():
    return FileResponse(MODBUS_REGISTER_PATH, media_type="application/json")

# API root endpoint (keep separate from frontend "/")
@app.get("/api", include_in_schema=False)
def api_root():
    return {"message": "Device Management API - Running on FastAPI"}


@app.post("/auth/login", tags=["Auth"])
def login(payload: UserLogin, db: Session = Depends(get_db)):
    """Login endpoint - returns JWT token for any valid account."""
    user = db.query(UserModel).filter(UserModel.username == payload.username).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Wrong credentials")
    
    # Create access token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username, "role": user.role},
        expires_delta=access_token_expires
    )
    
    return {
        "message": "Login successful",
        "username": user.username,
        "role": user.role,
        "user_id": user.id,
        "access_token": access_token,
        "token_type": "bearer"
    }

# CRUD Endpoints for Devices

@app.post("/devices/", response_model=Device, tags=["Devices"])
def create_device(
    device: DeviceCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Create a new device (requires authentication)"""
    try:
        device_data = device.dict()
        # Assign device to current user
        device_data['user_id'] = current_user.id
        
        # If device type is ESP32_Master, auto-generate device_key
        if device_data.get('type') == 'ESP32_Master':
            device_data['device_key'] = str(uuid.uuid4())
            device_data['is_online'] = False
        
        db_device = DeviceModel(**device_data)
        db.add(db_device)
        db.commit()
        db.refresh(db_device)
        
        if db_device.device_key:
            print(f"✅ ESP32 device created with key: {db_device.device_key}")
        
        return db_device
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Device with this IP address already exists"
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/devices/", response_model=List[Device], tags=["Devices"])
def get_devices(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get all devices for any authenticated user."""
    devices = db.query(DeviceModel).offset(skip).limit(limit).all()
    return devices

@app.get("/devices/{device_id}", response_model=Device, tags=["Devices"])
def get_device(device_id: int, db: Session = Depends(get_db)):
    """Get a specific device by ID"""
    device = db.query(DeviceModel).filter(DeviceModel.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device

@app.put("/devices/{device_id}", response_model=Device, tags=["Devices"])
def update_device(
    device_id: int, 
    device: DeviceUpdate, 
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Update a device (requires authentication)."""
    db_device = db.query(DeviceModel).filter(DeviceModel.id == device_id).first()
    if not db_device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    try:
        update_data = device.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_device, field, value)
        db.add(db_device)
        db.commit()
        db.refresh(db_device)
        return db_device
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Device with this IP address already exists"
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/devices/{device_id}", tags=["Devices"])
def delete_device(
    device_id: int, 
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Delete a device (requires authentication)."""
    db_device = db.query(DeviceModel).filter(DeviceModel.id == device_id).first()
    if not db_device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    db.delete(db_device)
    db.commit()
    return {"message": "Device deleted successfully", "id": device_id}


# ==================== ADMIN ENDPOINTS ====================

@app.get("/admin/users", response_model=List[UserBase], tags=["Admin"])
def get_all_users(
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_admin_user)
):
    """Get all registered users (Admin only)"""
    users = db.query(UserModel).all()
    return users


@app.get("/admin/users/{user_id}", response_model=UserWithDevices, tags=["Admin"])
def get_user_with_devices(
    user_id: int,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_admin_user)
):
    """Get a specific user with all their devices (Admin only)"""
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@app.get("/admin/devices", response_model=List[Device], tags=["Admin"])
def get_all_devices(
    skip: int = 0,
    limit: int = 1000,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_admin_user)
):
    """Get all devices from all users (Admin only)"""
    devices = db.query(DeviceModel).offset(skip).limit(limit).all()
    return devices


@app.get("/admin/devices/with-owners", tags=["Admin"])
def get_all_devices_with_owners(
    skip: int = 0,
    limit: int = 1000,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_admin_user)
):
    """Get all devices with owner information (Admin only)"""
    devices = db.query(DeviceModel).offset(skip).limit(limit).all()
    
    result = []
    for device in devices:
        device_dict = {
            "id": device.id,
            "device_name": device.device_name,
            "ip_address": device.ip_address,
            "type": device.type,
            "date_installed": device.date_installed,
            "user_id": device.user_id,
            "created_at": device.created_at,
            "updated_at": device.updated_at,
            "owner": None
        }
        
        if device.owner:
            device_dict["owner"] = {
                "id": device.owner.id,
                "username": device.owner.username,
                "role": device.owner.role,
                "created_at": device.owner.created_at
            }
        
        result.append(device_dict)
    
    return {
        "count": len(result),
        "devices": result
    }


@app.get("/admin/stats", tags=["Admin"])
def get_system_stats(
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_admin_user)
):
    """Get system-wide statistics (Admin only)"""
    total_users = db.query(UserModel).count()
    total_devices = db.query(DeviceModel).count()
    admin_users = db.query(UserModel).filter(UserModel.role == "admin").count()
    regular_users = db.query(UserModel).filter(UserModel.role == "user").count()
    
    # Get users with device counts
    users_with_device_counts = db.query(
        UserModel.id,
        UserModel.username,
        UserModel.role
    ).all()
    
    user_device_breakdown = []
    for user in users_with_device_counts:
        device_count = db.query(DeviceModel).filter(DeviceModel.user_id == user.id).count()
        user_device_breakdown.append({
            "user_id": user.id,
            "username": user.username,
            "role": user.role,
            "device_count": device_count
        })
    
    return {
        "total_users": total_users,
        "total_devices": total_devices,
        "admin_users": admin_users,
        "regular_users": regular_users,
        "user_device_breakdown": user_device_breakdown
    }


# ==================== RS485 / SENSOR READING ENDPOINTS ====================

@app.post("/sensors/readings", response_model=SensorReading, tags=["Sensors"])
async def create_sensor_reading(
    reading: SensorReadingCreate,
    db: Session = Depends(get_db)
):
    """
    Store a sensor reading from RS485 or other IoT device.
    This endpoint can be called by RS485 to send sensor data.
    """
    try:
        # Verify device exists
        device = db.query(DeviceModel).filter(DeviceModel.id == reading.device_id).first()
        if not device:
            raise HTTPException(status_code=404, detail=f"Device {reading.device_id} not found")
        
        # Create sensor reading
        db_reading = SensorReadingModel(**reading.dict())
        db.add(db_reading)
        db.commit()
        db.refresh(db_reading)
        
        # Broadcast to all connected WebSocket clients for this device
        message = {
            "type": "sensor_update",
            "device_id": reading.device_id,
            "data": {
                "id": db_reading.id,
                "temperature": db_reading.temperature,
                "humidity": db_reading.humidity,
                "pressure": db_reading.pressure,
                "light": db_reading.light,
                "motion": db_reading.motion,
                "distance": db_reading.distance,
                "custom_data": db_reading.custom_data,
                "timestamp": db_reading.timestamp.isoformat()
            }
        }
        await manager.broadcast_to_device(reading.device_id, message)
        
        print(f"📊 Sensor reading saved for device {reading.device_id}")
        return db_reading
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error saving sensor reading: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/sensors/readings/{device_id}", response_model=List[SensorReading], tags=["Sensors"])
def get_sensor_readings(
    device_id: int,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get recent sensor readings for a specific device"""
    # Verify device exists
    device = db.query(DeviceModel).filter(DeviceModel.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    # Get recent readings
    readings = db.query(SensorReadingModel).filter(
        SensorReadingModel.device_id == device_id
    ).order_by(
        SensorReadingModel.timestamp.desc()
    ).limit(limit).all()
    
    return readings


@app.get("/sensors/latest/{device_id}", tags=["Sensors"])
def get_latest_sensor_reading(
    device_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get the most recent sensor reading for a device"""
    # Verify device exists
    device = db.query(DeviceModel).filter(DeviceModel.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    # Get latest reading
    reading = db.query(SensorReadingModel).filter(
        SensorReadingModel.device_id == device_id
    ).order_by(
        SensorReadingModel.timestamp.desc()
    ).first()
    
    if not reading:
        return {"message": "No sensor data available yet"}
    
    return {
        "id": reading.id,
        "device_id": reading.device_id,
        "temperature": reading.temperature,
        "humidity": reading.humidity,
        "pressure": reading.pressure,
        "light": reading.light,
        "motion": reading.motion,
        "custom_data": reading.custom_data,
        "timestamp": reading.timestamp
    }


# ==================== WebSocket ENDPOINTS ====================

@app.websocket("/ws/device/{device_id}")
async def websocket_device_endpoint(websocket: WebSocket, device_id: int):
    """
    WebSocket endpoint for real-time sensor data streaming.
    Frontend clients connect here to receive live updates from RS485 devices.
    """
    await manager.connect(websocket, device_id)
    
    try:
        while True:
            # Keep connection alive and listen for any client messages
            data = await websocket.receive_text()
            
            # Optional: Handle client messages (like ping/pong)
            if data == "ping":
                await websocket.send_json({"type": "pong"})
                
    except WebSocketDisconnect:
        manager.disconnect(websocket, device_id)
        print(f"🔌 Client disconnected from device {device_id}")
    except Exception as e:
        print(f"⚠️ WebSocket error: {e}")
        manager.disconnect(websocket, device_id)


@app.websocket("/ws/rs485/send/{device_id}")
async def websocket_rs485_sender(websocket: WebSocket, device_id: int):
    """
    WebSocket endpoint for RS485 to send sensor data.
    RS485 connects here and sends JSON data which is stored and broadcast to clients.
    """
    await websocket.accept()
    print(f"🔌 RS485 connected for device {device_id}")
    
    # Get DB session for this connection
    db = next(get_db())
    
    try:
        while True:
            # Receive sensor data from RS485
            data = await websocket.receive_text()
            
            try:
                sensor_data = json.loads(data)
                print(f"📡 Received data from RS485 device {device_id}: {sensor_data}")
                
                # Validate device exists
                device = db.query(DeviceModel).filter(DeviceModel.id == device_id).first()
                if not device:
                    await websocket.send_json({"error": "Device not found"})
                    continue
                
                # Refresh heartbeat whenever data arrives.
                mark_device_online(device)
                
                # Create sensor reading
                db_reading = SensorReadingModel(
                    device_id=device_id,
                    temperature=sensor_data.get("temperature"),
                    humidity=sensor_data.get("humidity"),
                    pressure=sensor_data.get("pressure"),
                    light=sensor_data.get("light"),
                    motion=sensor_data.get("motion"),
                    distance=sensor_data.get("distance"),
                    custom_data=json.dumps(sensor_data.get("custom_data")) if sensor_data.get("custom_data") else None
                )
                db.add(db_reading)
                db.commit()
                db.refresh(db_reading)
                
                # Broadcast to all connected clients
                message = {
                    "type": "sensor_update",
                    "device_id": device_id,
                    "data": {
                        "id": db_reading.id,
                        "temperature": db_reading.temperature,
                        "humidity": db_reading.humidity,
                        "pressure": db_reading.pressure,
                        "light": db_reading.light,
                        "motion": db_reading.motion,
                        "distance": db_reading.distance,
                        "custom_data": db_reading.custom_data,
                        "timestamp": db_reading.timestamp.isoformat()
                    }
                }
                await manager.broadcast_to_device(device_id, message)
                
                # Acknowledge to RS485
                await websocket.send_json({"status": "ok", "reading_id": db_reading.id})
                
            except json.JSONDecodeError:
                await websocket.send_json({"error": "Invalid JSON format"})
            except Exception as e:
                print(f"❌ Error processing RS485 data: {e}")
                await websocket.send_json({"error": str(e)})
                
    except WebSocketDisconnect:
        print(f"🔌 RS485 disconnected from device {device_id}; waiting for heartbeat timeout before offline")
    except Exception as e:
        print(f"⚠️ RS485 WebSocket error for device {device_id}: {e}")
    finally:
        db.close()


# ==================== Helper Functions ====================

def compute_device_status(device: DeviceModel) -> str:
    """Compute status primarily from heartbeat recency to reduce flapping."""
    if device.last_heartbeat is None:
        return "Warning" if device.is_online else "Offline"

    seconds_since_heartbeat = heartbeat_age_seconds(device.last_heartbeat)

    if seconds_since_heartbeat < HEARTBEAT_WARNING_SECONDS:
        return "Online"
    if seconds_since_heartbeat < HEARTBEAT_OFFLINE_SECONDS:
        return "Warning"
    return "Offline"


# ==================== WebSocket Endpoint: ESP32 Master ====================

@app.websocket("/ws/esp32/connect")
async def websocket_esp32_handler(
    websocket: WebSocket,
    mac_address: Optional[str] = None,
    device_id: Optional[int] = None,
    device_key: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    WebSocket endpoint for ESP32 Master devices with auto-registration.

    Flow:
    1. Accept WebSocket immediately (so ESP32 always gets a proper response)
    2. Lookup device by credentials → MAC address → auto-register if new
    3. Send registration result (success or error) back to ESP32
    4. ESP32 stores credentials in flash for future reconnects
    5. Normal heartbeat / VFD data exchange continues
    
    NOTE: Some WebSocket clients don't properly send query parameters during upgrade.
    If query params are missing, we wait for first message with credentials.
    """
    # Accept first so client never sees 422; we validate and send error over WS if needed
    await websocket.accept()
    client_ip = websocket.client.host

    # Fallback: if query params missing, try to get from first message
    if not mac_address or not mac_address.strip():
        print(f"⚠️  Query params missing for WebSocket from {client_ip}, attempting first-message fallback...")
        try:
            # Wait up to 2 seconds for ESP32 to send credentials in first message
            init_msg = await asyncio.wait_for(websocket.receive_json(), timeout=2.0)
            mac_address = init_msg.get("mac_address", "").strip()
            device_id = init_msg.get("device_id")
            device_key = init_msg.get("device_key", "").strip()
            
            if mac_address:
                print(f"✅ Credentials received in first message from {client_ip}: mac={mac_address}")
            else:
                print(f"❌ ESP32 WebSocket rejected: no credentials in query params or first message from {client_ip}")
                await websocket.send_json({
                    "type": "registration",
                    "status": "error",
                    "message": "Missing mac_address - provide in query params or first message"
                })
                await websocket.close(code=4000)
                return
        except asyncio.TimeoutError:
            print(f"❌ ESP32 WebSocket rejected: timeout waiting for credentials from {client_ip}")
            await websocket.send_json({
                "type": "registration",
                "status": "error",
                "message": "Timeout waiting for mac_address"
            })
            await websocket.close(code=4000)
            return
        except Exception as e:
            print(f"❌ ESP32 WebSocket rejected: error parsing first message from {client_ip}: {e}")
            await websocket.send_json({
                "type": "registration",
                "status": "error",
                "message": "Invalid credentials format"
            })
            await websocket.close(code=4000)
            return

    mac_address = mac_address.strip()
    print(f"🔌 ESP32 WebSocket from {client_ip} | mac={mac_address} | device_id={device_id} | device_key={'***' if device_key else None}")

    device = None
    is_new_device = False
    session_registered = False

    try:
        # 2. TRY TO FIND DEVICE BY EXISTING CREDENTIALS
        if device_id and device_key:
            device = db.query(DeviceModel).filter(
                DeviceModel.id == device_id,
                DeviceModel.device_key == device_key
            ).first()

            if device:
                # Keep MAC address in sync
                if device.mac_address != mac_address:
                    print(f"⚠️ MAC updated for device {device_id}: {device.mac_address} -> {mac_address}")
                    device.mac_address = mac_address
                    db.commit()

        # 3. IF NOT FOUND BY CREDENTIALS, TRY BY MAC ADDRESS
        if not device:
            device = db.query(DeviceModel).filter(DeviceModel.mac_address == mac_address).first()
            if device:
                print(f"ℹ️ Device found by MAC: {mac_address} -> Device ID {device.id}")

        # 4. IF STILL NOT FOUND, AUTO-REGISTER NEW DEVICE
        if not device:
            mac_suffix = mac_address.replace(":", "")[-6:].upper()
            device_name = f"RS485_Master_{mac_suffix}"

            try:
                device = DeviceModel(
                    device_name=device_name,
                    ip_address=client_ip,
                    type="RS485",
                    mac_address=mac_address,
                    device_key=str(uuid.uuid4()),
                    is_online=False,
                    user_id=None
                )
                db.add(device)
                db.commit()
                db.refresh(device)
                is_new_device = True
                print(f"🆕 Auto-registered new device: name={device_name}, MAC={mac_address}, IP={client_ip}, ID={device.id}")

            except IntegrityError:
                # IP address already taken by another device — find it and adopt it
                db.rollback()
                device = db.query(DeviceModel).filter(DeviceModel.ip_address == client_ip).first()
                if device:
                    # Assign this MAC to the existing record if it has none
                    if not device.mac_address:
                        device.mac_address = mac_address
                    if not device.device_key:
                        device.device_key = str(uuid.uuid4())
                    db.commit()
                    db.refresh(device)
                    print(f"ℹ️ Reused existing device ID {device.id} for IP {client_ip}")
                else:
                    await websocket.send_json({
                        "type": "registration",
                        "status": "error",
                        "message": "Registration failed: IP address conflict and device not recoverable."
                    })
                    await websocket.close(code=4001)
                    return

        # 5. KEEP IP ADDRESS IN SYNC
        if device.ip_address != client_ip:
            print(f"⚠️ IP updated for device {device.id}: {device.ip_address} -> {client_ip}")
            device.ip_address = client_ip

        # 6. MARK DEVICE ONLINE
        mark_device_online(device)
        db.commit()

        active_sessions = await register_esp32_connection(device.id)
        session_registered = True
        print(f"🔗 ESP32 device {device.id} active sessions: {active_sessions}")

        # 7. SEND CREDENTIALS BACK TO ESP32
        registration_response = {
            "type": "registration",
            "status": "success",
            "device_id": device.id,
            "device_key": device.device_key,
            "device_name": device.device_name,
            "is_new_device": is_new_device,
            "message": "Device registered successfully" if is_new_device else "Device authenticated"
        }
        await websocket.send_json(registration_response)

        if is_new_device:
            print(f"✅ New ESP32 device {device.id} ({device.device_name}) registered from {client_ip}")
        else:
            print(f"✅ ESP32 device {device.id} ({device.device_name}) authenticated from {client_ip}")
    except Exception as e:
        print(f"❌ ESP32 WebSocket setup error: {e}")
        import traceback
        traceback.print_exc()
        if device is not None and session_registered:
            await unregister_esp32_connection(device.id)
        try:
            await websocket.send_json({
                "type": "registration",
                "status": "error",
                "message": str(e)
            })
        except Exception:
            pass
        await websocket.close(code=1011)
        return

    # 8. LISTEN FOR MESSAGES
    try:
        while True:
            message = await websocket.receive_json()
            message_type = message.get("type")
            
            if message_type == "heartbeat":
                # Update last heartbeat timestamp and ensure device is online
                mark_device_online(device)
                db.commit()
                print(f"💖 Heartbeat from device {device.id}: RSSI={message.get('rssi', 'N/A')}")
                
                # Send acknowledgment
                await websocket.send_json({"status": "ok", "type": "heartbeat_ack"})
                
            elif message_type == "sensor_data":
                # Process sensor data from ESP32
                try:
                    sensor_data = message.get("data", {})
                    
                    # Only accept VFD data (must contain frequency, speed, etc.)
                    is_vfd_data = any(key in sensor_data for key in ["frequency", "speed", "current", "voltage", "power", "torque"])
                    
                    if not is_vfd_data:
                        # Reject non-VFD sensor data
                        print(f"⚠️ Rejected non-VFD sensor data from device {device.id}")
                        await websocket.send_json({
                            "status": "error",
                            "error": "Only VFD data is accepted. Sensor-only data rejected."
                        })
                        continue
                    
                    # Update last activity so device appears online and status stays fresh
                    mark_device_online(device)
                    print(f"✅ Device {device.id} marked online - heartbeat updated")
                    
                    # Create VFD reading record
                    db_reading = VFDReadingModel(
                        device_id=device.id,
                        frequency=str(sensor_data.get("frequency")) if sensor_data.get("frequency") is not None else None,
                        speed=str(sensor_data.get("speed")) if sensor_data.get("speed") is not None else None,
                        current=str(sensor_data.get("current")) if sensor_data.get("current") is not None else None,
                        voltage=str(sensor_data.get("voltage")) if sensor_data.get("voltage") is not None else None,
                        power=str(sensor_data.get("power")) if sensor_data.get("power") is not None else None,
                        torque=str(sensor_data.get("torque")) if sensor_data.get("torque") is not None else None,
                        status=sensor_data.get("status"),
                        fault_code=sensor_data.get("faultCode"),
                        custom_data=json.dumps({
                            "rssi": message.get("rssi"),
                            "uptime": message.get("uptime"),
                            "verified": True
                        })
                    )
                    db.add(db_reading)
                    db.commit()  # This commits both device status and reading
                    db.refresh(db_reading)
                    
                    print(f"📡 VFD data from device {device.id}: Freq={sensor_data.get('frequency')}Hz, Speed={sensor_data.get('speed')}RPM, Status={sensor_data.get('status')}")
                    
                    # Broadcast to all connected frontend clients watching this device
                    broadcast_message = {
                        "type": "vfd_update",
                        "device_id": device.id,
                        "data": {
                            "id": db_reading.id,
                            "frequency": db_reading.frequency,
                            "speed": db_reading.speed,
                            "current": db_reading.current,
                            "voltage": db_reading.voltage,
                            "power": db_reading.power,
                            "torque": db_reading.torque,
                            "status": db_reading.status,
                            "fault_code": db_reading.fault_code,
                            "custom_data": db_reading.custom_data,
                            "timestamp": db_reading.timestamp.isoformat()
                        }
                    }
                    await manager.broadcast_to_device(device.id, broadcast_message)
                    
                    # Acknowledge to ESP32
                    await websocket.send_json({"status": "ok", "reading_id": db_reading.id, "type": "vfd"})
                    
                except Exception as e:
                    print(f"❌ Error processing VFD data: {e}")
                    import traceback
                    traceback.print_exc()
                    await websocket.send_json({"error": str(e)})
            
            else:
                print(f"⚠️ Unknown message type: {message_type}")
                await websocket.send_json({"error": "Unknown message type"})
    
    except WebSocketDisconnect:
        remaining = await unregister_esp32_connection(device.id)
        print(
            f"🔌 ESP32 device {device.id} disconnected; active sessions={remaining}. "
            "Status will follow heartbeat timeout."
        )
    except Exception as e:
        remaining = await unregister_esp32_connection(device.id)
        print(
            f"⚠️ ESP32 WebSocket error for device {device.id}: {e}; "
            f"active sessions={remaining}."
        )


# ==================== New API Endpoints ====================

@app.post("/devices/{device_id}/regenerate-key", tags=["Devices"])
def regenerate_device_key(
    device_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_admin_user)
):
    """Regenerate device key for security purposes (admin only)"""
    device = db.query(DeviceModel).filter(DeviceModel.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    new_key = str(uuid.uuid4())
    device.device_key = new_key
    db.commit()
    db.refresh(device)
    
    return {
        "message": "Device key regenerated",
        "device_id": device_id,
        "device_key": new_key
    }


@app.get("/devices/{device_id}/status", response_model=DeviceStatus, tags=["Devices"])
def get_device_status(device_id: int, db: Session = Depends(get_db)):
    """Get device status including online/offline and last heartbeat"""
    device = db.query(DeviceModel).filter(DeviceModel.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    status = compute_device_status(device)
    
    return DeviceStatus(
        id=device.id,
        device_name=device.device_name,
        ip_address=device.ip_address,
        type=device.type,
        is_online=device.is_online,
        last_heartbeat=device.last_heartbeat,
        status=status
    )


@app.post("/devices/{device_id}/initialize-esp32", tags=["Devices"])
def initialize_esp32_device(
    device_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_admin_user)
):
    """
    Initialize ESP32 device with a device key.
    Called when device is first registered.
    Returns the device key for programming into ESP32.
    """
    device = db.query(DeviceModel).filter(DeviceModel.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    if device.device_key:
        raise HTTPException(status_code=400, detail="Device already initialized")
    
    # Generate unique device key
    device_key = str(uuid.uuid4())
    device.device_key = device_key
    db.commit()
    db.refresh(device)
    
    print(f"✅ Device {device_id} initialized with key: {device_key}")
    
    return {
        "message": "Device initialized successfully",
        "device_id": device_id,
        "device_key": device_key,
        "setup_instructions": {
            "step1": "Copy the device_key above",
            "step2": "Upload ESP32 firmware with this device_key in config",
            "step3": "Set static IP to match ip_address field",
            "step4": "Device will auto-connect to server via WebSocket"
        }
    }


# ==================== VFD Readings Endpoints ====================

@app.get("/devices/{device_id}/vfd-readings", response_model=List[VFDReading], tags=["VFD"])
def get_vfd_readings(
    device_id: int,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Get VFD readings for a specific device (most recent first)"""
    device = db.query(DeviceModel).filter(DeviceModel.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    readings = db.query(VFDReadingModel).filter(
        VFDReadingModel.device_id == device_id
    ).order_by(VFDReadingModel.timestamp.desc()).limit(limit).all()
    
    return readings


@app.get("/devices/{device_id}/vfd-readings/latest", response_model=VFDReading, tags=["VFD"])
def get_latest_vfd_reading(device_id: int, db: Session = Depends(get_db)):
    """Get the most recent VFD reading for a device"""
    device = db.query(DeviceModel).filter(DeviceModel.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    reading = db.query(VFDReadingModel).filter(
        VFDReadingModel.device_id == device_id
    ).order_by(VFDReadingModel.timestamp.desc()).first()
    
    if not reading:
        raise HTTPException(status_code=404, detail="No VFD readings found for this device")
    
    return reading


@app.delete("/devices/{device_id}/vfd-readings", tags=["VFD"])
def delete_vfd_readings(
    device_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_admin_user)
):
    """Delete all VFD readings for a device (admin only)"""
    device = db.query(DeviceModel).filter(DeviceModel.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    count = db.query(VFDReadingModel).filter(VFDReadingModel.device_id == device_id).delete()
    db.commit()
    
    return {"message": f"Deleted {count} VFD readings for device {device_id}"}


# Serve built frontend (SPA) from backend on the same port (8000)
FRONTEND_DIST_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
)

if os.path.isdir(FRONTEND_DIST_DIR):
    app.mount(
        "/assets",
        StaticFiles(directory=os.path.join(FRONTEND_DIST_DIR, "assets")),
        name="assets",
    )

    @app.get("/", include_in_schema=False)
    async def serve_frontend_root():
        return FileResponse(os.path.join(FRONTEND_DIST_DIR, "index.html"))

    # Catch-all for SPA routes (e.g. /home). Do not shadow API routes.
    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_frontend_catch_all(full_path: str):
        if full_path.startswith(
            (
                "api",
                "auth",
                "devices",
                "sensors",
                "vfd",
                "docs",
                "redoc",
                "openapi.json",
            )
        ):
            raise HTTPException(status_code=404, detail="Not Found")
        return FileResponse(os.path.join(FRONTEND_DIST_DIR, "index.html"))


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)

