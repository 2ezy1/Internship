from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from dotenv import load_dotenv
import os
import sys

load_dotenv()

# Database configuration - PostgreSQL only
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:bisumain@localhost:5432/devices_db",
)

if not DATABASE_URL.startswith("postgresql"):
    print("❌ Error: Only PostgreSQL is supported. Please set DATABASE_URL to a PostgreSQL connection string.")
    print("   Example: postgresql://postgres:password@localhost:5432/devices_db")
    sys.exit(1)

# Create engine
engine = create_engine(DATABASE_URL)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for ORM models
Base = declarative_base()

# Dependency to get database session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
