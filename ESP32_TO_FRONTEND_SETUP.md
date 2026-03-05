# ESP32 to Frontend Data Transmission Setup Guide

## Overview
This guide explains how to set up complete data transmission from your ESP32 → Backend Server → Frontend Application.

## Architecture Flow
```
ESP32 Master ──(WebSocket)──> Backend ──(WebSocket Broadcast)──> Frontend
                 /ws/esp32/connect           /ws/device/{id}
```

---

## Prerequisites
- Backend running on `192.168.254.110:8000`
- Device registered in database with:
  - **Device ID**: `1`
  - **Device Key**: `69ced61b-5521-4ef7-ab17-19a2cdf14af8`
  - **Type**: `RS485` or `ESP32`
- Frontend accessible at `http://<your-ip>:5173`

---

## Step 1: Backend Setup ✅ (Already Configured)

Your backend (`/backend/main.py`) already has:

### ESP32 WebSocket Endpoint
- **Path**: `/ws/esp32/connect`
- **URL**: `ws://192.168.254.110:8000/ws/esp32/connect?device_id=1&device_key=69ced61b-5521-4ef7-ab17-19a2cdf14af8`
- **Receives**: Sensor data and heartbeats from ESP32
- **Broadcasts to**: All connected frontend clients watching device ID 1

### Frontend WebSocket Endpoint  
- **Path**: `/ws/device/{device_id}`
- **URL**: `ws://192.168.254.110:8000/ws/device/1`
- **Sends**: Real-time VFD/sensor updates to connected frontend clients

---

## Step 2: ESP32 Configuration ✅ (Updated)

Update `ESP32/master/src/config.h`:

```cpp
// Server Configuration
#define SERVER_IP "192.168.254.110"        // Your backend server IP
#define SERVER_PORT 8000
#define SERVER_PATH "/ws/esp32/connect"

// Device Configuration
#define DEVICE_ID 1                         // Must match database
#define DEVICE_KEY "69ced61b-5521-4ef7-ab17-19a2cdf14af8"  // Must match database
#define POLL_INTERVAL_MS 1000              // Send data every 1 second
#define HEARTBEAT_INTERVAL_MS 30000        // Heartbeat every 30 seconds
```

### Data Format (What ESP32 Sends)

**Sensor Data Message**:
```json
{
  "type": "sensor_data",
  "device_id": 1,
  "device_key": "69ced61b-5521-4ef7-ab17-19a2cdf14af8",
  "timestamp": "1234567890",
  "rssi": -45,
  "uptime": 3600000,
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

**Heartbeat Message**:
```json
{
  "type": "heartbeat",
  "device_id": 1,
  "device_key": "69ced61b-5521-4ef7-ab17-19a2cdf14af8",
  "timestamp": "1234567890",
  "rssi": -45,
  "uptime": 3600000
}
```

---

## Step 3: Frontend Real-time Updates (New)

A new hook has been created: `frontend/src/hooks/useDeviceRealtime.ts`

### Usage Example

```typescript
import { useDeviceRealtime } from '../hooks/useDeviceRealtime'

function MyComponent() {
  const { isConnected, lastUpdate, error } = useDeviceRealtime(1) // Device ID = 1
  
  return (
    <div>
      <p>Connected: {isConnected ? '✅' : '❌'}</p>
      {lastUpdate && (
        <div>
          <p>Frequency: {lastUpdate.frequency} Hz</p>
          <p>Speed: {lastUpdate.speed} RPM</p>
          <p>Current: {lastUpdate.current} A</p>
          <p>Power: {lastUpdate.power} kW</p>
        </div>
      )}
      {error && <p>Error: {error}</p>}
    </div>
  )
}
```

### In DeviceDetails Component

The hook has been imported. To use it:

```typescript
// Inside DeviceDetails component, after other state declarations:
const { isConnected: realtimeConnected, lastUpdate: realtimeData } = useDeviceRealtime(deviceId)

// Then display the real-time data:
useEffect(() => {
  if (realtimeData) {
    console.log('Real-time VFD update:', realtimeData)
    // Update your UI with realtimeData
    // e.g., update chart, statistics, etc.
  }
}, [realtimeData])
```

---

## Step 4: Database Setup ✅

Ensure your device is registered:

```python
# In backend, verify device exists:
# Device ID: 1
# Device Name: (e.g., "VFD Master")
# IP Address: (will be auto-detected from ESP32)
# Device Key: "69ced61b-5521-4ef7-ab17-19a2cdf14af8"
# Type: "RS485" or "VFD"
```

To register a new device via API:
```bash
curl -X POST http://192.168.254.110:8000/devices/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "device_name": "VFD Master",
    "ip_address": "192.168.254.111",
    "type": "RS485"
  }'
```

---

## Step 5: Testing the Setup

### 1. **Test Backend WebSocket Endpoint**
```bash
# Use wscat or websocat
wscat -c "ws://192.168.254.110:8000/ws/esp32/connect?device_id=1&device_key=69ced61b-5521-4ef7-ab17-19a2cdf14af8"

# Should see:
# ✅ Connected
# Then test by sending:
# {"type":"heartbeat","device_id":1,"device_key":"69ced61b-5521-4ef7-ab17-19a2cdf14af8","timestamp":"1234567"}
```

### 2. **Monitor Backend Logs**
```bash
cd backend
python main.py

# Look for messages like:
# ✅ ESP32 device 1 connected from 192.168.254.111
# 💖 Heartbeat from device 1: RSSI=-45
# 📡 VFD data from device 1: Freq=50.0Hz, Speed=1500.0RPM
# 📡 Data from device 1 received and broadcasted
```

### 3. **Test Frontend WebSocket Connection**
```bash
# In browser console:
const ws = new WebSocket('ws://192.168.254.110:8000/ws/device/1')
ws.onmessage = (e) => console.log('Received:', JSON.parse(e.data))
ws.onopen = () => console.log('Connected!')

# You should see real-time updates when ESP32 sends data
```

### 4. **Test Complete Flow**
1. Start ESP32 master
2. Watch backend console for connection messages
3. Open frontend at `http://localhost:5173/devices/1`
4. Watch frontend console for real-time data
5. Chart should update with live data from ESP32

---

## Troubleshooting

### Backend not receiving ESP32 data
```
✅ Check 1: ESP32 is connected to WiFi
  - Monitor serial output for "WiFi connected!" message
  
✅ Check 2: SERVER_IP is correct
  - Verify IP address matches your backend server
  - Test with: ping 192.168.254.110
  
✅ Check 3: Port 8000 is accessible
  - Ensure firewall allows connections to :8000
  - Test with: curl http://192.168.254.110:8000/health
  
✅ Check 4: Device ID and Key match
  - Check database for registered device
  - Run: SELECT id, device_key FROM devices WHERE id = 1;
```

### Frontend not receiving broadcasts
```
✅ Check 1: Backend is broadcasting
  - Look for "Broadcast to all connected clients for device X" in logs
  
✅ Check 2: Frontend WebSocket connection
  - Open DevTools → Network → WS
  - Should see ws://..../ws/device/1 connection
  
✅ Check 3: CORS/Network issues
  - Check browser console for blocked WebSocket errors
  - Verify firewall rules
```

### WebSocket Connection Drops
```
✅ Solution 1: Increase heartbeat frequency
  - Change HEARTBEAT_INTERVAL_MS to lower value (e.g., 15000)
  
✅ Solution 2: Add reconnect logic
  - Already implemented in both ESP32 and frontend
  - Check reconnection messages in logs
  
✅ Solution 3: Check network stability
  - Monitor WiFi signal strength (RSSI)
  - Check for network interference
```

---

## Data Flow Verification Checklist

- [ ] Backend is running on `192.168.254.110:8000`
- [ ] ESP32 is configured with correct `SERVER_IP` and `DEVICE_KEY`
- [ ] Device is registered in database with ID `1`
- [ ] Backend receives connection: `✅ ESP32 device 1 connected`
- [ ] Backend receives heartbeat: `💖 Heartbeat from device 1`
- [ ] Backend receives sensor data: `📡 VFD data from device 1`
- [ ] Backend broadcasts: Messages show broadcast confirmation
- [ ] Frontend WebSocket connects: `ws://..../ws/device/1` shows in DevTools
- [ ] Frontend receives data: Real-time updates shown in console
- [ ] Chart/UI updates with live data

---

## Environment Variables

### Backend (.env)
```env
JWT_SECRET_KEY=your-secret-key
MODBUS_PORT=COM5
MODBUS_BAUDRATE=9600
MODBUS_SLAVE_ID=1
MODBUS_POLL_INTERVAL_MS=1000
MODBUS_BRAND=teco
```

### Frontend (.env.local)
```env
VITE_API_BASE=http://192.168.254.110:8000
```

---

## API Endpoints Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Backend health check |
| `/auth/login` | POST | User login |
| `/devices/` | GET/POST | List/create devices |
| `/devices/{id}` | GET/PUT/DELETE | Get/update/delete device |
| `/devices/{id}/status` | GET | Get device online status |
| `/devices/{id}/initialize-esp32` | POST | Initialize ESP32 with key |
| `/ws/esp32/connect` | WS | ESP32 data stream (from device) |
| `/ws/device/{id}` | WS | Frontend data stream (to clients) |
| `/sensors/readings/{id}` | GET | Get sensor historical data |
| `/vfd/readings/{id}` | GET | Get VFD historical data |

---

## Next Steps

1. **Upload code to ESP32**:
   ```bash
   cd ESP32/master
   platformio run --target upload
   ```

2. **Monitor ESP32 serial output**:
   ```bash
   platformio device monitor --baud 115200
   ```

3. **Start backend**:
   ```bash
   cd backend
   python main.py
   ```

4. **Start frontend**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

5. **Navigate to device page**:
   - Open `http://localhost:5173/devices/1`
   - Should show real-time data updates

---

## Success Indicators

✅ **ESP32 Console Output:**
```
✅ WiFi connected!
✅ WebSocket connected!
📡 VFD data sent - Freq: 50.0 Hz, Speed: 1500.0 RPM
```

✅ **Backend Console Output:**
```
✅ ESP32 device 1 connected from 192.168.254.111
💖 Heartbeat from device 1: RSSI=-45
📡 VFD data from device 1: Freq=50.0Hz, Speed=1500.0RPM
```

✅ **Frontend Console Output:**
```
🔌 Connecting to device WebSocket: ws://192.168.254.110:8000/ws/device/1
✅ Device WebSocket connected for device 1
📨 Real-time update received: {type: 'vfd_update', data: {...}}
```

✅ **Visual Indicators:**
- Device shows as "Online" in device list
- Real-time data displayed in GUI
- Chart updates with live values
- Last heartbeat timestamp is recent

---

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review backend logs: `python main.py --debug`
3. Monitor ESP32 serial: `platformio device monitor`
4. Check frontend console: DevTools → Console tab
5. Inspect WebSocket traffic: DevTools → Network tab
