from fastapi import FastAPI, Depends, HTTPException, Header, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from database import engine, get_db, Base
from models import Device as DeviceModel, User as UserModel, SensorReading as SensorReadingModel
from schemas import (
    Device, DeviceCreate, DeviceUpdate, HealthCheck, DeviceStatus,
    UserLogin, LoginResponse, UserBase, UserWithDevices,
    SensorReading, SensorReadingCreate
)
from typing import List, Optional
import hashlib
import os
import jwt
from datetime import datetime, timedelta
import json
import asyncio
import uuid
from modbus_polling import ModbusPoller

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Device Management API", version="1.0.0")

MODBUS_PORT = os.getenv("MODBUS_PORT", "COM5")
MODBUS_BAUDRATE = int(os.getenv("MODBUS_BAUDRATE", "9600"))
MODBUS_SLAVE_ID = int(os.getenv("MODBUS_SLAVE_ID", "1"))
MODBUS_POLL_INTERVAL_MS = int(os.getenv("MODBUS_POLL_INTERVAL_MS", "1000"))
MODBUS_BRAND = os.getenv("MODBUS_BRAND", "teco")
MODBUS_DEVICE_ID = os.getenv("MODBUS_DEVICE_ID")
MODBUS_DEVICE_ID = int(MODBUS_DEVICE_ID) if MODBUS_DEVICE_ID else None
MODBUS_REGISTER_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "vfd_brand_model_registers.json")
)

# JWT Configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 365 * 10  # 10 years (never expires)

# Allow React to access this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Change this to your frontend URL in production
    allow_credentials=True,
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
    """Verify that current user is an admin"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
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


@app.on_event("shutdown")
def stop_modbus_poller():
    poller = getattr(app.state, "modbus_poller", None)
    if poller:
        poller.stop()


async def check_device_heartbeats():
    """Background task to mark devices as offline if heartbeat is missing"""
    while True:
        try:
            await asyncio.sleep(30)  # Check every 30 seconds
            
            db = next(get_db())
            devices = db.query(DeviceModel).filter(DeviceModel.is_online == True).all()
            
            for device in devices:
                if device.last_heartbeat is None:
                    continue
                
                seconds_since_heartbeat = (datetime.utcnow() - device.last_heartbeat).total_seconds()
                
                # Mark as offline if no heartbeat for 5 minutes
                if seconds_since_heartbeat > 300:
                    device.is_online = False
                    db.commit()
                    print(f"⚠️ Device {device.id} marked offline (no heartbeat for {seconds_since_heartbeat:.0f}s)")
            
            db.close()
        except Exception as e:
            print(f"❌ Error in heartbeat check task: {e}")
            await asyncio.sleep(30)


# Start background heartbeat checker when app starts
@asyncio.get_running_loop()
def start_background_tasks():
    """Start background tasks on app startup"""
    asyncio.create_task(check_device_heartbeats())


# Alternative: Create task on startup event
@app.on_event("startup")
async def startup_background_tasks():
    """Create background task for device heartbeat monitoring"""
    asyncio.create_task(check_device_heartbeats())


# Health check endpoint
@app.get("/health", response_model=HealthCheck)
def health_check():
    """Check API health status"""
    return HealthCheck(status="healthy", message="API is running")

# Root endpoint
@app.get("/")
def read_root():
    return {"message": "Device Management API - Running on FastAPI"}


@app.post("/auth/login", tags=["Auth"])
def login(payload: UserLogin, db: Session = Depends(get_db)):
    """Login endpoint - returns JWT token (only user and BITSOJT accounts allowed)"""
    # Only allow specific accounts to log in
    allowed_accounts = ["user", "BITSOJT"]
    if payload.username not in allowed_accounts:
        raise HTTPException(
            status_code=403, 
            detail="Access denied. Only authorized accounts can log into this system."
        )
    
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
    """Get devices (all devices for admin, own devices for regular users)"""
    if current_user.role == "admin":
        # Admins can see all devices
        devices = db.query(DeviceModel).offset(skip).limit(limit).all()
    else:
        # Regular users can only see their own devices
        devices = db.query(DeviceModel).filter(
            DeviceModel.user_id == current_user.id
        ).offset(skip).limit(limit).all()
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
    """Update a device (requires authentication and ownership)"""
    db_device = db.query(DeviceModel).filter(DeviceModel.id == device_id).first()
    if not db_device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    # Check if user owns the device or is an admin
    if db_device.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="You do not have permission to update this device")
    
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
    """Delete a device (requires authentication and ownership)"""
    db_device = db.query(DeviceModel).filter(DeviceModel.id == device_id).first()
    if not db_device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    # Check if user owns the device or is an admin
    if db_device.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="You do not have permission to delete this device")
    
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
    # Verify device exists and user has access
    device = db.query(DeviceModel).filter(DeviceModel.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    # Check if user owns this device (or is admin)
    if device.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    
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
    # Verify device exists and user has access
    device = db.query(DeviceModel).filter(DeviceModel.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    # Check if user owns this device (or is admin)
    if device.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    
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
        print(f"🔌 RS485 disconnected from device {device_id}")
    except Exception as e:
        print(f"⚠️ RS485 WebSocket error: {e}")
    finally:
        db.close()


# ==================== Helper Functions ====================

def compute_device_status(device: DeviceModel) -> str:
    """Compute device status based on online flag and last heartbeat"""
    if not device.is_online:
        return "Offline"
    
    if device.last_heartbeat is None:
        return "Warning"
    
    seconds_since_heartbeat = (datetime.utcnow() - device.last_heartbeat).total_seconds()
    
    if seconds_since_heartbeat < 60:  # Less than 1 minute
        return "Online"
    elif seconds_since_heartbeat < 300:  # Less than 5 minutes
        return "Warning"
    else:
        return "Offline"


# ==================== WebSocket Endpoint: ESP32 Master ====================

@app.websocket("/ws/esp32/connect")
async def websocket_esp32_handler(websocket: WebSocket, device_id: int, device_key: str, db: Session = Depends(get_db)):
    """
    WebSocket endpoint for ESP32 Master devices to send sensor data.
    Validates device_key and IP address before accepting connection.
    Stores sensor readings and broadcasts to connected clients.
    """
    
    # 1. VERIFY DEVICE EXISTS AND KEY MATCHES
    device = db.query(DeviceModel).filter(
        DeviceModel.id == device_id,
        DeviceModel.device_key == device_key
    ).first()
    
    if not device:
        print(f"❌ ESP32 auth failed: Invalid device ID {device_id} or key")
        await websocket.close(code=4000, reason="Invalid device or key")
        return
    
    # 2. VERIFY IP ADDRESS MATCHES (security check)
    client_ip = websocket.client.host
    if client_ip != device.ip_address:
        print(f"⚠️ IP mismatch for device {device_id}: {client_ip} vs {device.ip_address}")
        await websocket.close(code=4001, reason="IP address mismatch")
        return
    
    # 3. ACCEPT CONNECTION & SET ONLINE
    await websocket.accept()
    device.is_online = True
    device.last_heartbeat = datetime.utcnow()
    db.commit()
    print(f"✅ ESP32 device {device_id} connected from {client_ip}")
    
    # 4. LISTEN FOR MESSAGES
    try:
        while True:
            message = await websocket.receive_json()
            message_type = message.get("type")
            
            if message_type == "heartbeat":
                # Update last heartbeat timestamp
                device.last_heartbeat = datetime.utcnow()
                db.commit()
                print(f"💖 Heartbeat from device {device_id}: RSSI={message.get('rssi', 'N/A')}")
                
                # Send acknowledgment
                await websocket.send_json({"status": "ok", "type": "heartbeat_ack"})
                
            elif message_type == "sensor_data":
                # Process sensor data from ESP32
                try:
                    sensor_data = message.get("data", {})
                    
                    # Create sensor reading record
                    db_reading = SensorReadingModel(
                        device_id=device_id,
                        temperature=str(sensor_data.get("temperature")),
                        humidity=str(sensor_data.get("humidity")),
                        pressure=str(sensor_data.get("pressure")),
                        light=str(sensor_data.get("light")),
                        motion=str(sensor_data.get("motion")),
                        distance=str(sensor_data.get("distance")),
                        custom_data=json.dumps({
                            "rssi": message.get("rssi"),
                            "uptime": message.get("uptime"),
                            "verified": True
                        })
                    )
                    db.add(db_reading)
                    db.commit()
                    db.refresh(db_reading)
                    
                    print(f"📡 Sensor data from device {device_id}: {sensor_data}")
                    
                    # Broadcast to all connected frontend clients watching this device
                    broadcast_message = {
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
                    await manager.broadcast_to_device(device_id, broadcast_message)
                    
                    # Acknowledge to ESP32
                    await websocket.send_json({"status": "ok", "reading_id": db_reading.id})
                    
                except Exception as e:
                    print(f"❌ Error processing sensor data: {e}")
                    await websocket.send_json({"error": str(e)})
            
            else:
                print(f"⚠️ Unknown message type: {message_type}")
                await websocket.send_json({"error": "Unknown message type"})
    
    except WebSocketDisconnect:
        device.is_online = False
        db.commit()
        print(f"🔌 ESP32 device {device_id} disconnected")
    except Exception as e:
        print(f"⚠️ ESP32 WebSocket error: {e}")
        device.is_online = False
        db.commit()


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
