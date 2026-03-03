# VFD Data Flow Documentation

## Overview
This document describes how VFD (Variable Frequency Drive) data flows from the ESP32 slave device to the master, then to the backend server, and finally to the web frontend.

## Complete Data Flow

```
┌─────────────┐   Serial2   ┌─────────────┐  WebSocket  ┌─────────────┐  WebSocket  ┌─────────────┐
│  ESP32      │   (UART)    │   ESP32     │   (WiFi)    │   Backend   │   Broadcast │  Frontend   │
│  Slave      │────────────>│   Master    │────────────>│   Server    │────────────>│   Client    │
│             │             │             │             │             │             │             │
└─────────────┘             └─────────────┘             └─────────────┘             └─────────────┘
    VFD Data                  Receives &                  Stores in                   Displays
    Generator                 Displays                    Database                    VFD Data
```

## 1. Slave → Master (Serial Communication)

### Data Sent Every 1 Second
The ESP32 slave sends JSON-formatted VFD data via Serial2 (UART):

**JSON Format:**
```json
{
  "frequency": 45.2,
  "speed": 1350.5,
  "current": 32.1,
  "voltage": 400.5,
  "power": 28.3,
  "torque": 145.7,
  "status": 1,
  "faultCode": 0
}
```

**Field Definitions:**
- `frequency` (float): Drive frequency in Hz (0.0 - 60.0)
- `speed` (float): Motor speed in RPM (0 - 1800.0)
- `current` (float): Current draw in Amperes (0.0 - 50.0)
- `voltage` (float): Input voltage in Volts (380.0 - 420.0)
- `power` (float): Power consumption in kW (0.0 - 37.0)
- `torque` (float): Motor torque in Nm (0.0 - 200.0)
- `status` (int): Operating status
  - `0` = STOP
  - `1` = RUN
  - `2` = FAULT
  - `3` = READY
- `faultCode` (int): Error code number (only when status = 2)

**Serial Configuration:**
- **Baud Rate:** 9600
- **RX Pin (Master):** GPIO 15
- **TX Pin (Master):** GPIO 13
- **Protocol:** JSON over UART

**Code Location:** [ESP32/slave/src/main.cpp](ESP32/slave/src/main.cpp#L273-L294)

## 2. Master Display (Serial Monitor)

The ESP32 master now displays received data in a formatted box:

```
┌─────────────────────────────────────────┐
│  📥 RECEIVED DATA FROM SLAVE           │
├─────────────────────────────────────────┤
│  Frequency:   45.2 Hz                  │
│  Speed:     1350.5 RPM                 │
│  Current:     32.1 A                   │
│  Voltage:    400.5 V                   │
│  Power:       28.3 kW                  │
│  Torque:     145.7 Nm                  │
│  Status:     RUN                       │
└─────────────────────────────────────────┘
```

**Code Location:** [ESP32/master/src/main.cpp](ESP32/master/src/main.cpp#L323-L360)

## 3. Master → Server (WebSocket)

The master sends VFD data to the backend server every 1 second:

**WebSocket Message Format:**
```json
{
  "type": "sensor_data",
  "device_id": 1,
  "device_key": "your-device-key-here",
  "timestamp": "12345678",
  "rssi": -45,
  "uptime": 120000,
  "data": {
    "frequency": 45.2,
    "speed": 1350.5,
    "current": 32.1,
    "voltage": 400.5,
    "power": 28.3,
    "torque": 145.7,
    "status": 1,
    "faultCode": 0
  }
}
```

**WebSocket Configuration:**
- **Server URL:** `ws://192.168.254.110:8000/ws/esp32/connect`
- **Authentication:** Query parameters `device_id` and `device_key`
- **Send Interval:** 1 second (configurable in config.h)
- **Heartbeat Interval:** 30 seconds

**Code Location:** [ESP32/master/src/main.cpp](ESP32/master/src/main.cpp#L284-L320)

## 4. Backend Processing

### Automatic Detection
The backend automatically detects VFD data by checking for VFD-specific fields (frequency, speed, current, voltage, power, torque).

### Database Storage
VFD data is stored in a dedicated `vfd_readings` table:

**Table Schema:**
```sql
CREATE TABLE vfd_readings (
    id SERIAL PRIMARY KEY,
    device_id INTEGER NOT NULL,
    frequency VARCHAR,
    speed VARCHAR,
    current VARCHAR,
    voltage VARCHAR,
    power VARCHAR,
    torque VARCHAR,
    status INTEGER,
    fault_code INTEGER,
    custom_data VARCHAR,  -- Stores RSSI, uptime, etc. as JSON
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);
```

### WebSocket Broadcast
After storing the data, the backend broadcasts to all connected frontend clients:

**Broadcast Message:**
```json
{
  "type": "vfd_update",
  "device_id": 1,
  "data": {
    "id": 123,
    "frequency": "45.2",
    "speed": "1350.5",
    "current": "32.1",
    "voltage": "400.5",
    "power": "28.3",
    "torque": "145.7",
    "status": 1,
    "fault_code": 0,
    "custom_data": "{\"rssi\": -45, \"uptime\": 120000}",
    "timestamp": "2026-03-03T10:30:45.123456"
  }
}
```

**Code Location:** [backend/main.py](backend/main.py#L805-L860)

## 5. API Endpoints

### Get VFD Readings
```http
GET /devices/{device_id}/vfd-readings?limit=100
```

### Get Latest VFD Reading
```http
GET /devices/{device_id}/vfd-readings/latest
```

### Delete VFD Readings (Admin)
```http
DELETE /devices/{device_id}/vfd-readings
```

**Code Location:** [backend/main.py](backend/main.py#L1017-L1068)

## Database Migration

To create the VFD readings table, run:

```bash
cd backend
python migrate_vfd_table.py
```

**Migration Script:** [backend/migrate_vfd_table.py](backend/migrate_vfd_table.py)

## Models and Schemas

### Database Model
- **File:** [backend/models.py](backend/models.py#L59-L76)
- **Class:** `VFDReading`

### Pydantic Schemas
- **File:** [backend/schemas.py](backend/schemas.py#L106-L130)
- **Classes:** `VFDReadingBase`, `VFDReadingCreate`, `VFDReading`

## Configuration

### ESP32 Master Config
**File:** [ESP32/master/src/config.h](ESP32/master/src/config.h)

Key settings:
- `DEVICE_ID`: Device identifier (must match database)
- `DEVICE_KEY`: Authentication key (generated by server)
- `SERVER_IP`: Backend server IP address
- `SERVER_PORT`: Backend server port (default: 8000)
- `POLL_INTERVAL_MS`: Data send interval (default: 1000ms)
- `RX_PIN`: Serial RX pin (default: GPIO 15)
- `TX_PIN`: Serial TX pin (default: GPIO 13)
- `UART_BAUD`: Serial baud rate (default: 9600)

## Testing the Data Flow

1. **Upload Slave Code:** Flash the slave ESP32 with the updated code
2. **Upload Master Code:** Flash the master ESP32 with the updated code
3. **Connect Serial Monitor:** Open serial monitor at 115200 baud on the master
4. **Verify Slave Data:** You should see VFD data boxes every 3 seconds
5. **Check Backend:** Backend should log "📡 VFD data from device X"
6. **Query API:** Use the API endpoints to retrieve stored data

## Status Codes

| Code | Status | Description |
|------|--------|-------------|
| 0    | STOP   | Motor is stopped |
| 1    | RUN    | Motor is running normally |
| 2    | FAULT  | Motor has encountered a fault |
| 3    | READY  | Motor is ready to start |

## Troubleshooting

### No Data in Master Serial Monitor
- Check slave TX pin (GPIO 13) is connected to master RX pin (GPIO 15)
- Verify baud rate is 9600 on both devices
- Check slave is powered and running

### Master Not Sending to Server
- Verify WiFi credentials in config.h
- Check SERVER_IP and SERVER_PORT settings
- Ensure device is registered in backend with correct DEVICE_ID
- Verify DEVICE_KEY matches the server

### Backend Not Storing Data
- Check database connection
- Run migration script: `python migrate_vfd_table.py`
- Verify device authentication (device_id + device_key)
- Check server logs for errors

### Frontend Not Displaying
- Frontend update pending (not yet implemented)
- Check WebSocket connection in browser console
- Verify device is online in the system

## Next Steps

- [ ] Update frontend to display VFD data in real-time
- [ ] Add VFD data visualization (charts, gauges)
- [ ] Implement data export functionality
- [ ] Add alert system for fault conditions
- [ ] Create VFD device details page

## Summary

✅ **Slave → Master:** Sends VFD data via Serial2 every 1 second  
✅ **Master Display:** Shows formatted VFD data in serial monitor  
✅ **Master → Server:** Sends VFD data via WebSocket every 1 second  
✅ **Server Storage:** Stores in dedicated `vfd_readings` table  
✅ **Server Broadcast:** Broadcasts to frontend clients in real-time  
✅ **API Access:** RESTful endpoints for querying VFD data  
⏳ **Frontend:** Display implementation pending

---

**Last Updated:** March 3, 2026  
**Version:** 1.0
