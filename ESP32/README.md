# ESP32 WebSocket Sensor Integration

This folder contains Arduino code for ESP32 to send sensor data to your FastAPI WebSocket server.

## Quick Start

### 1. Hardware Setup

**Minimum Required:**
- ESP32 Development Board
- USB cable for programming
- WiFi network

**Optional Sensors:**
- DHT22 or DHT11 (Temperature & Humidity)
- BMP280 or BME280 (Atmospheric Pressure)
- LDR (Light Dependent Resistor)
- PIR Motion Sensor

### 2. Software Requirements

**Arduino IDE Setup:**
1. Download and install [Arduino IDE](https://www.arduino.cc/en/software)
2. Add ESP32 board support:
   - File → Preferences
   - Add to "Additional Board Manager URLs": 
     ```
     https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
     ```
   - Tools → Board → Boards Manager
   - Search "ESP32" and install "esp32 by Espressif Systems"

**Required Libraries:**
1. WebSocketsClient by Markus Sattler
2. ArduinoJson by Benoit Blanchon

Install via: Tools → Manage Libraries → Search and Install

### 3. Configuration

Open `ESP32_WebSocket_Sensor.ino` and modify:

```cpp
// WiFi Configuration
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Server Configuration
const char* serverHost = "192.168.1.100";  // Your computer's IP
const uint16_t serverPort = 8000;
const uint16_t deviceId = 1;  // Device ID from database
```

**Finding Your Computer's IP Address:**
- Linux: `ip addr show` or `hostname -I`
- Windows: `ipconfig`
- Mac: `ifconfig`

### 4. Upload to ESP32

1. Connect ESP32 via USB
2. Select Board: Tools → Board → ESP32 Arduino → ESP32 Dev Module
3. Select Port: Tools → Port → (your ESP32 port)
4. Click Upload ⬆️
5. Open Serial Monitor (115200 baud) to see debug output

## How It Works

```
ESP32 → WiFi → WebSocket → FastAPI Server → Database
                              ↓
                         Browser (Real-time updates)
```

1. ESP32 connects to your WiFi network
2. Establishes WebSocket connection to FastAPI server
3. Sends sensor readings every 5 seconds
4. Server stores data in database
5. Server broadcasts to all connected web clients
6. Frontend displays real-time sensor data

## Data Format

ESP32 sends JSON data:

```json
{
  "temperature": "25.34",
  "humidity": "62.45",
  "pressure": "1013.25",
  "light": "523",
  "motion": "false",
  "custom_data": {
    "wifi_rssi": -45,
    "uptime": 3600
  }
}
```

## Testing Without ESP32

You can test the WebSocket functionality using the Python test script:

```bash
cd /home/bits/Desktop/ESP32
python3 test_websocket_client.py
```

## Troubleshooting

### WiFi Connection Issues
- ✅ Verify SSID and password are correct
- ✅ Check WiFi signal strength
- ✅ Ensure 2.4GHz WiFi (ESP32 doesn't support 5GHz)

### WebSocket Connection Issues
- ✅ Verify server is running: `cd backend && uvicorn main:app --reload --host 0.0.0.0`
- ✅ Check firewall settings (allow port 8000)
- ✅ Verify server IP address is correct
- ✅ Ensure device ID exists in database

### No Data Appearing
- ✅ Check Serial Monitor for error messages
- ✅ Verify device ID matches database
- ✅ Ensure backend server is running
- ✅ Check browser console for WebSocket errors

### Sensor Reading Errors
- ✅ Check sensor wiring
- ✅ Verify power supply (3.3V or 5V depending on sensor)
- ✅ Install required sensor libraries
- ✅ Check pin numbers in code

## Adding Real Sensors

### DHT22 Temperature/Humidity Sensor

**Wiring:**
- VCC → 3.3V
- GND → GND
- DATA → GPIO 4

**Code Changes:**
```cpp
#include <DHT.h>
#define DHTPIN 4
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

void setup() {
  // ... existing code ...
  dht.begin();
}

float readTemperature() {
  return dht.readTemperature();
}

float readHumidity() {
  return dht.readHumidity();
}
```

### BMP280 Pressure Sensor

**Wiring:**
- VCC → 3.3V
- GND → GND
- SCL → GPIO 22
- SDA → GPIO 21

**Code Changes:**
```cpp
#include <Adafruit_BMP280.h>
Adafruit_BMP280 bmp;

void setup() {
  // ... existing code ...
  if (!bmp.begin(0x76)) {
    Serial.println("BMP280 not found!");
  }
}

float readPressure() {
  return bmp.readPressure() / 100.0F; // Convert Pa to hPa
}
```

## API Endpoints

### WebSocket Endpoints

**For ESP32 (sending data):**
```
ws://YOUR_SERVER_IP:8000/ws/esp32/send/{device_id}
```

**For Frontend (receiving data):**
```
ws://YOUR_SERVER_IP:8000/ws/device/{device_id}
```

### REST Endpoints

**Get latest reading:**
```
GET /sensors/latest/{device_id}
```

**Get reading history:**
```
GET /sensors/readings/{device_id}?limit=100
```

**Create reading (POST):**
```
POST /sensors/readings
{
  "device_id": 1,
  "temperature": "25.5",
  "humidity": "60.0"
}
```

## Security Notes

⚠️ **Important for Production:**

1. Use HTTPS/WSS instead of HTTP/WS
2. Implement device authentication
3. Add API keys or tokens
4. Restrict CORS origins
5. Validate all input data
6. Use environment variables for secrets

## Support

Need help? Check:
- Serial Monitor output for debug messages
- Backend server logs
- Browser Developer Console (F12)
- FastAPI docs: `http://YOUR_SERVER_IP:8000/docs`

## License

MIT License - Free to use and modify
