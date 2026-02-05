# Device Management System - Backend API

FastAPI-based REST API for device management with SQLAlchemy ORM and SQLite database.

## 🚀 Quick Start

### Prerequisites
- Python 3.8+
- pip

### Setup

1. Create virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Run the API:
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at: `http://localhost:8000`
API documentation: `http://localhost:8000/docs`

## 📁 Project Structure

```
backend/
├── main.py           # FastAPI application and endpoints
├── models.py         # SQLAlchemy ORM models
├── schemas.py        # Pydantic validation schemas
├── database.py       # Database configuration
├── devices.db        # SQLite database file
└── requirements.txt  # Python dependencies
```

## 🔌 API Endpoints

### Health Check
- `GET /health` - Check API status

### Device CRUD Operations
- `GET /devices/` - Get all devices
- `GET /devices/{device_id}` - Get specific device
- `POST /devices/` - Create new device
- `PUT /devices/{device_id}` - Update device
- `DELETE /devices/{device_id}` - Delete device

## 📝 Device Model

```json
{
  "id": 1,
  "device_name": "Server-01",
  "ip_address": "192.168.1.100",
  "type": "Server",
  "created_at": "2026-02-05T13:51:39",
  "updated_at": "2026-02-05T14:07:36"
}
```

## 🔒 CORS Configuration

Currently allows all origins (`"*"`). For production, change to specific frontend URL in `main.py`.

## 📚 Technologies

- **FastAPI** - Modern web framework
- **SQLAlchemy** - ORM for database operations
- **Pydantic** - Data validation
- **Uvicorn** - ASGI server
- **SQLite** - Lightweight database
