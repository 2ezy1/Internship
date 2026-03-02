#!/usr/bin/env python
"""Verify that user and admin accounts exist in the database with correct information"""

from database import get_db, Base, engine
from models import User as UserModel
import hashlib
import os

# Create tables if they don't exist
Base.metadata.create_all(bind=engine)

def hash_password(password: str) -> str:
    """Hash password using SHA-256 with salt (same as main.py)"""
    salt = os.getenv("AUTH_SALT", "device-mgmt-salt")
    return hashlib.sha256(f"{salt}:{password}".encode("utf-8")).hexdigest()

def verify_accounts():
    """Check if user and admin accounts exist and are correctly configured"""
    db = next(get_db())
    
    try:
        print("=" * 60)
        print("DATABASE ACCOUNT VERIFICATION")
        print("=" * 60)
        
        # Check user account
        user = db.query(UserModel).filter(UserModel.username == "user").first()
        if user:
            print("\n✅ USER ACCOUNT FOUND")
            print(f"   Username: {user.username}")
            print(f"   Role: {user.role}")
            print(f"   ID: {user.id}")
            
            # Verify password
            expected_hash = hash_password("user123")
            if user.hashed_password == expected_hash:
                print(f"   Password: ✅ CORRECT (matches 'user123')")
            else:
                print(f"   Password: ❌ MISMATCH")
        else:
            print("\n❌ USER ACCOUNT NOT FOUND - Creating it now...")
            new_user = UserModel(
                username="user",
                hashed_password=hash_password("user123"),
                role="user"
            )
            db.add(new_user)
            db.commit()
            print("✅ User account created successfully")
        
        # Check admin account
        admin = db.query(UserModel).filter(UserModel.username == "BITSOJT").first()
        if admin:
            print("\n✅ ADMIN ACCOUNT FOUND")
            print(f"   Username: {admin.username}")
            print(f"   Role: {admin.role}")
            print(f"   ID: {admin.id}")
            
            # Verify password
            expected_hash = hash_password("BITS2026")
            if admin.hashed_password == expected_hash:
                print(f"   Password: ✅ CORRECT (matches 'BITS2026')")
            else:
                print(f"   Password: ❌ MISMATCH")
        else:
            print("\n❌ ADMIN ACCOUNT NOT FOUND - Creating it now...")
            new_admin = UserModel(
                username="BITSOJT",
                hashed_password=hash_password("BITS2026"),
                role="admin"
            )
            db.add(new_admin)
            db.commit()
            print("✅ Admin account created successfully")
        
        # Summary
        print("\n" + "=" * 60)
        total_users = db.query(UserModel).count()
        print(f"Total accounts in database: {total_users}")
        print("=" * 60 + "\n")
        
    finally:
        db.close()

if __name__ == "__main__":
    verify_accounts()
