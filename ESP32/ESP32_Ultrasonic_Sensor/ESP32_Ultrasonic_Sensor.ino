/*
 * ESP32 with HC-SR04 Ultrasonic Sensor to WebSocket Server
 * 
 * This sketch connects an ESP32 with an HC-SR04 ultrasonic distance sensor
 * to your FastAPI WebSocket server and sends real-time distance measurements
 * 
 * Hardware Requirements:
 * - ESP32 Development Board
 * - HC-SR04 Ultrasonic Distance Sensor
 * - Jumper wires
 * 
 * Libraries Required:
 * - WiFi (built-in)
 * - WebSocketsClient by Markus Sattler
 * - ArduinoJson by Benoit Blanchon
 * 
 * Install via Arduino Library Manager
 */

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

// ==================== WiFi Configuration ====================
// IMPORTANT: Change these to match your network
const char* ssid = "R3JHOMEFIBRa4780";           // Replace with your WiFi name
const char* password = "R3JWIFIwwk9a";   // Replace with your WiFi password

// ==================== Server Configuration ====================
// IMPORTANT: Change this to your computer's IP address
// Find it using: hostname -I (Linux) or ipconfig (Windows)
const char* serverHost = "127.0.0.1";      // YOUR SERVER IP HERE
const uint16_t serverPort = 8000;              // FastAPI server port
const uint16_t deviceId = 1;                   // Device ID from your database

// ==================== HC-SR04 Ultrasonic Sensor Pins ====================
#define TRIG_PIN 5   // GPIO 5 - Trigger pin (sends ultrasonic pulse)
#define ECHO_PIN 18  // GPIO 18 - Echo pin (receives reflected pulse)

// ==================== Sensor Configuration ====================
const unsigned long READING_INTERVAL = 2000;  // Send data every 2 seconds (2000ms)
const float MAX_DISTANCE = 400.0;             // Maximum measurable distance (cm)
const float MIN_DISTANCE = 2.0;               // Minimum measurable distance (cm)
const int NUM_SAMPLES = 5;                    // Number of samples for averaging

// ==================== Global Variables ====================
WebSocketsClient webSocket;
unsigned long lastReadingTime = 0;

// ==================== Function Prototypes ====================
void setupWiFi();
void setupWebSocket();
void setupUltrasonicSensor();
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length);
void sendSensorData();
float readDistance();
float getMedianDistance(float distances[], int size);

// ==================== Setup ====================
void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n\n===========================================");
  Serial.println("   ESP32 Ultrasonic Sensor WebSocket Client");
  Serial.println("===========================================\n");
  
  // Setup ultrasonic sensor pins
  setupUltrasonicSensor();
  
  // Connect to WiFi
  setupWiFi();
  
  // Setup WebSocket connection
  setupWebSocket();
  
  Serial.println("✅ Setup complete! Starting measurements...\n");
}

// ==================== Main Loop ====================
void loop() {
  // Handle WebSocket events
  webSocket.loop();
  
  // Send sensor data at regular intervals
  unsigned long currentTime = millis();
  if (currentTime - lastReadingTime >= READING_INTERVAL) {
    lastReadingTime = currentTime;
    sendSensorData();
  }
}

// ==================== WiFi Setup ====================
void setupWiFi() {
  Serial.println("📡 Connecting to WiFi...");
  Serial.print("   SSID: ");
  Serial.println(ssid);
  
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi Connected!");
    Serial.print("   IP Address: ");
    Serial.println(WiFi.localIP());
    Serial.print("   Signal Strength: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm\n");
  } else {
    Serial.println("\n❌ WiFi Connection Failed!");
    Serial.println("   Please check your SSID and password.");
    Serial.println("   Restarting in 5 seconds...");
    delay(5000);
    ESP.restart();
  }
}

// ==================== WebSocket Setup ====================
void setupWebSocket() {
  Serial.println("🔌 Setting up WebSocket connection...");
  Serial.print("   Server: ws://");
  Serial.print(serverHost);
  Serial.print(":");
  Serial.print(serverPort);
  Serial.print("/ws/esp32/send/");
  Serial.println(deviceId);
  
  // Setup WebSocket connection
  String path = "/ws/esp32/send/" + String(deviceId);
  webSocket.begin(serverHost, serverPort, path);
  
  // Event handler
  webSocket.onEvent(webSocketEvent);
  
  // Reconnect interval (5 seconds)
  webSocket.setReconnectInterval(5000);
  
  Serial.println("   WebSocket initialized.\n");
}

// ==================== Ultrasonic Sensor Setup ====================
void setupUltrasonicSensor() {
  Serial.println("📏 Setting up HC-SR04 Ultrasonic Sensor...");
  Serial.print("   TRIG Pin: GPIO ");
  Serial.println(TRIG_PIN);
  Serial.print("   ECHO Pin: GPIO ");
  Serial.println(ECHO_PIN);
  
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  
  // Initialize trigger pin to LOW
  digitalWrite(TRIG_PIN, LOW);
  
  Serial.println("   Sensor ready!\n");
}

// ==================== WebSocket Event Handler ====================
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.println("🔌 WebSocket Disconnected");
      break;
      
    case WStype_CONNECTED:
      Serial.println("✅ WebSocket Connected!");
      Serial.print("   Server URL: ");
      Serial.println((char*)payload);
      
      // Send initial measurement
      sendSensorData();
      break;
      
    case WStype_TEXT:
      Serial.print("📨 Server response: ");
      Serial.println((char*)payload);
      
      // Parse server response
      StaticJsonDocument<200> doc;
      DeserializationError error = deserializeJson(doc, payload);
      
      if (!error) {
        if (doc.containsKey("status")) {
          const char* status = doc["status"];
          if (strcmp(status, "ok") == 0) {
            Serial.println("   ✓ Data saved successfully");
            if (doc.containsKey("reading_id")) {
              Serial.print("   Reading ID: ");
              Serial.println(doc["reading_id"].as<int>());
            }
          }
        }
        if (doc.containsKey("error")) {
          Serial.print("   ❌ Server error: ");
          Serial.println(doc["error"].as<const char*>());
        }
      }
      break;
      
    case WStype_ERROR:
      Serial.println("❌ WebSocket Error");
      break;
  }
}

// ==================== Read Distance from Ultrasonic Sensor ====================
float readDistance() {
  // Array to store multiple measurements
  float distances[NUM_SAMPLES];
  
  // Take multiple samples for better accuracy
  for (int i = 0; i < NUM_SAMPLES; i++) {
    // Send 10 microsecond pulse to trigger
    digitalWrite(TRIG_PIN, LOW);
    delayMicroseconds(2);
    digitalWrite(TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);
    
    // Read the echo pulse duration (time taken for sound to return)
    long duration = pulseIn(ECHO_PIN, HIGH, 30000); // 30ms timeout
    
    // Calculate distance in centimeters
    // Speed of sound = 340 m/s = 0.034 cm/µs
    // Distance = (Time × Speed of Sound) / 2
    float distance = (duration * 0.034) / 2.0;
    
    // Validate measurement
    if (distance < MIN_DISTANCE || distance > MAX_DISTANCE || duration == 0) {
      distances[i] = -1; // Invalid reading
    } else {
      distances[i] = distance;
    }
    
    delay(30); // Small delay between readings
  }
  
  // Return median value to filter out noise
  return getMedianDistance(distances, NUM_SAMPLES);
}

// ==================== Calculate Median Distance ====================
float getMedianDistance(float distances[], int size) {
  // Remove invalid readings and count valid ones
  int validCount = 0;
  for (int i = 0; i < size; i++) {
    if (distances[i] != -1) {
      validCount++;
    }
  }
  
  if (validCount == 0) {
    return -1; // No valid readings
  }
  
  // Simple bubble sort for small array
  for (int i = 0; i < size - 1; i++) {
    for (int j = 0; j < size - i - 1; j++) {
      if (distances[j] > distances[j + 1]) {
        float temp = distances[j];
        distances[j] = distances[j + 1];
        distances[j + 1] = temp;
      }
    }
  }
  
  // Return median value (middle element)
  return distances[size / 2];
}

// ==================== Send Sensor Data to Server ====================
void sendSensorData() {
  if (!webSocket.isConnected()) {
    Serial.println("⚠️  WebSocket not connected, skipping data send");
    return;
  }
  
  // Read distance from ultrasonic sensor
  float distance = readDistance();
  
  // Check if reading is valid
  if (distance < 0) {
    Serial.println("⚠️  Invalid distance reading, skipping...");
    return;
  }
  
  // Create JSON document
  StaticJsonDocument<300> doc;
  
  // Add distance measurement (primary data)
  doc["distance"] = String(distance, 2);
  
  // Optional: Add other sensor data if you have them
  // doc["temperature"] = String(25.5, 2);
  // doc["humidity"] = String(60.0, 2);
  
  // Add device information in custom_data
  JsonObject customData = doc.createNestedObject("custom_data");
  customData["wifi_rssi"] = WiFi.RSSI();
  customData["uptime_seconds"] = millis() / 1000;
  customData["sensor_type"] = "HC-SR04";
  
  // Serialize to string
  String jsonString;
  serializeJson(doc, jsonString);
  
  // Send to server
  Serial.println("\n📤 Sending measurement:");
  Serial.print("   Distance: ");
  Serial.print(distance);
  Serial.println(" cm");
  Serial.print("   JSON: ");
  Serial.println(jsonString);
  
  webSocket.sendTXT(jsonString);
}

/*
 * ==================== WIRING INSTRUCTIONS ====================
 * 
 * HC-SR04 Ultrasonic Sensor Connections:
 * 
 *   HC-SR04 Pin  →  ESP32 Pin
 *   ─────────────────────────
 *   VCC          →  5V (or 3.3V)
 *   GND          →  GND
 *   TRIG         →  GPIO 5
 *   ECHO         →  GPIO 18
 * 
 * Pin Layout Diagram:
 * 
 *        HC-SR04 Sensor
 *     ┌──────────────────┐
 *     │  VCC GND TRIG ECHO│
 *     └───┬───┬───┬────┬──┘
 *         │   │   │    │
 *         │   │   │    └─────→ GPIO 18 (ECHO)
 *         │   │   └──────────→ GPIO 5 (TRIG)
 *         │   └──────────────→ GND
 *         └──────────────────→ 5V or 3.3V
 * 
 * IMPORTANT NOTES:
 * 
 * 1. Some HC-SR04 sensors work with 3.3V, others require 5V
 *    - If using 5V, you may need a voltage divider for ECHO pin
 *    - Most ESP32 boards can tolerate 5V on input pins, but check your board
 * 
 * 2. You can change the pin numbers by modifying:
 *    #define TRIG_PIN 5
 *    #define ECHO_PIN 18
 * 
 * 3. Keep sensor at least 2cm away from obstacles for accurate readings
 * 
 * 4. Sensor should be mounted facing forward with clear line of sight
 * 
 * ==================== CONFIGURATION STEPS ====================
 * 
 * STEP 1: Update WiFi Credentials
 *   - Change "YOUR_WIFI_SSID" to your WiFi network name
 *   - Change "YOUR_WIFI_PASSWORD" to your WiFi password
 * 
 * STEP 2: Find Your Server IP Address
 *   Linux/Mac:   Open terminal and run: hostname -I
 *   Windows:     Open CMD and run: ipconfig
 *   
 *   Look for address like: 192.168.1.xxx or 10.0.0.xxx
 * 
 * STEP 3: Update Server Configuration
 *   - Change serverHost to your server's IP address
 *   - Keep serverPort as 8000 (or change if you use different port)
 * 
 * STEP 4: Add Device to Database
 *   Method 1 - Via Web Interface:
 *     - Login to http://YOUR_SERVER_IP:5173
 *     - Click "Add Device"
 *     - Enter device name (e.g., "ESP32-Ultrasonic-1")
 *     - Enter ESP32's IP address (shown in Serial Monitor after WiFi connects)
 *     - Select type: "ESP32"
 *     - Note the device ID (1, 2, 3, etc.)
 * 
 *   Method 2 - Via Serial Monitor:
 *     - The ESP32 will display its IP address
 *     - Add this device manually in the web interface
 * 
 * STEP 5: Update Device ID
 *   - Change deviceId to match the ID from your database
 *   - Default is 1 for the first device
 * 
 * STEP 6: Upload Code
 *   - Connect ESP32 via USB
 *   - Select: Tools → Board → ESP32 Dev Module
 *   - Select: Tools → Port → (your ESP32 port)
 *   - Click Upload button
 * 
 * STEP 7: Monitor Output
 *   - Open Serial Monitor (115200 baud)
 *   - Watch for connection status
 *   - Verify distance readings are being sent
 * 
 * ==================== TROUBLESHOOTING ====================
 * 
 * Problem: WiFi won't connect
 * Solution:
 *   - Double-check SSID and password (case-sensitive!)
 *   - Ensure 2.4GHz WiFi (ESP32 doesn't support 5GHz)
 *   - Move ESP32 closer to router
 *   - Check if WiFi has MAC address filtering
 * 
 * Problem: WebSocket connection fails
 * Solution:
 *   - Verify server IP address is correct
 *   - Ensure backend server is running: uvicorn main:app --reload --host 0.0.0.0
 *   - Check firewall isn't blocking port 8000
 *   - Verify ESP32 and server are on same network
 * 
 * Problem: "Device not found" error
 * Solution:
 *   - Add device via web interface first
 *   - Verify deviceId matches the database ID
 *   - Check device was created successfully
 * 
 * Problem: Distance reading always 0 or -1
 * Solution:
 *   - Check HC-SR04 wiring (especially TRIG and ECHO)
 *   - Verify sensor has proper power (3.3V or 5V)
 *   - Ensure no obstacles within 2cm of sensor
 *   - Try different GPIO pins if needed
 * 
 * Problem: Inconsistent readings
 * Solution:
 *   - Sensor might be picking up electrical noise
 *   - Add small capacitor (10µF) across VCC and GND
 *   - Keep wires short and away from power cables
 *   - Increase NUM_SAMPLES for more averaging
 * 
 * ==================== TESTING ====================
 * 
 * 1. Serial Monitor Test:
 *    - Distance values should change when you move your hand
 *    - Typical range: 2 cm to 400 cm
 *    - Should see "Data saved successfully" from server
 * 
 * 2. Web Interface Test:
 *    - Login to web interface
 *    - Click on your device
 *    - Should see "Live" badge (green)
 *    - Distance value should update every 2 seconds
 * 
 * 3. Accuracy Test:
 *    - Place object at known distance (e.g., 20cm)
 *    - Compare sensor reading with actual measurement
 *    - Should be accurate within ±1cm for distances up to 100cm
 * 
 * ==================== ADVANCED CONFIGURATION ====================
 * 
 * Adjust Reading Interval:
 *   const unsigned long READING_INTERVAL = 2000;  // milliseconds
 *   Decrease for faster updates (minimum ~100ms)
 *   Increase to reduce battery usage
 * 
 * Change Distance Range:
 *   const float MAX_DISTANCE = 400.0;  // Maximum 400cm
 *   const float MIN_DISTANCE = 2.0;    // Minimum 2cm
 * 
 * Improve Accuracy:
 *   const int NUM_SAMPLES = 5;  // Increase to 10 for better accuracy
 *   More samples = slower but more accurate
 * 
 * Change Pin Numbers:
 *   #define TRIG_PIN 5   // Any available GPIO
 *   #define ECHO_PIN 18  // Any available GPIO
 *   Avoid pins used by built-in features
 * 
 * ==================== ADDITIONAL SENSORS ====================
 * 
 * You can add other sensors and send multiple values:
 * 
 * Example with DHT22 temperature sensor:
 *   #include <DHT.h>
 *   DHT dht(4, DHT22);
 *   
 *   In setup():
 *     dht.begin();
 *   
 *   In sendSensorData():
 *     doc["temperature"] = String(dht.readTemperature(), 2);
 *     doc["humidity"] = String(dht.readHumidity(), 2);
 * 
 * ==================== POWER SAVING ====================
 * 
 * For battery-powered applications:
 * 
 * 1. Deep Sleep Mode:
 *    ESP.deepSleep(30e6);  // Sleep for 30 seconds
 * 
 * 2. Reduce WiFi power:
 *    WiFi.setSleep(true);
 * 
 * 3. Lower reading frequency:
 *    const unsigned long READING_INTERVAL = 10000;  // 10 seconds
 * 
 * ==================== API ENDPOINTS ====================
 * 
 * Your data is sent to:
 *   ws://YOUR_SERVER:8000/ws/esp32/send/{device_id}
 * 
 * View data via REST API:
 *   GET /sensors/latest/{device_id}
 *   GET /sensors/readings/{device_id}
 * 
 * API documentation:
 *   http://YOUR_SERVER:8000/docs
 */
