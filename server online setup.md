# Server Online Setup

This guide explains how to keep your project online and accessible from different networks using:

- **Tailscale** (private cross-network access)
- **systemd** (auto-start and auto-restart services)
- Your existing stack: **FastAPI backend + Vite frontend + PostgreSQL**

---

## 0) Devices You Will Use

You have 2 main device roles:

1. **Server Device**  
   The Ubuntu laptop/VM where your project runs (`/home/mike/Documents/Internship`).

2. **Client Device(s)**  
   Any other laptop/phone/tablet you want to use to access the app remotely.

> Install and sign in to Tailscale on **both** server and client devices.

---

## 1) On the Server Device (Ubuntu VM/laptop)

### 1.1 Install Tailscale

```bash
curl -fsSL https://tailscale.com/install.sh | sh
```

### 1.2 Connect server to your Tailscale network

```bash
sudo tailscale up
```

- A login URL will appear in terminal.
- Open it in browser and sign in.

### 1.3 Get the server Tailscale IP

```bash
tailscale ip -4
```

You will get something like:

```text
100.88.12.34
```

Save this IP. You will use it to open frontend/backend from other devices.

---

## 2) On Each Client Device (other laptop/phone)

### 2.1 Install Tailscale

- Windows/macOS/Linux: install from [https://tailscale.com/download](https://tailscale.com/download)
- Android/iOS: install from Play Store/App Store

### 2.2 Sign in with the **same Tailscale account**

If client and server are on the same Tailnet account, they can reach each other privately.

### 2.3 Test connection to server

From client device terminal:

```bash
ping 100.88.12.34
```

Replace with your real server Tailscale IP.

---

## 3) Prepare Backend Virtual Environment (Server Device)

From server terminal:

```bash
cd /home/mike/Documents/Internship/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

---

## 4) Configure Backend Environment (`.env`) (Server Device)

Make sure this file exists:

`/home/mike/Documents/Internship/backend/.env`

Example:

```env
DATABASE_URL=postgresql+psycopg2://postgres:YOUR_PASSWORD@172.20.10.4:5432/devices_db
JWT_SECRET_KEY=change_this_secret
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

Use your real database credentials.

---

## 5) Create systemd Service for Backend (Server Device)

Create service file:

```bash
sudo nano /etc/systemd/system/internship-backend.service
```

Paste:

```ini
[Unit]
Description=Internship FastAPI Backend
After=network.target postgresql.service
Wants=postgresql.service

[Service]
User=mike
WorkingDirectory=/home/mike/Documents/Internship/backend
Environment="PATH=/home/mike/Documents/Internship/backend/.venv/bin"
ExecStart=/home/mike/Documents/Internship/backend/.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now internship-backend
sudo systemctl status internship-backend
```

---

## 6) Create systemd Service for Frontend (Server Device)

Create service file:

```bash
sudo nano /etc/systemd/system/internship-frontend.service
```

Paste:

```ini
[Unit]
Description=Internship Frontend (Vite Dev Server)
After=network.target

[Service]
User=mike
WorkingDirectory=/home/mike/Documents/Internship/frontend
ExecStart=/usr/bin/npm run dev -- --host 0.0.0.0 --port 5173
Restart=always
RestartSec=3
Environment=NODE_ENV=development

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now internship-frontend
sudo systemctl status internship-frontend
```

> If `npm` path is different, run `which npm` and update `ExecStart`.

---

## 7) Ensure PostgreSQL Auto-Starts (Server Device)

```bash
sudo systemctl enable --now postgresql
sudo systemctl status postgresql
```

---

## 8) Access URLs from Client Devices (Different Networks)

Use the **server Tailscale IP** (example `100.88.12.34`):

- Frontend: `http://100.88.12.34:5173`
- Backend API docs: `http://100.88.12.34:8000/docs`
- Backend root: `http://100.88.12.34:8000`

---

## 9) Useful Maintenance Commands (Server Device)

Check service status:

```bash
sudo systemctl status internship-backend
sudo systemctl status internship-frontend
```

Restart services:

```bash
sudo systemctl restart internship-backend
sudo systemctl restart internship-frontend
```

Live logs:

```bash
sudo journalctl -u internship-backend -f
sudo journalctl -u internship-frontend -f
```

---

## 10) Troubleshooting

### A) Client cannot open URLs

- Confirm server is online
- Confirm both devices are logged into same Tailscale account
- Re-check server Tailscale IP with `tailscale ip -4`
- Check services are running with `systemctl status`

### B) Backend fails to start

- Check logs: `sudo journalctl -u internship-backend -f`
- Verify `.env` exists in `backend/`
- Verify virtualenv and dependencies installed

### C) Frontend fails to start

- Check logs: `sudo journalctl -u internship-frontend -f`
- Run once manually to verify:
  - `cd /home/mike/Documents/Internship/frontend`
  - `npm install`
  - `npm run dev -- --host 0.0.0.0 --port 5173`

---

## 11) Recommended Next Upgrade (Optional)

For better long-term stability:

- Serve frontend build with **Nginx** instead of Vite dev server
- Run backend with **gunicorn + uvicorn workers**
- Keep Tailscale for private remote access

