# Cloud Deployment (No Tailscale)

This setup publishes your app over normal HTTPS links:

- Frontend: Vercel
- Backend API + WebSocket: Railway
- Database: Railway Postgres

## 1) Backend + Database on Railway

1. Create a Railway project.
2. Add a **PostgreSQL** service.
3. Add a **GitHub repo service** for this repository and set the root directory to `backend`.
4. Set backend environment variables:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (from Railway variable picker)
   - `JWT_SECRET_KEY` = strong random secret
   - `AUTH_SALT` = same value used in your current environment
   - `ACCESS_TOKEN_EXPIRE_MINUTES` = `30` (or preferred value)
   - `CORS_ALLOWED_ORIGINS` = `https://<your-vercel-domain>`
5. Deploy the backend service.
6. Verify backend health:
   - Open `https://<railway-backend-domain>/health`
7. Verify WebSocket endpoint is reachable:
   - Base endpoint should be available on the same Railway domain used by API.

## 2) Frontend on Vercel

1. Create a Vercel project from this repository.
2. Set project root to `frontend`.
3. Add environment variable:
   - `VITE_API_BASE=https://<railway-backend-domain>`
4. Deploy.
5. Open Vercel URL and test:
   - Login
   - Devices list
   - Add/update/delete device
   - Device details live updates

## 3) ESP32 Cutover to Public Backend

Update firmware/network config so device traffic goes to the new public backend domain.

- Replace old LAN/VPN host with `api.<your-domain>` or Railway domain.
- Use secure WebSocket (`wss://`) and HTTPS where firmware stack supports TLS.
- Roll out one test ESP32 first, confirm telemetry appears, then deploy to all devices.

## 4) Production Hardening

1. **Restrict CORS** to your frontend domain only.
2. **Set strong secrets** (`JWT_SECRET_KEY`).
3. **Enable Postgres backups** in Railway and confirm retention policy.
4. **Custom domains**:
   - `app.<your-domain>` -> Vercel
   - `api.<your-domain>` -> Railway
5. Add Railway health check path `/health`.
6. Keep logs/metrics monitored for:
   - restart loops
   - WebSocket disconnect spikes
   - database connection errors

## 5) Smoke Test Checklist

- Frontend works from any network without local software installs.
- API responses are successful from frontend domain only.
- WebSocket updates stream continuously for at least 30 minutes.
- New device/sensor data is persisted and still present after backend restart.
- ESP32 reconnects automatically after temporary network interruption.

You can run the automated checks from this repo:

```bash
API_BASE_URL=https://api.yourdomain.com FRONTEND_URL=https://app.yourdomain.com ./scripts/verify-cloud-deploy.sh
```
