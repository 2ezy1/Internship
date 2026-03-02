#include <Arduino.h>

/*
 * Modbus RTU Slave - VFD Simulator (ESP32 Compatible)
 * Responds to Modbus read requests on configured addresses
 * Returns random values to simulate sensor readings
 *
 * Hardware Configuration:
 * - ESP32 UART2 on GPIO13 (RX) and GPIO15 (TX)
 * - Baud Rate: 9600
 *
 * Register Configuration:
 * Use X(address, maxValue) to define registers in REGISTER_MAP
 * - address: Modbus register address
 * - maxValue: Maximum random value to return (0 to maxValue)
 *
 * Example:
 *   X(100, 10)  -> Address 100 returns random values from 0-10
 *   X(200, 255) -> Address 200 returns random values from 0-255
 *   X(300, 1000) -> Address 300 returns random values from 0-1000
 *
 * To add more registers, simply add more X() entries in REGISTER_MAP
 */

#define SLAVE_ID 1
#define SERIAL_BAUD 9600

// ESP32 UART Configuration
#define RX_PIN 15
#define TX_PIN 13
#define UART_NUM 2  // Using UART2 (Serial2)

// Modbus function codes
#define MODBUS_READ_HOLDING_REGISTERS 0x03
#define MODBUS_READ_INPUT_REGISTERS 0x04





// Register Configuration - Add/Remove/Modify as needed
// Format: X(address, maxValue)
#define REGISTER_MAP \
  X(1000, 10) \
  X(1001, 20) \
  X(1002, 30) \
  X(1003, 40) \
  X(1004, 50)

// Internal structure for register mapping
struct ModbusRegister {
  uint16_t address;
  uint16_t maxValue;
};

// Generate register array from macro
#define X(addr, maxVal) {addr, maxVal},
const ModbusRegister registers[] = {
  REGISTER_MAP
};
#undef X

#define NUM_REGISTERS (sizeof(registers) / sizeof(registers[0]))

// Create a reference to Serial2 for cleaner code
#define ModbusSerial Serial2

uint8_t rxBuffer[256];
uint8_t rxIndex = 0;
unsigned long lastRxTime = 0;
const unsigned long RX_TIMEOUT = 50; // 50ms timeout between frames
unsigned long lastSensorSendTime = 0;
const unsigned long SENSOR_SEND_INTERVAL = 3000; // Send sensor data every 3 seconds

void processModbusRequest(uint8_t* request, uint8_t length);
void sendReadResponse(uint8_t slaveId, uint8_t functionCode, uint16_t address, uint16_t quantity);
void sendExceptionResponse(uint8_t slaveId, uint8_t functionCode, uint8_t exceptionCode);
uint16_t calculateCRC(uint8_t* buffer, uint8_t length);
void sendSensorDataToMaster();

void setup() {
  // Initialize Serial2 with custom RX/TX pins for ESP32
  ModbusSerial.begin(SERIAL_BAUD, SERIAL_8N1, RX_PIN, TX_PIN);

  // Initialize random seed
  randomSeed(analogRead(0));

  // Enable Debug output on Serial (USB)
  Serial.begin(115200);
  delay(500);
  Serial.println("=================================");
  Serial.println("Modbus RTU Slave + Sensor Data");
  Serial.printf("Slave ID: %d\n", SLAVE_ID);
  Serial.printf("Baud Rate: %d\n", SERIAL_BAUD);
  Serial.printf("RX Pin: GPIO%d, TX Pin: GPIO%d\n", RX_PIN, TX_PIN);
  Serial.println("Features:");
  Serial.println("  - Modbus RTU slave responses");
  Serial.println("  - Periodic JSON sensor data to master");
  Serial.println("=================================");
}

void loop() {
  // Send sensor data to master periodically (every 3 seconds)
  if (millis() - lastSensorSendTime > SENSOR_SEND_INTERVAL) {
    sendSensorDataToMaster();
    lastSensorSendTime = millis();
  }

  // Check for incoming data on Serial2
  if (ModbusSerial.available() > 0) {
    uint8_t incomingByte = ModbusSerial.read();
    rxBuffer[rxIndex++] = incomingByte;
    lastRxTime = millis();

    // Prevent buffer overflow
    if (rxIndex >= sizeof(rxBuffer)) {
      rxIndex = 0;
    }
  }

  // Process complete frame after timeout (frame complete)
  if (rxIndex > 0 && (millis() - lastRxTime) > RX_TIMEOUT) {
    if (rxIndex >= 8) { // Minimum Modbus RTU request size
      Serial.printf("\n[RX] Received %d bytes: ", rxIndex);
      for (int i = 0; i < rxIndex; i++) {
        Serial.printf("%02X ", rxBuffer[i]);
      }
      Serial.println();
      processModbusRequest(rxBuffer, rxIndex);
    } else {
      Serial.printf("[RX] Incomplete frame (%d bytes), ignored\n", rxIndex);
    }
    rxIndex = 0;
  }
}

void processModbusRequest(uint8_t* request, uint8_t length) {
  // Verify minimum length
  if (length < 8) return;

  uint8_t slaveId = request[0];
  uint8_t functionCode = request[1];
  uint16_t address = (request[2] << 8) | request[3];
  uint16_t quantity = (request[4] << 8) | request[5];
  uint16_t receivedCRC = request[length-2] | (request[length-1] << 8);

  Serial.printf("[PARSE] SlaveID=%d, FC=%d, Addr=%d, Qty=%d\n", slaveId, functionCode, address, quantity);

  // Verify CRC
  uint16_t calculatedCRC = calculateCRC(request, length - 2);
  if (receivedCRC != calculatedCRC) {
    Serial.printf("[ERROR] CRC mismatch: received=0x%04X, calculated=0x%04X\n", receivedCRC, calculatedCRC);
    return; // Invalid CRC, ignore request
  }
  Serial.println("[OK] CRC valid");

  // Check if request is for this slave
  if (slaveId != SLAVE_ID) {
    Serial.printf("[INFO] Not for this slave (expected %d)\n", SLAVE_ID);
    return; // Not for us
  }

  // Handle read holding registers (0x03) or read input registers (0x04)
  if (functionCode == MODBUS_READ_HOLDING_REGISTERS ||
      functionCode == MODBUS_READ_INPUT_REGISTERS) {
    Serial.println("[OK] Processing read request...");
    sendReadResponse(slaveId, functionCode, address, quantity);
  } else {
    // Unsupported function code
    Serial.printf("[ERROR] Unsupported function code: %d\n", functionCode);
    sendExceptionResponse(slaveId, functionCode, 0x01); // Illegal function
  }
}

void sendReadResponse(uint8_t slaveId, uint8_t functionCode, uint16_t address, uint16_t quantity) {
  // Check if quantity is valid (1-125 registers for Modbus)
  if (quantity == 0 || quantity > 125) {
    sendExceptionResponse(slaveId, functionCode, 0x03); // Illegal data value
    return;
  }

  // Find the register configuration
  int8_t regIndex = -1;
  for (uint8_t i = 0; i < NUM_REGISTERS; i++) {
    if (registers[i].address == address) {
      regIndex = i;
      break;
    }
  }

  if (regIndex == -1) {
    Serial.printf("[ERROR] Invalid address: %d\n", address);
    sendExceptionResponse(slaveId, functionCode, 0x02); // Illegal data address
    return;
  }

  Serial.printf("[OK] Found register at index %d, maxValue=%d\n", regIndex, registers[regIndex].maxValue);

  // Build response
  uint8_t byteCount = quantity * 2; // 2 bytes per register
  uint8_t responseLength = 3 + byteCount + 2; // SlaveID + FC + ByteCount + Data + CRC
  uint8_t response[260]; // Maximum response size

  response[0] = slaveId;
  response[1] = functionCode;
  response[2] = byteCount;

  // Fill with random register values based on maxValue
  uint16_t maxValue = registers[regIndex].maxValue;
  for (uint16_t i = 0; i < quantity; i++) {
    uint16_t randomValue = random(0, maxValue + 1); // Random value from 0 to maxValue
    response[3 + i*2] = (randomValue >> 8) & 0xFF; // High byte
    response[4 + i*2] = randomValue & 0xFF;         // Low byte
    Serial.printf("[DATA] Register %d value: %d\n", i, randomValue);
  }

  // Calculate and append CRC
  uint16_t crc = calculateCRC(response, 3 + byteCount);
  response[3 + byteCount] = crc & 0xFF;
  response[3 + byteCount + 1] = (crc >> 8) & 0xFF;

  Serial.printf("[TX] Sending response (%d bytes): ", responseLength);
  for (int i = 0; i < responseLength; i++) {
    Serial.printf("%02X ", response[i]);
  }
  Serial.println();

  // Send response via Serial2
  ModbusSerial.write(response, responseLength);
  Serial.println("[OK] Response sent\n");
}

void sendExceptionResponse(uint8_t slaveId, uint8_t functionCode, uint8_t exceptionCode) {
  uint8_t response[5];
  response[0] = slaveId;
  response[1] = functionCode | 0x80; // Set MSB to indicate exception
  response[2] = exceptionCode;

  uint16_t crc = calculateCRC(response, 3);
  response[3] = crc & 0xFF;
  response[4] = (crc >> 8) & 0xFF;

  ModbusSerial.write(response, 5);
}

uint16_t calculateCRC(uint8_t* buffer, uint8_t length) {
  uint16_t crc = 0xFFFF;

  for (uint8_t i = 0; i < length; i++) {
    crc ^= buffer[i];

    for (uint8_t j = 0; j < 8; j++) {
      if (crc & 0x0001) {
        crc >>= 1;
        crc ^= 0xA001;
      } else {
        crc >>= 1;
      }
    }
  }

  return crc;
}

void sendSensorDataToMaster() {
  // Generate simulated VFD data
  float frequency = random(00, 6000) / 100.0;     // 0.0 to 60.0 Hz
  float speed = random(0, 180000) / 100.0;        // 0 to 1800.0 RPM
  float current = random(0, 5000) / 100.0;        // 0.0 to 50.0 A
  float voltage = random(38000, 42000) / 100.0;   // 380.0 to 420.0 V
  float power = random(0, 3700) / 100.0;          // 0.0 to 37.0 kW
  float torque = random(0, 20000) / 100.0;        // 0.0 to 200.0 Nm
  int status = random(0, 4);                      // 0=Stop, 1=Run, 2=Fault, 3=Ready
  int faultCode = (status == 2) ? random(1, 20) : 0;  // Fault code if status=Fault
  
  // Create JSON string
  String jsonData = "{";
  jsonData += "\"frequency\":" + String(frequency, 1) + ",";
  jsonData += "\"speed\":" + String(speed, 1) + ",";
  jsonData += "\"current\":" + String(current, 1) + ",";
  jsonData += "\"voltage\":" + String(voltage, 1) + ",";
  jsonData += "\"power\":" + String(power, 1) + ",";
  jsonData += "\"torque\":" + String(torque, 1) + ",";
  jsonData += "\"status\":" + String(status) + ",";
  jsonData += "\"faultCode\":" + String(faultCode);
  jsonData += "}\n";
  
  // Send JSON to master via Serial2
  ModbusSerial.print(jsonData);
  
  Serial.print("📤 Sent VFD data to master: ");
  Serial.print(jsonData);
}
