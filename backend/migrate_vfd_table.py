"""
Migration script to add VFD readings table to the database.
Run this script to create the vfd_readings table for storing VFD sensor data.
"""

from sqlalchemy import create_engine, text
from database import DATABASE_URL
import sys

def create_vfd_readings_table():
    """Create the vfd_readings table"""
    engine = create_engine(DATABASE_URL)
    
    # SQL to create the VFD readings table
    create_table_sql = """
    CREATE TABLE IF NOT EXISTS vfd_readings (
        id SERIAL PRIMARY KEY,
        device_id INTEGER NOT NULL,
        frequency VARCHAR,
        speed VARCHAR,
        current VARCHAR,
        voltage VARCHAR,
        power VARCHAR,
        torque VARCHAR,
        status INTEGER,
        fault_code INTEGER,
        custom_data VARCHAR,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );
    """
    
    # SQL to create index on device_id for faster queries
    create_index_sql = """
    CREATE INDEX IF NOT EXISTS idx_vfd_readings_device_id ON vfd_readings(device_id);
    """
    
    # SQL to create index on timestamp for faster time-based queries
    create_timestamp_index_sql = """
    CREATE INDEX IF NOT EXISTS idx_vfd_readings_timestamp ON vfd_readings(timestamp);
    """
    
    try:
        with engine.connect() as conn:
            print("🔄 Creating vfd_readings table...")
            conn.execute(text(create_table_sql))
            conn.commit()
            print("✅ vfd_readings table created successfully")
            
            print("🔄 Creating indexes...")
            conn.execute(text(create_index_sql))
            conn.execute(text(create_timestamp_index_sql))
            conn.commit()
            print("✅ Indexes created successfully")
            
            print("\n✅ Migration completed successfully!")
            print("   - vfd_readings table is ready to store VFD sensor data")
            print("   - Indexes created for optimal query performance")
            
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        engine.dispose()

if __name__ == "__main__":
    print("=" * 60)
    print("VFD Readings Table Migration")
    print("=" * 60)
    create_vfd_readings_table()
