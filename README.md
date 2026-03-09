# Internship IoT Monitoring System - Complete Documentation

This repository contains an end-to-end IoT monitoring stack:
- FastAPI backend (`backend/`) for authentication, device management, WebSocket ingestion, and historical VFD/sensor storage
- React + Vite frontend (`frontend/`) for dashboard, realtime monitoring, and device details
- ESP32 firmware (`ESP32/master/`) that sends heartbeat and VFD data over WebSocket
- Optional Modbus polling service (started by backend) for serial VFD register polling

This file is the single documentation source for setup, operation, architecture, and troubleshooting.

## 1. System Architecture

### 1.1 High-Level Components
- **Frontend (React)**: User login, device list, live status, charts, and detailed telemetry.
- **Backend (FastAPI + SQLAlchemy)**: REST API, JWT auth, WebSocket server, heartbeat monitor, and DB persistence.
- **Database**: PostgreSQL (required).
- **ESP32 Master**: Connects via WiFi to backend WebSocket, authenticates/registers, sends heartbeat and VFD data.
- **Optional Modbus Poller**: Reads VFD registers over serial and writes to `vfd_readings`.

### 1.2 End-to-End Flow
```mermaid
flowchart LR
  A[ESP32 Master] -->|WebSocket /ws/esp32/connect| B[FastAPI Backend]
  C[Modbus Poller] -->|Serial register reads| B
  D[RS485 Sender] -->|WebSocket /ws/rs485/send/{device_id}| B
  B -->|SQLAlchemy| E[(PostgreSQL)]
  F[Frontend React App] -->|REST + WebSocket| B
  B -->|Broadcast realtime updates| F
```

### 1.3 ESP32 Session/Registration Flow
```mermaid
flowchart TD
  A[ESP32 connects with MAC and optional credentials] --> B{Credentials valid?}
  B -->|Yes| C[Authenticate existing device]
  B -->|No| D{Device found by MAC?}
  D -->|Yes| E[Reuse existing device]
  D -->|No| F[Auto-register new device and generate key]
  C --> G[Send registration success + device_key]
  E --> G
  F --> G
  G --> H[ESP32 sends heartbeat every 30s]
  G --> I[ESP32 sends VFD sensor_data every poll interval]
  H --> J[Update is_online and last_heartbeat]
  I --> K[Store VFD reading and broadcast vfd_update]
```

### 1.4 Device Status Logic
```mermaid
flowchart TD
  A[last_heartbeat present?] -->|No| B[Offline or Warning based on is_online]
  A -->|Yes| C[Compute seconds since heartbeat]
  C -->|< HEARTBEAT_WARNING_SECONDS| D[Online]
  C -->|>= WARNING and < OFFLINE| E[Warning]
  C -->|>= HEARTBEAT_OFFLINE_SECONDS| F[Offline]
```

## 2. Repository Layout

- `backend/main.py`: FastAPI app, routes, WebSocket handlers, heartbeat checker
- `backend/database.py`: SQLAlchemy engine/session config from `DATABASE_URL`
- `backend/models.py`: ORM models (`users`, `devices`, `sensor_readings`, `vfd_readings`)
- `backend/schemas.py`: Pydantic request/response models
- `backend/modbus_polling.py`: Optional serial Modbus VFD polling thread
- `frontend/src/services/api.ts`: REST client; defaults API base to `http://<frontend-host>:8000`
- `frontend/src/services/websocket.ts`: Frontend WebSocket client for `/ws/device/{device_id}`
- `ESP32/master/src/main.cpp`: ESP32 WiFi, WebSocket, heartbeat, VFD transmission
- `ESP32/master/src/config.h`: ESP32 network, server, and device credential config

## 3. Prerequisites

### 3.1 Required
- Python 3.10+
- Node.js 18+
- npm 9+
- PostgreSQL 14+
- Git

### 3.2 Optional
- PlatformIO CLI (for flashing ESP32)
- USB/serial permissions on Linux (`dialout` group)

## 4. Quick Start (Recommended)

### 4.0 Database Setup (First Time Only)
Before starting the backend, ensure PostgreSQL is installed and running:

```bash
# Install PostgreSQL (Ubuntu/Debian)
sudo apt update
sudo apt install postgresql postgresql-contrib

# Start PostgreSQL service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database and user
sudo -u postgres psql -c "CREATE DATABASE devices_db;"
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'bisumain';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE devices_db TO postgres;"
```

Or use the provided setup script:
```bash
cd backend
./setup_postgres.sh
```

Run backend and frontend in separate terminals.

### 4.1 Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```

Backend starts at:
- API root: `http://<server-ip>:8000/`
- Health: `http://<server-ip>:8000/health`
- Swagger docs: `http://<server-ip>:8000/docs`

### 4.2 Frontend
```bash
cd frontend
npm install
npm run dev
```

Frontend starts at:
- `http://localhost:5173`

### 4.3 Login Credentials (auto-created on backend startup)
- User: `user` / `user123`
- Admin: `BITSOJT` / `BITS2026`

## 5. Environment Configuration

## 5.1 Backend Environment Variables
`backend/database.py` and `backend/main.py` read from environment.

- `DATABASE_URL` (required)
  - Default: `postgresql://postgres:bisumain@localhost:5432/devices_db`
  - Must be a PostgreSQL connection string
  - Format: `postgresql://username:password@host:port/database_name`
- `JWT_SECRET_KEY` (recommended to set in production)
- `AUTH_SALT`
- `HEARTBEAT_CHECK_INTERVAL_SECONDS` (default `15`)
- `HEARTBEAT_WARNING_SECONDS` (default `60`)
- `HEARTBEAT_OFFLINE_SECONDS` (default `120`)

Modbus poller variables:
- `MODBUS_PORT` (default `COM5`)
- `MODBUS_BAUDRATE` (default `9600`)
- `MODBUS_SLAVE_ID` (default `1`)
- `MODBUS_POLL_INTERVAL_MS` (default `1000`)
- `MODBUS_BRAND` (default `teco`)
- `MODBUS_DEVICE_ID` (optional)

Linux serial example:
```bash
export MODBUS_PORT=/dev/ttyUSB0
```

### 5.2 Frontend Environment Variables
From `frontend/src/services/api.ts`:
- `VITE_API_BASE` (optional)
  - If unset, frontend uses `http://<current-host>:8000`

Example `frontend/.env`:
```bash
VITE_API_BASE=http://192.168.1.100:8000
```

## 6. Database Setup

### 6.1 PostgreSQL Installation
**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**macOS:**
```bash
brew install postgresql@14
brew services start postgresql@14
```

**Windows:**
Download and install from https://www.postgresql.org/download/windows/

### 6.2 Database Creation
```bash
# Create database
sudo -u postgres psql -c "CREATE DATABASE devices_db;"

# Set password for postgres user
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'bisumain';"

# Grant privileges
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE devices_db TO postgres;"
```

Or use the provided script:
```bash
cd backend
chmod +x setup_postgres.sh
./setup_postgres.sh
```

### 6.3 Custom Database Configuration
If you want to use different credentials:
```bash
export DATABASE_URL="postgresql://your_user:your_password@localhost:5432/your_database"
cd backend
python main.py
```

Notes:
- Backend will exit with an error if PostgreSQL is not configured
- Tables are created automatically on first run
- For production, store secrets in environment or secret manager, not hardcoded scripts

## 7. How Backend Works

### 7.1 Startup Behavior
On startup (`backend/main.py`):
- Validates PostgreSQL connection (exits if not PostgreSQL)
- Creates DB tables if missing
- Creates default `user` and `BITSOJT` accounts if missing
- Ensures static test ESP32 device exists:
  - `id=1`, `name=Testing`
  - `device_key=69ced61b-5521-4ef7-ab17-19a2cdf14af8`
  - `mac=A0:B7:65:29:3D:28`
- Starts Modbus polling thread
- Starts heartbeat background checker

### 7.2 Auth Model
- Login endpoint: `POST /auth/login`
- Returns JWT bearer token
- Frontend stores token in localStorage and sends `Authorization: Bearer <token>`

### 7.3 Main REST Endpoints
- `GET /health`
- `POST /auth/login`
- `POST /devices/`
- `GET /devices/`
- `GET /devices/{device_id}`
- `PUT /devices/{device_id}`
- `DELETE /devices/{device_id}`
- `GET /devices/{device_id}/status`
- `POST /devices/{device_id}/regenerate-key`
- `POST /devices/{device_id}/initialize-esp32`
- `GET /devices/{device_id}/vfd-readings`
- `GET /devices/{device_id}/vfd-readings/latest`
- `DELETE /devices/{device_id}/vfd-readings`
- `POST /sensors/readings`
- `GET /sensors/readings/{device_id}`
- `GET /sensors/latest/{device_id}`

Admin endpoints (currently same auth dependency allows authenticated users):
- `GET /admin/users`
- `GET /admin/users/{user_id}`
- `GET /admin/devices`
- `GET /admin/devices/with-owners`
- `GET /admin/stats`

### 7.4 WebSocket Endpoints
- `ws://<host>:8000/ws/device/{device_id}`
  - Frontend subscribes for realtime updates (`sensor_update`, `vfd_update`)
- `ws://<host>:8000/ws/rs485/send/{device_id}`
  - RS485 sender pushes readings to backend
- `ws://<host>:8000/ws/esp32/connect?mac_address=...&device_id=...&device_key=...`
  - ESP32 auth/registration + heartbeat + VFD upload

## 8. ESP32 Setup and Operation

### 8.1 Configure Firmware
Edit `ESP32/master/src/config.h`:
- WiFi SSID and password
- Static IP / gateway / subnet / DNS
- `SERVER_IP`, `SERVER_PORT`, `SERVER_PATH`
- Optional static credentials (`DEVICE_ID`, `DEVICE_KEY`)

Two credential modes:
- **Static testing mode**: use configured `DEVICE_ID` and `DEVICE_KEY` (device 1 / Testing)
- **Auto-registration mode**: remove/comment static credentials; ESP32 registers by MAC

### 8.2 Build/Upload (PlatformIO)
```bash
cd ESP32/master
pio run --target upload
pio device monitor --baud 115200
```

### 8.3 Runtime Behavior
- Connects to WiFi (static IP config)
- Connects WebSocket to backend
- Sends credentials first
- Sends heartbeat every `HEARTBEAT_INTERVAL_MS`
- Sends VFD data every `POLL_INTERVAL_MS`
- Parses UART JSON from slave via `Serial2`

## 9. Frontend Runtime Behavior

- API base is dynamic (`VITE_API_BASE` or same host on port 8000)
- Device details page uses WebSocket stream for live updates
- Home page includes optimized interaction logic for smoother filtering and realtime UX

## 10. Run Profiles

### 10.1 Local Development (Most Common)
1. Start backend (`python main.py`)
2. Start frontend (`npm run dev`)
3. Login in browser
4. Connect ESP32 on same network and verify data appears

### 10.2 Backend Only (API testing)
- Use Swagger docs at `/docs`
- Use Postman/curl for auth + device/vfd endpoints

### 10.3 ESP32 Hardware Test
- Keep serial monitor open
- Validate successful registration/auth response
- Confirm heartbeat logs every 30s
- Confirm VFD updates arrive and appear in frontend

## 11. Verification Checklist

- PostgreSQL service running: `sudo systemctl status postgresql` (Linux) or `brew services list` (macOS)
- Database exists: `psql -U postgres -d devices_db -c "\dt"`
- Backend healthy: `GET /health` returns `{"status":"healthy"...}`
- Frontend opens at `http://localhost:5173`
- Login works with default account
- Devices list loads
- ESP32 appears online after heartbeat
- New VFD readings appear in `/devices/{id}/vfd-readings/latest`
- Device status transitions Online -> Warning -> Offline if heartbeat stops

## 12. Troubleshooting

### 12.1 Backend Won't Start - Database Error
- Ensure PostgreSQL is running: `sudo systemctl status postgresql`
- Verify database exists: `sudo -u postgres psql -l | grep devices_db`
- Check credentials in `DATABASE_URL` match PostgreSQL user/password
- Test connection: `psql -U postgres -d devices_db`
- Review backend startup logs for specific error messages

### 12.2 Frontend Cannot Reach Backend
- Check backend running on `0.0.0.0:8000`
- Verify host firewall and network routing
- Set `VITE_API_BASE` explicitly if frontend and backend hosts differ

### 12.3 ESP32 Fails WebSocket Handshake
- Verify `SERVER_IP` and port in `config.h`
- Ensure `mac_address` reaches backend (query params or first message fallback)
- Confirm backend log for registration errors

### 12.4 Device Stays Offline
- Heartbeat not arriving or stale
- Verify `HEARTBEAT_*` thresholds
- Check ESP32 serial logs and backend WebSocket logs

### 12.5 No VFD Data in UI
- Ensure ESP32 sends `sensor_data` with VFD keys (`frequency`, `speed`, etc.)
- Backend rejects non-VFD payloads on ESP32 channel
- Confirm DB writes and `/vfd-readings/latest` endpoint output

### 12.6 Modbus Poller Issues
- On Linux, use `/dev/ttyUSB*` or `/dev/ttyACM*` for `MODBUS_PORT`
- Confirm serial permissions and cable/adapter
- Verify register map path exists: `frontend/public/vfd_brand_model_registers.json`

## 13. Security Notes

- Change default credentials and JWT secret before production use
- Restrict CORS origins in production (`allow_origins`)
- Rotate device keys if leaked (`/devices/{id}/regenerate-key`)
- Use HTTPS/WSS in production deployments

## 14. Known Implementation Notes

- "Admin" dependency currently allows any authenticated user (`get_admin_user` returns current user)
- Access token expiry is intentionally long (10 years) by current design
- `ModbusPoller` starts automatically on backend startup

## 15. Useful Commands

Backend:
```bash
cd backend
source venv/bin/activate
python main.py
```

Frontend:
```bash
cd frontend
npm run dev
```

ESP32 upload:
```bash
cd ESP32/master
pio run --target upload
pio device monitor --baud 115200
```

API docs:
```bash
xdg-open http://localhost:8000/docs
```

## 16. Data Model Summary

- `users`: login identities and roles
- `devices`: inventory, owner, key, MAC, online/heartbeat state
- `sensor_readings`: generic sensor stream records
- `vfd_readings`: VFD telemetry records (frequency, speed, current, voltage, power, torque, status, fault)

## 17. Operational Flow Summary

```mermaid
sequenceDiagram
  participant ESP32
  participant API as FastAPI
  participant DB as Database
  participant UI as Frontend

  ESP32->>API: WS connect /ws/esp32/connect (+ MAC/credentials)
  API->>DB: Find or create device
  API-->>ESP32: registration success (device_id, device_key)
  loop Every heartbeat interval
    ESP32->>API: heartbeat
    API->>DB: update last_heartbeat + is_online
    API-->>ESP32: heartbeat_ack
  end
  loop Every sensor poll interval
    ESP32->>API: sensor_data(VFD)
    API->>DB: insert vfd_reading
    API-->>UI: vfd_update via ws/device/{id}
  end
  UI->>API: REST fetch devices/history
  API->>DB: query data
  API-->>UI: JSON responses
```

---
If you keep this repository updated, maintain this file as the single source of truth for setup and operations.
