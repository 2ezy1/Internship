from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="user", nullable=False)  # "user" or "admin"
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationship to devices
    devices = relationship("Device", back_populates="owner")


class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    device_name = Column(String, unique=False, index=True, nullable=False)
    ip_address = Column(String, unique=True, index=True, nullable=False)
    type = Column(String, nullable=True)
    date_installed = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationship to user
    owner = relationship("User", back_populates="devices")
    # Relationship to sensor readings
    sensor_readings = relationship("SensorReading", back_populates="device", cascade="all, delete-orphan")


class SensorReading(Base):
    __tablename__ = "sensor_readings"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=False)
    temperature = Column(String, nullable=True)  # Temperature in Celsius
    humidity = Column(String, nullable=True)     # Humidity percentage
    pressure = Column(String, nullable=True)     # Pressure in hPa
    light = Column(String, nullable=True)        # Light level
    motion = Column(String, nullable=True)       # Motion detected (boolean)
    distance = Column(String, nullable=True)     # Ultrasonic distance in cm
    custom_data = Column(String, nullable=True)  # JSON string for additional data
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # Relationship to device
    device = relationship("Device", back_populates="sensor_readings")
