# VFD IoT Monitoring System (ESP32 + FastAPI + PostgreSQL)

## System Overview
This project is an IoT monitoring system for Variable Frequency Drive (VFD) telemetry.

The system is designed for real-time data ingestion from ESP32 devices, backend processing, and storage for monitoring and analysis.

Core purpose:
- Collect VFD operating data from edge hardware.
- Stream data to a backend using WebSockets.
- Persist telemetry in a relational database.
- Provide device lifecycle management (register, identify, monitor, remove).

## System Architecture

### High-Level Communication Path
ESP32 master -> WebSocket -> Backend server -> Database

```mermaid
flowchart LR
  A["Step 1: ESP32 reads VFD values"] --> B["Step 2: Send data over WebSocket"]
  B --> C["Step 3: Backend receives and validates data"]
  C --> D["Step 4: Store readings in PostgreSQL"]
  C --> E["Step 5: Update device status in Device Management"]
```

### Component Roles
- ESP32 master:
  - Reads VFD values from UART/RS485 side (in this repo: `Serial2` input + JSON parsing).
  - Maintains Wi-Fi and WebSocket connectivity.
  - Sends heartbeat and sensor payloads periodically.
- WebSocket communication:
  - Persistent full-duplex channel for low-latency telemetry.
  - Used by ESP32 for registration/authentication + streaming data.
  - Used by frontend hooks for live device updates.
- Backend server:
  - Accepts WebSocket connections from devices.
  - Validates/identifies devices.
  - Processes heartbeat and telemetry messages.
  - Writes readings to database and updates online state.
- Database:
  - Stores device metadata and historical VFD readings.
  - Supports monitoring, history, and future analytics.
- Device management module:
  - Handles registration and identity (device ID, key, MAC).
  - Tracks online/offline state through heartbeat metadata.
  - Supports add/list/update/delete device operations.

## Communication Flow

### End-to-End Flow (Step-by-Step)
This is the runtime flow in simple terms:

1. ESP32 connects to the backend WebSocket.
2. Backend verifies the device (or registers it if new).
3. ESP32 sends heartbeat messages so the backend knows it is online.
4. ESP32 sends VFD data at a fixed interval.
5. Backend stores each reading in PostgreSQL and confirms receipt.

```mermaid
flowchart TD
  A["Step 1: ESP32 connects to backend WebSocket"] --> B["Step 2: Backend verifies or registers device"]
  B --> C["Step 3: ESP32 sends heartbeat messages"]
  C --> D["Step 4: ESP32 sends VFD telemetry data"]
  D --> E["Step 5: Backend stores data in PostgreSQL and sends ack"]
```

### Message Processing Model
1. Connection established at device WebSocket endpoint.
2. Device provides identity using query params and/or first credentials message.
3. Server validates existing credentials or registers device by MAC.
4. Heartbeat messages refresh device liveness metadata.
5. Sensor messages are parsed into VFD fields and written to `vfd_readings`.
6. Backend can broadcast latest updates to frontend device streams.

## Device Management
Device management logic is responsible for inventory control and runtime state.

Functions covered by the module:
- Registration:
  - New ESP32 can be auto-registered from MAC address.
  - Server returns `device_id` and `device_key` for subsequent auth.
- Identification:
  - Device session can be verified by `device_id` + `device_key` + MAC.
  - Credentials can be persisted on ESP32 (Preferences storage).
- Monitoring:
  - Tracks online state using heartbeat timestamps.
  - Supports status views such as Online / Warning / Offline.
- Lifecycle operations:
  - Add device manually.
  - List and inspect devices.
  - Update metadata.
  - Remove device and related readings.

## Server-Side Architecture and Processing

This section explains what happens inside the backend server, not only how ESP32 sends data.

### 1) Backend Runtime Layers
The backend is organized as a typical FastAPI + SQLAlchemy service:

- API layer:
  - Exposes REST endpoints for auth, device CRUD, and telemetry queries.
  - Exposes WebSocket endpoints for realtime ingestion and device streaming.
- Validation layer:
  - Uses Pydantic schemas (`backend/schemas.py`) to validate and serialize request/response payloads.
- Service logic layer:
  - Handles authentication, device verification, registration logic, heartbeat updates, and telemetry processing.
- Data layer:
  - SQLAlchemy session/engine from `backend/database.py`.
  - ORM entities in `backend/models.py` map to PostgreSQL tables.
- Background processing:
  - Optional Modbus polling worker (`backend/modbus_polling.py`) collects register data and writes readings.

### 2) Startup Lifecycle (What Server Does on Boot)
When the backend process starts, the expected sequence is:

1. Load environment variables (for DB URL and runtime settings).
2. Initialize PostgreSQL connection engine and session factory.
3. Initialize/validate database schema (ORM tables).
4. Start HTTP and WebSocket routes.
5. Start optional background jobs (for example Modbus poller, heartbeat status checks).
6. Begin accepting REST and WebSocket traffic.

```mermaid
flowchart TD
  A["Load environment and config"] --> B["Create DB engine and session factory"]
  B --> C["Initialize ORM models and tables"]
  C --> D["Register REST and WebSocket routes"]
  D --> E["Start background workers"]
  E --> F["Server ready and listening"]
```

### 3) REST Request Processing Pipeline
For normal API requests (login, device CRUD, readings queries), the server pipeline is:

1. Request enters FastAPI route.
2. Payload/params are validated by schema models.
3. Auth middleware/dependencies validate token (for protected routes).
4. Business logic executes (query, insert, update, delete).
5. SQLAlchemy session commits changes (or rolls back on error).
6. Response is serialized and returned to client.

Why this matters:
- Keeps validation centralized.
- Prevents malformed writes to DB.
- Ensures transactional behavior (commit/rollback).

### 4) WebSocket Processing Pipeline (Server Side)
For realtime channels, the server generally follows this loop:

1. Accept WebSocket connection.
2. Extract identity from query params and/or first message.
3. Verify existing device credentials or register a new device.
4. Enter message loop:
   - If `heartbeat`: update `devices.last_heartbeat` and `devices.is_online`.
   - If `sensor_data`: parse VFD payload and insert into `vfd_readings`.
   - Optionally broadcast update to frontend subscribers.
5. On disconnect/error: clean up connection state and mark status according to timeout logic.

### 5) Database Write Processes in the Server
The backend performs multiple write paths, each with a different purpose:

- Device state writes (`devices` table):
  - Registration or credential updates.
  - Online/offline metadata (`is_online`, `last_heartbeat`).
- Telemetry writes (`vfd_readings` table):
  - Frequency, speed, current, voltage, power, torque, status, fault code.
  - Timestamped historical records for trend/history pages.
- Optional generic sensor writes (`sensor_readings` table):
  - Additional non-VFD telemetry fields.

### 6) Background Processes (Beyond Request/Response)
The server can run processes that are not triggered by a direct HTTP call:

- Modbus poller worker (`backend/modbus_polling.py`):
  - Reads configured registers on intervals.
  - Maps fields, builds payload, writes to `vfd_readings`.
  - Updates associated device heartbeat/online status.
- Heartbeat monitor (if enabled in backend runtime):
  - Periodically checks `last_heartbeat` age.
  - Transitions devices between Online/Warning/Offline windows.

### 7) Error Handling and Recovery Paths
Important server-side failure paths include:

- DB unavailable:
  - Connection errors prevent startup or writes.
  - Safe behavior is fail-fast at boot or rollback on write errors.
- Invalid device credentials:
  - Connection/message rejected or re-registration flow triggered.
- Malformed telemetry payload:
  - Message ignored/rejected; valid stream continues.
- Worker/serial errors in Modbus polling:
  - Poll cycle logs error and retries next interval.

### 8) Concurrency Model (How Multiple Things Run)
At runtime the backend handles:

- Concurrent REST calls (many clients at once).
- Concurrent WebSocket sessions (multiple devices and frontend listeners).
- Background polling/monitoring jobs.

This means the server must keep DB operations short, use isolated DB sessions, and avoid blocking the event loop with long synchronous operations in request paths.

### 9) Server-Side Data Lifecycle Summary
End-to-end inside backend:

1. Ingest message/request.
2. Validate and authenticate.
3. Transform payload into internal model fields.
4. Persist with transaction semantics.
5. Update live state (device status, stream subscribers).
6. Serve historical and realtime data back to clients.

## Project Structure

```text
Internship/
├── backend/
│   ├── database.py            # SQLAlchemy engine/session setup (PostgreSQL)
│   ├── models.py              # ORM models: users, devices, sensor_readings, vfd_readings
│   ├── schemas.py             # Pydantic schemas for API payloads
│   ├── modbus_polling.py      # Optional Modbus poller writing VFD readings
│   ├── check_vfd.py           # Utility script to inspect latest VFD rows
│   ├── setup_postgres.sh      # PostgreSQL bootstrap script
│   ├── setup_db.sql           # SQL setup snippet
│   └── requirements.txt       # Backend Python dependencies
│
├── frontend/
│   ├── package.json           # Vite scripts and JS dependencies
│   ├── src/
│   │   ├── hooks/useDeviceRealtime.ts  # Frontend WebSocket client for device updates
│   │   ├── components/ThemeToggle.tsx
│   │   ├── theme/ThemeContext.tsx
│   │   └── ...
│   └── public/
│       └── vfd_brand_model_registers.json
│
├── ESP32/
│   ├── master/
│   │   ├── platformio.ini     # PlatformIO board + libs
│   │   └── src/
│   │       ├── config.h        # Wi-Fi/server/device constants
│   │       └── main.cpp        # WebSocket connection + heartbeat + sensor send logic
│   └── slave/
│       └── src/main.cpp
│
├── push.sh                    # Helper script to git add/commit/push
└── README.md
```

## Server Setup Guide (Local Development)

### 1. Required Software
- Python 3.10+
- Node.js 18+ and npm
- PostgreSQL 14+
- Git
- Optional for firmware: PlatformIO CLI

### 2. Clone and Enter Project
```bash
git clone https://github.com/2ezy1/Internship.git
cd Internship
```

### 3. Backend Installation
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 4. Environment Configuration
Backend defaults from `backend/database.py`:
- `DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/devices_db`

Recommended explicit setup:
```bash
export DATABASE_URL="postgresql://postgres:your_password@localhost:5432/devices_db"
```

Optional backend environment values typically used in this system:
- `JWT_SECRET_KEY`
- `AUTH_SALT`
- `HEARTBEAT_CHECK_INTERVAL_SECONDS`
- `HEARTBEAT_WARNING_SECONDS`
- `HEARTBEAT_OFFLINE_SECONDS`

### 5. Database Setup
Option A (script):
```bash
cd backend
chmod +x setup_postgres.sh
./setup_postgres.sh
```

Option B (manual):
```bash
sudo -u postgres psql -c "CREATE DATABASE devices_db;"
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'YOUR_PASSWORD';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE devices_db TO postgres;"
```

### 6. Start the Backend Server
Expected startup (per project scripts):
```bash
cd backend
source venv/bin/activate
python main.py
```

Alternative if using Uvicorn directly:
```bash
cd backend
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 7. Start Frontend (Optional but Recommended)
```bash
cd frontend
npm install
npm run dev
```

### 7b. Single-port mode (Recommended for Slim)
If you want **one public URL** that serves **both** the frontend and backend (so login works without CORS issues), run the React build and let FastAPI serve it from **port 8000**.

Build frontend once:
```bash
cd frontend
npm install
npm run build
```

Then start backend on port 8000:
```bash
cd backend
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000
```

Local URLs in this mode:
- App UI: `http://localhost:8000/`
- API docs: `http://localhost:8000/docs`

Development note:
- During local frontend development (`npm run dev` on `:5173`), the Vite dev server proxies API requests to `http://localhost:8000` via `frontend/vite.config.ts`.

### Default Login Credentials
Use this account to log in after the server starts:

- Username: `BITSOJT`
- Password: `BITS2026`
### 8. Verify Server is Running
- Open API docs (if FastAPI app is running):
  - `http://localhost:8000/docs`
- Health endpoint (expected):
  - `http://localhost:8000/health`
- Frontend local URL:
  - `http://localhost:5173`
- DB check (latest rows):
```bash
cd backend
source venv/bin/activate
python check_vfd.py
```

## ESP32 Integration

### ESP32 Connection Strategy
From `ESP32/master/src/main.cpp` and `config.h`:
- WebSocket path: `/ws/esp32/connect`
- Supports both:
  - `ws://host:port/...` when `USE_WSS=0`
  - `wss://host:443/...` when `USE_WSS=1`
- Query parameters include:
  - `mac_address` (URL encoded)
  - `device_id` and `device_key` when known

The firmware also sends a first JSON credentials message after connect as fallback.

### ESP32 Message Formats
Heartbeat payload:
```json
{
  "type": "heartbeat",
  "device_id": 1,
  "device_key": "69ced61b-5521-4ef7-ab17-19a2cdf14af8",
  "timestamp": "1234567",
  "rssi": -62,
  "uptime": 1234567
}
```

VFD sensor payload:
```json
{
  "type": "sensor_data",
  "device_id": 1,
  "device_key": "69ced61b-5521-4ef7-ab17-19a2cdf14af8",
  "timestamp": "1234577",
  "rssi": -61,
  "uptime": 1234577,
  "data": {
    "frequency": 49.9,
    "speed": 1485.0,
    "current": 6.2,
    "voltage": 399.0,
    "power": 3.4,
    "torque": 22.1,
    "status": 1,
    "faultCode": 0
  }
}
```

## Database Schema

### Main Tables
The SQLAlchemy models in `backend/models.py` define these tables:

1. `users`
- `id` (PK)
- `username` (unique)
- `hashed_password`
- `role`
- `created_at`

2. `devices`
- `id` (PK)
- `device_name`
- `ip_address` (unique)
- `type`
- `date_installed`
- `user_id` (FK -> users.id)
- `is_online`
- `last_heartbeat`
- `device_key` (unique)
- `mac_address`
- `created_at`, `updated_at`

3. `sensor_readings`
- `id` (PK)
- `device_id` (FK -> devices.id)
- Generic sensor columns (`temperature`, `humidity`, etc.)
- `custom_data`
- `timestamp`

4. `vfd_readings`
- `id` (PK)
- `device_id` (FK -> devices.id)
- `frequency`, `speed`, `current`, `voltage`, `power`, `torque`
- `status`, `fault_code`
- `custom_data`
- `timestamp`

## Example Data Flow

### Example: Incoming WebSocket Frame
```json
{
  "type": "sensor_data",
  "device_id": 1,
  "device_key": "69ced61b-5521-4ef7-ab17-19a2cdf14af8",
  "data": {
    "frequency": 50.0,
    "speed": 1500.0,
    "current": 6.5,
    "voltage": 400.0,
    "power": 3.6,
    "torque": 23.0,
    "status": 1,
    "faultCode": 0
  }
}
```

### Example: Persisted Row (`vfd_readings`)
```text
id: 1285
device_id: 1
frequency: "50.0"
speed: "1500.0"
current: "6.5"
voltage: "400.0"
power: "3.6"
torque: "23.0"
status: 1
fault_code: 0
timestamp: 2026-03-16T14:21:33Z
```

## API and WebSocket Endpoints

### WebSocket Endpoints
- `ws://<host>:8000/ws/esp32/connect`
  - ESP32 registration/auth + heartbeat + sensor_data upload
- `ws://<host>:8000/ws/device/{device_id}`
  - Frontend realtime subscription (used in `useDeviceRealtime.ts`)
- `ws://<host>:8000/ws/rs485/send/{device_id}`
  - Optional RS485 sender channel (if implemented in backend)

### REST Endpoints (Device Management and Data)
Commonly used by this architecture:
- `POST /auth/login`
- `GET /health`
- `POST /devices/`
- `GET /devices/`
- `GET /devices/{device_id}`
- `PUT /devices/{device_id}`
- `DELETE /devices/{device_id}`
- `GET /devices/{device_id}/status`
- `POST /devices/{device_id}/regenerate-key`
- `GET /devices/{device_id}/vfd-readings`
- `GET /devices/{device_id}/vfd-readings/latest`

## Troubleshooting

### 1. PostgreSQL Connection Errors
Symptoms:
- Backend exits at startup.
- DB connection refused/auth failed.

Fix:
- Ensure PostgreSQL is running: `sudo systemctl status postgresql`
- Validate `DATABASE_URL`.
- Re-run `backend/setup_postgres.sh`.

### 2. WebSocket Fails to Connect from ESP32
Symptoms:
- ESP32 repeatedly logs reconnect attempts.

Fix:
- Check `SERVER_HOST`, `SERVER_PORT`, `USE_WSS`, `SERVER_PATH` in `ESP32/master/src/config.h`.
- Ensure endpoint is reachable from ESP32 network.
- For cloud hosts, prefer `wss` on port `443`.

### 3. Device Appears Offline
Symptoms:
- Device listed but status not updating.

Fix:
- Confirm heartbeat payload is being sent every `HEARTBEAT_INTERVAL_MS`.
- Check server heartbeat thresholds.
- Verify backend writes `last_heartbeat` and `is_online`.

### 4. VFD Data Missing in DB
Symptoms:
- No new rows in `vfd_readings`.

Fix:
- Validate incoming JSON contains required VFD fields under `data`.
- Confirm `device_id` and `device_key` are valid.
- Run `python backend/check_vfd.py` to inspect rows quickly.

### 5. Frontend Realtime Not Updating
Symptoms:
- UI loads but live values never change.

Fix:
- Confirm frontend is connecting to `/ws/device/{device_id}`.
- Set `VITE_API_BASE` to the correct backend URL if frontend/backend are on different hosts.
- Check browser console for WebSocket close/error frames.

## Slim Forwarding (Expose VM to the Internet)
This project supports tunneling with Slim. The recommended approach is:
- **Expose the app on a single port** (FastAPI serves the built frontend on `:8000`)
- Use **one Slim tunnel** for the app
- Optionally expose **pgAdmin** separately for database browsing

### A) Forward the app (FastAPI + built React) on port 8000
1) Start the backend (single-port mode) on the VM:
```bash
cd backend
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000
```

2) In another terminal, start Slim:
```bash
slim share --port 8000
```

3) Open the **Slim URL** Slim prints.
- Do **not** add `:8000` to the Slim URL.

### B) Forward pgAdmin (optional) on port 5050
pgAdmin is a separate web app for browsing PostgreSQL. In this repo/workspace we run it with Docker and expose it on port `5050`.

Start/verify pgAdmin on the VM (host networking + reverse-proxy settings for Slim):
```bash
docker rm -f pgadmin 2>/dev/null || true
docker run -d --name pgadmin --network host \
  -e PGADMIN_LISTEN_ADDRESS=0.0.0.0 \
  -e PGADMIN_LISTEN_PORT=5050 \
  -e PGADMIN_DEFAULT_EMAIL=YOUR_EMAIL@example.com \
  -e PGADMIN_DEFAULT_PASSWORD=YOUR_PGADMIN_PASSWORD \
  -e PGADMIN_CONFIG_PROXY_X_FOR_COUNT=1 \
  -e PGADMIN_CONFIG_PROXY_X_PROTO_COUNT=1 \
  -e PGADMIN_CONFIG_PROXY_X_HOST_COUNT=1 \
  -e PGADMIN_CONFIG_PROXY_X_PREFIX_COUNT=1 \
  -e "PGADMIN_CONFIG_PREFERRED_URL_SCHEME='https'" \
  -e PGADMIN_CONFIG_WTF_CSRF_SSL_STRICT=False \
  -v pgadmin-data:/var/lib/pgadmin \
  dpage/pgadmin4
```

Forward pgAdmin with Slim:
```bash
slim share --port 5050
```

Then open the Slim URL (in a private window if you see session/cookie issues).

### C) Database credentials (PostgreSQL)
**Security note:** do **not** commit real passwords to git. Use environment variables or a local `.env` that is git-ignored.

- **PostgreSQL host (from inside the VM / from pgAdmin running on the VM)**: `127.0.0.1`
- **PostgreSQL host (from another machine on the same LAN)**: `172.20.10.6`
- **Port**: `5432`
- **Database**: `devices_db`
- **User (recommended)**: `devices_user`
- **Password**: `<set-your-own-password>`

### D) pgAdmin web login credentials (pgAdmin UI)
These are **NOT** PostgreSQL credentials. They are only for signing into the pgAdmin web UI:
- **Email**: `<your-email>`
- **Password**: `<your-pgadmin-password>`

### E) Flowchart: Browser → Slim → VM services
```mermaid
flowchart LR
  subgraph Internet
    U[User Browser]
    S1[Slim URL for App]
    S2[Slim URL for pgAdmin]
  end

  subgraph VM["VM (172.20.10.6)"]
    A[FastAPI :8000<br/>serves React UI + API + WS]
    P[(PostgreSQL :5432)]
    G[pgAdmin :5050<br/>Docker host network]
  end

  U -->|HTTPS| S1 -->|Tunnel| A
  A --> P

  U -->|HTTPS| S2 -->|Tunnel| G
  G -->|TCP 5432| P
```

## Cloud Deployment (Vercel + Railway)

This section explains where Vercel and Railway fit in production deployment.

### Deployment Architecture
- Railway:
  - Hosts the backend API service.
  - Hosts PostgreSQL database.
- Vercel:
  - Hosts the frontend (Vite/React build).
  - Calls Railway backend using HTTPS and WebSocket endpoints.

```mermaid
flowchart LR
  U["User Browser"] --> V["Vercel Frontend"]
  V --> R["Railway Backend API"]
  R --> P[("Railway PostgreSQL")]
  E["ESP32 Device"] --> R
```

### Railway Setup (Backend + Database)

Railway project URL:
- `https://railway.com/project/172e780e-421a-40e2-9115-2c4dff249e6a?environmentId=b7f0b655-26c0-4ad8-944c-1ebfe83100b3`

Railway backend invite URL:
- `https://railway.com/invite/mLcWaM9C2XK`

Railway backend onboarding flow:

```mermaid
flowchart TD
  A["Open Railway invite link"] --> B["Join Railway project"]
  B --> C["Open backend service in Railway"]
  C --> D["Configure env vars DATABASE_URL JWT_SECRET_KEY AUTH_SALT"]
  D --> E["Deploy backend service"]
  E --> F["Copy backend public domain"]
  F --> G["Set VITE_API_BASE in Vercel frontend"]
```

1. Create a Railway project.
2. Add a PostgreSQL service.
3. Add a backend service connected to this repository.
4. Set backend environment variables:
   - `DATABASE_URL` (from Railway Postgres)
   - `JWT_SECRET_KEY`
   - `AUTH_SALT`
5. Deploy backend and copy the generated public URL.

### Vercel Setup (Frontend)

1. Import this repository in Vercel.
2. Set root directory to `frontend`.
3. Add environment variable:
   - `VITE_API_BASE=https://<your-railway-backend-domain>`
4. Deploy and open the Vercel domain.

Live frontend URL:
- `https://internship-murex-xi.vercel.app/home`

### ESP32 for Cloud Backend

In `ESP32/master/src/config.h`, use cloud settings:

- `SERVER_HOST` = Railway backend domain
- `SERVER_PORT` = 443
- `USE_WSS` = 1
- `SERVER_PATH` = `/ws/esp32/connect`

### Basic Cloud Verification

1. Open backend health endpoint on Railway:
   - `https://<railway-domain>/health`
2. Open frontend on Vercel and log in:
  - `https://internship-murex-xi.vercel.app/home`
3. Confirm frontend can list devices.
4. Connect ESP32 and check backend logs for heartbeat/sensor messages.

## Notes
- This repository currently contains backend models/schemas/utilities and ESP32 firmware, while backend route entrypoint code may be maintained separately or omitted in this snapshot.
- Local run instructions in this README assume a FastAPI app entrypoint at `backend/main.py`.
- If missing locally, restore/create `backend/main.py` before running API services.
