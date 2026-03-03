# PostgreSQL Setup for Windows

## Quick Setup Instructions

### Step 1: Download PostgreSQL

1. Go to: https://www.postgresql.org/download/windows/
2. Download **PostgreSQL 15 or 16** (latest stable version)
3. Run the installer

### Step 2: Install PostgreSQL

**During installation:**
1. Choose installation directory (default is fine)
2. **Important: Set password for `postgres` user to: `bisumain`**
3. Port: Keep default **5432**
4. Locale: [Your system locale]
5. Stack Builder: You can skip this

### Step 3: Verify Installation

Open PowerShell and run:
```powershell
psql --version
```

Should show: `psql (PostgreSQL) 15.x` or similar

### Step 4: Create Database

**Option A: Using psql (Command Line)**

```powershell
# Connect to PostgreSQL
psql -U postgres

# Once connected (psql prompt), run:
CREATE DATABASE devices_db;
\q
```

**Option B: Using pgAdmin**

1. Open pgAdmin (installed with PostgreSQL)
2. Right-click "Databases" → Create → Database
3. Name: `devices_db`
4. Owner: `postgres`
5. Click Save

### Step 5: Verify Connection

```powershell
psql -U postgres -d devices_db -c "SELECT 1 as connection_test;"
```

Should output:
```
 connection_test
-----------------
               1
(1 row)
```

## Running the Backend

```powershell
# Navigate to backend directory
cd backend

# Run database migration
python migrate_database.py

# Start the server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## Troubleshooting

### psql: command not found

PostgreSQL is not on PATH. Add it manually:

```powershell
$env:Path += ";C:\Program Files\PostgreSQL\15\bin"
```

Or use full path:
```powershell
"C:\Program Files\PostgreSQL\15\bin\psql" -U postgres
```

### Cannot connect to database

**Check if PostgreSQL service is running:**

```powershell
# Windows Services - search for "Services"
# Look for "postgresql-x64-15" or similar
# It should be "Running"

# Or via PowerShell:
Get-Service postgresql*

# Start if not running:
Start-Service postgresql-x64-15  # Version may vary
```

### Wrong password for postgres user

```powershell
# Reset postgres password using psql
psql -U postgres -c "ALTER USER postgres WITH PASSWORD 'bisumain';"
```

### Port 5432 already in use

```powershell
# Find what's using port 5432
netstat -ano | findstr :5432

# Kill the process:
taskkill /PID <PID> /F

# Change PostgreSQL port (in data/postgresql.conf) or change backend config
```

### Database doesn't exist error

```powershell
# Create the database:
psql -U postgres -c "CREATE DATABASE devices_db;"

# Run migration:
python migrate_database.py
```

## Configuration

Your `.env` file is already configured for PostgreSQL:

```env
DATABASE_URL=postgresql+psycopg2://postgres:bisumain@localhost:5432/devices_db
```

Change the password if you used a different one:
```env
DATABASE_URL=postgresql+psycopg2://postgres:YOUR_PASSWORD@localhost:5432/devices_db
```

## Using pgAdmin

pgAdmin is included with PostgreSQL installation.

1. Look for "pgAdmin 4" in Start Menu
2. Default browser opens to http://localhost:5050
3. Password: `bisumain` (or your chosen password)
4. Browse: Servers → PostgreSQL → Databases → devices_db

### View VFD Data in pgAdmin

```sql
-- Get latest VFD readings
SELECT 
    id,
    device_id,
    frequency || ' Hz' as frequency,
    speed || ' RPM' as speed,
    current || ' A' as current,
    voltage || ' V' as voltage,
    status,
    timestamp
FROM vfd_readings
ORDER BY timestamp DESC
LIMIT 20;

-- Real-time monitoring (refresh every 2 seconds in pgAdmin)
SELECT 
    device_id,
    COUNT(*) as total_readings,
    MAX(timestamp) as last_reading,
    AVG(CAST(frequency AS NUMERIC)) as avg_frequency
FROM vfd_readings
GROUP BY device_id;
```

## Quick Commands

```powershell
# Connect to database
psql -U postgres -d devices_db

# Run SQL file
psql -U postgres -d devices_db -f query.sql

# Backup database
pg_dump -U postgres devices_db -f backup.sql

# Restore from backup
psql -U postgres -d devices_db -f backup.sql

# Delete and recreate database
dropdb -U postgres devices_db
createdb -U postgres -T template0 devices_db

# Check database size
psql -U postgres -c "SELECT pg_size_pretty(pg_database_size('devices_db'));"
```

## Complete Setup Checklist

- [ ] Download PostgreSQL 15/16
- [ ] Run PostgreSQL installer
- [ ] Set `postgres` password to `bisumain`
- [ ] PostgreSQL service running (port 5432)
- [ ] Created `devices_db` database
- [ ] Backend `.env` configured (already done)
- [ ] `psycopg2-binary` installed (already done)
- [ ] Run: `python migrate_database.py`
- [ ] Start backend: `uvicorn main:app --reload`
- [ ] Test: Open http://localhost:8000/docs
- [ ] Test VFD data flow

## Next Steps

Once PostgreSQL is set up:

1. **Upload ESP32 code:**
   - Slave: every 1 second
   - Master: every 1 second

2. **Monitor data in pgAdmin:**
   - Real-time VFD readings
   - Device status
   - Data statistics

3. **Access API:**
   - http://localhost:8000/docs (Swagger UI)
   - http://localhost:8000/redoc (ReDoc)

---

**After installing PostgreSQL, continue with the backend setup!**
