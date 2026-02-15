# ESP32 with HC-SR04 Ultrasonic Sensor

Real-time distance measurement with WebSocket streaming to your server.

## 🎯 What You'll Need

### Hardware
- **ESP32 Development Board** (any model)
- **HC-SR04 Ultrasonic Distance Sensor**
- **USB Cable** (for programming)
- **Jumper Wires** (4 pieces)

### Software
- **Arduino IDE** with ESP32 support
- **Libraries:** WebSocketsClient, ArduinoJson

---

## ⚡ Quick Start (5 Minutes)

### 1. Find Your Server IP Address

```bash
# Linux/Mac
hostname -I

# Windows
ipconfig
```

Example output: `192.168.1.100` ← **This is your server IP**

⚠️ **IMPORTANT:** Your ESP32 needs this IP address to connect!

---

### 2. Start Your Server

```bash
# Terminal 1 - Backend
cd ~/Desktop/Internship/backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

⚠️ **Must use `--host 0.0.0.0`** (not localhost)

```bash
# Terminal 2 - Frontend
cd ~/Desktop/Internship/frontend
npm run dev
```

Open: `http://localhost:5173`

---

### 3. Wire HC-SR04 to ESP32

```
HC-SR04   →   ESP32
─────────────────────
VCC       →   3.3V or 5V
GND       →   GND
TRIG      →   GPIO 5
ECHO      →   GPIO 18
```

**Visual Diagram:**
```
        HC-SR04 Sensor
    ┌──────────────────┐
    │  VCC GND TRIG ECHO│
    └───┬───┬───┬────┬──┘
        │   │   │    │
        5V GND G5  G18  (ESP32 Pins)
```

---

### 4. Add Device in Web Interface

1. Login to `http://localhost:5173`
   - Username: `user`
   - Password: `user123`

2. Click **"Add Device"** button

3. Fill in:
   - **Device Name:** `ESP32-Ultrasonic-1`
   - **IP Address:** `192.168.1.150` (temporary, will update later)
   - **Device Type:** `ESP32`

4. **Note the Device ID** (shown after creation: `1`, `2`, `3`, etc.)

---

### 5. Configure Arduino Code

Open `ESP32_Ultrasonic_Sensor.ino` and update:

```cpp
// ============ CHANGE THESE ============
const char* ssid = "YourWiFiName";          // ← Your WiFi name
const char* password = "YourWiFiPassword";  // ← Your WiFi password
const char* serverHost = "192.168.1.100";   // ← Your server IP (from step 1)
const uint16_t deviceId = 1;                // ← Device ID (from step 4)
// ======================================
```

---

### 6. Upload to ESP32

1. **Install Libraries:**
   - Arduino IDE → Tools → Manage Libraries
   - Install: `WebSocketsClient` by Markus Sattler
   - Install: `ArduinoJson` by Benoit Blanchon

2. **Select Board:**
   - Tools → Board → ESP32 Arduino → **ESP32 Dev Module**

3. **Select Port:**
   - Tools → Port → **(your ESP32 port)**

4. **Upload:**
   - Click **Upload** button (→)

5. **Open Serial Monitor:**
   - Tools → **Serial Monitor**
   - Set baud rate: **115200**

---

### 7. Expected Serial Monitor Output

```
===========================================
   ESP32 Ultrasonic Sensor WebSocket Client
===========================================

📏 Setting up HC-SR04 Ultrasonic Sensor...
   TRIG Pin: GPIO 5
   ECHO Pin: GPIO 18
   Sensor ready!

📡 Connecting to WiFi...
   SSID: MyHomeWiFi
....
✅ WiFi Connected!
   IP Address: 192.168.1.150    ← Note this!
   Signal Strength: -45 dBm

🔌 Setting up WebSocket connection...
   Server: ws://192.168.1.100:8000/ws/esp32/send/1
   WebSocket initialized.

✅ Setup complete! Starting measurements...

✅ WebSocket Connected!

📤 Sending measurement:
   Distance: 25.34 cm
   JSON: {"distance":"25.34","custom_data":{...}}
📨 Server response: {"status":"ok","reading_id":1}
   ✓ Data saved successfully
   Reading ID: 1
```

---

### 8. Update Device IP (If Different)

If the ESP32's IP (shown in Serial Monitor) is different from what you entered:

1. Go to web interface
2. Click **Edit** (pencil icon) on your device
3. Update **IP Address** to match Serial Monitor
4. Click **Submit**

---

### 9. View Real-Time Data

1. **Click on your device** in the web interface

2. **You should see:**
   - ✅ **"Live"** badge (green, blinking)
   - 📊 **Distance:** updating every 2 seconds
   - 📈 **Chart:** showing real-time trends

3. **Test it:**
   - Move your hand in front of sensor
   - Watch distance change in real-time!

---

## 🐛 Troubleshooting

### WiFi Won't Connect

**Problem:** Serial Monitor shows "WiFi Connection Failed"

**Check:**
- ✅ SSID spelled correctly (case-sensitive)
- ✅ Password correct (case-sensitive)
- ✅ Using 2.4GHz WiFi (ESP32 doesn't support 5GHz)
- ✅ Good signal strength

### WebSocket Won't Connect

**Problem:** Shows "WebSocket Disconnected"

**Check:**
- ✅ Server running with `--host 0.0.0.0`
- ✅ Server IP correct
- ✅ Firewall allows port 8000
- ✅ ESP32 and server on same network

**Test connectivity:**
```bash
# From your computer, ping the server
ping 192.168.1.100

# Test if server is accessible
curl http://192.168.1.100:8000/health
```

### Device Not Found

**Problem:** Error message "Device {id} not found"

**Solution:**
1. Device wasn't added to database
2. Add via web interface (step 4)
3. Verify `deviceId` in code matches database ID

### No Distance Readings

**Problem:** Distance always shows 0 or -1

**Check wiring:**
```
VCC  → 3.3V or 5V (check sensor requirements)
GND  → GND (common ground)
TRIG → GPIO 5 (or pin you configured)
ECHO → GPIO 18 (or pin you configured)
```

**Quick test:**
```cpp
// Add to loop() for debugging
Serial.print("TRIG: ");
Serial.println(digitalRead(TRIG_PIN));
Serial.print("ECHO: ");
Serial.println(digitalRead(ECHO_PIN));
```

### Web Interface Not Updating

**Problem:** Data sends but web doesn't update

**Check:**
- ✅ "Live" badge should be green and blinking
- ✅ Browser DevTools (F12) → Console for errors
- ✅ Viewing correct device (check Device ID)
- ✅ Backend terminal shows no errors

**Try:**
- Refresh the page
- Check WebSocket connection in DevTools → Network → WS

---

## 📊 Understanding Distance Readings

### Sensor Range
- **Minimum Distance:** 2 cm
- **Maximum Distance:** 400 cm (4 meters)
- **Accuracy:** ±1 cm (up to 100 cm)

### Sensor Behavior
- **Reflective surfaces** (mirrors, water): May give incorrect readings
- **Angled surfaces** (>15° angle): May not reflect back
- **Soft materials** (fabric, foam): Absorb sound waves
- **Best results:** Flat, hard surfaces perpendicular to sensor

### Reading Intervals
- **Default:** Every 2 seconds
- **Change:** Modify `READING_INTERVAL` in code
- **Minimum:** ~100ms (10 readings/sec)
- **Battery saving:** Increase to 10-60 seconds

---

## 🔧 Advanced Configuration

### Change Pin Numbers

If GPIO 5 or 18 are used by other components:

```cpp
#define TRIG_PIN 23   // Any available GPIO
#define ECHO_PIN 22   // Any available GPIO
```

### Adjust Reading Speed

```cpp
// Faster updates (1 second)
const unsigned long READING_INTERVAL = 1000;

// Slower updates for battery (10 seconds)
const unsigned long READING_INTERVAL = 10000;
```

### Improve Accuracy

```cpp
// Take more samples (slower but more accurate)
const int NUM_SAMPLES = 10;  // was 5
```

### Add Temperature Compensation

Distance calculation depends on temperature (speed of sound changes):

```cpp
// Approximately 0.6 m/s per °C
float speedOfSound = 331.3 + (0.606 * temperature);
float distance = (duration * speedOfSound / 10000.0) / 2.0;
```

---

## 📡 Adding More Sensors

You can send multiple sensor values simultaneously:

```cpp
void sendSensorData() {
  // ... existing code ...
  
  doc["distance"] = String(distance, 2);
  doc["temperature"] = String(25.5, 2);    // Add DHT22
  doc["humidity"] = String(60.0, 2);       // Add DHT22
  doc["pressure"] = String(1013.25, 2);    // Add BMP280
  
  // ... rest of code ...
}
```

Your web interface will automatically display all available sensor values!

---

## 📋 Pinout Reference

### ESP32 Pinout (DevKit V1)
```
                    ESP32
        ┌─────────────────────┐
        │                     │
    EN  │ EN              D23 │
    VP  │ VP              D22 │
    VN  │ VN              TX0 │
    D34 │ D34             RX0 │
    D35 │ D35             D21 │
    D32 │ D32             GND │
    D33 │ D33             D19 │
    D25 │ D25             D18 │ ← ECHO
    D26 │ D26             D5  │ ← TRIG
    D27 │ D27             D17 │
    D14 │ D14             D16 │
    D12 │ D12             D4  │
    D13 │ D13             D0  │
    GND │ GND             D2  │
    VIN │ VIN             D15 │
        │                     │
        └─────────────────────┘
```

---

## 🎯 Success Checklist

- [ ] Server IP address found
- [ ] Backend server running on 0.0.0.0:8000
- [ ] Frontend running on localhost:5173
- [ ] HC-SR04 wired to ESP32
- [ ] Device added in web interface
- [ ] Arduino libraries installed
- [ ] Code uploaded to ESP32
- [ ] Serial Monitor shows WiFi connected
- [ ] Serial Monitor shows WebSocket connected
- [ ] Web interface shows "Live" badge
- [ ] Distance readings updating

---

## 📚 Additional Resources

- **Full Integration Guide:** See `ESP32_INTEGRATION.md`
- **Device Registration:** See `DEVICE_REGISTRATION.md`
- **API Documentation:** `http://YOUR_SERVER:8000/docs`
- **Project README:** `~/Desktop/Internship/README.md`

---

## 🆘 Getting Help

**If you're stuck:**

1. Check Serial Monitor output for error messages
2. Verify all checklist items above
3. Read troubleshooting section
4. Check backend terminal for errors
5. Open browser DevTools (F12) for frontend errors

**Common Network Issues:**

```bash
# Check if server is reachable
ping YOUR_SERVER_IP

# Check if port 8000 is open
telnet YOUR_SERVER_IP 8000

# Check firewall status
sudo ufw status  # Linux
```

---

**Happy Distance Measuring! 📏🔌✨**
