"""
One-time script: drop and recreate the `devices` table so its columns match the SQLAlchemy model.
Run from backend dir: python fix_devices_table.py
"""
from database import engine, Base, DATABASE_URL
from models import Device
from sqlalchemy import text

# Drop the devices table so it can be recreated with the correct schema
with engine.connect() as conn:
    # SQLite doesn't support CASCADE, so we just drop the table
    if DATABASE_URL.startswith("sqlite"):
        conn.execute(text("DROP TABLE IF EXISTS devices"))
    else:
        conn.execute(text("DROP TABLE IF EXISTS devices CASCADE"))
    conn.commit()
    print("Dropped table 'devices'.")

# Recreate the devices table with correct columns
Device.__table__.create(engine, checkfirst=True)
print("Created table 'devices' with correct schema. Restart the API and try again.")
