# ⚽ EPL Score Predictor - Server & Docker Setup

This project provides a Premier League prediction mini-league dashboard built with Vite, HTML, CSS, Express, and SQLite.

---

## 🔌 Unique Port Mapping Overview

To avoid port conflicts with common services (like 80, 8080, 3000, 5173), custom high-range ports have been configured:

| Service | Container Port | Unique Host Port | Description |
| :--- | :--- | :--- | :--- |
| **Production Web Dashboard** | `80` | **`19899`** | Production Nginx web server |
| **Express Backend API** | `3000` | **`19830`** | Server API & SQLite persistence |
| **Development Web Server** | `5173` | **`19517`** | Hot-reloading Vite dev server |

---

## 🐳 Quick Start Commands

### 1. Production Mode (Recommended)

Run the backend server and Nginx production web app:

```bash
cd /home/python/epl_score_predictor

# Build & launch containers in background
docker compose up --build -d
```

- **Production Dashboard**: `http://localhost:19899` (or `http://<your-server-ip>:19899`)
- **Backend API**: `http://localhost:19830/api/groups`

---

### 2. Development Mode (with Live Reload)

Run the Vite hot-reloading dev server:

```bash
docker compose --profile dev up --build epl-predictor-dev
```

- **Development Dashboard**: `http://localhost:19517`

---

## 📁 Architecture & Volumes

- **`server/`**: Express REST API server using SQLite database for persistent groups, players, and predictions.
- **`epl-db-data` Volume**: Mounts `/app/data` to ensure SQLite database data is preserved across container restarts.
- **`tailscale-state` Volume**: Preserves Tailscale machine state across container restarts.
- **`nginx.conf`**: Serves static files and proxies `/api/` requests internally to `http://127.0.0.1:3000`.

---

## 🔒 Tailscale Sidecar Configuration

To expose your EPL Predictor securely on your Tailnet or via Funnel:

1. Configure your `.env` with your Tailscale auth key:
   ```env
   TS_AUTHKEY=tskey-auth-your-key-here
   TS_HOSTNAME=epl-score-predictor
   TS_EXTRA_ARGS=--advertise-tags=tag:container
   ```
2. Verify or customize [config/tailscale-serve.json](file:///home/python/epl_score_predictor/config/tailscale-serve.json):
   - Proxy forwards traffic to `http://127.0.0.1:80` (Nginx).
   - Set `"AllowFunnel": { "${TS_CERT_DOMAIN}:443": true }` if you want public internet access via Tailscale Funnel, or `false` for private Tailnet access only.
3. Start the stack:
   ```bash
   docker compose up -d
   ```

