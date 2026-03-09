#include <Arduino.h>
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include "config.h"

// ==================== Global Variables ====================

WebSocketsClient webSocket;
Preferences preferences;
bool isConnected = false;
bool isRegistered = false;
uint32_t lastDataSendTime = 0;
uint32_t lastHeartbeatTime = 0;
uint32_t lastWiFiCheckTime = 0;
uint32_t lastWebSocketAttemptTime = 0;
uint16_t reconnectAttempts = 0;
const uint16_t MAX_RECONNECT_ATTEMPTS = 10;
const uint32_t WEBSOCKET_RETRY_INTERVAL_MS = 5000;

// Device credentials (loaded from Preferences or received from server)
String deviceMAC = "";
int deviceID = 0;
String deviceKey = "";
String deviceName = "";

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
void loadCredentials();
void saveCredentials();
void connectWebSocket();
void webSocketEvent(WStype_t type, uint8_t *payload, size_t length);
void handleRegistrationResponse(JsonDocument& doc);
void sendSensorData();
void sendHeartbeat();
void readSensorDataFromSerial2();
void processVFDJson(const String& jsonPayload);
void printStatus();
String getMACAddress();
String urlEncode(const String& value);

// ==================== Setup ====================

void setup() {
  // Initialize USB Serial for debugging
  Serial.begin(115200);
  delay(100);
  
  Serial.println("\n\n");
  Serial.println("=====================================");
  Serial.println("ESP32 Master WebSocket - Starting");
  Serial.println("   AUTO-REGISTRATION ENABLED");
  Serial.println("=====================================");
  
  // Initialize Serial2 for UART communication with slave
  Serial2.begin(UART_BAUD, SERIAL_8N1, RX_PIN, TX_PIN);
  Serial.printf("Serial2 initialized: BAUD=%d, RX=GPIO%d, TX=GPIO%d\n", UART_BAUD, RX_PIN, TX_PIN);
  
  // Connect to WiFi with static IP (sets STA mode first)
  connectToWiFi();

  // Get MAC address AFTER WiFi is in STA mode so we read the correct STA MAC
  deviceMAC = getMACAddress();
  Serial.printf("MAC Address: %s\n", deviceMAC.c_str());

  // Load stored credentials from Preferences
  loadCredentials();
  
  // If no stored credentials but static credentials are defined in config.h, use them
  // so this ESP32 connects as the "Testing" device (id=1) and data shows in the frontend
  #if defined(DEVICE_ID) && defined(DEVICE_KEY) && DEVICE_ID > 0
  if (deviceID <= 0 || deviceKey.length() == 0) {
    deviceID = DEVICE_ID;
    deviceKey = String(DEVICE_KEY);
    isRegistered = true;
    Serial.println("✅ Using static credentials from config.h (Testing device)");
    Serial.printf("   Device ID: %d\n", deviceID);
  }
  #endif
  
  if (deviceID > 0 && deviceKey.length() > 0) {
    if (!isRegistered) {
      isRegistered = true;
    }
    Serial.printf("   Device ID: %d, Key: %s\n", deviceID, deviceKey.c_str());
  } else {
    Serial.println("ℹ️  No credentials - will auto-register with server");
    isRegistered = false;
  }
  
  Serial.printf("Server: %s:%d\n", SERVER_IP, SERVER_PORT);
  Serial.println();

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

  // If WiFi is connected but WebSocket is down, retry periodically
  if (WiFi.status() == WL_CONNECTED && !isConnected && (millis() - lastWebSocketAttemptTime > WEBSOCKET_RETRY_INTERVAL_MS)) {
    connectWebSocket();
  }
  
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
  // Reset WiFi state before reconnecting
  WiFi.mode(WIFI_STA);
  WiFi.persistent(false);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  WiFi.disconnect(true, true);
  delay(200);

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
    Serial.print("  Gateway: ");
    Serial.println(WiFi.gatewayIP());
    Serial.print("  DNS: ");
    Serial.println(WiFi.dnsIP());
    Serial.print("  RSSI: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");

    if (WiFi.RSSI() <= -85) {
      Serial.println("⚠️ Very weak WiFi signal detected. Connection may drop frequently.");
    }
  } else {
    Serial.println("❌ Failed to connect to WiFi");
  }
}

void checkWiFiConnection() {
  if (WiFi.status() != WL_CONNECTED) {
    isConnected = false;
    webSocket.disconnect();
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

  lastWebSocketAttemptTime = millis();
  
  Serial.println("\n🔌 Connecting to WebSocket...");
  Serial.printf("  Server: %s:%d\n", SERVER_IP, SERVER_PORT);
  Serial.printf("  MAC Address: %s\n", deviceMAC.c_str());
  
  // Build WebSocket path: mac_address must be URL-encoded (colons break some servers)
  String macEncoded = urlEncode(deviceMAC);
  String wsPath = String(SERVER_PATH);
  wsPath += "?mac_address=" + macEncoded;
  
  if (isRegistered && deviceID > 0 && deviceKey.length() > 0) {
    wsPath += "&device_id=" + String(deviceID);
    wsPath += "&device_key=" + deviceKey;
    Serial.printf("  ✅ Authenticating with device_id=%d\n", deviceID);
  } else {
    Serial.println("  ℹ️  Requesting auto-registration (no stored credentials)");
  }
  
  Serial.printf("  WebSocket Path: ws://%s:%d%s\n", SERVER_IP, SERVER_PORT, SERVER_PATH);
  Serial.printf("  Full URL: ws://%s:%d%s\n", SERVER_IP, SERVER_PORT, wsPath.c_str());
  
  webSocket.begin(SERVER_IP, SERVER_PORT, wsPath);
  webSocket.setReconnectInterval(0);  // Manual retry loop in loop() controls reconnect timing.
  webSocket.enableHeartbeat(15000, 3000, 2);
  
  reconnectAttempts = 0;
  
  Serial.println("⏳ Waiting for WebSocket handshake...");
}

void webSocketEvent(WStype_t type, uint8_t *payload, size_t length) {
  switch (type) {
    
    case WStype_DISCONNECTED: {
      isConnected = false;
      reconnectAttempts++;
      Serial.printf("❌ WebSocket disconnected (attempt counter=%u). Waiting for next retry tick...\n", reconnectAttempts);
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts = 0;
      }
      break;
    }
    
    case WStype_CONNECTED: {
      isConnected = true;
      reconnectAttempts = 0;
      lastWebSocketAttemptTime = millis();
      Serial.println("✅ WebSocket connected - sending initial credentials...");
      
      // Send credentials as first message (fallback in case query params weren't sent)
      StaticJsonDocument<256> credMsg;
      credMsg["mac_address"] = deviceMAC;
      if (isRegistered && deviceID > 0 && deviceKey.length() > 0) {
        credMsg["device_id"] = deviceID;
        credMsg["device_key"] = deviceKey;
      }
      
      String jsonString;
      serializeJson(credMsg, jsonString);
      webSocket.sendTXT(jsonString);
      
      Serial.println("📨 Credentials message sent to server");
      break;
    }
    
    case WStype_TEXT: {
      // Parse server response
      String text = String((char *)payload);
      Serial.printf("📨 Server response: %s\n", text.c_str());
      
      // Handle JSON responses
      StaticJsonDocument<512> doc;
      DeserializationError error = deserializeJson(doc, text);
      
      if (!error) {
        String msgType = doc["type"] | "";
        String status = doc["status"] | "";
        
        if (msgType == "registration") {
          // Handle registration/authentication response
          handleRegistrationResponse(doc);
        } else if (status == "ok") {
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
  if (!isConnected || !isRegistered) {
    return;
  }
  
  // Create JSON heartbeat message
  StaticJsonDocument<256> doc;
  doc["type"] = "heartbeat";
  doc["device_id"] = deviceID;
  doc["device_key"] = deviceKey;
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
  if (!isConnected || !isRegistered) {
    return;
  }
  
  // Create JSON sensor data message
  StaticJsonDocument<356> doc;
  doc["type"] = "sensor_data";
  doc["device_id"] = deviceID;
  doc["device_key"] = deviceKey;
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
  static String buffer = "";
  
  while (Serial2.available()) {
    char c = Serial2.read();
    buffer += c;

    // Prevent unbounded growth from noisy UART traffic
    if (buffer.length() > 512) {
      Serial.println("⚠️ UART buffer overflow/noise detected, resetting buffer");
      buffer = "";
      continue;
    }

    // Extract complete JSON objects from noisy stream
    int startIdx = buffer.indexOf('{');
    int endIdx = buffer.indexOf('}', startIdx >= 0 ? startIdx : 0);

    while (startIdx >= 0 && endIdx > startIdx) {
      String jsonPayload = buffer.substring(startIdx, endIdx + 1);
      processVFDJson(jsonPayload);
      buffer.remove(0, endIdx + 1);
      startIdx = buffer.indexOf('{');
      endIdx = buffer.indexOf('}', startIdx >= 0 ? startIdx : 0);
    }

    // If no JSON start marker exists, clear garbage
    if (buffer.indexOf('{') < 0 && buffer.length() > 120) {
      buffer = "";
    }
  }
}

void processVFDJson(const String& jsonPayload) {
  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, jsonPayload);

  if (error) {
    Serial.println("\n⚠️  ERROR: Invalid JSON received from slave");
    Serial.print("Raw data: ");
    Serial.println(jsonPayload);
    return;
  }

  vfdData.frequency = doc["frequency"] | 0.0;
  vfdData.speed = doc["speed"] | 0.0;
  vfdData.current = doc["current"] | 0.0;
  vfdData.voltage = doc["voltage"] | 0.0;
  vfdData.power = doc["power"] | 0.0;
  vfdData.torque = doc["torque"] | 0.0;
  vfdData.status = doc["status"] | 0;
  vfdData.faultCode = doc["faultCode"] | 0;

  Serial.println("\n┌─────────────────────────────────────────┐");
  Serial.println("│  📥 RECEIVED DATA FROM SLAVE           │");
  Serial.println("├─────────────────────────────────────────┤");
  Serial.printf("│  Frequency:  %6.1f Hz                  │\n", vfdData.frequency);
  Serial.printf("│  Speed:      %7.1f RPM                │\n", vfdData.speed);
  Serial.printf("│  Current:    %6.1f A                   │\n", vfdData.current);
  Serial.printf("│  Voltage:    %6.1f V                   │\n", vfdData.voltage);
  Serial.printf("│  Power:      %6.1f kW                  │\n", vfdData.power);
  Serial.printf("│  Torque:     %6.1f Nm                  │\n", vfdData.torque);
  Serial.print("│  Status:     ");
  switch(vfdData.status) {
    case 0: Serial.println("STOP                      │"); break;
    case 1: Serial.println("RUN                       │"); break;
    case 2: Serial.println("FAULT                     │"); break;
    case 3: Serial.println("READY                     │"); break;
    default: Serial.printf("UNKNOWN (%d)              │\n", vfdData.status); break;
  }
  if (vfdData.status == 2) {
    Serial.printf("│  Fault Code: %d                          │\n", vfdData.faultCode);
  }
  Serial.println("└─────────────────────────────────────────┘");

  if (DEBUG_ENABLED) {
    Serial.print("📄 Raw JSON: ");
    Serial.println(jsonPayload);
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
  
  Serial.print("Registration: ");
  if (isRegistered) {
    Serial.print("Registered (ID=");
    Serial.print(deviceID);
    Serial.println(")");
  } else {
    Serial.println("Not registered");
  }
  
  Serial.print("Latest VFD Data: ");
  Serial.print("Freq=");
  Serial.print(vfdData.frequency);
  Serial.print(" Hz, Speed=");
  Serial.print(vfdData.speed);
  Serial.print(" RPM, Status=");
  Serial.println(vfdData.status);
}

String getMACAddress() {
  uint8_t mac[6];
  WiFi.macAddress(mac);
  
  char macStr[18];
  snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
           mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  
  return String(macStr);
}

// URL-encode string for query params (colons in MAC break some WebSocket handshakes)
String urlEncode(const String& value) {
  String encoded = "";
  for (unsigned int i = 0; i < value.length(); i++) {
    char c = value[i];
    if (c == ':') {
      encoded += "%3A";
    } else if (c == '&') {
      encoded += "%26";
    } else if (c == '=') {
      encoded += "%3D";
    } else {
      encoded += c;
    }
  }
  return encoded;
}

// ==================== Credentials Management ====================

void loadCredentials() {
  preferences.begin("esp32_device", true); // true = read-only

  deviceID  = preferences.getInt("device_id", 0);
  deviceKey = preferences.getString("device_key", "");
  deviceName = preferences.getString("device_name", "");
  
  preferences.end();
  
  if (DEBUG_ENABLED && deviceID > 0) {
    Serial.println("📂 Loaded credentials from Preferences");
  }
}

void saveCredentials() {
  preferences.begin("esp32_device", false); // false = read-write
  
  preferences.putInt("device_id", deviceID);
  preferences.putString("device_key", deviceKey);
  preferences.putString("device_name", deviceName);
  
  preferences.end();
  
  Serial.println("💾 Credentials saved to Preferences");
  Serial.printf("   Device ID: %d\n", deviceID);
  Serial.printf("   Device Name: %s\n", deviceName.c_str());
}

void handleRegistrationResponse(JsonDocument& doc) {
  String status = doc["status"] | "";
  
  if (status == "success") {
    // Extract credentials from server response
    int newDeviceID = doc["device_id"] | 0;
    String newDeviceKey = doc["device_key"] | "";
    String newDeviceName = doc["device_name"] | "";
    bool isNewDevice = doc["is_new_device"] | false;
    String message = doc["message"] | "";
    
    Serial.println("\n┌─────────────────────────────────────────┐");
    if (isNewDevice) {
      Serial.println("│  🆕 DEVICE AUTO-REGISTERED             │");
    } else {
      Serial.println("│  ✅ DEVICE AUTHENTICATED               │");
    }
    Serial.println("├─────────────────────────────────────────┤");
    Serial.printf("│  Device ID:   %-24d │\n", newDeviceID);
    Serial.printf("│  Device Name: %-24s │\n", newDeviceName.c_str());
    Serial.printf("│  MAC Address: %-24s │\n", deviceMAC.c_str());
    Serial.println("└─────────────────────────────────────────┘\n");
    
    // Update stored credentials
    bool needsSave = false;
    if (deviceID != newDeviceID || deviceKey != newDeviceKey || deviceName != newDeviceName) {
      deviceID = newDeviceID;
      deviceKey = newDeviceKey;
      deviceName = newDeviceName;
      needsSave = true;
    }
    
    // Save to Preferences if credentials changed
    if (needsSave || isNewDevice) {
      saveCredentials();
    }
    
    isRegistered = true;
    
    // Send initial data so server has activity immediately
    Serial.println("📡 Sending initial heartbeat...");
    sendHeartbeat();
    lastHeartbeatTime = millis();
    Serial.println("📡 Sending initial sensor data...");
    sendSensorData();
    lastDataSendTime = millis();
    
  } else {
    Serial.println("❌ Registration failed:");
    String message = doc["message"] | "Unknown error";
    Serial.println(message);
    
    // Clear invalid credentials
    deviceID = 0;
    deviceKey = "";
    isRegistered = false;
  }
}

