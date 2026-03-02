/*
 * UART Bridge - Serial to Serial2
 * Bridges communication between USB Serial and Hardware Serial2
 * 
 * Hardware Configuration:
 * - Serial: USB connection (default pins)
 * - Serial2: GPIO13 (RX) and GPIO15 (TX)
 * 
 * Use Case:
 * - Connect ESP32 USB to computer
 * - Serial2 connects to Modbus device or another UART device
 * - All data is transparently bridged between both interfaces
 */

#define SERIAL_BAUD 9600    // USB Serial baud rate
#define SERIAL2_BAUD 9600   // Hardware Serial2 baud rate

// ESP32 UART2 Configuration
#define RX_PIN 15
#define TX_PIN 13

void setup() {
  // Initialize USB Serial
  Serial.begin(SERIAL_BAUD);
  
  // Initialize Serial2 with custom RX/TX pins for ESP32
  Serial2.begin(SERIAL2_BAUD, SERIAL_8N1, RX_PIN, TX_PIN);
  
  // Wait for Serial to be ready
  delay(100);
  
  Serial.println("UART Bridge Started");
  Serial.printf("USB Serial: %d baud\n", SERIAL_BAUD);
  Serial.printf("Serial2: %d baud, RX=GPIO%d, TX=GPIO%d\n", SERIAL2_BAUD, RX_PIN, TX_PIN);
  Serial.println("Bridging data...");
  delay(1000);
}

void loop() {
  // Forward data from Serial (USB) to Serial2 (UART)
  if (Serial.available()) {
    uint8_t data = Serial.read(); 
    Serial2.write(data);
  }
  
  // Forward data from Serial2 (UART) to Serial (USB)
  if (Serial2.available()) {
    uint8_t data = Serial2.read();
    Serial.write(data);
  }
}
