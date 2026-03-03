# Using pgAdmin with Your Database

## Current Database Status

Your system is **currently using SQLite** (`devices.db`), which is a file-based database. 

**pgAdmin is for PostgreSQL only** - it cannot work with SQLite databases.

## To Use pgAdmin: Switch to PostgreSQL

### Step 1: Install PostgreSQL (if not already installed)

**On Windows:**
1. Download PostgreSQL from: https://www.postgresql.org/download/windows/
2. Run the installer
3. Set password for `postgres` user (e.g., `bisumain`)
4. Default port: 5432
5. Install pgAdmin (usually included with PostgreSQL)

**On Linux:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### Step 2: Create Database

**Option A: Using pgAdmin GUI**
1. Open pgAdmin
2. Connect to PostgreSQL (localhost)
3. Right-click "Databases" → "Create" → "Database"
4. Database name: `devices_db`
5. Owner: `postgres`
6. Click "Save"

**Option B: Using SQL**
1. Open pgAdmin
2. Click on "PostgreSQL" server
3. Open "Query Tool"
4. Run:
```sql
CREATE DATABASE devices_db;
```

**Option C: Using Command Line**
```bash
# Windows (PowerShell as Administrator)
psql -U postgres
CREATE DATABASE devices_db;
\q

# Linux
sudo -u postgres createdb devices_db
```

### Step 3: Configure Backend to Use PostgreSQL

The `.env` file has been created in the `backend` folder with PostgreSQL configuration:

**File: `backend/.env`**
```env
DATABASE_URL=postgresql+psycopg2://postgres:bisumain@localhost:5432/devices_db
```

**Update the password** if you used a different one during PostgreSQL installation.

### Step 4: Install psycopg2 (PostgreSQL Driver)

```powershell
cd backend
.venv\Scripts\Activate.ps1
pip install psycopg2-binary
```

### Step 5: Migrate Database Tables

```powershell
# Run migrations to create all tables
python migrate_database.py

# Create VFD readings table
python migrate_vfd_table.py
```

### Step 6: Start Backend

```powershell
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## Using pgAdmin to View Data

### Connect to Database

1. Open pgAdmin
2. Navigate: Servers → PostgreSQL → Databases → devices_db
3. Expand: Schemas → public → Tables

### View Tables

You should see these tables:
- **devices** - Device registration
- **users** - User accounts
- **sensor_readings** - Generic sensor data
- **vfd_readings** - VFD data (NEW)

### Query VFD Data

1. Right-click on `vfd_readings` table
2. Select "View/Edit Data" → "All Rows"

Or use the Query Tool:

```sql
-- Get latest 10 VFD readings
SELECT * FROM vfd_readings 
ORDER BY timestamp DESC 
LIMIT 10;

-- Get VFD data for a specific device
SELECT * FROM vfd_readings 
WHERE device_id = 1 
ORDER BY timestamp DESC;

-- Get average frequency over time
SELECT 
    DATE_TRUNC('minute', timestamp) as minute,
    AVG(CAST(frequency AS NUMERIC)) as avg_frequency,
    AVG(CAST(speed AS NUMERIC)) as avg_speed
FROM vfd_readings
WHERE device_id = 1
GROUP BY DATE_TRUNC('minute', timestamp)
ORDER BY minute DESC;

-- Count readings per device
SELECT 
    device_id, 
    COUNT(*) as total_readings,
    MAX(timestamp) as last_reading
FROM vfd_readings
GROUP BY device_id;
```

### Real-time Monitoring

Enable auto-refresh in pgAdmin:
1. Open Query Tool
2. Run your query
3. Click the "Auto-refresh" button (⟳)
4. Set interval (e.g., 2 seconds)

**Example query for real-time monitoring:**
```sql
SELECT 
    id,
    device_id,
    frequency || ' Hz' as frequency,
    speed || ' RPM' as speed,
    current || ' A' as current,
    voltage || ' V' as voltage,
    power || ' kW' as power,
    CASE status
        WHEN 0 THEN 'STOP'
        WHEN 1 THEN 'RUN'
        WHEN 2 THEN 'FAULT'
        WHEN 3 THEN 'READY'
    END as status_text,
    timestamp
FROM vfd_readings
WHERE device_id = 1
ORDER BY timestamp DESC
LIMIT 20;
```

## Alternative: Keep Using SQLite

If you don't need pgAdmin, SQLite works perfectly fine:

**Advantages of SQLite:**
- ✅ No installation required
- ✅ Single file database
- ✅ Fast and lightweight
- ✅ Perfect for development

**To view SQLite database:**

1. **SQLite Browser** (GUI tool)
   - Download: https://sqlitebrowser.org/
   - Open `backend/devices.db`
   - View and query tables

2. **VS Code Extension**
   - Install "SQLite" extension
   - Right-click `devices.db` → "Open Database"

3. **Command Line**
   ```powershell
   sqlite3 backend/devices.db
   SELECT * FROM vfd_readings LIMIT 10;
   .quit
   ```

## Comparison: PostgreSQL vs SQLite

| Feature | PostgreSQL | SQLite |
|---------|-----------|---------|
| pgAdmin Support | ✅ Yes | ❌ No |
| Setup Required | Yes | No |
| Multi-user | Excellent | Limited |
| Scalability | High | Moderate |
| Production Ready | ✅ Yes | For small apps |
| Development | Good | ✅ Excellent |

## Connection Details

### PostgreSQL (for pgAdmin)
```
Host: localhost
Port: 5432
Database: devices_db
User: postgres
Password: bisumain (or your password)
```

### SQLite (current)
```
File: backend/devices.db
No credentials needed
```

## Troubleshooting

### Cannot Connect to PostgreSQL
```powershell
# Check if PostgreSQL is running
Get-Service postgresql*

# Start PostgreSQL service
Start-Service postgresql-x64-14  # Version number may vary
```

### Password Authentication Failed
Update `.env` file with correct password:
```env
DATABASE_URL=postgresql+psycopg2://postgres:YOUR_PASSWORD@localhost:5432/devices_db
```

### psycopg2 Installation Error
```powershell
pip install psycopg2-binary
# If still fails, try:
pip install psycopg2
```

### Tables Not Created
Run migrations:
```powershell
python migrate_database.py
python migrate_vfd_table.py
```

## Data Transmission Speed

✅ **Updated to 1 second intervals:**
- Slave sends VFD data every 1 second
- Master sends to server every 1 second
- Data appears in database in real-time

To view in pgAdmin:
1. Run query with auto-refresh (2 seconds)
2. Watch data populate in real-time

---

## Quick Start: Enable pgAdmin Access

```powershell
# 1. Install PostgreSQL (if needed)

# 2. Create database using pgAdmin or:
psql -U postgres -c "CREATE DATABASE devices_db;"

# 3. Install driver
cd backend
pip install psycopg2-binary

# 4. Update .env (already created)
# Edit backend/.env if password is different

# 5. Run migrations
python migrate_database.py
python migrate_vfd_table.py

# 6. Start backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# 7. Upload ESP32 code (transmission now every 1 second)

# 8. Open pgAdmin and view vfd_readings table
```

**Done! Your VFD data will now appear in pgAdmin every second.**
