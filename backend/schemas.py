from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class DeviceBase(BaseModel):
    device_name: str
    ip_address: str
    type: Optional[str] = None
    date_installed: Optional[datetime] = None

class DeviceCreate(DeviceBase):
    pass

class DeviceUpdate(BaseModel):
    device_name: Optional[str] = None
    ip_address: Optional[str] = None
    type: Optional[str] = None
    date_installed: Optional[datetime] = None

class Device(DeviceBase):
    id: int
    user_id: Optional[int] = None
    date_installed: datetime
    created_at: datetime
    updated_at: Optional[datetime] = None
    is_online: bool = False
    last_heartbeat: Optional[datetime] = None
    device_key: Optional[str] = None
    mac_address: Optional[str] = None

    class Config:
        from_attributes = True


class DeviceStatus(BaseModel):
    """Device status with computed status field"""
    id: int
    device_name: str
    ip_address: str
    type: Optional[str] = None
    is_online: bool
    last_heartbeat: Optional[datetime] = None
    status: str  # "Online", "Warning", "Offline"
    
    class Config:
        from_attributes = True

class HealthCheck(BaseModel):
    status: str
    message: str

class UserBase(BaseModel):
    id: int
    username: str
    role: str
    created_at: datetime
    
    class Config:
        from_attributes = True

class UserLogin(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    message: str
    username: str
    role: str
    user_id: int
    access_token: str
    token_type: str

class UserWithDevices(UserBase):
    devices: List[Device] = []

class DeviceWithOwner(Device):
    owner: Optional[UserBase] = None


# Sensor Reading Schemas
class SensorReadingBase(BaseModel):
    device_id: int
    temperature: Optional[str] = None
    humidity: Optional[str] = None
    pressure: Optional[str] = None
    light: Optional[str] = None
    motion: Optional[str] = None
    distance: Optional[str] = None  # Ultrasonic distance in cm
    custom_data: Optional[str] = None


class SensorReadingCreate(SensorReadingBase):
    pass


class SensorReading(SensorReadingBase):
    id: int
    timestamp: datetime

    class Config:
        from_attributes = True


# VFD (Variable Frequency Drive) Reading Schemas
class VFDReadingBase(BaseModel):
    device_id: int
    frequency: Optional[str] = None     # Hz
    speed: Optional[str] = None         # RPM
    current: Optional[str] = None       # A
    voltage: Optional[str] = None       # V
    power: Optional[str] = None         # kW
    torque: Optional[str] = None        # Nm
    status: Optional[int] = None        # 0=Stop, 1=Run, 2=Fault, 3=Ready
    fault_code: Optional[int] = None    # Fault code number
    custom_data: Optional[str] = None   # JSON string for additional data


class VFDReadingCreate(VFDReadingBase):
    pass


class VFDReading(VFDReadingBase):
    id: int
    timestamp: datetime

    class Config:
        from_attributes = True

