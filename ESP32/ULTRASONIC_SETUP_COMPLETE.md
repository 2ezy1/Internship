# 🎉 ESP32 Ultrasonic Sensor Integration - COMPLETE!

## What Was Added

Your Device Management System now supports **ESP32 with HC-SR04 Ultrasonic Distance Sensor** with real-time WebSocket streaming!

---

## ✨ New Features

### 1. Ultrasonic Distance Sensor Support
- ✅ HC-SR04 sensor integration
- ✅ Real-time distance measurements (2-400 cm)
- ✅ WebSocket streaming to web interface
- ✅ Historical data storage and charting
- ✅ Live distance display with color indicators

### 2. Complete ESP32 Code
- ✅ Ready-to-use Arduino sketch
- ✅ WiFi and WebSocket client
- ✅ HC-SR04 sensor reading with noise filtering
- ✅ Automatic reconnection
- ✅ Detailed comments and configuration guide

### 3. Comprehensive Documentation
- ✅ Step-by-step setup guide
- ✅ Wiring diagrams
- ✅ Troubleshooting section
- ✅ Network configuration help
- ✅ Device registration instructions

---

## 📂 What Was Modified

### Backend Changes

**1. models.py** - Added ultrasonic distance field
```python
class SensorReading(Base):
    # ... existing fields ...
    distance = Column(String, nullable=True)  # ← NEW
```

**2. schemas.py** - Updated schema validation
```python
class SensorReadingBase(BaseModel):
    # ... existing fields ...
    distance: Optional[str] = None  # ← NEW
```

**3. main.py** - Updated WebSocket broadcast messages
```python
"data": {
    # ... existing fields ...
    "distance": db_reading.distance,  # ← NEW
}
```

### Frontend Changes

**1. websocket.ts** - Added distance to data type
```typescript
export type SensorData = {
  // ... existing fields ...
  distance: string | null  // ← NEW
}
```

**2. api.ts** - Added distance to API type
```typescript
createReading: (data: {
  // ... existing fields ...
  distance?: string  // ← NEW
})
```

**3. DeviceDetails.tsx** - Added distance display
```tsx
const distance = latestReading?.distance ? parseFloat(latestReading.distance) : null

// Display in UI
{distance !== null && (
  <Col span={12}>
    <Statistic
      title="Distance"
      value={distance.toFixed(1)}
      suffix="cm"
      valueStyle={{ color: distance < 10 ? '#faad14' : '#52c41a' }}
    />
  </Col>
)}
```

---

## 📁 New Files Created

### ESP32 Arduino Code

**ESP32/ESP32_Ultrasonic_Sensor/ESP32_Ultrasonic_Sensor.ino**
- Complete Arduino sketch for ESP32
- HC-SR04 ultrasonic sensor integration
- WiFi and WebSocket client
- Noise filtering with median calculation
- Comprehensive comments and configuration

### Documentation

**ESP32/ESP32_Ultrasonic_Sensor/README.md**
- Quick start guide (5 minutes)
- Wiring diagrams
- Troubleshooting section
- Advanced configuration options

**ESP32/DEVICE_REGISTRATION.md**
- Step-by-step device registration
- Network configuration guide
- IP address finding instructions
- Firewall configuration help

---

## 🚀 How to Use Your ESP32

### Step 1: Get Your Server IP

```bash
hostname -I
# Output: 192.168.1.100 ← This is your server IP
```

### Step 2: Start Server

**Terminal 1:**
```bash
cd ~/Desktop/Internship/backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2:**
```bash
cd ~/Desktop/Internship/frontend
npm run dev
```

### Step 3: Add Device

1. Open `http://localhost:5173`
2. Login (user/user123)
3. Click "Add Device"
4. Fill in:
   - Name: `ESP32-Ultrasonic-1`
   - IP: `192.168.1.150` (or any)
   - Type: `ESP32`
5. Note the Device ID (e.g., `1`)

### Step 4: Wire HC-SR04

```
HC-SR04  →  ESP32
─────────────────
VCC      →  3.3V or 5V
GND      →  GND
TRIG     →  GPIO 5
ECHO     →  GPIO 18
```

### Step 5: Configure Arduino Code

Open `ESP32_Ultrasonic_Sensor.ino`:

```cpp
const char* ssid = "YourWiFiName";          // ← Change this
const char* password = "YourWiFiPassword";  // ← Change this
const char* serverHost = "192.168.1.100";   // ← Your server IP
const uint16_t deviceId = 1;                // ← Device ID from step 3
```

### Step 6: Upload & Monitor

1. Install libraries: `WebSocketsClient`, `ArduinoJson`
2. Select Board: ESP32 Dev Module
3. Upload code
4. Open Serial Monitor (115200 baud)

### Step 7: View Real-Time Data

1. Click on your device in web interface
2. See "Live" badge (green)
3. Watch distance update every 2 seconds!

---

## 📊 Features Demonstration

### Real-Time Distance Monitoring

```
Web Interface Display:
┌────────────────────────────────┐
│ ESP32-Ultrasonic-1             │
│ Live 🟢                         │
├────────────────────────────────┤
│ Distance:  25.3 cm             │
│ (Color changes based on value) │
│                                │
│ ▂▃▅▆▇█ Real-time Chart        │
│                                │
└────────────────────────────────┘
```

### Serial Monitor Output

```
📤 Sending measurement:
   Distance: 25.34 cm
   JSON: {"distance":"25.34","custom_data":{...}}
📨 Server response: {"status":"ok","reading_id":1}
   ✓ Data saved successfully
```

### Color Indicators

- 🟢 **Green** (distance > 10 cm): Safe distance
- 🟡 **Yellow** (distance < 10 cm): Warning - object nearby

---

## 🎯 Key Configuration Points

### 1. WiFi Settings

```cpp
// ⚠️ MUST MATCH YOUR NETWORK
const char* ssid = "YourWiFiName";
const char* password = "YourWiFiPassword";
```

**Important:**
- Case-sensitive!
- Must be 2.4GHz (ESP32 doesn't support 5GHz)
- No special characters in SSID if possible

### 2. Server IP Address

```cpp
// ⚠️ NOT localhost or 127.0.0.1
const char* serverHost = "192.168.1.100";  // Your actual IP
```

**Find your IP:**
- Linux/Mac: `hostname -I`
- Windows: `ipconfig`

**Important:**
- Must be accessible from ESP32's network
- Server must run with `--host 0.0.0.0`

### 3. Device ID

```cpp
// ⚠️ MUST MATCH DATABASE
const uint16_t deviceId = 1;  // From web interface
```

**How to get:**
- Add device in web interface first
- Note the ID shown after creation
- First device = 1, second = 2, etc.

### 4. Sensor Pins

```cpp
// Can be changed if needed
#define TRIG_PIN 5   // Trigger pin
#define ECHO_PIN 18  // Echo pin
```

**Available GPIOs:**
- Most GPIOs work (2, 4, 5, 12-19, 21-23, 25-27, 32-33)
- Avoid: 0, 6-11 (used by flash)

---

## 🐛 Common Issues & Solutions

### Issue #1: "WiFi Connection Failed"

**Symptoms:**
```
📡 Connecting to WiFi...
...................
❌ WiFi Connection Failed!
```

**Solution:**
```cpp
// Verify SSID (case-sensitive!)
const char* ssid = "MyHomeWiFi";  // NOT "myhomewifi"

// Verify password (case-sensitive!)
const char* password = "Password123";  // NOT "password123"

// Check WiFi frequency
// ESP32 only supports 2.4GHz, not 5GHz
```

### Issue #2: "WebSocket Disconnected"

**Symptoms:**
```
✅ WiFi Connected!
🔌 Setting up WebSocket connection...
🔌 WebSocket Disconnected
```

**Solutions:**

1. **Check server is running:**
   ```bash
   # Must see this running:
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

2. **Verify IP address:**
   ```bash
   # Test from your computer:
   ping 192.168.1.100
   curl http://192.168.1.100:8000/health
   ```

3. **Check firewall:**
   ```bash
   # Linux:
   sudo ufw allow 8000/tcp
   ```

4. **Verify same network:**
   - ESP32 and server must be on same WiFi network
   - Check router settings

### Issue #3: "Device not found"

**Symptoms:**
```
📨 Server response: {"error":"Device 1 not found"}
```

**Solution:**
1. Device hasn't been added to database
2. Go to web interface → "Add Device"
3. Make sure `deviceId` in code matches database ID

### Issue #4: Distance Always 0 or -1

**Symptoms:**
```
📤 Sending measurement:
   Distance: -1.00 cm
⚠️  Invalid distance reading, skipping...
```

**Solution - Check Wiring:**
```
ESP32 Pin  →  HC-SR04 Pin
─────────────────────────
3.3V/5V    →  VCC (check sensor voltage)
GND        →  GND (ensure common ground!)
GPIO 5     →  TRIG
GPIO 18    →  ECHO
```

**Solution - Test Sensor:**
```cpp
// Add to loop() to debug
digitalWrite(TRIG_PIN, HIGH);
delayMicroseconds(10);
digitalWrite(TRIG_PIN, LOW);

long duration = pulseIn(ECHO_PIN, HIGH, 30000);
Serial.print("Duration: ");
Serial.println(duration);  // Should be > 0
```

### Issue #5: Data Not Showing in Web Interface

**Symptoms:**
- Serial Monitor shows "Data saved successfully"
- But web interface shows "No sensor data available"

**Solutions:**

1. **Check WebSocket connection:**
   - Web interface should show "Live" badge (green)
   - If "Offline", refresh the page

2. **Verify correct device:**
   - Make sure you're viewing the right device
   - Check Device ID matches

3. **Check browser console:**
   - Press F12 → Console tab
   - Look for WebSocket errors

4. **Verify data in database:**
   ```bash
   curl http://localhost:8000/sensors/latest/1 \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

---

## 📈 Performance Optimization

### Faster Updates

```cpp
// Send every 1 second (instead of 2)
const unsigned long READING_INTERVAL = 1000;
```

### Better Accuracy

```cpp
// Take 10 samples instead of 5
const int NUM_SAMPLES = 10;
```

### Battery Saving

```cpp
// Send every 10 seconds
const unsigned long READING_INTERVAL = 10000;

// Or even less frequent
const unsigned long READING_INTERVAL = 60000;  // 1 minute
```

### WiFi Power Saving

```cpp
void setup() {
  // ... existing code ...
  WiFi.setSleep(true);  // Enable WiFi sleep mode
}
```

---

## 🔧 Adding More Sensors

You can add multiple sensors to the same ESP32:

### Example: Add DHT22 Temperature Sensor

```cpp
#include <DHT.h>

#define DHTPIN 4
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

void setup() {
  // ... existing code ...
  dht.begin();
}

void sendSensorData() {
  float distance = readDistance();
  float temperature = dht.readTemperature();
  float humidity = dht.readHumidity();
  
  // Create JSON
  doc["distance"] = String(distance, 2);
  doc["temperature"] = String(temperature, 2);
  doc["humidity"] = String(humidity, 2);
  
  // ... rest of code ...
}
```

Your web interface will automatically display all sensor values!

---

## 📚 File Reference

### Arduino Code
- **Main file:** `ESP32/ESP32_Ultrasonic_Sensor/ESP32_Ultrasonic_Sensor.ino`
- **Quick guide:** `ESP32/ESP32_Ultrasonic_Sensor/README.md`

### Documentation
- **Device registration:** `ESP32/DEVICE_REGISTRATION.md`
- **Full integration:** `Internship/ESP32_INTEGRATION.md`
- **Project README:** `Internship/README.md`

### Backend
- **Models:** `backend/models.py` (added `distance` field)
- **Schemas:** `backend/schemas.py` (added `distance` field)
- **Main API:** `backend/main.py` (updated broadcasts)

### Frontend
- **WebSocket:** `frontend/src/services/websocket.ts` (added `distance` type)
- **API client:** `frontend/src/services/api.ts` (added `distance` field)
- **Device details:** `frontend/src/pages/DeviceDetails.tsx` (added distance display)

---

## ✅ Success Checklist

Complete setup verification:

- [ ] Found server IP address (`hostname -I`)
- [ ] Backend running with `--host 0.0.0.0 --port 8000`
- [ ] Frontend running on `localhost:5173`
- [ ] HC-SR04 wired: VCC→3.3V, GND→GND, TRIG→GPIO5, ECHO→GPIO18
- [ ] Device added in web interface (noted Device ID)
- [ ] Arduino libraries installed (WebSocketsClient, ArduinoJson)
- [ ] ESP32 board selected in Arduino IDE
- [ ] WiFi credentials configured in code
- [ ] Server IP configured in code
- [ ] Device ID configured in code
- [ ] Code uploaded to ESP32
- [ ] Serial Monitor open (115200 baud)
- [ ] Serial Monitor shows "WiFi Connected"
- [ ] Serial Monitor shows "WebSocket Connected"
- [ ] Serial Monitor shows "Data saved successfully"
- [ ] Web interface shows "Live" badge
- [ ] Distance value updating every 2 seconds
- [ ] Moving hand changes distance reading

---

## 🎓 What You've Built

You now have a **complete IoT monitoring system** with:

1. **ESP32 microcontroller** sending real-time sensor data
2. **WebSocket communication** for instant updates
3. **FastAPI backend** processing and storing data
4. **React frontend** displaying live measurements
5. **PostgreSQL database** storing historical data
6. **Real-time charts** showing sensor trends

### System Architecture

```
┌──────────────┐
│   ESP32      │ ← Reading distance via HC-SR04
│ + HC-SR04    │ ← Connected to WiFi
└──────┬───────┘
       │ WebSocket (JSON)
       ↓
┌──────────────┐
│   FastAPI    │ ← Receives sensor data
│   Backend    │ ← Validates and stores
└──────┬───────┘
       │
       ├─→ PostgreSQL (stores data)
       │
       └─→ WebSocket broadcast
            ↓
       ┌──────────────┐
       │    React     │ ← Displays real-time
       │   Frontend   │ ← Updates automatically
       └──────────────┘
```

---

## 🚀 Next Steps

### Add More Features

1. **Multiple ESP32 Devices:**
   - Each device gets unique ID
   - All visible in dashboard
   - Compare readings across devices

2. **Alerts & Notifications:**
   - Email when distance < 10cm
   - SMS for critical events
   - Dashboard notifications

3. **More Sensors:**
   - Temperature (DHT22)
   - Humidity (DHT22)
   - Pressure (BMP280)
   - Light (LDR)
   - Motion (PIR)

4. **Data Analysis:**
   - Export to CSV
   - Generate reports
   - Statistical analysis
   - Trend prediction

5. **Mobile App:**
   - React Native app
   - Push notifications
   - Remote monitoring

---

## 📞 Need Help?

### Quick Links

- **API Docs:** http://YOUR_SERVER:8000/docs
- **Setup Guide:** ESP32/ESP32_Ultrasonic_Sensor/README.md
- **Registration:** ESP32/DEVICE_REGISTRATION.md
- **Integration:** Internship/ESP32_INTEGRATION.md

### Debugging Commands

```bash
# Check server status
curl http://localhost:8000/health

# View latest reading
curl http://localhost:8000/sensors/latest/1 \
  -H "Authorization: Bearer YOUR_TOKEN"

# Check if port is open
telnet YOUR_SERVER_IP 8000

# Test network connectivity
ping YOUR_SERVER_IP
```

### Log Files

- **Backend logs:** Terminal where uvicorn is running
- **Frontend logs:** Browser DevTools (F12) → Console
- **ESP32 logs:** Arduino Serial Monitor (115200 baud)

---

## 🎉 Congratulations!

You've successfully integrated **ESP32 with Ultrasonic Sensor** into your Device Management System!

**What you achieved:**
- ✅ Real-time distance monitoring
- ✅ WebSocket communication
- ✅ Live data visualization
- ✅ Complete IoT pipeline
- ✅ Professional documentation

**You can now:**
- 📏 Monitor distances in real-time
- 📊 View historical data and trends
- 🔔 Detect objects and proximity
- 📈 Scale to multiple devices
- 🚀 Build upon this foundation

---

**Happy IoT Building! 🎊📡🔧**
