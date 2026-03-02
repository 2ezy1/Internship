# ESP32 Master WebSocket Integration - Complete Setup Guide

## ✅ Implementation Complete

All components have been implemented for ESP32 Master WebSocket integration with device verification, static IP configuration, and online/offline status tracking.

---

## 📋 What Was Implemented

### 1. **Backend Database & API Enhancements**

#### New Device Model Fields (models.py)
```python
- is_online: Boolean (default False) - Current connection status
- last_heartbeat: DateTime - Timestamp of last communication
- device_key: String (unique) - UUID for device authentication
- mac_address: String - Optional MAC address for verification
```

#### New API Endpoints
- `POST /devices/{device_id}/initialize-esp32` - Generate device key during registration
- `GET /devices/{device_id}/status` - Get current device status (Online/Warning/Offline)
- `POST /devices/{device_id}/regenerate-key` - Regenerate device key for security
- `WS /ws/esp32/connect` - WebSocket endpoint for ESP32 Master data transmission

#### Background Tasks
- Device heartbeat checker runs every 30 seconds
- Marks devices as offline if no heartbeat for 5+ minutes

### 2. **ESP32 Master Firmware (WebSocket)**

**Location**: `ESP32/master/src/`

**Features**:
- WiFi connection with static IP configuration
- Device authentication via device_key
- Sensor data transmission every 5 seconds
- Heartbeat messages every 30 seconds
- Automatic reconnection with exponential backoff
- Serial2 data reading from slave devices
- JSON message format for all communications

**Configuration File**: `config.h`
- WiFi credentials
- Static IP settings (10.60.240.0/24 network)
- Server address and port
- Device ID and key
- Poll intervals

### 3. **Frontend Updates (Home.tsx)**

**Enhanced Features**:
- Real-time device status fetching from API
- Status display: Online (🟢), Warning (🟡), Offline (🔴)
- Auto-refresh on device list render
- Status filtering (Online/Warning/Offline)
- Metrics updated to show "Online" devices

---

## 🚀 Setup Instructions

### **Step 1: Network Configuration**

#### A. Set Your Computer's Static IP

**Windows:**
1. Open Settings → Network & Internet → Change adapter options
2. Right-click your Ethernet/WiFi adapter → Properties
3. Select "Internet Protocol Version 4 (TCP/IPv4)" → Properties
4. Choose "Use the following IP address"
   - IP Address: `10.60.240.100`
   - Subnet Mask: `255.255.255.0`
   - Default Gateway: `10.60.240.7`
   - Preferred DNS: `8.8.8.8`
   - Alternate DNS: `8.8.4.4`
5. Click OK

#### B. Verify Network Connection
```bash
# Test if ESP32 can reach your computer
ping 10.60.240.100

# Test server is running
curl http://10.60.240.100:8000/health
```

---

### **Step 2: Database Migration**

The new fields are added to the Device model. Run the database initialization:

```bash
cd backend

# SQLAlchemy will auto-create tables with new fields on startup
python main.py
```

Check that the devices table now has:
- `is_online` (BOOLEAN)
- `last_heartbeat` (DATETIME)
- `device_key` (VARCHAR UNIQUE)
- `mac_address` (VARCHAR)

---

### **Step 3: Start Backend Server**

```bash
cd backend

# Install any new dependencies (if needed)
pip install -r requirements.txt

# Start FastAPI server
python main.py
```

**Expected Output:**
```
✅ User account 'user' already exists
✅ Admin account 'BITSOJT' already exists
Uvicorn running on http://0.0.0.0:8000
```

---

### **Step 4: Register ESP32 Master Device**

#### A. Create Device via API

Use the admin account (BITSOJT/BITS2026):

```bash
# Login first
curl -X POST http://10.60.240.100:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "BITSOJT",
    "password": "BITS2026"
  }'

# Note the access_token returned

# Create device (replace TOKEN with the token above)
curl -X POST http://10.60.240.100:8000/devices/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "device_name": "Master ESP32 Unit 1",
    "ip_address": "10.60.240.50",
    "type": "ESP32_Master",
    "mac_address": "AA:BB:CC:DD:EE:FF"
  }'
```

**Response Example:**
```json
{
  "id": 1,
  "device_name": "Master ESP32 Unit 1",
  "ip_address": "10.60.240.50",
  "device_key": "550e8400-e29b-41d4-a716-446655440000",
  "is_online": false,
  "type": "ESP32_Master"
}
```

#### B. Copy Device Key

Save the `device_key` value - you'll need it for the ESP32 firmware.

---

### **Step 5: Configure & Upload ESP32 Master Firmware**

#### A. Edit Configuration

Open `ESP32/master/src/config.h`:

```cpp
// WiFi
#define WIFI_SSID "POCO X7 Pro"
#define WIFI_PASSWORD "1234509876"

// Static IP (adjust last octet for multiple devices)
#define STATIC_IP_0 10
#define STATIC_IP_1 60
#define STATIC_IP_2 240
#define STATIC_IP_3 50              // Change this for different devices

// Server
#define SERVER_IP "10.60.240.100"   // Your computer's IP
#define SERVER_PORT 8000

// Device
#define DEVICE_ID 1                 // From device creation response
#define DEVICE_KEY "550e8400-..."   // Paste the device_key here
```

#### B. Upload Firmware

```bash
cd ESP32/master

# Compile
pio run

# Upload (select correct COM port)
pio run --target upload --upload-port COM7

# Monitor serial output
pio device monitor --port COM7 --baud 115200
```

**Expected Serial Output:**
```
=====================================
ESP32 Master WebSocket - Starting
=====================================
Device ID: 1
Server: 10.60.240.100:8000

📡 Configuring static IP...
✅ Static IP configured:
  IP: 10.60.240.50
  Gateway: 10.60.240.7
  Subnet: 255.255.255.0

📡 Connecting to WiFi...
✅ WiFi connected!
  Local IP: 10.60.240.50
  RSSI: -65 dBm

🔌 Connecting to WebSocket...
  Server: 10.60.240.100:8000
  Path: /ws/esp32/connect?device_id=1&device_key=550e8400-...

✅ WebSocket connected!
💖 Heartbeat sent - RSSI: -65 dBm
📡 Sensor data sent - Temp: 25.5°C, Humidity: 60%
```

---

### **Step 6: Verify Device Status**

#### A. Check Device Status Endpoint

```bash
# Get device status
curl http://10.60.240.100:8000/devices/1/status

# Response:
{
  "id": 1,
  "device_name": "Master ESP32 Unit 1",
  "ip_address": "10.60.240.50",
  "type": "ESP32_Master",
  "is_online": true,
  "last_heartbeat": "2026-03-02T10:30:45Z",
  "status": "Online"
}
```

#### B. Check Frontend

1. Open http://localhost:5173
2. Login with `user` / `user123`
3. Your device should show:
   - 🟢 Green icon = Online
   - 🟡 Yellow icon = Warning (no heartbeat > 1 min)
   - 🔴 Red icon = Offline (no heartbeat > 5 min)

---

## 📊 Data Flow

```
Slave Device (Serial)
    ↓ (Modbus/Serial2)
ESP32 Master
    ├─ Reads from Serial2
    ├─ Sends via WebSocket to Server
    └─ Includes device_key & IP verification
        ↓
Backend Server (10.60.240.100:8000)
    ├─✓ Verify device_key
    ├─✓ Verify IP address match
    ├─✓ Store sensor readings
    ├─✓ Update last_heartbeat
    ├─✓ Set is_online = true
    └─ Broadcast to frontend
        ↓
Frontend Dashboard
    ├─ Fetch device status
    ├─ Display real-time status
    └─ Show 🟢🟡🔴 indicators
```

---

## 🔍 Troubleshooting

### ESP32 Won't Connect to WiFi
- [ ] Check SSID and password in config.h
- [ ] Ensure router is 2.4GHz (ESP32 doesn't support 5GHz)
- [ ] Verify router IP is 10.60.240.7

### ESP32 Connects to WiFi but Not WebSocket
- [ ] Check server IP in config.h (should be your computer's IP)
- [ ] Verify backend server is running: `curl http://10.60.240.100:8000/health`
- [ ] Check device_key is correct
- [ ] Check device_id matches database
- [ ] Look at backend logs for connection errors

### Device Shows "Offline" Even When Connected
- [ ] Check last_heartbeat in status endpoint
- [ ] Verify esp32 is sending heartbeat messages (check serial monitor)
- [ ] Check network connectivity between esp32 and server

### No Data in Database
- [ ] Verify device is showing as "Online"
- [ ] Check ESP32 serial monitor shows "Sensor data sent"
- [ ] Query database: `SELECT * FROM sensor_readings ORDER BY timestamp DESC LIMIT 5`

---

## 🔒 Security Notes

1. **Device Key**: Each ESP32 has a unique UUID - never hardcode the same key for multiple devices
2. **IP Verification**: Server validates that connection comes from registered IP address
3. **HTTPS/WSS**: For production, upgrade to WSS (WebSocket Secure) with TLS certificates
4. **Change Passwords**: Update default passwords before deployment

---

## 📈 Testing Checklist

- [ ] Network static IPs configured correctly
- [ ] Backend server running on 10.60.240.100:8000
- [ ] Device created in database with device_key
- [ ] ESP32 firmware compiled with correct config.h
- [ ] ESP32 connected to WiFi (shows in serial monitor)
- [ ] ESP32 connected to WebSocket (shows in serial monitor)
- [ ] Sensor data appearing in frontend
- [ ] Device shows "Online" status in dashboard
- [ ] Status changes to "Warning" after 1 minute without heartbeat
- [ ] Status changes to "Offline" after 5 minutes without heartbeat

---

## 📞 Support

For issues with:
- **Backend API**: Check logs in terminal running `python main.py`
- **ESP32 Firmware**: Check serial monitor output at 115200 baud
- **Frontend**: Check browser console (F12)
- **Network**: Ping both devices and verify IP addresses with `ipconfig`

---

**Last Updated**: March 2, 2026
**Status**: ✅ Ready for Testing
