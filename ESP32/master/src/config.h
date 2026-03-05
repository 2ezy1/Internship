/*
 * Configuration Header for ESP32 Master WebSocket
 * Set these values based on your network and server setup
 */

#ifndef CONFIG_H
#define CONFIG_H

// WiFi Configuration
#define WIFI_SSID "iPhone"
#define WIFI_PASSWORD "12345678"

// Static IP Configuration
// Current host hotspot network: 172.20.10.0/28
// Current server host IP: 172.20.10.6
#define STATIC_IP_0 172
#define STATIC_IP_1 20
#define STATIC_IP_2 10
#define STATIC_IP_3 10       // ESP32 static IP (must be in same /28 range)

#define GATEWAY_0 172
#define GATEWAY_1 20
#define GATEWAY_2 10
#define GATEWAY_3 1          // Gateway/DNS for this subnet

#define SUBNET_0 255
#define SUBNET_1 255
#define SUBNET_2 255
#define SUBNET_3 240         // /28 mask from iPhone hotspot

#define PRIMARY_DNS_0 172
#define PRIMARY_DNS_1 20
#define PRIMARY_DNS_2 10
#define PRIMARY_DNS_3 1

#define SECONDARY_DNS_0 8
#define SECONDARY_DNS_1 8
#define SECONDARY_DNS_2 8
#define SECONDARY_DNS_3 8

// Server Configuration
#define SERVER_IP "172.20.10.6"   // Backend server IP on network (current PC IP)
#define SERVER_PORT 8000
#define SERVER_PATH "/ws/esp32/connect"

// Device Configuration
#define DEVICE_ID 1                    // Must match device ID registered in database
#define DEVICE_KEY "69ced61b-5521-4ef7-ab17-19a2cdf14af8"  // Must match device_key in database
#define POLL_INTERVAL_MS 1000         // Send sensor data every 1 second
#define HEARTBEAT_INTERVAL_MS 30000   // Send heartbeat every 30 seconds

// UART Configuration
#define RX_PIN 15
#define TX_PIN 13
#define UART_BAUD 9600
#define UART_NUM 2  // Serial2

// Logging
#define DEBUG_ENABLED 1
#define LOG_LEVEL_VERBOSE 1

#endif // CONFIG_H
