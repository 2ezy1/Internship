# Device Management System with ESP32 Integration

A full-stack IoT device management system with real-time ESP32 sensor monitoring using WebSockets.

## ✨ Features

- 🔐 **User Authentication** - JWT-based authentication with user/admin roles
- 📱 **Device Management** - CRUD operations for IoT devices
- 📡 **Real-time Monitoring** - WebSocket-based live sensor data streaming
- 📊 **Data Visualization** - Interactive charts for temperature history
- 🌡️ **Multi-Sensor Support** - Temperature, humidity, pressure, light, motion
- 📈 **Historical Data** - Store and query past sensor readings
- 🔌 **ESP32 Integration** - Ready-to-use Arduino code for ESP32

## 🚀 Quick Start

### Option 1: Automated Setup

```bash
cd /home/bits/Desktop/Internship
./quick_start.sh
```

### Option 2: Manual Setup

#### 1. Backend Setup

```bash
cd /home/bits/Desktop/Internship/backend
pip install -r requirements.txt
cd /home/bits/Desktop/Internship/backend
```

#### 2. Frontend Setup

```bash
cd /home/bits/Desktop/Internship/frontend
npm install
npm run dev
```

#### 3. Access the Application

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:8000
- **API Docs:** http://localhost:8000/docs

#### 4. Login Credentials

- **User Account:** user / user123
- **Admin Account:** BITSOJT / BITS2026

## 📡 ESP32 Integration

### Testing Without Hardware

Test the WebSocket functionality using the Python simulator:

```bash
cd /home/bits/Desktop/ESP32
python3 test_websocket_client.py
```

### Setting Up Real ESP32

1. Open Arduino IDE
2. Install libraries: `WebSocketsClient`, `ArduinoJson`
3. Open `ESP32/ESP32_WebSocket_Sensor/ESP32_WebSocket_Sensor.ino`
4. Configure WiFi and server settings
5. Upload to ESP32

See [ESP32/README.md](../ESP32/README.md) for detailed instructions.

## 📚 Documentation

- **[IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)** - Complete overview of changes
- **[ESP32_INTEGRATION.md](ESP32_INTEGRATION.md)** - Detailed integration guide
- **[ESP32/README.md](../ESP32/README.md)** - ESP32 hardware setup

## 🏗️ Architecture

```
┌─────────────┐     WebSocket      ┌──────────────┐
│   ESP32     │ ──────────────────> │   FastAPI    │
│   Sensors   │ <────────────────── │   Backend    │
└─────────────┘                     └──────────────┘
                                           │
                                           ↓
                                    ┌──────────────┐
                                    │  PostgreSQL  │
                                    │   Database   │
                                    └──────────────┘
                                           │
                                           ↓
┌─────────────┐     WebSocket      ┌──────────────┐
│   React     │ <──────────────────│   FastAPI    │
│  Frontend   │ ──────────────────>│   Backend    │
└─────────────┘                     └──────────────┘
```

## 🛠️ Technology Stack

### Backend
- **FastAPI** - Modern Python web framework
- **SQLAlchemy** - ORM for database operations
- **PostgreSQL** - Database (SQLite for development)
- **WebSockets** - Real-time communication
- **JWT** - Authentication tokens

### Frontend
- **React 19** - UI framework
- **TypeScript** - Type-safe JavaScript
- **Vite** - Build tool and dev server
- **Ant Design** - UI component library
- **Axios** - HTTP client

### IoT
- **ESP32** - Microcontroller
- **Arduino** - Development framework
- **WebSocketsClient** - WebSocket library
- **ArduinoJson** - JSON parsing

## 🔌 API Endpoints

### Authentication
- `POST /auth/login` - User login

### Devices
- `GET /devices/` - List user's devices
- `POST /devices/` - Create device
- `GET /devices/{id}` - Get device details
- `PUT /devices/{id}` - Update device
- `DELETE /devices/{id}` - Delete device

### Sensors (NEW)
- `GET /sensors/latest/{device_id}` - Latest reading
- `GET /sensors/readings/{device_id}` - Historical data
- `POST /sensors/readings` - Create reading

### WebSockets (NEW)
- `ws://localhost:8000/ws/device/{device_id}` - Frontend client
- `ws://localhost:8000/ws/esp32/send/{device_id}` - ESP32 sender

## 📊 Database Schema

### Tables
- `users` - User accounts with roles
- `devices` - IoT devices
- `sensor_readings` - Sensor data (NEW)

## 🧪 Testing

### Test Backend
```bash
curl http://localhost:8000/health
```

### Test WebSocket
```bash
cd /home/bits/Desktop/ESP32
python3 test_websocket_client.py
```

### Test Frontend
Open browser to http://localhost:5173 and navigate to a device's details page.

## 🐛 Troubleshooting

### Backend Won't Start
```bash
# Check if port 8000 is already in use
sudo lsof -i :8000

# Kill the process if needed
sudo kill -9 <PID>
```

### Frontend Won't Start
```bash
# Clear npm cache and reinstall
cd frontend
rm -rf node_modules package-lock.json
npm install
```

### WebSocket Connection Failed
- Ensure backend is running with `--host 0.0.0.0`
- Check firewall settings
- Verify correct IP address

## 🗂️ Project Structure

```
Internship/
├── backend/
│   ├── main.py              # FastAPI app with WebSocket
│   ├── models.py            # Database models
│   ├── schemas.py           # Pydantic schemas
│   ├── database.py          # Database connection
│   ├── requirements.txt     # Python dependencies
│   └── ...
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Home.tsx           # Device list
│   │   │   ├── DeviceDetails.tsx  # Real-time monitoring
│   │   │   └── Login.tsx          # Authentication
│   │   ├── services/
│   │   │   ├── api.ts            # REST API client
│   │   │   └── websocket.ts      # WebSocket client (NEW)
│   │   └── ...
│   ├── package.json
│   └── ...
├── ESP32_INTEGRATION.md     # Complete guide (NEW)
├── IMPLEMENTATION_SUMMARY.md # What was added (NEW)
├── quick_start.sh           # Setup script (NEW)
└── README.md               # This file

ESP32/
├── ESP32_WebSocket_Sensor/
│   └── ESP32_WebSocket_Sensor.ino  # Arduino code (NEW)
├── test_websocket_client.py        # Test simulator (NEW)
└── README.md                       # ESP32 setup (NEW)
```

## 🔒 Security Notes

**Development Mode** (current):
- WebSocket connections are not authenticated
- CORS allows all origins
- Using HTTP (not HTTPS)

**Production Recommendations:**
- Add WebSocket authentication
- Use HTTPS/WSS with SSL certificates
- Restrict CORS to specific origins
- Implement rate limiting
- Use environment variables for secrets

## 📝 Git Push

To push changes to GitHub:

```bash
cd /home/bits/Desktop/Internship
./push.sh "your commit message here"
```

## 🎯 Next Steps

1. ✅ Set up the system using quick_start.sh
2. ✅ Test with Python WebSocket simulator
3. ✅ View real-time data in the web interface
4. ⬜ Connect real ESP32 hardware
5. ⬜ Add more sensors (DHT22, BMP280, etc.)
6. ⬜ Implement alerts and notifications
7. ⬜ Create multi-device dashboard

## 📞 Support

- **API Documentation:** http://localhost:8000/docs
- **Integration Guide:** See ESP32_INTEGRATION.md
- **ESP32 Setup:** See ESP32/README.md

## 📄 License

MIT License - Free to use and modify

---

**Made with ❤️ for IoT monitoring**