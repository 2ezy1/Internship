# How to Run the Device Management System

## ✅ Prerequisites

- **Node.js 16+** (frontend)
- **Python 3.9+** (backend)
- **pip** (Python package manager)

---

## 🚀 Step 1: Start the Backend (FastAPI)

Open **PowerShell** and run:

```bash
cd server
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 192.168.1.100 --port 8000
```

**Expected output:**
```
Uvicorn running on http://192.168.1.100:8000 (Press CTRL+C to quit)
```

**API Documentation:** Open http://192.168.1.100:8000/docs in your browser

---

## 🚀 Step 2: Start the Frontend (React + Vite)

Open a **new PowerShell terminal** and run:

```bash
npm install
npm run dev
```

**Expected output:**
```
➜  Local:   http://localhost:5173/
```

---

## 🌐 Step 3: Access the Application

1. Open your browser and go to: **http://localhost:5173**
2. Login with demo credentials:
   - **Username:** admin
   - **Password:** password

---

## 📊 Complete User Flow

| Step | Action | Details |
|------|--------|---------|
| 1 | **Open Browser** | User navigates to http://localhost:5173 |
| 2 | **Frontend Loads** | React + Vite renders login page |
| 3 | **Login** | User enters credentials and clicks "Sign In" |
| 4 | **Routes to Home** | Frontend redirects to dashboard |
| 5 | **View Devices** | Page fetches devices from backend (initially empty) |
| 6 | **Add Device** | User clicks "Add Device" button |
| 7 | **Submit Form** | User fills device info and submits |
| 8 | **API Request** | Frontend sends POST request to `http://192.168.1.100:8000/devices/` |
| 9 | **Validate & Store** | Backend validates data and stores in database |
| 10 | **Display** | Device appears in table on dashboard |
| 11 | **Manage** | User can view, update, or delete devices |
| 12 | **Logout** | User returns to login page |

---

## 🔧 Useful Commands

### Frontend
```bash
npm run dev          # Start dev server
npm run build        # Build for production
npm run lint         # Run ESLint
npm run preview      # Preview production build
```

### Backend
```bash
# Start with auto-reload
python -m uvicorn app.main:app --reload

# Start on specific IP and port
python -m uvicorn app.main:app --reload --host 192.168.1.100 --port 8000

# View API docs
# Open: http://192.168.1.100:8000/docs
```

---

## ⚠️ Troubleshooting

### Backend won't start
- ✅ Check if port 8000 is already in use
- ✅ Verify Python is installed: `python --version`
- ✅ Install dependencies: `pip install -r requirements.txt`

### Frontend can't connect to backend
- ✅ Ensure backend is running on **http://192.168.1.100:8000**
- ✅ Check `.env` file has correct `VITE_API_BASE` URL
- ✅ Verify CORS is enabled (should be in FastAPI main.py)
- ✅ Check browser console for errors (F12)

### Database errors
- ✅ SQLite is used by default (no setup needed)
- ✅ Database file: `server/dev.db`
- ✅ To reset: Delete `dev.db` and restart backend

---

## 📁 Project Structure

```
BITS_WEB/
├── src/                     # React frontend
│   ├── pages/
│   │   ├── Login.tsx       # Login page
│   │   └── Home.tsx        # Dashboard
│   ├── services/
│   │   └── api.ts          # API calls (Axios)
│   ├── styles/
│   ├── App.tsx             # Router setup
│   └── main.tsx            # Entry point
├── server/                  # FastAPI backend
│   ├── app/
│   │   ├── main.py         # FastAPI app & routes
│   │   ├── models.py       # SQLAlchemy models
│   │   ├── database.py     # Database config
│   │   └── __init__.py
│   └── requirements.txt     # Python dependencies
├── package.json            # Node dependencies
├── .env                    # Environment variables
└── RUNNING.md             # This file
```

---

## 🎯 API Endpoints

Base URL: `http://192.168.1.100:8000`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check |
| GET | `/health` | Health status |
| POST | `/devices/` | Create device |
| GET | `/devices/` | List all devices |
| GET | `/devices/{id}` | Get device by ID |
| PUT | `/devices/{id}` | Update device |
| DELETE | `/devices/{id}` | Delete device |

---

## ✨ Features

- ✅ User authentication (login/logout)
- ✅ Add/view/delete devices
- ✅ Real-time device management
- ✅ Beautiful UI with Ant Design
- ✅ FastAPI with SQLAlchemy ORM
- ✅ SQLite database
- ✅ CORS enabled for frontend-backend communication
- ✅ Type-safe TypeScript frontend
- ✅ RESTful API

---

## 📝 Notes

- The app uses SQLite by default (no database setup required)
- CORS is enabled to allow frontend requests from localhost
- Demo credentials: **admin / password**
- All data is stored in `server/dev.db`
