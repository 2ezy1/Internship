import os
os.environ['DATABASE_URL'] = 'postgresql://postgres:bisumain@localhost:5432/devices_db'

from database import SessionLocal
from models import VFDReading as VFDReadingModel

db = SessionLocal()
try:
    # Count total readings
    count = db.query(VFDReadingModel).count()
    print(f"Total VFD readings: {count}")
    
    # Show latest 3 readings
    readings = db.query(VFDReadingModel).order_by(VFDReadingModel.timestamp.desc()).limit(3).all()
    print("\nLatest 3 VFD readings:")
    print("-" * 80)
    for r in readings:
        print(f"ID: {r.id:5d} | Device: {r.device_id} | Freq: {r.frequency:>6} Hz | Speed: {r.speed:>7} RPM")
        print(f"  Current: {r.current:>6} A | Voltage: {r.voltage:>6} V | Power: {r.power:>6} kW")
        print(f"  Status: {r.status} | Fault: {r.fault_code} | Time: {r.timestamp}")
        print("-" * 80)
finally:
    db.close()
