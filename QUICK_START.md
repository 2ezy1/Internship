# Quick Start - ESP32 Data Transmission Setup

## 🚀 30-Second Quick Start

```bash
# Windows
start_all.bat

# Linux/macOS
bash start_all.sh
```

This will automatically:
1. ✅ Verify the setup
2. ✅ Start the backend server (http://192.168.254.110:8000)
3. ✅ Start the frontend (http://localhost:5173)
4. ⚙️ Optionally upload code to ESP32

---

## 📋 Manual Setup (Step-by-Step)

### Step 1: Backend Server
```bash
cd backend

# Activate virtual environment
# Windows:
venv\Scripts\activate.bat
# Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run server
python main.py
```

✅ **Success**: You should see:
```
✅ Application startup complete
Uvicorn running on http://192.168.254.110:8000
```

### Step 2: Frontend Application
```bash
cd frontend

# Install dependencies (first time only)
npm install

# Start development server
npm run dev
```

✅ **Success**: You should see:
```
  VITE v4.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

### Step 3: ESP32 Upload
```bash
cd ESP32/master

# Install PlatformIO (if needed)
pip install platformio

# Upload code to ESP32
pio run --target upload

# Monitor serial output
pio device monitor --baud 115200
```

✅ **Success**: You should see in serial monitor:
```
✅ WiFi connected!
✅ WebSocket connected!
📡 VFD data sent...
```

---

## 🧪 Test the Complete Setup

### 1. Open Frontend
- Navigate to: **http://localhost:5173**
- Login with your credentials

### 2. Create/Select Device
- Device ID: **1** (must match ESP32 DEVICE_ID)
- Device Key: **69ced61b-5521-4ef7-ab17-19a2cdf14af8** (must match ESP32 DEVICE_KEY)

### 3. Check Real-Time Data
- Open device details page
- Should show live VFD metrics:
  - Frequency (Hz)
  - Speed (RPM)
  - Current (A)
  - Voltage (V)
  - Power (kW)
  - Torque (Nm)

### 4. Monitor Logs
- **Backend**: Terminal running `python main.py`
- **Frontend**: Browser DevTools (F12)
- **ESP32**: Serial monitor output

---

## ✅ Configuration Checklist

### Backend
- [ ] Running on `192.168.254.110:8000`
- [ ] Database initialized (see backend/setup_db.sql)
- [ ] Device registered with ID=1

### ESP32
- [ ] `DEVICE_ID = 1`
- [ ] `DEVICE_KEY = "69ced61b-5521-4ef7-ab17-19a2cdf14af8"`
- [ ] `SERVER_IP = "192.168.254.110"`
- [ ] `SERVER_PORT = 8000`
- [ ] WiFi credentials configured
- [ ] Static IP configured (192.168.254.111 or similar)

### Frontend
- [ ] Running on `http://localhost:5173`
- [ ] `VITE_API_BASE = "http://192.168.254.110:8000"`
- [ ] Authenticated and logged in

---

## 🔍 Verification

Run the verification script to check all components:

```bash
python verify_setup.py
```

This checks:
1. ✅ Network connectivity to backend
2. ✅ Backend server is running
3. ✅ Database is accessible
4. ✅ Device is registered
5. ✅ WebSocket endpoints are listening
6. ✅ Frontend communication works

---

## 📊 Data Flow

```
ESP32 Master (WiFi)
    ↓
    └─→ WebSocket: ws://192.168.254.110:8000/ws/esp32/connect
            ↓ (Sends sensor data every 1 second)
Backend Server (FastAPI)
    ↓ (Stores in database)
    └─→ Database (PostgreSQL)
    └─→ Broadcasts to all connected clients
            ↓
Frontend (React)
    ↓
    └─→ WebSocket: ws://192.168.254.110:8000/ws/device/1
            ↓ (Receives real-time updates)
Display Live Chart & Metrics
```

---

## 🆘 Troubleshooting

### Backend won't start
```bash
# Check Python version
python --version  # Should be 3.8+

# Check port is available
netstat -ano | findstr :8000  # Windows
lsof -i :8000  # Linux/macOS

# Kill existing process if needed
taskkill /PID <PID> /F  # Windows
kill -9 <PID>  # Linux/macOS
```

### Frontend not loading data
```bash
# Check browser console (F12)
# Look for WebSocket connection errors

# Check backend logs for broadcast messages
# Should see: "Broadcast to all connected clients"
```

### ESP32 not connecting
```bash
# Check serial monitor output
pio device monitor --baud 115200

# Verify:
# - WiFi credentials are correct
# - SERVER_IP matches your backend (192.168.254.110)
# - DEVICE_KEY matches database

# Reset ESP32
# Hold BOOT button while pressing RESET
```

### WebSocket connection drops
```bash
# Increase heartbeat frequency in config.h:
#define HEARTBEAT_INTERVAL_MS 15000  // Down from 30000

# Check network stability:
# - Monitor WiFi signal (RSSI)
# - Check for interference
# - Ensure stable power supply
```

---

## 📚 Documentation Files

- **[ESP32_TO_FRONTEND_SETUP.md](ESP32_TO_FRONTEND_SETUP.md)** - Complete technical setup guide
- **[WEBSOCKET_SETUP_GUIDE.md](WEBSOCKET_SETUP_GUIDE.md)** - WebSocket protocol details
- **[README.md](README.md)** - Project overview

---

## 🔌 API Endpoints

```
Health Check:
  GET /health

Devices:
  GET    /devices/                  - List all devices
  POST   /devices/                  - Create new device
  GET    /devices/{id}               - Get device details
  PUT    /devices/{id}               - Update device
  DELETE /devices/{id}               - Delete device

Status:
  GET /devices/{id}/status          - Get device status

WebSocket:
  WS /ws/esp32/connect              - ESP32 data stream (from device)
  WS /ws/device/{id}                - Frontend data stream (to clients)

Data:
  GET /vfd/readings/{id}            - Historical VFD readings
  GET /sensors/readings/{id}        - Historical sensor readings
```

---

## 🎯 Success Indicators

When everything is working:

✅ **Backend Terminal**:
```
✅ ESP32 device 1 connected from 192.168.254.111
💖 Heartbeat from device 1: RSSI=-45
📡 VFD data from device 1: Freq=50.0Hz, Speed=1500.0RPM
```

✅ **ESP32 Serial Monitor**:
```
✅ WiFi connected!
  Local IP: 192.168.254.111
✅ WebSocket connected!
📡 VFD data sent - Freq: 50.0 Hz, Speed: 1500.0 RPM
```

✅ **Frontend Console (F12)**:
```
🔌 Connecting to device WebSocket: ws://192.168.254.110:8000/ws/device/1
✅ Device WebSocket connected for device 1
📨 Real-time update received: {type: 'vfd_update', data: {...}}
```

✅ **Visual in Frontend**:
- Device shows as "Online"
- Real-time metrics display numbers (not "--")
- Chart updates with live data
- Last heartbeat is recent

---

## 🚨 Emergency Stop

If you need to stop all services:

```bash
# Windows - Close the terminal windows or:
taskkill /F /IM python.exe
taskkill /F /IM node.exe

# Linux/macOS:
pkill -f "python main.py"
pkill -f "npm run dev"
```

---

## 📞 Need Help?

1. **Check logs first** - They usually tell you what's wrong
2. **Run verify_setup.py** - Automated diagnostics
3. **Review troubleshooting section** above
4. **Check documentation files** - Detailed guides available

---

## 🎓 Understanding the Architecture

The system consists of three parts:

1. **ESP32 Master** - Collects data from VFD/sensors via UART, sends via WebSocket
2. **Backend Server** - Receives data, validates, stores in database, broadcasts to clients
3. **Frontend** - Receives broadcasts in real-time, displays live chart and metrics

```
Data: ESP32 → Backend → Frontend (in real-time)
Updates: 1 message per second
Storage: Persistent in PostgreSQL database
Display: Live chart of last 30 days
```

---

## 🔄 Data Format

**ESP32 sends:**
```json
{
  "type": "sensor_data",
  "device_id": 1,
  "device_key": "69ced61b-5521-4ef7-ab17-19a2cdf14af8",
  "data": {
    "frequency": 50.5,
    "speed": 1500.2,
    "current": 5.2,
    "voltage": 380.0,
    "power": 3.2,
    "torque": 20.5,
    "status": 1,
    "faultCode": 0
  }
}
```

**Frontend receives:**
```json
{
  "type": "vfd_update",
  "device_id": 1,
  "data": {
    "id": 12345,
    "frequency": "50.5",
    "speed": "1500.2",
    "timestamp": "2024-03-05T10:30:00"
  }
}
```

---

**Happy monitoring!** 🎉

When you've completed the setup successfully, you'll be able to see real-time VFD data streaming from your ESP32 to the frontend dashboard.
