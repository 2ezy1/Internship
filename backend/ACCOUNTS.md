# Account Information

## ⚠️ AUTHORIZED ACCOUNTS ONLY

### User Account (Device Management Access)
- **Username:** `user`
- **Password:** `user123`
- **Role:** `user`
- **Access:** Can log into the web interface and manage their own devices

### Admin Account (Full System Access)
- **Username:** `BITSOJT`
- **Password:** `BITS2026`
- **Role:** `admin`
- **Access:** Can log into the web interface + additional access to view all users, all devices, and system statistics in the database

**IMPORTANT:** Only these TWO accounts are authorized to log into the system. Any other account will receive "Access denied" even if the credentials are correct.

---

## API Endpoints

### Authentication
- `POST /auth/login` - Login and get JWT token

### User Endpoints (Requires Authentication)
- `POST /devices/` - Create a new device
- `GET /devices/` - Get your devices  
- `GET /devices/{id}` - Get specific device
- `PUT /devices/{id}` - Update device
- `DELETE /devices/{id}` - Delete device

### Admin Endpoints (Admin Only)
- `GET /admin/users` - Get all registered users
- `GET /admin/users/{id}` - Get user with their devices
- `GET /admin/devices` - Get all devices
- `GET /admin/devices/with-owners` - Get devices with owner info
- `GET /admin/stats` - Get system statistics

---

## How to Login

### Using curl:
```bash
# Login as user
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"user","password":"user123"}'

# Login as admin
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"BITSOJT","password":"BITS2026"}'

# Any other account will be DENIED:
# curl -X POST http://localhost:8000/auth/login \
#   -H "Content-Type: application/json" \
#   -d '{"username":"otheruser","password":"somepassword"}'
# Response: {"detail":"Access denied. Only authorized accounts can log into this system."}
```

### Response:
```json
{
  "message": "Login successful",
  "username": "user",
  "role": "user",
  "user_id": 1,
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "token_type": "bearer"
}
```

## Using the JWT Token

Include the token in the Authorization header:
```bash
Authorization: Bearer <access_token>
```

### Example:
```bash
# Get your devices (user account)
curl -X GET http://localhost:8000/devices/ \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"

# Get all users (admin only)
curl -X GET http://localhost:8000/admin/users \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN_HERE"

# Get all devices with owners (admin only)
curl -X GET http://localhost:8000/admin/devices/with-owners \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN_HERE"
```

---

## Testing the API

Visit the interactive API documentation:
- **Swagger UI:** http://localhost:8000/docs
- **ReDoc:** http://localhost:8000/redoc
