# PostgreSQL Setup Guide

## Step 1: Start PostgreSQL Service

```bash
sudo systemctl start postgresql
sudo systemctl enable postgresql  # Auto-start on boot
```

## Step 2: Create Database

### Option A: Using psql command line

```bash
# Switch to postgres user and create database
sudo -u postgres createdb devices_db

# Set password for postgres user
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'bisumain';"
```

### Option B: Using SQL file

```bash
sudo -u postgres psql -f setup_db.sql
```

### Option C: Using pgAdmin

1. Open pgAdmin (already set up based on terminal history)
2. Connect to localhost
3. Right-click "Databases" → "Create" → "Database"
4. Name: `devices_db`
5. Owner: `postgres`
6. Save

## Step 3: Verify Connection

```bash
psql -h localhost -U postgres -d devices_db -c "SELECT version();"
```

Enter password: `bisumain`

## Step 4: Start the Backend

```bash
cd /home/bits/Desktop/Internship/backend
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The backend will automatically create all necessary tables on first run.

## Connection Details

- **Host:** localhost
- **Port:** 5432
- **Database:** devices_db
- **User:** postgres
- **Password:** bisumain

## Troubleshooting

### PostgreSQL not running

```bash
sudo systemctl status postgresql
sudo systemctl start postgresql
```

### Permission denied

```bash
# Make sure postgres user has access
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE devices_db TO postgres;"
```

### Connection refused

Check if PostgreSQL is listening:
```bash
sudo netstat -plnt | grep 5432
```

Should show postgres listening on port 5432.

## Alternative: Use SQLite (Simpler)

If PostgreSQL setup is problematic, you can use SQLite instead:

1. Edit `backend/database.py`:
```python
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///./devices.db",
)
```

2. Start backend normally - SQLite requires no setup!
