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
