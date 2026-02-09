from pydantic import BaseModel
from typing import Optional
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
    date_installed: datetime
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class HealthCheck(BaseModel):
    status: str
    message: str


class UserLogin(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    message: str
    username: str
