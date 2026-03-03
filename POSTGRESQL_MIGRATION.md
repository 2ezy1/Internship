# PostgreSQL Migration Guide

**Status:** ✅ Backend configured for PostgreSQL  
**Next Step:** Install PostgreSQL on your computer

---

## What Was Done ✅

1. **✅ Updated `.env`**
   - Now uses: `postgresql+psycopg2://postgres:bisumain@localhost:5432/devices_db`
   - Removed all SQLite references

2. **✅ Installed `psycopg2-binary`**
   - PostgreSQL driver installed in Python environment

3. **✅ Updated `migrate_database.py`**
   - Now works with PostgreSQL
   - Creates all tables automatically

4. **✅ Removed SQLite**
   - Deleted `devices.db` file
   - Backend no longer uses file-based database

---

## What You Need To Do 🚀

### Step 1: Install PostgreSQL (5 minutes)

**Download & Install:**
1. Go to: https://www.postgresql.org/download/windows/
2. Download PostgreSQL 15 or 16 (latest stable)
3. Run installer
4. **IMPORTANT: Set password to `bisumain` for postgres user**
5. Keep port as 5432 (default)
6. Complete installation

**Verify Installation:**
```powershell
psql --version
```

### Step 2: Create Database (2 minutes)

**Option A: Automatic Setup (Recommended)**

Run the batch script:
```powershell
setup_postgresql.bat
```

**Option B: Manual Setup**

Open PowerShell:
```powershell
psql -U postgres
```

Then run (at psql prompt):
```sql
CREATE DATABASE devices_db;
\q
```

### Step 3: Run Migration (1 minute)

```powershell
cd backend
python migrate_database.py
```

Should output:
```
============================================================
PostgreSQL Database Migration
============================================================

🔄 Creating all tables from models...

✅ All tables created successfully!

📊 Created tables:
  ✓ users
  ✓ devices
  ✓ sensor_readings
  ✓ vfd_readings

============================================================
✅ Database migration completed successfully!
============================================================
```

### Step 4: Start Backend (1 minute)

```powershell
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Should show:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete.
```

---

## Configuration Details

### Database Connection
```
Host: localhost
Port: 5432
Database: devices_db
User: postgres
Password: bisumain
```

### Backend Configuration
**File:** `backend/.env`
```
DATABASE_URL=postgresql+psycopg2://postgres:bisumain@localhost:5432/devices_db
```

### Tables Created

| Table | Purpose |
|-------|---------|
| users | User authentication |
| devices | Device registration |
| sensor_readings | Generic sensor data |
| vfd_readings | VFD motor data (NEW) |

---

## Monitoring Data

### Using pgAdmin (GUI)

1. Find "pgAdmin 4" in Start Menu
2. Open in browser
3. Password: `bisumain`
4. Navigate: Servers → PostgreSQL → Databases → devices_db → Schemas → public → Tables

### Using Command Line

```powershell
# Connect to database
psql -U postgres -d devices_db

# View VFD data
SELECT * FROM vfd_readings ORDER BY timestamp DESC LIMIT 10;

# Exit
\q
```

### Using API

```powershell
# Get latest VFD reading for device 1
curl http://localhost:8000/devices/1/vfd-readings/latest

# Get last 20 readings
curl http://localhost:8000/devices/1/vfd-readings?limit=20
```

---

## Data Flow with PostgreSQL

```
ESP32 Slave (1 sec)
    ↓
ESP32 Master (1 sec)
    ↓
Backend Server (8000) ─→ PostgreSQL (5432)
    ↓
WebSocket Broadcast
    ↓
Frontend Client
```

---

## Troubleshooting

### PostgreSQL Service Not Running

```powershell
# Check status
Get-Service postgresql*

# Start service
Start-Service postgresql-x64-15  # Version may vary
```

### Cannot Connect to Database

```powershell
# Check if port 5432 is listening
netstat -ano | findstr :5432

# Test connection
psql -U postgres -d devices_db -c "SELECT 1;"
```

### Migration Error

```powershell
# Check PostgreSQL is running
psql -U postgres -c "SELECT version();"

# Check database exists
psql -U postgres -l

# If database missing:
psql -U postgres -c "CREATE DATABASE devices_db;"
```

### Wrong Password

```powershell
# Reset postgres password
psql -U postgres -c "ALTER USER postgres WITH PASSWORD 'bisumain';"
```

---

## Files Created/Modified

### New Files:
- `POSTGRESQL_INSTALL.md` - Detailed installation guide
- `setup_postgresql.bat` - Automatic setup script
- `POSTGRESQL_MIGRATION.md` - This file

### Modified Files:
- `backend/.env` - PostgreSQL connection string
- `backend/migrate_database.py` - PostgreSQL-compatible migration
- Removed: `backend/devices.db` - SQLite file deleted

---

## Next Steps After Setup

### 1. Upload ESP32 Code
```powershell
# Master
cd ESP32\master
pio run --target upload

# Slave 
cd ..\slave
pio run --target upload
```

### 2. Monitor Serial Output
```powershell
cd ESP32\master
platformio device monitor -b 115200
```

### 3. Check VFD Data in pgAdmin
1. Open pgAdmin
2. Query: `SELECT * FROM vfd_readings ORDER BY timestamp DESC;`
3. Data refreshes every 1 second

### 4. Test API
```powershell
# Swagger UI
http://localhost:8000/docs

# Get all devices
GET http://localhost:8000/devices/

# Get VFD readings
GET http://localhost:8000/devices/1/vfd-readings
```

---

## Complete Setup Command

```powershell
# After PostgreSQL is installed:

# 1. Setup database
.\setup_postgresql.bat

# 2. Migrate database
cd backend
python migrate_database.py

# 3. Start backend
uvicorn main:app --reload

# In another terminal:
# 4. Upload sketch to ESP32
cd ESP32\master
pio run --target upload
```

---

## Support

If you encounter issues:

1. Check `POSTGRESQL_INSTALL.md` for detailed troubleshooting
2. Verify PostgreSQL is running: `Get-Service postgresql*`
3. Verify database exists: `psql -U postgres -l`
4. Check backend logs for errors
5. Verify ESP32 is sending data (check serial monitor)

---

**Status:** Ready for PostgreSQL!  
**Next Action:** Install PostgreSQL, then run setup scripts  
**Time Estimate:** ~10 minutes total
