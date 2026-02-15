# ESP32 Device Registration Guide

## Quick Start - Adding Your ESP32 to the Server

### Step 1: Find Your Computer's IP Address

Your ESP32 needs to know where your server is running. Find your server's IP address:

**On Linux:**
```bash
hostname -I
# or
ip addr show | grep "inet "
```

**On Windows:**
```cmd
ipconfig
```

**On Mac:**
```bash
ifconfig | grep "inet "
```

Look for an address like:
- `192.168.1.xxx` (home network)
- `10.0.0.xxx` (office network)
- `172.16.xxx.xxx` (some networks)

**Example:** `192.168.1.100`

⚠️ **IMPORTANT:** Use the IP address, NOT `localhost` or `127.0.0.1` (these only work on the same machine)

---

### Step 2: Start Your Server

The server MUST be running before ESP32 can connect.

**Terminal 1 - Backend:**
```bash
cd /home/bits/Desktop/Internship/backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

⚠️ **IMPORTANT:** Use `--host 0.0.0.0` (not `127.0.0.1`)

**Terminal 2 - Frontend:**
```bash
cd /home/bits/Desktop/Internship/frontend
npm run dev
```

Open browser to: `http://localhost:5173`

---

### Step 3: Register Your ESP32 Device

#### Option A: Via Web Interface (Recommended)

1. **Login to the web interface:**
   - URL: `http://localhost:5173` (or `http://YOUR_SERVER_IP:5173`)
   - Username: `user`
   - Password: `user123`

2. **Click "Add Device" button** (top right)

3. **Fill in device information:**
   ```
   Device Name: ESP32-Ultrasonic-1
   IP Address: 192.168.1.xxx (will be shown in Serial Monitor)
   Device Type: ESP32
   ```

4. **Note the Device ID:**
   - After creation, the device will have an ID (1, 2, 3, etc.)
   - You'll need this ID for the ESP32 code

#### Option B: Via API (Advanced)

```bash
# Get auth token
TOKEN=$(curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"user","password":"user123"}' \
  | jq -r '.access_token')

# Create device
curl -X POST http://localhost:8000/devices/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "device_name": "ESP32-Ultrasonic-1",
    "ip_address": "192.168.1.150",
    "type": "ESP32"
  }'
```

---

### Step 4: Configure ESP32 Code

Open the Arduino sketch and update these lines:

```cpp
// ==================== WiFi Configuration ====================
const char* ssid = "YOUR_WIFI_SSID";           // Your WiFi name
const char* password = "YOUR_WIFI_PASSWORD";   // Your WiFi password

// ==================== Server Configuration ====================
const char* serverHost = "192.168.1.100";      // Your server IP
const uint16_t serverPort = 8000;              // Keep as 8000
const uint16_t deviceId = 1;                   // Device ID from database
```

**Example Configuration:**
```cpp
const char* ssid = "MyHomeWiFi";
const char* password = "MyPassword123";
const char* serverHost = "192.168.1.100";  // Your computer's IP
const uint16_t serverPort = 8000;
const uint16_t deviceId = 1;  // First device
```

---

### Step 5: Upload to ESP32

1. **Connect ESP32 via USB**

2. **Install Required Libraries:**
   - Arduino IDE → Tools → Manage Libraries
   - Install: `WebSocketsClient` by Markus Sattler
   - Install: `ArduinoJson` by Benoit Blanchon

3. **Select Board:**
   - Tools → Board → ESP32 Arduino → ESP32 Dev Module

4. **Select Port:**
   - Tools → Port → (your ESP32 port, usually /dev/ttyUSB0 or COM3)

5. **Upload:**
   - Click the Upload button (→)
   - Wait for "Done uploading"

---

### Step 6: Monitor ESP32

1. **Open Serial Monitor:**
   - Tools → Serial Monitor
   - Set baud rate to: `115200`

2. **Expected Output:**
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
      IP Address: 192.168.1.150
      Signal Strength: -45 dBm

   🔌 Setting up WebSocket connection...
      Server: ws://192.168.1.100:8000/ws/esp32/send/1
      WebSocket initialized.

   ✅ Setup complete! Starting measurements...

   ✅ WebSocket Connected!
      Server URL: /ws/esp32/send/1

   📤 Sending measurement:
      Distance: 25.34 cm
      JSON: {"distance":"25.34","custom_data":{...}}
   📨 Server response: {"status":"ok","reading_id":1}
      ✓ Data saved successfully
      Reading ID: 1
   ```

3. **Note the IP Address** shown after "WiFi Connected"

---

### Step 7: Update Device IP (If Needed)

If the ESP32's IP address is different from what you entered:

1. Go back to web interface
2. Click the "Edit" button (pencil icon) on your device
3. Update the IP address to match what was shown in Serial Monitor
4. Click "Submit"

---

### Step 8: View Real-Time Data

1. **In the web interface, click on your device**

2. **You should see:**
   - ✅ "Live" badge (green, blinking) - WebSocket connected
   - 📊 Real-time distance readings updating every 2 seconds
   - 📈 Historical data chart

3. **Test the sensor:**
   - Move your hand in front of the ultrasonic sensor
   - Distance value should change in real-time
   - Charts should update automatically

---

## Troubleshooting

### Problem: ESP32 Can't Connect to WiFi

**Check:**
- ✅ SSID is spelled exactly right (case-sensitive!)
- ✅ Password is correct (case-sensitive!)
- ✅ WiFi is 2.4GHz (ESP32 doesn't support 5GHz)
- ✅ WiFi has good signal strength
- ✅ WiFi doesn't use special characters in SSID

**Try:**
```cpp
// Add this to see WiFi scan results
void scanWiFi() {
  Serial.println("Scanning WiFi networks...");
  int n = WiFi.scanNetworks();
  for (int i = 0; i < n; i++) {
    Serial.print(i + 1);
    Serial.print(": ");
    Serial.print(WiFi.SSID(i));
    Serial.print(" (");
    Serial.print(WiFi.RSSI(i));
    Serial.println(" dBm)");
  }
}

// Call in setup() before WiFi.begin()
scanWiFi();
```

### Problem: WebSocket Connection Fails

**Check:**
- ✅ Backend server is running with `--host 0.0.0.0`
- ✅ serverHost IP address is correct
- ✅ ESP32 and server are on same network
- ✅ Firewall isn't blocking port 8000
- ✅ Device exists in database with correct ID

**Try:**
```bash
# Test if server is reachable from ESP32's network
ping 192.168.1.100

# Test if WebSocket endpoint is accessible
curl http://192.168.1.100:8000/health
```

### Problem: "Device not found" Error

**Solution:**
1. Device hasn't been added to database yet
2. Add device via web interface (Step 3)
3. Make sure deviceId in code matches database ID

**Verify device exists:**
```bash
# List all devices
curl http://localhost:8000/devices/ \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Problem: No Distance Readings

**Check Wiring:**
```
HC-SR04  →  ESP32
────────────────────
VCC      →  3.3V or 5V
GND      →  GND
TRIG     →  GPIO 5
ECHO     →  GPIO 18
```

**Try:**
- Verify sensor has power (use multimeter)
- Check all connections are firm
- Try different GPIO pins
- Ensure sensor has clear line of sight (no obstacles within 2cm)

**Test sensor manually:**
```cpp
void testSensor() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  
  long duration = pulseIn(ECHO_PIN, HIGH, 30000);
  float distance = (duration * 0.034) / 2.0;
  
  Serial.print("Test distance: ");
  Serial.print(distance);
  Serial.println(" cm");
}
```

### Problem: Data Not Appearing in Web Interface

**Check:**
1. ✅ WebSocket shows "Live" badge
2. ✅ Serial Monitor shows "Data saved successfully"
3. ✅ You're viewing the correct device (check Device ID)
4. ✅ Browser console has no errors (F12 → Console)

**Try:**
- Refresh the page
- Check backend terminal for errors
- Verify data is being saved:
  ```bash
  curl http://localhost:8000/sensors/latest/1 \
    -H "Authorization: Bearer YOUR_TOKEN"
  ```

### Problem: Inconsistent Distance Readings

**Solutions:**
- Increase number of samples:
  ```cpp
  const int NUM_SAMPLES = 10;  // was 5
  ```
- Add capacitor (10µF) across VCC and GND
- Keep sensor wires short
- Mount sensor firmly (vibration affects readings)
- Avoid pointing at shiny or angled surfaces

---

## Network Configuration Guide

### Finding Your Network Info

**Check your network configuration:**
```bash
# Linux
ip route | grep default
# Shows: default via 192.168.1.1 dev wlan0
# Router IP: 192.168.1.1
# Your device: wlan0

ifconfig wlan0
# Shows your IP address

# Check what network devices are on
nmap -sn 192.168.1.0/24  # Scan entire subnet
```

### Common Network Setups

**Home Network (Router):**
```
Internet → Router (192.168.1.1)
             ├─ Computer (192.168.1.100) ← Server here
             └─ ESP32 (192.168.1.150)
```

**University/Office Network:**
```
Network Switch
  ├─ Computer (10.0.0.50) ← Server here
  └─ ESP32 (10.0.0.75)

Both must be on same subnet!
```

### Firewall Configuration

**Linux (Ubuntu):**
```bash
# Allow port 8000
sudo ufw allow 8000/tcp

# Check status
sudo ufw status
```

**Windows:**
- Control Panel → Windows Defender Firewall
- Advanced Settings → Inbound Rules
- New Rule → Port → TCP 8000 → Allow

---

## Quick Reference

### WiFi Configuration
```cpp
const char* ssid = "YourWiFiName";
const char* password = "YourWiFiPassword";
```

### Server Configuration
```cpp
const char* serverHost = "192.168.1.100";  // YOUR SERVER IP
const uint16_t serverPort = 8000;
const uint16_t deviceId = 1;  // From database
```

### HC-SR04 Wiring
```
VCC  → 3.3V or 5V
GND  → GND
TRIG → GPIO 5
ECHO → GPIO 18
```

### Server Commands
```bash
# Start backend
cd ~/Desktop/Internship/backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Start frontend
cd ~/Desktop/Internship/frontend
npm run dev

# View in browser
http://localhost:5173
```

### Serial Monitor Settings
- Baud Rate: `115200`
- Line Ending: `Both NL & CR` or `Newline`

---

## Success Indicators

✅ **WiFi Connected:**
- Serial Monitor shows IP address
- Signal strength displayed

✅ **WebSocket Connected:**
- Serial Monitor shows "WebSocket Connected!"
- Server URL displayed

✅ **Data Being Sent:**
- Distance values in Serial Monitor
- "Data saved successfully" messages
- Reading IDs incrementing

✅ **Web Interface Working:**
- "Live" badge is green and blinking
- Distance value updates every 2 seconds
- No error messages in browser console

---

## Next Steps

Once your ESP32 is working:

1. **Add more sensors:**
   - DHT22 (temperature/humidity)
   - BMP280 (pressure)
   - PIR (motion)

2. **Set up alerts:**
   - Trigger when distance < 10cm
   - Send email/notification

3. **Add multiple ESP32 devices:**
   - Each device gets unique ID
   - All visible in web interface

4. **Customize dashboard:**
   - Add charts for distance trends
   - Create widgets for quick view

---

**Need help? Check the comprehensive guide in ESP32_INTEGRATION.md**
