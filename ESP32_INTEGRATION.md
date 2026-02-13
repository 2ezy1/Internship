# ESP32 Integration Guide

## 🚀 New Features

Your Device Management System now includes **real-time ESP32 sensor monitoring** with WebSocket support!

### What's New:

✅ **Real-time WebSocket Communication**
- Live sensor data streaming from ESP32 devices
- Automatic updates in the web interface
- No page refresh needed

✅ **Sensor Data Storage**
- Temperature, humidity, pressure, light, and motion detection
- Historical data with timestamps
- Queryable via REST API

✅ **Enhanced Device Details Page**
- Live sensor readings with visual indicators
- Real-time temperature charts
- Connection status monitoring
- Historical data visualization

✅ **ESP32 Arduino Sketch**
- Ready-to-use code for ESP32
- Support for multiple sensors
- Automatic reconnection
- Detailed documentation

---

## 🏗️ Architecture

```
┌─────────────┐        WebSocket         ┌──────────────┐
│   ESP32     │ ─────────────────────────>│   FastAPI    │
│   Device    │ <─────────────────────────│   Backend    │
└─────────────┘    (Real-time data)       └──────────────┘
                                                  │
                                                  │ Store
                                                  ↓
                                           ┌──────────────┐
                                           │  PostgreSQL  │
                                           │   Database   │
                                           └──────────────┘
                                                  │
                                                  │ Broadcast
                                                  ↓
┌─────────────┐        WebSocket         ┌──────────────┐
│   React     │ <─────────────────────────│   FastAPI    │
│  Frontend   │ ─────────────────────────>│   Backend    │
└─────────────┘    (Live updates)         └──────────────┘
```

---

## 📋 Setup Instructions

### 1. Install Backend Dependencies

```bash
cd /home/bits/Desktop/Internship/backend
pip install -r requirements.txt
```

The updated `requirements.txt` now includes:
- `websockets==12.0` for WebSocket support

### 2. Start the Backend Server

```bash
cd /home/bits/Desktop/Internship/backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Important:** Use `--host 0.0.0.0` to allow ESP32 to connect from the network.

### 3. Start the Frontend

```bash
cd /home/bits/Desktop/Internship/frontend
npm run dev
```

The frontend will be available at `http://localhost:5173`

### 4. Configure ESP32

See [ESP32/README.md](/home/bits/Desktop/ESP32/README.md) for detailed ESP32 setup instructions.

**Quick steps:**
1. Open Arduino IDE
2. Install required libraries (WebSocketsClient, ArduinoJson)
3. Open `ESP32/ESP32_WebSocket_Sensor/ESP32_WebSocket_Sensor.ino`
4. Update WiFi credentials and server IP
5. Upload to ESP32

---

## 🔌 WebSocket Endpoints

### For ESP32 (Send Sensor Data)

**Endpoint:** `ws://YOUR_SERVER_IP:8000/ws/esp32/send/{device_id}`

**ESP32 sends JSON:**
```json
{
  "temperature": "25.5",
  "humidity": "60.2",
  "pressure": "1013.25",
  "light": "523",
  "motion": "false",
  "custom_data": {
    "wifi_rssi": -45,
    "uptime": 3600
  }
}
```

**Server responds:**
```json
{
  "status": "ok",
  "reading_id": 123
}
```

### For Frontend (Receive Real-time Updates)

**Endpoint:** `ws://YOUR_SERVER_IP:8000/ws/device/{device_id}`

**Frontend receives:**
```json
{
  "type": "sensor_update",
  "device_id": 1,
  "data": {
    "id": 123,
    "temperature": "25.5",
    "humidity": "60.2",
    "pressure": "1013.25",
    "light": "523",
    "motion": "false",
    "custom_data": null,
    "timestamp": "2026-02-13T10:30:45.123456"
  }
}
```

---

## 🛠️ REST API Endpoints

### Get Latest Sensor Reading

**GET** `/sensors/latest/{device_id}`

**Response:**
```json
{
  "id": 123,
  "device_id": 1,
  "temperature": "25.5",
  "humidity": "60.2",
  "pressure": "1013.25",
  "light": "523",
  "motion": "false",
  "custom_data": null,
  "timestamp": "2026-02-13T10:30:45.123456"
}
```

### Get Sensor Reading History

**GET** `/sensors/readings/{device_id}?limit=100`

**Response:**
```json
[
  {
    "id": 123,
    "device_id": 1,
    "temperature": "25.5",
    "humidity": "60.2",
    ...
  },
  ...
]
```

### Create Sensor Reading (for testing)

**POST** `/sensors/readings`

**Body:**
```json
{
  "device_id": 1,
  "temperature": "25.5",
  "humidity": "60.2",
  "pressure": "1013.25",
  "light": "523",
  "motion": "false"
}
```

---

## 🧪 Testing Without ESP32

You can test the WebSocket functionality without physical hardware:

### Option 1: Python Test Script

```bash
cd /home/bits/Desktop/ESP32
python3 test_websocket_client.py
```

This simulates an ESP32 sending sensor data every 5 seconds.

### Option 2: Manual POST Request

```bash
curl -X POST http://localhost:8000/sensors/readings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "device_id": 1,
    "temperature": "25.5",
    "humidity": "60.2",
    "pressure": "1013.25",
    "light": "523",
    "motion": "false"
  }'
```

### Option 3: Swagger UI

Visit `http://localhost:8000/docs` and use the interactive API documentation.

---

## 💻 Frontend Implementation

### WebSocket Service

The frontend uses a custom WebSocket service (`src/services/websocket.ts`) that:
- Automatically reconnects on connection loss
- Handles ping/pong for keeping connections alive
- Provides clean event handlers for messages
- Manages connection state

### Device Details Page Updates

The [DeviceDetails.tsx](frontend/src/pages/DeviceDetails.tsx) page now:
- Connects to WebSocket on component mount
- Displays real-time sensor readings
- Shows connection status with badge
- Renders historical data in charts
- Automatically updates when new data arrives

### Usage Example

```typescript
import { DeviceWebSocket } from '../services/websocket'

const ws = new DeviceWebSocket(deviceId)

ws.onMessage((message) => {
  if (message.type === 'sensor_update') {
    console.log('New sensor data:', message.data)
    // Update UI
  }
})

ws.connect()
```

---

## 🗄️ Database Schema Updates

### New Table: `sensor_readings`

```sql
CREATE TABLE sensor_readings (
    id SERIAL PRIMARY KEY,
    device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE,
    temperature VARCHAR,
    humidity VARCHAR,
    pressure VARCHAR,
    light VARCHAR,
    motion VARCHAR,
    custom_data VARCHAR,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

The database will be automatically created/updated when you start the backend server.

---

## 🔍 Monitoring and Debugging

### Backend Logs

Watch the backend terminal for WebSocket events:
```
✅ WebSocket connected for device 1. Total connections: 1
📡 Received data from ESP32 device 1: {...}
📊 Sensor reading saved for device 1
```

### Frontend Console

Open browser DevTools (F12) and check the Console for:
```
🔌 Connecting to WebSocket: ws://localhost:8000/ws/device/1
✅ Connected to device WebSocket
📨 WebSocket message received: {...}
```

### ESP32 Serial Monitor

In Arduino IDE, open Serial Monitor (115200 baud) to see:
```
✅ WiFi Connected!
✅ WebSocket Connected!
📤 Sending sensor data: {...}
✅ Server acknowledged data
```

---

## 🚨 Troubleshooting

### WebSocket Connection Failed

**Problem:** Frontend can't connect to WebSocket

**Solutions:**
1. Ensure backend is running with `--host 0.0.0.0`
2. Check if WebSocket endpoint is accessible: `ws://YOUR_IP:8000/ws/device/1`
3. Verify firewall allows port 8000
4. Check CORS settings in backend

### ESP32 Can't Connect

**Problem:** ESP32 shows "Connection refused"

**Solutions:**
1. Verify server IP address in Arduino code
2. Ensure backend is running on `0.0.0.0` not `127.0.0.1`
3. Check if ESP32 and server are on same network
4. Verify device ID exists in database
5. Check firewall settings

### No Data Appearing

**Problem:** WebSocket connects but no data shows

**Solutions:**
1. Check device ID matches in ESP32 code and database
2. Verify user has access to the device (ownership)
3. Check backend logs for errors
4. Use browser DevTools to inspect WebSocket messages
5. Test with Python simulator first

### Database Errors

**Problem:** "Table sensor_readings does not exist"

**Solutions:**
1. Stop the backend server
2. Delete the database file (if using SQLite) or drop tables
3. Restart the backend server (tables will be recreated)

---

## 🎯 Next Steps

### 1. Add More Sensors to ESP32

Enhance your ESP32 with real sensors:
- DHT22 for temperature/humidity
- BMP280 for atmospheric pressure
- LDR for light detection
- PIR for motion detection

See [ESP32/README.md](/home/bits/Desktop/ESP32/README.md) for wiring diagrams.

### 2. Add More Visualizations

Enhance the frontend with:
- Humidity charts
- Pressure trends
- Light level gauges
- Motion event timeline

### 3. Add Alerts

Implement threshold-based alerts:
- Email/SMS when temperature exceeds limits
- Notifications for motion detection
- Warnings for abnormal readings

### 4. Multi-Device Dashboard

Create a dashboard showing:
- All devices at a glance
- Average readings across devices
- Device comparison charts
- Status summary

### 5. Data Export

Add functionality to:
- Export sensor data to CSV
- Generate PDF reports
- Schedule automated backups

---

## 📚 API Documentation

Full API documentation is available at:
```
http://localhost:8000/docs
```

This interactive documentation (Swagger UI) allows you to:
- Browse all endpoints
- Test API calls directly
- View request/response schemas
- See authentication requirements

---

## 🔒 Security Considerations

**Current Implementation (Development):**
- WebSocket connections are **not authenticated**
- CORS allows all origins
- HTTP (not HTTPS)

**For Production:**
1. Add WebSocket authentication
2. Use HTTPS/WSS (encrypted)
3. Restrict CORS to specific origins
4. Implement rate limiting
5. Add API keys for ESP32 devices
6. Use environment variables for secrets

---

## 📝 Code Changes Summary

### Backend Changes

1. **models.py**: Added `SensorReading` model
2. **schemas.py**: Added sensor reading schemas
3. **main.py**: Added WebSocket endpoints and connection manager
4. **requirements.txt**: Added `websockets==12.0`

### Frontend Changes

1. **websocket.ts**: New WebSocket service class
2. **api.ts**: Added sensor API endpoints
3. **DeviceDetails.tsx**: Complete rewrite with real-time data
4. No package.json changes (WebSocket is native to browsers)

### New Files

1. **ESP32/ESP32_WebSocket_Sensor/ESP32_WebSocket_Sensor.ino**: Arduino sketch
2. **ESP32/README.md**: ESP32 setup guide
3. **ESP32/test_websocket_client.py**: Python test simulator

---

## 🤝 Support

For issues or questions:
1. Check the troubleshooting section above
2. Review backend/frontend console logs
3. Test with the Python simulator
4. Examine the Swagger API docs

---

## 📄 License

MIT License - Feel free to use and modify for your projects.

---

**Happy Monitoring! 🎉**
