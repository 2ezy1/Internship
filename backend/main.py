from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from database import engine, get_db, Base
from models import Device as DeviceModel, User as UserModel
from schemas import Device, DeviceCreate, DeviceUpdate, HealthCheck, UserLogin, LoginResponse
from typing import List
import hashlib
import os

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Device Management API", version="1.0.0")

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

@app.on_event("startup")
def ensure_default_user():
    username = os.getenv("ADMIN_USERNAME", "admin")
    password = os.getenv("ADMIN_PASSWORD", "password")
    db = next(get_db())
    try:
        existing = db.query(UserModel).filter(UserModel.username == username).first()
        if not existing:
            db.add(UserModel(username=username, hashed_password=hash_password(password)))
            db.commit()
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


@app.post("/auth/login", response_model=LoginResponse, tags=["Auth"])
def login(payload: UserLogin, db: Session = Depends(get_db)):
    user = db.query(UserModel).filter(UserModel.username == payload.username).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return LoginResponse(message="Login successful", username=user.username)

# CRUD Endpoints for Devices

@app.post("/devices/", response_model=Device, tags=["Devices"])
def create_device(device: DeviceCreate, db: Session = Depends(get_db)):
    """Create a new device"""
    try:
        db_device = DeviceModel(**device.dict())
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
def get_devices(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all devices with pagination"""
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