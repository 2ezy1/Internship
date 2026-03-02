#include <Arduino.h>
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include "config.h"

// ==================== Global Variables ====================

WebSocketsClient webSocket;
bool isConnected = false;
uint32_t lastDataSendTime = 0;
uint32_t lastHeartbeatTime = 0;
uint32_t lastWiFiCheckTime = 0;
uint16_t reconnectAttempts = 0;
const uint16_t MAX_RECONNECT_ATTEMPTS = 10;

// VFD data structure
struct VFDData {
  float frequency = 0.0;     // Hz
  float speed = 0.0;         // RPM
  float current = 0.0;       // A
  float voltage = 0.0;       // V
  float power = 0.0;         // kW
  float torque = 0.0;        // Nm
  int status = 0;            // 0=Stop, 1=Run, 2=Fault, 3=Ready
  int faultCode = 0;         // Fault code number
};

VFDData vfdData;

// ==================== Function Prototypes ====================

void connectToWiFi();
void checkWiFiConnection();
void connectWebSocket();
void webSocketEvent(WStype_t type, uint8_t *payload, size_t length);
void sendSensorData();
void sendHeartbeat();
void readSensorDataFromSerial2();
void printStatus();

// ==================== Setup ====================

void setup() {
  // Initialize USB Serial for debugging
  Serial.begin(115200);
  delay(100);
  
  Serial.println("\n\n");
  Serial.println("=====================================");
  Serial.println("ESP32 Master WebSocket - Starting");
  Serial.println("=====================================");
  Serial.printf("Device ID: %d\n", DEVICE_ID);
  Serial.printf("Server: %s:%d\n", SERVER_IP, SERVER_PORT);
  Serial.println();
  
  // Initialize Serial2 for UART communication with slave
  Serial2.begin(UART_BAUD, SERIAL_8N1, RX_PIN, TX_PIN);
  Serial.printf("Serial2 initialized: BAUD=%d, RX=GPIO%d, TX=GPIO%d\n", UART_BAUD, RX_PIN, TX_PIN);
  
  // Connect to WiFi with static IP
  connectToWiFi();
  
  // Setup WebSocket callbacks
  webSocket.onEvent(webSocketEvent);
  
  // Attempt initial WebSocket connection if WiFi is connected
  if (WiFi.status() == WL_CONNECTED) {
    connectWebSocket();
  }
  
  Serial.println("Setup complete - ready to establish WebSocket connection");
}

// ==================== Main Loop ====================

void loop() {
  // Check WiFi connection every 10 seconds
  if (millis() - lastWiFiCheckTime > 10000) {
    checkWiFiConnection();
    lastWiFiCheckTime = millis();
  }
  
  // WebSocket event handling
  webSocket.loop();
  
  // Read data from Serial2 (slave device)
  if (Serial2.available()) {
    readSensorDataFromSerial2();
  }
  
  // Send sensor data at specified interval
  if (isConnected && (millis() - lastDataSendTime > POLL_INTERVAL_MS)) {
    sendSensorData();
    lastDataSendTime = millis();
  }
  
  // Send heartbeat at specified interval
  if (isConnected && (millis() - lastHeartbeatTime > HEARTBEAT_INTERVAL_MS)) {
    sendHeartbeat();
    lastHeartbeatTime = millis();
  }
  
  delay(10);
}

// ==================== WiFi Functions ====================

void connectToWiFi() {
  Serial.println("\n📡 Configuring static IP...");
  
  IPAddress local_ip(STATIC_IP_0, STATIC_IP_1, STATIC_IP_2, STATIC_IP_3);
  IPAddress gateway(GATEWAY_0, GATEWAY_1, GATEWAY_2, GATEWAY_3);
  IPAddress subnet(SUBNET_0, SUBNET_1, SUBNET_2, SUBNET_3);
  IPAddress primaryDNS(PRIMARY_DNS_0, PRIMARY_DNS_1, PRIMARY_DNS_2, PRIMARY_DNS_3);
  IPAddress secondaryDNS(SECONDARY_DNS_0, SECONDARY_DNS_1, SECONDARY_DNS_2, SECONDARY_DNS_3);
  
  // Configure static IP before connecting
  if (!WiFi.config(local_ip, gateway, subnet, primaryDNS, secondaryDNS)) {
    Serial.println("❌ Failed to configure static IP");
  } else {
    Serial.println("✅ Static IP configured:");
    Serial.print("  IP: "); Serial.println(local_ip);
    Serial.print("  Gateway: "); Serial.println(gateway);
    Serial.print("  Subnet: "); Serial.println(subnet);
  }
  
  Serial.println("\n📡 Connecting to WiFi...");
  Serial.printf("  SSID: %s\n", WIFI_SSID);
  
  // Start WiFi connection
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  // Wait for connection (max 20 seconds)
  uint8_t timeout = 0;
  while (WiFi.status() != WL_CONNECTED && timeout < 20) {
    delay(500);
    Serial.print(".");
    timeout++;
  }
  
  Serial.println();
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("✅ WiFi connected!");
    Serial.print("  Local IP: ");
    Serial.println(WiFi.localIP());
    Serial.print("  RSSI: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
  } else {
    Serial.println("❌ Failed to connect to WiFi");
  }
}

void checkWiFiConnection() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠️  WiFi disconnected - reconnecting...");
    connectToWiFi();
    
    if (WiFi.status() == WL_CONNECTED) {
      // WiFi reconnected, attempt WebSocket connection
      connectWebSocket();
    }
  }
}

// ==================== WebSocket Functions ====================

void connectWebSocket() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("❌ Cannot connect to WebSocket - WiFi not connected");
    return;
  }
  
  Serial.println("\n🔌 Connecting to WebSocket...");
  Serial.printf("  Server: %s:%d\n", SERVER_IP, SERVER_PORT);
  Serial.printf("  Path: %s?device_id=%d&device_key=%s\n", SERVER_PATH, DEVICE_ID, DEVICE_KEY);
  
  // Build WebSocket URL with device authentication
  String wsPath = String(SERVER_PATH);
  wsPath += "?device_id=" + String(DEVICE_ID);
  wsPath += "&device_key=" + String(DEVICE_KEY);
  
  webSocket.begin(SERVER_IP, SERVER_PORT, wsPath);
  
  reconnectAttempts = 0;
}

void webSocketEvent(WStype_t type, uint8_t *payload, size_t length) {
  switch (type) {
    
    case WStype_DISCONNECTED: {
      isConnected = false;
      Serial.println("❌ WebSocket disconnected");
      reconnectAttempts++;
      
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        uint32_t delayMs = min(30000UL, 1000UL * (1 << reconnectAttempts)); // Exponential backoff, max 30s
        Serial.printf("⏳ Reconnecting in %lu ms (attempt %u/%u)...\n", delayMs, reconnectAttempts, MAX_RECONNECT_ATTEMPTS);
        delay(delayMs);
        connectWebSocket();
      } else {
        Serial.println("❌ Max reconnection attempts reached - will retry later");
        delay(300000);  // Wait 5 minutes before retrying
        reconnectAttempts = 0;
      }
      break;
    }
    
    case WStype_CONNECTED: {
      isConnected = true;
      reconnectAttempts = 0;
      Serial.println("✅ WebSocket connected!");
      
      // Send initial heartbeat to confirm connection
      sendHeartbeat();
      lastHeartbeatTime = millis();
      break;
    }
    
    case WStype_TEXT: {
      // Parse server response
      String text = String((char *)payload);
      Serial.printf("📨 Server response: %s\n", text.c_str());
      
      // Handle JSON responses
      StaticJsonDocument<200> doc;
      DeserializationError error = deserializeJson(doc, text);
      
      if (!error) {
        String status = doc["status"] | "";
        if (status == "ok") {
          // Data acknowledged by server
          if (DEBUG_ENABLED) {
            Serial.println("✅ Data acknowledged by server");
          }
        }
      }
      break;
    }
    
    case WStype_ERROR: {
      Serial.printf("❌ WebSocket error: %s\n", (char *)payload);
      break;
    }
    
    case WStype_BIN:
      // Binary data not expected
      break;
  }
}

// ==================== Data Transmission Functions ====================

void sendHeartbeat() {
  if (!isConnected) {
    return;
  }
  
  // Create JSON heartbeat message
  StaticJsonDocument<256> doc;
  doc["type"] = "heartbeat";
  doc["device_id"] = DEVICE_ID;
  doc["device_key"] = DEVICE_KEY;
  doc["timestamp"] = String(millis());
  doc["rssi"] = WiFi.RSSI();
  doc["uptime"] = millis();
  
  // Serialize and send
  String jsonString;
  serializeJson(doc, jsonString);
  
  webSocket.sendTXT(jsonString);
  
  if (DEBUG_ENABLED) {
    Serial.print("💖 Heartbeat sent - RSSI: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
  }
}

void sendSensorData() {
  if (!isConnected) {
    return;
  }
  
  // Create JSON sensor data message
  StaticJsonDocument<356> doc;
  doc["type"] = "sensor_data";
  doc["device_id"] = DEVICE_ID;
  doc["device_key"] = DEVICE_KEY;
  doc["timestamp"] = String(millis());
  doc["rssi"] = WiFi.RSSI();
  doc["uptime"] = millis();
  
  // Add VFD data
  JsonObject data = doc.createNestedObject("data");
  data["frequency"] = vfdData.frequency;
  data["speed"] = vfdData.speed;
  data["current"] = vfdData.current;
  data["voltage"] = vfdData.voltage;
  data["power"] = vfdData.power;
  data["torque"] = vfdData.torque;
  data["status"] = vfdData.status;
  data["faultCode"] = vfdData.faultCode;
  
  // Serialize and send
  String jsonString;
  serializeJson(doc, jsonString);
  
  webSocket.sendTXT(jsonString);
  
  if (DEBUG_ENABLED) {
    Serial.print("📡 VFD data sent - Freq: ");
    Serial.print(vfdData.frequency);
    Serial.print(" Hz, Speed: ");
    Serial.print(vfdData.speed);
    Serial.println(" RPM");
  }
}

// ==================== Serial Data Reading ====================

void readSensorDataFromSerial2() {
  // Read incoming data from Serial2
  String buffer = "";
  
  while (Serial2.available()) {
    char c = Serial2.read();
    buffer += c;
    
    // Look for complete JSON message (ends with newline)
    if (c == '\n') {
      // Try to parse as JSON
      StaticJsonDocument<256> doc;
      DeserializationError error = deserializeJson(doc, buffer);
      
      if (!error) {
        // Extract VFD values
        vfdData.frequency = doc["frequency"] | 0.0;
        vfdData.speed = doc["speed"] | 0.0;
        vfdData.current = doc["current"] | 0.0;
        vfdData.voltage = doc["voltage"] | 0.0;
        vfdData.power = doc["power"] | 0.0;
        vfdData.torque = doc["torque"] | 0.0;
        vfdData.status = doc["status"] | 0;
        vfdData.faultCode = doc["faultCode"] | 0;
        
        if (DEBUG_ENABLED) {
          Serial.print("📥 Received from slave: ");
          Serial.println(buffer);
        }
      } else if (DEBUG_ENABLED) {
        Serial.print("⚠️  Invalid JSON from slave: ");
        Serial.println(buffer);
      }
      
      buffer = "";
    }
  }
}

// ==================== Utility Functions ====================

void printStatus() {
  Serial.println("\n=== System Status ===");
  Serial.print("WiFi: ");
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("Connected (");
    Serial.print(WiFi.localIP());
    Serial.print(", RSSI: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm)");
  } else {
    Serial.println("Disconnected");
  }
  
  Serial.print("WebSocket: ");
  Serial.println(isConnected ? "Connected" : "Disconnected");
  
  Serial.print("Latest VFD Data: ");
  Serial.print("Freq=");
  Serial.print(vfdData.frequency);
  Serial.print(" Hz, Speed=");
  Serial.print(vfdData.speed);
  Serial.print(" RPM, Status=");
  Serial.println(vfdData.status);
}

