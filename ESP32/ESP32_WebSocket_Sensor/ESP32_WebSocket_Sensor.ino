/*
 * ESP32 Sensor Data to WebSocket Server
 * 
 * This sketch connects an ESP32 to your FastAPI WebSocket server
 * and sends simulated sensor readings (temperature, humidity, pressure, light)
 * 
 * Hardware Requirements:
 * - ESP32 board
 * - Optional: DHT22/DHT11 sensor for real temperature/humidity
 * - Optional: BMP280 sensor for real pressure
 * - Optional: LDR (Light Dependent Resistor) for light detection
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
const char* ssid = "YOUR_WIFI_SSID";           // Replace with your WiFi SSID
const char* password = "YOUR_WIFI_PASSWORD";   // Replace with your WiFi password

// ==================== Server Configuration ====================
const char* serverHost = "192.168.1.100";      // Replace with your server IP
const uint16_t serverPort = 8000;              // FastAPI server port
const uint16_t deviceId = 1;                   // Device ID from your database

// WebSocket client
WebSocketsClient webSocket;

// Sensor reading interval (milliseconds)
const unsigned long READING_INTERVAL = 5000;  // Send data every 5 seconds
unsigned long lastReadingTime = 0;

// Simulated sensor baseline values
float baseTemperature = 25.0;
float baseHumidity = 60.0;
float basePressure = 1013.0;
float baseLight = 500.0;

// ==================== Function Prototypes ====================
void setupWiFi();
void setupWebSocket();
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length);
void sendSensorData();
float readTemperature();
float readHumidity();
float readPressure();
float readLight();
bool readMotion();

// ==================== Setup ====================
void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n\n=================================");
  Serial.println("ESP32 Sensor WebSocket Client");
  Serial.println("=================================\n");
  
  // Connect to WiFi
  setupWiFi();
  
  // Setup WebSocket connection
  setupWebSocket();
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
  Serial.print("Connecting to WiFi: ");
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
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
    Serial.print("Signal Strength (RSSI): ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm\n");
  } else {
    Serial.println("\n❌ WiFi Connection Failed!");
    Serial.println("Please check your SSID and password.");
  }
}

// ==================== WebSocket Setup ====================
void setupWebSocket() {
  Serial.println("Setting up WebSocket connection...");
  Serial.print("Server: ws://");
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
  
  // Reconnect interval
  webSocket.setReconnectInterval(5000);
  
  Serial.println("WebSocket initialized.\n");
}

// ==================== WebSocket Event Handler ====================
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.println("🔌 WebSocket Disconnected");
      break;
      
    case WStype_CONNECTED:
      Serial.println("✅ WebSocket Connected!");
      Serial.print("Server URL: ");
      Serial.println((char*)payload);
      
      // Send initial message
      sendSensorData();
      break;
      
    case WStype_TEXT:
      Serial.print("📨 Received from server: ");
      Serial.println((char*)payload);
      
      // Parse server response
      StaticJsonDocument<200> doc;
      DeserializationError error = deserializeJson(doc, payload);
      
      if (!error) {
        if (doc.containsKey("status")) {
          const char* status = doc["status"];
          if (strcmp(status, "ok") == 0) {
            Serial.println("✅ Server acknowledged data");
          }
        }
        if (doc.containsKey("error")) {
          Serial.print("❌ Server error: ");
          Serial.println(doc["error"].as<const char*>());
        }
      }
      break;
      
    case WStype_ERROR:
      Serial.println("❌ WebSocket Error");
      break;
      
    case WStype_BIN:
      Serial.println("📦 Binary data received (not supported)");
      break;
  }
}

// ==================== Send Sensor Data ====================
void sendSensorData() {
  if (!webSocket.isConnected()) {
    Serial.println("⚠️ WebSocket not connected, skipping data send");
    return;
  }
  
  // Read sensor values
  float temperature = readTemperature();
  float humidity = readHumidity();
  float pressure = readPressure();
  float light = readLight();
  bool motion = readMotion();
  
  // Create JSON document
  StaticJsonDocument<300> doc;
  
  doc["temperature"] = String(temperature, 2);
  doc["humidity"] = String(humidity, 2);
  doc["pressure"] = String(pressure, 2);
  doc["light"] = String(light, 0);
  doc["motion"] = motion ? "true" : "false";
  
  // Optional: Add custom data
  JsonObject customData = doc.createNestedObject("custom_data");
  customData["wifi_rssi"] = WiFi.RSSI();
  customData["uptime"] = millis() / 1000;
  
  // Serialize to string
  String jsonString;
  serializeJson(doc, jsonString);
  
  // Send to server
  Serial.println("\n📤 Sending sensor data:");
  Serial.println(jsonString);
  
  webSocket.sendTXT(jsonString);
}

// ==================== Sensor Reading Functions ====================

// Read Temperature (Simulated or Real DHT22)
float readTemperature() {
  // SIMULATED: Replace with real sensor reading
  // For DHT22: dht.readTemperature()
  float randomVariation = (random(-20, 20)) / 10.0;
  return baseTemperature + randomVariation;
  
  /* REAL DHT22 EXAMPLE:
  #include <DHT.h>
  #define DHTPIN 4
  #define DHTTYPE DHT22
  DHT dht(DHTPIN, DHTTYPE);
  
  float temp = dht.readTemperature();
  if (isnan(temp)) {
    Serial.println("Failed to read from DHT sensor!");
    return baseTemperature;
  }
  return temp;
  */
}

// Read Humidity (Simulated or Real DHT22)
float readHumidity() {
  // SIMULATED: Replace with real sensor reading
  // For DHT22: dht.readHumidity()
  float randomVariation = (random(-30, 30)) / 10.0;
  float humidity = baseHumidity + randomVariation;
  return constrain(humidity, 0.0, 100.0);
  
  /* REAL DHT22 EXAMPLE:
  float hum = dht.readHumidity();
  if (isnan(hum)) {
    Serial.println("Failed to read from DHT sensor!");
    return baseHumidity;
  }
  return hum;
  */
}

// Read Atmospheric Pressure (Simulated or Real BMP280)
float readPressure() {
  // SIMULATED: Replace with real sensor reading
  // For BMP280: bmp.readPressure() / 100.0F
  float randomVariation = (random(-50, 50)) / 10.0;
  return basePressure + randomVariation;
  
  /* REAL BMP280 EXAMPLE:
  #include <Adafruit_BMP280.h>
  Adafruit_BMP280 bmp;
  
  float pressure = bmp.readPressure() / 100.0F; // Convert Pa to hPa
  if (pressure == 0) {
    Serial.println("Failed to read from BMP280!");
    return basePressure;
  }
  return pressure;
  */
}

// Read Light Level (Simulated or Real LDR)
float readLight() {
  // SIMULATED: Replace with real sensor reading
  // For LDR: analogRead(LDR_PIN)
  float randomVariation = (random(-200, 200));
  float light = baseLight + randomVariation;
  return constrain(light, 0.0, 4095.0);
  
  /* REAL LDR EXAMPLE:
  #define LDR_PIN 34
  
  int ldrValue = analogRead(LDR_PIN);
  // Convert to lux (approximate formula)
  float lux = map(ldrValue, 0, 4095, 0, 1000);
  return lux;
  */
}

// Read Motion (Simulated or Real PIR)
bool readMotion() {
  // SIMULATED: Random motion detection
  // For PIR: digitalRead(PIR_PIN)
  return random(0, 10) > 7;
  
  /* REAL PIR EXAMPLE:
  #define PIR_PIN 5
  
  int motionState = digitalRead(PIR_PIN);
  return motionState == HIGH;
  */
}

/*
 * ==================== USAGE INSTRUCTIONS ====================
 * 
 * 1. UPDATE CONFIGURATION:
 *    - Change WiFi SSID and password
 *    - Update serverHost with your computer's IP address
 *    - Update deviceId with the device ID from your database
 * 
 * 2. INSTALL LIBRARIES:
 *    Arduino IDE -> Tools -> Manage Libraries
 *    - Search and install "WebSocketsClient" by Markus Sattler
 *    - Search and install "ArduinoJson" by Benoit Blanchon
 * 
 * 3. SELECT BOARD:
 *    - Tools -> Board -> ESP32 Arduino -> ESP32 Dev Module
 * 
 * 4. UPLOAD:
 *    - Connect ESP32 via USB
 *    - Click Upload button
 * 
 * 5. MONITOR:
 *    - Open Serial Monitor (115200 baud)
 *    - Watch for connection status and data transmission
 * 
 * 6. ADDING REAL SENSORS:
 *    - Uncomment the relevant sensor code sections
 *    - Install required sensor libraries
 *    - Connect sensors to ESP32 pins as specified
 *    - Initialize sensors in setup() function
 * 
 * ==================== TROUBLESHOOTING ====================
 * 
 * - WiFi not connecting: Check SSID/password, signal strength
 * - WebSocket not connecting: Verify server IP, check firewall
 * - Data not appearing: Check device ID, verify server is running
 * - Sensor errors: Check wiring, library versions, power supply
 * 
 * ==================== PIN CONFIGURATION (if using real sensors) ====================
 * 
 * DHT22 Temperature/Humidity:
 *   - VCC -> 3.3V
 *   - GND -> GND
 *   - DATA -> GPIO 4
 * 
 * BMP280 Pressure:
 *   - VCC -> 3.3V
 *   - GND -> GND
 *   - SCL -> GPIO 22
 *   - SDA -> GPIO 21
 * 
 * LDR Light Sensor:
 *   - One end -> 3.3V via 10K resistor
 *   - Other end -> GND
 *   - Middle tap -> GPIO 34 (analog)
 * 
 * PIR Motion:
 *   - VCC -> 5V
 *   - GND -> GND
 *   - OUT -> GPIO 5
 */
