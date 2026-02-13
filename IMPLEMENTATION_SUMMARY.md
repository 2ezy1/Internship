# 🎉 ESP32 Integration Complete!

## Summary

I've successfully enhanced your Device Management System with **real-time ESP32 sensor monitoring** using WebSockets! Your system can now:

✅ Receive live sensor data from ESP32 devices  
✅ Display real-time readings in the web interface  
✅ Store historical sensor data in the database  
✅ Show live temperature charts  
✅ Support multiple sensors (temperature, humidity, pressure, light, motion)

---

## 📂 What Was Added/Modified

### Backend Changes

**1. models.py**
- Added `SensorReading` model with fields for temperature, humidity, pressure, light, motion, and custom data
- Added relationship between Device and SensorReading (one-to-many)

**2. schemas.py**
- Added `SensorReadingBase`, `SensorReadingCreate`, and `SensorReading` schemas
- Validates incoming sensor data from ESP32

**3. main.py** ⭐ Major changes
- Added WebSocket support imports (`WebSocket`, `WebSocketDisconnect`)
- Created `ConnectionManager` class to manage WebSocket connections
- Added WebSocket endpoint `/ws/device/{device_id}` for frontend to receive real-time updates
- Added WebSocket endpoint `/ws/esp32/send/{device_id}` for ESP32 to send sensor data
- Added REST endpoint `POST /sensors/readings` to store sensor data
- Added REST endpoint `GET /sensors/readings/{device_id}` to fetch historical data
- Added REST endpoint `GET /sensors/latest/{device_id}` to get the most recent reading

**4. requirements.txt**
- Added `websockets==12.0` dependency

### Frontend Changes

**1. src/services/websocket.ts** (NEW FILE)
- Complete WebSocket client implementation
- Auto-reconnection with exponential backoff
- Ping/pong keep-alive mechanism
- Clean event handler API
- Connection state management

**2. src/services/api.ts**
- Added `sensorAPI` with methods:
  - `getSensorReadings()` - fetch historical data
  - `getLatestReading()` - get most recent reading
  - `createReading()` - manually create a reading (for testing)

**3. src/pages/DeviceDetails.tsx** ⭐ Complete rewrite
- Removed simulated data generation
- Added WebSocket connection on component mount
- Displays real-time sensor readings with Ant Design Statistic components
- Shows connection status with Badge indicator
- Renders temperature history chart from actual data
- Auto-updates UI when new data arrives
- Shows loading states and error messages
- Displays "No data available" when no readings exist yet

### ESP32 Code

**1. ESP32/ESP32_WebSocket_Sensor/ESP32_WebSocket_Sensor.ino** (NEW FILE)
- Complete Arduino sketch for ESP32
- WiFi connection management
- WebSocket client implementation
- Simulated sensor readings (easily replaceable with real sensors)
- JSON data serialization
- Auto-reconnection
- Detailed comments and instructions
- Support for DHT22, BMP280, LDR, and PIR sensors (commented examples)

**2. ESP32/README.md** (NEW FILE)
- Complete setup guide for ESP32
- Hardware requirements
- Software installation instructions
- Configuration steps
- Wiring diagrams for real sensors
- Troubleshooting guide

**3. ESP32/test_websocket_client.py** (NEW FILE)
- Python script to simulate ESP32 without hardware
- Useful for testing the entire WebSocket flow
- Generates realistic sensor readings
- Shows connection status and server responses

### Documentation

**1. Internship/ESP32_INTEGRATION.md** (NEW FILE)
- Complete integration guide
- Architecture diagram
- API documentation
- Testing instructions
- Troubleshooting section
- Security considerations
- Next steps and enhancement ideas

---

## 🚀 How to Run Everything

### Step 1: Start Backend Server

```bash
cd /home/bits/Desktop/Internship/backend

# Install new dependencies
pip install -r requirements.txt

# Start server (note the --host 0.0.0.0 to allow ESP32 connection)
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Expected output:**
```
INFO:     Uvicorn running on http://0.0.0.0:8000
✅ User account 'user' already exists
✅ Admin account 'BITSOJT' already exists
```

### Step 2: Start Frontend

```bash
cd /home/bits/Desktop/Internship/frontend

# Start development server
npm run dev
```

**Access at:** `http://localhost:5173`

### Step 3: Test WebSocket (Without ESP32)

```bash
cd /home/bits/Desktop/ESP32

# Run the Python test client
python3 test_websocket_client.py
```

This will simulate an ESP32 sending sensor data every 5 seconds.

### Step 4: View Real-time Data

1. Login to the web interface (user/user123 or BITSOJT/BITS2026)
2. Create a device with ID=1 (or use existing device)
3. Click on the device to view details
4. You should see "Live" badge when WebSocket is connected
5. Watch the sensor readings update in real-time!

### Step 5: Setup Real ESP32 (Optional)

See [ESP32/README.md](/home/bits/Desktop/ESP32/README.md) for complete instructions.

**Quick steps:**
1. Open Arduino IDE
2. Install libraries: WebSocketsClient, ArduinoJson
3. Open `ESP32_WebSocket_Sensor.ino`
4. Update WiFi SSID, password, and server IP
5. Upload to ESP32
6. Open Serial Monitor to see debug output

---

## 🔍 Testing the Integration

### Test 1: Backend API

```bash
# Check if server is running
curl http://localhost:8000/health

# View API docs
# Open in browser: http://localhost:8000/docs
```

### Test 2: Create a Test Reading

```bash
# Get auth token first
TOKEN=$(curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"user","password":"user123"}' \
  | jq -r '.access_token')

# Create a test reading
curl -X POST http://localhost:8000/sensors/readings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "device_id": 1,
    "temperature": "25.5",
    "humidity": "60.2",
    "pressure": "1013.25",
    "light": "523",
    "motion": "false"
  }'
```

### Test 3: WebSocket Connection

1. Open browser DevTools (F12)
2. Go to Device Details page
3. Check Console tab for WebSocket messages:
   ```
   🔌 Connecting to WebSocket: ws://localhost:8000/ws/device/1
   ✅ Connected to device WebSocket
   ```

### Test 4: Python Simulator

```bash
cd /home/bits/Desktop/ESP32
python3 test_websocket_client.py
```

Watch the backend terminal and browser simultaneously to see data flow:
```
ESP32 Simulator → Backend → Database → Frontend (real-time update)
```

---

## 📊 Database Schema

The database now includes a new `sensor_readings` table:

```sql
sensor_readings
├── id (PRIMARY KEY)
├── device_id (FOREIGN KEY → devices.id)
├── temperature (VARCHAR)
├── humidity (VARCHAR)
├── pressure (VARCHAR)
├── light (VARCHAR)
├── motion (VARCHAR)
├── custom_data (VARCHAR, JSON string)
└── timestamp (TIMESTAMP WITH TIMEZONE)
```

---

## 🎯 Usage Flow

### ESP32 to Server
```
1. ESP32 connects to WiFi
2. ESP32 establishes WebSocket connection to /ws/esp32/send/{device_id}
3. ESP32 sends JSON sensor data every 5 seconds
4. Server receives, validates, and stores in database
5. Server broadcasts to all connected web clients
```

### Frontend to Server
```
1. User opens Device Details page
2. Frontend establishes WebSocket connection to /ws/device/{device_id}
3. Frontend receives real-time sensor updates
4. UI automatically updates with new data
5. Charts re-render with latest readings
```

---

## 🐛 Troubleshooting

### Issue: "WebSocket connection failed"

**Solution:**
- Ensure backend is running with `--host 0.0.0.0`
- Check firewall settings (allow port 8000)
- Verify correct IP address in ESP32 code

### Issue: "No sensor data available"

**Solution:**
- Make sure device ID exists in database
- Check if ESP32 is sending data (Serial Monitor)
- Verify WebSocket connection is established
- Try the Python test script first

### Issue: "ESP32 can't connect"

**Solution:**
- Verify WiFi credentials are correct
- Check server IP address (use `hostname -I` to find it)
- Ensure ESP32 and server are on same network
- Check Serial Monitor for error messages

### Issue: "Frontend not updating"

**Solution:**
- Open browser DevTools and check Console for errors
- Verify WebSocket connection status (should show "Live")
- Check Network tab for WebSocket connection
- Ensure you're viewing the correct device

---

## 📈 What Can You Do Now?

### 1. Monitor Multiple Devices
- Add multiple ESP32 devices
- Each device sends its own sensor data
- View all devices from the home page
- Click any device to see its real-time data

### 2. Historical Analysis
- All sensor readings are stored in the database
- Query historical data via REST API
- Export data for analysis
- View temperature trends over time

### 3. Add Real Sensors
- Replace simulated readings with real DHT22 (temperature/humidity)
- Add BMP280 for atmospheric pressure
- Connect LDR for light detection
- Integrate PIR for motion sensing

### 4. Extend the System
- Add email/SMS alerts for threshold violations
- Create multi-device dashboard
- Implement data export to CSV
- Add more sensor types (air quality, CO2, etc.)
- Set up automated reports

---

## 🔒 Security Notes

**Current Implementation (Development Mode):**
- ⚠️ WebSocket connections are NOT authenticated
- ⚠️ CORS allows all origins
- ⚠️ Using HTTP (not HTTPS)
- ⚠️ No rate limiting

**For Production Deployment:**
- ✅ Add WebSocket authentication (JWT tokens)
- ✅ Use HTTPS/WSS with SSL certificates
- ✅ Restrict CORS to specific origins
- ✅ Implement rate limiting
- ✅ Add API keys for ESP32 devices
- ✅ Use environment variables for secrets
- ✅ Add input validation and sanitization

---

## 📚 Key Files Reference

| File | Purpose |
|------|---------|
| `backend/main.py` | WebSocket endpoints, connection manager |
| `backend/models.py` | SensorReading database model |
| `backend/schemas.py` | Data validation schemas |
| `frontend/src/services/websocket.ts` | WebSocket client class |
| `frontend/src/pages/DeviceDetails.tsx` | Real-time sensor display |
| `ESP32/ESP32_WebSocket_Sensor.ino` | Arduino code for ESP32 |
| `ESP32/test_websocket_client.py` | Python test simulator |
| `ESP32_INTEGRATION.md` | Complete integration guide |

---

## 🎓 How It Works

### WebSocket Flow
```
┌──────────┐                ┌──────────┐                ┌──────────┐
│  ESP32   │────JSON data───>│  Backend │────broadcast──>│ Frontend │
│  Device  │<───ack/error───│  Server  │<───subscribe──│   Client │
└──────────┘                └──────────┘                └──────────┘
                                  │
                                  │ Store
                                  ↓
                            ┌──────────┐
                            │ Database │
                            └──────────┘
```

### Data Format

**ESP32 sends:**
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

**Frontend receives:**
```json
{
  "type": "sensor_update",
  "device_id": 1,
  "data": {
    "id": 123,
    "temperature": "25.5",
    "humidity": "60.2",
    "timestamp": "2026-02-13T10:30:45.123456"
  }
}
```

---

## 🆘 Need Help?

1. **Check Logs:**
   - Backend terminal for server logs
   - Browser DevTools Console for frontend errors
   - Arduino Serial Monitor for ESP32 debug output

2. **Read Documentation:**
   - [ESP32_INTEGRATION.md](/home/bits/Desktop/Internship/ESP32_INTEGRATION.md) - Complete guide
   - [ESP32/README.md](/home/bits/Desktop/ESP32/README.md) - ESP32 setup
   - API Docs: http://localhost:8000/docs

3. **Test Step by Step:**
   - Start with Python simulator
   - Verify backend receives data
   - Check frontend displays data
   - Then move to real ESP32

---

## ✨ What's Next?

**Immediate improvements:**
- Add more sensor types
- Implement data visualization (charts, graphs)
- Create alerts and notifications
- Add data export functionality

**Future enhancements:**
- Mobile app for monitoring
- Machine learning for anomaly detection
- Multi-user dashboard
- Integration with cloud services (AWS IoT, Azure IoT Hub)

---

## 🎊 Conclusion

Your Device Management System is now a **complete IoT platform** with:
- ✅ Real-time sensor monitoring
- ✅ WebSocket communication
- ✅ Historical data storage
- ✅ Interactive web interface
- ✅ ESP32 integration
- ✅ Extensible architecture

**You can now:**
1. Monitor ESP32 sensors in real-time
2. Store and analyze sensor data
3. View live updates without page refresh
4. Add multiple devices and sensors
5. Build upon this foundation for more complex IoT projects

---

**Happy Monitoring! 🚀📡🎉**

Made with ❤️ for your Internship Project
