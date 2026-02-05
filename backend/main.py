from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from database import engine, get_db, Base
from models import Device as DeviceModel
from schemas import Device, DeviceCreate, DeviceUpdate, HealthCheck
from typing import List

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

# Health check endpoint
@app.get("/health", response_model=HealthCheck)
def health_check():
    """Check API health status"""
    return HealthCheck(status="healthy", message="API is running")

# Root endpoint
@app.get("/")
def read_root():
    return {"message": "Device Management API - Running on FastAPI"}

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