"""
Database migration script to add role and user_id columns
Run this script to update your existing database schema
"""
from database import engine, SessionLocal
from sqlalchemy import text

def migrate_database():
    """Add role column to users table and user_id column to devices table"""
    db = SessionLocal()
    
    try:
        print("Starting database migration...")
        
        # Add role column to users table if it doesn't exist
        print("Adding 'role' column to users table...")
        db.execute(text("""
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name='users' AND column_name='role'
                ) THEN
                    ALTER TABLE users ADD COLUMN role VARCHAR DEFAULT 'user' NOT NULL;
                    PRINT 'Added role column to users table';
                ELSE
                    RAISE NOTICE 'role column already exists in users table';
                END IF;
            END $$;
        """))
        db.commit()
        print("✅ Role column added/verified")
        
        # Add user_id column to devices table if it doesn't exist  
        print("Adding 'user_id' column to devices table...")
        db.execute(text("""
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name='devices' AND column_name='user_id'
                ) THEN
                    ALTER TABLE devices ADD COLUMN user_id INTEGER REFERENCES users(id);
                    RAISE NOTICE 'Added user_id column to devices table';
                ELSE
                    RAISE NOTICE 'user_id column already exists in devices table';
                END IF;
            END $$;
        """))
        db.commit()
        print("✅ user_id column added/verified")
        
        print("\n✅ Database migration completed successfully!")
        
    except Exception as e:
        print(f"\n❌ Error during migration: {e}")
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    migrate_database()
