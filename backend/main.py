from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from database import engine, get_db, Base
from models import Device as DeviceModel, User as UserModel
from schemas import (
    Device, DeviceCreate, DeviceUpdate, HealthCheck, 
    UserLogin, LoginResponse, UserBase, UserWithDevices
)
from typing import List, Optional
import hashlib
import os
import jwt
from datetime import datetime, timedelta

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Device Management API", version="1.0.0")

# JWT Configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

# Allow React to access this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Change this to your frontend URL in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def hash_password(password: str) -> str:
    salt = os.getenv("AUTH_SALT", "device-mgmt-salt")
    return hashlib.sha256(f"{salt}:{password}".encode("utf-8")).hexdigest()

def verify_password(password: str, hashed_password: str) -> bool:
    return hash_password(password) == hashed_password

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
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
        db_device = DeviceModel(**device_data)
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

@app.get("/devices/", response_model=List[Device], tags=["Devices"])
def get_devices(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get devices for current user (requires authentication)"""
    # Users can only see their own devices
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
def update_device(device_id: int, device: DeviceUpdate, db: Session = Depends(get_db)):
    """Update a device"""
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
def delete_device(device_id: int, db: Session = Depends(get_db)):
    """Delete a device"""
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