"""
Database migration script for PostgreSQL
Creates and updates all necessary tables
"""
from database import engine, SessionLocal
from models import Base
import sys

def migrate_database():
    """Create all tables from SQLAlchemy models"""
    db = SessionLocal()
    
    try:
        print("=" * 60)
        print("PostgreSQL Database Migration")
        print("=" * 60)
        print("\n🔄 Creating all tables from models...")
        
        # Create all tables defined in models
        Base.metadata.create_all(bind=engine)
        
        print("\n✅ All tables created successfully!")
        print("\n📊 Created tables:")
        print("  ✓ users")
        print("  ✓ devices")
        print("  ✓ sensor_readings")
        print("  ✓ vfd_readings")
        
        print("\n" + "=" * 60)
        print("✅ Database migration completed successfully!")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n❌ Error during migration: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    migrate_database()
