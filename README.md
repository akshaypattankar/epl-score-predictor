<p align="center">
  <img src="assets/pl-logo.png" alt="Premier League Logo" width="120" />
</p>

<h1 align="center">⚽ Premier League Score Predictor</h1>

<p align="center">
  <strong>A modern, real-time Premier League prediction league dashboard with dynamic multi-tier scoring, interactive What-If simulations, 2D scoreline heatmaps, and zero-trust Tailscale deployment.</strong>
</p>

<p align="center">
  <a href="#-key-features"><img src="https://img.shields.io/badge/Platform-Web%20Dashboard-38bdf8?style=flat-square&logo=googlechrome&logoColor=white" alt="Platform" /></a>
  <a href="#-tech-stack"><img src="https://img.shields.io/badge/Backend-Node.js%20%7C%20Express-68a063?style=flat-square&logo=node.js&logoColor=white" alt="Node Express" /></a>
  <a href="#-tech-stack"><img src="https://img.shields.io/badge/Database-SQLite%20(WAL)-003B57?style=flat-square&logo=sqlite&logoColor=white" alt="SQLite" /></a>
  <a href="#-tech-stack"><img src="https://img.shields.io/badge/Frontend-Vite%20%7C%20Vanilla%20JS-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite" /></a>
  <a href="#-deployment--docker-orchestration"><img src="https://img.shields.io/badge/Deployment-Docker%20Compose-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker Compose" /></a>
  <a href="#-tailscale-sidecar-mesh-networking"><img src="https://img.shields.io/badge/Security-Tailscale%20Sidecar-20232A?style=flat-square&logo=tailscale&logoColor=white" alt="Tailscale" /></a>
  <a href="#-6-tier-scoring-system"><img src="https://img.shields.io/badge/Season-2026%2F27-38003c?style=flat-square&logo=premierleague&logoColor=white" alt="Premier League" /></a>
</p>

> [!NOTE]
> **Vibe-Coded Experiment**: This application was completely *vibe-coded* as an exploratory engineering project to showcase the capabilities and autonomy of state-of-the-art AI coding models.

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [6-Tier Scoring Engine](#-6-tier-scoring-engine)
- [Prediction Accuracy Score (PAS)](#-prediction-accuracy-score-pas)
- [System Architecture](#-system-architecture)
- [Unique Port Mapping](#-unique-port-mapping)
- [Quick Start & Deployment](#-quick-start--deployment)
  - [1. Docker Compose (Production - Recommended)](#1-docker-compose-production---recommended)
  - [2. Docker Compose (Development with Hot Reload)](#2-docker-compose-development-with-hot-reload)
  - [3. Bare-Metal Local Development](#3-bare-metal-local-development)
- [Tailscale Mesh & Funnel Access](#-tailscale-mesh--funnel-access)
- [Environment Configuration](#-environment-configuration)
- [Database Backups & Maintenance](#-database-backups--maintenance)
- [REST API Reference](#-rest-api-reference)
- [Themes & Aesthetics](#-themes--aesthetics)
- [License](#-license)

---

## 🌟 Overview

The **EPL Score Predictor** is a self-hosted, multi-group prediction platform designed for friends, offices, and football communities. Instead of traditional fantasy football that tracks individual player statistics, this platform focuses purely on **match scoreline prediction** (e.g., predicting *Arsenal 2 – 1 Chelsea*).

The platform integrates directly with the official Fantasy Premier League (FPL) data endpoints for live fixture states, match clock timing, and automated score updates. It packs an interactive What-If scenario simulator, detailed 2D heatmaps, a customizable 6-tier scoring engine, and an SVG points progression ribbon chart—all accessible through an ultra-fast, framework-overhead-free responsive interface.

---

## ✨ Key Features

### ⏱️ Live Match Center & FPL Sync
- **Automated Live Streaming**: Real-time fixture streaming with background polling every 30–60 seconds on matchdays.
- **Match State & Kickoff Cues**: Live clock minutes, scheduled kickoff countdowns, and UK time-of-day contextual indicators (🌅 morning, ☀️ afternoon, 🌆 evening, 🌙 night).
- **Automated Prediction Locking**: Predictions freeze automatically at the exact kickoff time for each fixture to ensure strict fair play.
- **Interactive Match Inspection**: Click any fixture to pop open an inspector showing all league participants' predictions, actual scores, and point outcomes side-by-side.

### 🔮 What-If Standings Simulator & PAS
- **Scenario Modeling Engine**: Experiment with hypothetical scorelines for upcoming or in-progress matches to see instant live recalculations of league ranks.
- **European Race & Relegation Visualizer**: Dynamically highlights UEFA Champions League (1–4), Europa League (5), Conference League (6), and Relegation zone (18–20) positions.
- **Predictor Accuracy Score (PAS)**: An advanced statistical model assessing prediction skill across match precision, table rank proximity (Spearman's $\rho$ and MARS), and overall points calibration.

### 📊 2D Scoreline Heatmaps & Advanced Analytics
- **Dual-View Distribution**: Compare actual Premier League score patterns with collective league predictions on an intuitive 2D grid ($0\text{–}5+$ goals).
- **Multi-Metric Toggles**: Switch between match frequency counts and fantasy points earned, with raw values or percentage shares.
- **Team-Specific Filtering**: Filter the entire heatmap view down to individual clubs.

### 📈 Points Progression Ribbon Chart
- **Custom Responsive SVG Engine**: Zero heavy third-party charting libraries—blazing-fast rendering on both mobile and desktop screens.
- **Multiple Visualization Modes**: View standings progression across Season Overview (Ribbon, Stepped, and Linear paths) or isolate individual gameweek drilldowns.
- **Interactive Legend**: Highlight or isolate individual players with a single tap.

### 🛡️ Multi-League & Zero-Friction Authentication
- **Multi-Group Isolation**: Run multiple independent prediction leagues simultaneously, each with custom starting gameweeks (e.g., mid-season mini-leagues or cup runs).
- **Passcode-Based Logins**: No bloated registration forms, forgotten passwords, or email verifications—participants sign in instantly with a memorable 4-word passcode.
- **Role-Based Permissions**: Clean permission separation across Guest (read-only), Player (prediction submission), and Admin (full configuration) roles.
- **Live Player Activity & Credentials Sync**: Real-time heartbeat detection showing who is currently online, with automatic credential exports to `user_credentials.txt` for admin distribution.

### 🎨 Cyberpunk, Midnight & Light Themes
- **Cyberpunk Dark** (Default): Glassmorphism card layouts, glowing cyan/purple neon accents, and backdrop blur filters.
- **Midnight Black**: Pure AMOLED black palette optimized for battery conservation and high contrast.
- **Clean Light**: Crisp, professional light mode designed for daylight viewing.
- **Monospace Typography**: Built with *JetBrains Mono* and *Fira Code* for a distinctive developer terminal aesthetic.

---

## 🎯 6-Tier Scoring Engine

Every prediction is evaluated against the actual match result using a symmetric, 6-tier base scoring model plus additive bonus modifiers.

```
                    ┌────────────────────────────────────────┐
                    │       Actual vs Predicted Score        │
                    └───────────────────┬────────────────────┘
                                        │
                         Exact Score? ──┴──> 🔮 Tier 1: The Oracle (6 pts)
                                        │
           Correct Outcome & Exact GD? ──┴──> 📋 Tier 2: The Manager (4 pts)
                                        │
   Correct Outcome & 1 Team Score Match? ──┴──> 🎙️ Tier 3: The Pundit (3 pts)
                                        │
                      Correct Outcome? ──┴──> 📣 Tier 4: The Fan (2 pts)
                                        │
                   1 Team Score Match? ──┴──> 🎲 Tier 5: The Lucky Guess (1 pt)
                                        │
                   No Matches Whatever ─────> 🛋️ Tier 6: The Casual (0 pts)
```

### Base Points (Mutually Exclusive)

| Tier | Icon | Title | Condition | Base Pts | Example (Actual `3–1`) |
| :---: | :---: | :--- | :--- | :---: | :--- |
| **Tier 1** | 🔮 | **The Oracle** | Exact match scoreline | **6 pts** | Predicted `3–1` |
| **Tier 2** | 📋 | **The Manager** | Correct outcome & exact goal difference ($GD = \text{Home} - \text{Away}$), excl. 0–0 | **4 pts** | Predicted `2–0` ($GD = +2$) |
| **Tier 3** | 🎙️ | **The Pundit** | Correct outcome, incorrect GD, but one team's exact goal count correct | **3 pts** | Predicted `3–0` or `2–1` |
| **Tier 4** | 📣 | **The Fan** | Correct outcome only; GD and individual team scores both incorrect | **2 pts** | Predicted `4–0` or `1–0` |
| **Tier 5** | 🎲 | **The Lucky Guess** | Incorrect outcome, but correctly predicted one team's exact goal count | **1 pt** | Predicted `3–3` (Draw) or `0–1` (Away Win) |
| **Tier 6** | 🛋️ | **The Casual** | Incorrect outcome and zero team scores correct | **0 pts** | Predicted `0–2` |

### Additive Bonus Modifiers

Bonus points stack directly on top of base tier points:

- **🔥 High-Scoring Thriller (+1 pt)**: Total actual match goals $\ge 4$ AND total predicted goals $\ge 4$, with correct outcome predicted.
- **⚡ Goal Rush (+1 pt)**: Either team scores $\ge 5$ goals with a goal difference $\ge 3$, correctly anticipated in the player's prediction alongside the correct outcome.
- **🤝 Exact Draw Premium (+1 pt)**: Match ends in a draw and the player predicted the exact draw scoreline (e.g., actual `2–2`, predicted `2–2` yields $6 + 1 + 1 = \mathbf{8\text{ pts}}$).

> [!TIP]
> Administrators can customize base tier values and bonus triggers dynamically via the in-app **Rules Editor**, with CSV import/export support. See [SCORING_RULES.md](file:///home/python/epl_score_predictor/SCORING_RULES.md) for full formal specifications.

---

## 📐 Prediction Accuracy Score (PAS)

To evaluate prediction prowess beyond raw points accumulation, the system computes the **Prediction Accuracy Score (PAS)**—a calibrated metric normalized to a 0–100 scale:

$$\text{PAS} = w_{\text{match}} \cdot \text{MatchPrecision} + w_{\text{rank}} \cdot \text{RankProximity} + w_{\text{pts}} \cdot \text{PointsCalibration}$$

- **Match Precision (Default: 50%)**: Direct accuracy based on exact outcomes, goal differences, and error tolerances.
- **Table Rank Proximity (Default: 35%)**: Evaluates how accurately predicted scorelines reflect the true Premier League table order, combining **Spearman's Rank Correlation ($\rho$, 60%)** and **Mean Absolute Rank Shift (MARS, 40%)**.
- **Points Calibration (Default: 15%)**: Consistency of scoring output relative to optimal prediction ceilings.

Weights can be tuned via `.env` or adjusted live from the Admin Management console with instant database persistence.

---

## 🏗️ System Architecture

```mermaid
flowchart TD
    subgraph Client["Client Tier"]
        Browser["Modern Web Browser<br/>(Desktop / Tablet / Mobile)"]
    end

    subgraph Security["Zero-Trust Network Mesh"]
        TS["Tailscale Sidecar Container<br/>(ts-epl / Funnel HTTPS)"]
    end

    subgraph AppStack["Application Stack (Docker Network Namespace)"]
        Nginx["Nginx Reverse Proxy<br/>Container: epl_score_predictor_prod<br/>Port: 80 (Internal) / 19899 (Host)"]
        ViteAssets["Compiled Static Assets<br/>(Vanilla JS, CSS3, SVGs)"]
        Express["Express.js API Engine<br/>Container: epl_score_predictor_backend<br/>Port: 3000"]
        DB[(SQLite 3 Database<br/>epl_predictor.db<br/>WAL Mode + Automated Backups)]
    end

    subgraph External["External Services"]
        FPL["Official FPL API<br/>fantasy.premierleague.com"]
    end

    Browser -->|Port 19899 or Tailscale VPN| TS
    TS --> Nginx
    Nginx -->|Serve Static HTML/JS/CSS| ViteAssets
    Nginx -->|Proxy /api/* requests| Express
    Express -->|Read / Write| DB
    Express -->|Polling Sync (30-60s)| FPL
```

### Repository Structure

```plaintext
epl_score_predictor/
├── assets/                  # Team crests, logos, and UI assets
│   ├── pl-logo.png          # Barclays Premier League brand asset
│   ├── ranks/               # Rank medal badges 1 through 10
│   └── team_crests/         # Official SVGs & PNGs for all 20 PL clubs
├── config/
│   ├── scoring_rules.csv    # Default CSV scoring matrix template
│   └── tailscale-serve.json # Tailscale serve & funnel ingress definition
├── css/
│   └── styles.css           # Design system (glassmorphism, themes, grid)
├── data/                    # Host-mounted SQLite directory
│   └── backups/             # Point-in-time database snapshot rotation
├── js/
│   ├── api.js               # Client API transport & token management
│   ├── app.js               # Reactive application controller & DOM state
│   ├── db.js                # Dexie.js client-side IndexedDB persistence
│   ├── rulesEditor.js       # In-app interactive scoring rules editor
│   ├── rulesExporter.js     # Scoring rules CSV export/import utility
│   ├── scoring.js           # Core evaluation algorithm (browser side)
│   ├── tierIcons.js         # SVG badges & visual tier medals
│   └── whatIfStandings.js   # What-If scenario simulation engine
├── server/
│   ├── backup.js            # CLI & programmatic database backup utility
│   ├── db.js                # SQLite data access layer & schema migrations
│   ├── dump_credentials.js  # CLI credential exporter utility
│   ├── server.js            # Express API routes, auth, and FPL proxy
│   └── whatif.js            # Backend PAS & What-If calculation engine
├── docker-compose.yml       # Production & development orchestration
├── Dockerfile               # Multi-stage production & dev Dockerfile
├── nginx.conf               # High-performance static & reverse proxy config
├── package.json             # Build toolchain & dependencies
└── vite.config.js           # Vite development server configuration
```

---

## 🔌 Unique Port Mapping

To prevent collisions with standard web applications (such as ports `80`, `3000`, `5000`, or `5173`), this stack defaults to custom high-range host ports:

| Service | Container Port | Host Port | Purpose |
| :--- | :---: | :---: | :--- |
| **Production Web Dashboard** | `80` | **`19899`** | Production Nginx web server & API proxy |
| **Backend Express API** | `3000` | **`19830`** | Direct backend API (internal or debug) |
| **Development Web Server** | `5173` | **`19517`** | Hot-reloading Vite dev environment |

---

## 🚀 Quick Start & Deployment

### 1. Docker Compose (Production - Recommended)

The production stack builds the static frontend with Vite, serves it with Alpine Nginx, launches the Node.js Express backend with SQLite, and optionally exposes it securely over Tailscale.

```bash
# Clone the repository
git clone https://github.com/akshaypattankar/epl-score-predictor.git
cd epl-score-predictor

# Copy environment variables template
cp .env.example .env

# Edit .env to set your ADMIN_PASSWORD and optional Tailscale key
nano .env

# Launch the production stack
docker compose up --build -d
```

- 🌐 **Web Dashboard**: Access at `http://localhost:19899` (or `http://<your-server-ip>:19899`).
- 🩺 **Health Check**: Verify backend status at `http://localhost:19899/api/health`.
- 📁 **Data Volume**: Database files persist in the Docker volume `epl-db-data` and backups sync to `./data/backups`.

---

### 2. Docker Compose (Development with Hot Reload)

For active frontend or styling development with instant hot-module replacement (HMR):

```bash
# Run the Vite hot-reloading dev container
docker compose --profile dev up --build epl-predictor-dev
```

- 🛠️ **Dev Dashboard**: Access at `http://localhost:19517`. Changes to `css/`, `js/`, or `index.html` reflect immediately in the browser.

---

### 3. Bare-Metal Local Development

To run the application natively without Docker:

#### Prerequisites
- **Node.js**: v20.x or higher
- **npm**: v10.x or higher

```bash
# 1. Install frontend and backend dependencies
npm install
cd server && npm install && cd ..

# 2. Start the Express API server (Terminal 1)
PORT=3000 node server/server.js

# 3. Start the Vite development server (Terminal 2)
npm run dev
```

Open `http://localhost:5173` in your browser. The Vite dev server automatically proxies `/api/*` calls to the backend running on port 3000.

---

## 🔒 Tailscale Mesh & Funnel Access

The included `ts-epl` sidecar container enables secure remote access without opening router ports or dealing with dynamic DNS:

1. **Obtain an Auth Key**: Create an auth key in the [Tailscale Admin Console](https://login.tailscale.com/admin/settings/keys).
2. **Update `.env`**:
   ```env
   TS_AUTHKEY=tskey-auth-k1234567890CNTRL-abcdef123456
   TS_HOSTNAME=epl-predictor
   TS_EXTRA_ARGS=--advertise-tags=tag:container
   ```
3. **Tailscale Funnel (Optional Public HTTPS)**:
   Edit [config/tailscale-serve.json](file:///home/python/epl_score_predictor/config/tailscale-serve.json) to enable or disable public Funnel:
   ```json
   {
     "TCP": { "443": { "HTTPS": true } },
     "Web": {
       "${TS_CERT_DOMAIN}:443": {
         "Handlers": { "/": { "Proxy": "http://127.0.0.1:80" } }
       }
     },
     "AllowFunnel": { "${TS_CERT_DOMAIN}:443": true }
   }
   ```
4. **Deploy**: Run `docker compose up -d`. Your dashboard will be reachable over your private Tailnet at `https://epl-predictor.<your-tailnet>.ts.net` with automatic valid TLS certificates.

---

## ⚙️ Environment Configuration

Configuration is managed through environment variables or the `.env` file:

```env
# ==============================================================================
# Admin & System Settings
# ==============================================================================
ADMIN_PASSWORD=admin123             # Password for administrator access
TZ=Asia/Kolkata                     # System timezone for backup schedules and logs
PORT=3000                           # Express internal listening port

# ==============================================================================
# Prediction Accuracy Score (PAS) Weights
# ==============================================================================
# Values can be specified as decimals (0.50) or integers/percentages (50 or 50%)
# The system automatically normalizes all component weights to sum to 100%.
PAS_WEIGHT_MATCH=0.50               # Weight for Match Score Precision (50%)
PAS_WEIGHT_RANK=0.35                # Weight for Table Rank Proximity (35%)
PAS_WEIGHT_POINTS=0.15              # Weight for Points Calibration (15%)

# Sub-weights for Table Rank Proximity
PAS_WEIGHT_RHO=0.60                 # Spearman rank correlation rho (60%)
PAS_WEIGHT_MARS=0.40                # Mean Absolute Rank Shift MARS (40%)

# ==============================================================================
# Tailscale Configuration (Optional)
# ==============================================================================
TS_AUTHKEY=                         # Tailscale auth key
TS_HOSTNAME=epl-predictor           # Node hostname on your Tailnet
TS_EXTRA_ARGS=--advertise-tags=tag:container
```

---

## 💾 Database Backups & Maintenance

The application uses an embedded **SQLite 3** database configured with **WAL (Write-Ahead Logging)** mode for concurrent, robust reads and writes.

### Automated Nightly Backups
A scheduled background cron worker automatically creates a point-in-time hot snapshot of the database every night at midnight. Old snapshots are automatically rotated and pruned based on the retention policy.

### Manual CLI Backups
Create on-demand database snapshots or inspect existing backups at any time:

```bash
# Create a hot snapshot backup immediately
npm run backup

# List all stored snapshots with file sizes and creation timestamps
npm run backup:list
```

### Credentials Exporter
Export active player accounts and passcodes for physical or off-band distribution:

```bash
npm run dump-credentials
```
This updates [user_credentials.txt](file:///home/python/epl_score_predictor/user_credentials.txt) with all leagues, player names, and login passcodes.

---

## 📡 REST API Reference

The Express backend exposes a comprehensive RESTful API under the `/api` prefix:

### Authentication & Sessions
| Method | Endpoint | Access | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/health` | Public | System status and timestamp |
| `POST` | `/api/auth/player` | Public | Authenticate player using 4-word passcode |
| `POST` | `/api/auth/admin` | Public | Authenticate administrator |
| `GET` | `/api/auth/verify` | Session | Validate current session token |
| `POST` | `/api/auth/logout` | Session | Invalidate current session |
| `POST` | `/api/players/activity/ping` | Session | Record player presence heartbeat |

### Fixtures & Live FPL Data
| Method | Endpoint | Access | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/fpl/bootstrap-static/` | Public | Cached FPL teams and gameweek metadata |
| `GET` | `/api/fpl/fixtures/` | Public | Cached official match fixtures, scores, and status |

### Leagues & Players
| Method | Endpoint | Access | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/groups` | Public | Retrieve all prediction leagues |
| `POST` | `/api/groups` | Admin | Create a new prediction league |
| `PUT` | `/api/groups/:id` | Admin | Update league name or starting gameweek |
| `DELETE` | `/api/groups/:id` | Admin | Remove a league |
| `GET` | `/api/groups/:id/players` | Public | Retrieve players enrolled in a league |
| `GET` | `/api/players` | Public | List all registered players |
| `POST` | `/api/players` | Admin | Create a new player and generate passcode |
| `POST` | `/api/players/:id/reset-passcode` | Admin | Generate a new passcode for a player |
| `DELETE` | `/api/players/:id` | Admin | Delete a player and associated predictions |

### Predictions & Scoring
| Method | Endpoint | Access | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/predictions` | Public | Fetch predictions (scoped by group/gameweek) |
| `POST` | `/api/predictions` | Player / Admin | Submit or update match predictions |
| `GET` | `/api/scoring-rules` | Public | Retrieve active scoring tiers and bonus rules |
| `PUT` | `/api/scoring-rules` | Admin | Update scoring rules matrix |

### What-If & Analytics
| Method | Endpoint | Access | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/whatif/standings` | Public | Compute hypothetical standings & PAS scores |
| `GET` | `/api/whatif/pas-settings` | Public | Get active PAS weighting coefficients |
| `PUT` | `/api/whatif/pas-settings` | Admin | Configure PAS weighting coefficients |
| `POST` | `/api/whatif/pas-settings/reset` | Admin | Reset PAS weights to factory defaults |

### Admin Maintenance
| Method | Endpoint | Access | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/admin/backups` | Admin | List database backup snapshots |
| `POST` | `/api/admin/backups` | Admin | Trigger immediate database snapshot |

---

## 🎨 Themes & Aesthetics

The application includes three fully designed themes switchable directly from the dashboard header:

1. **Cyberpunk Dark**: The signature look featuring translucent glass panels, cyan/indigo highlights, and sleek glowing accents.
2. **Midnight Black**: High-contrast, deep pitch-black theme crafted for OLED displays and low-light environments.
3. **Clean Light**: High-legibility light theme featuring soft gray backgrounds, crisp borders, and full contrast.

---

## 📄 License

This project is licensed under the [MIT License](file:///home/python/epl_score_predictor/LICENSE) — feel free to fork, adapt, and run it for your own Premier League prediction leagues.

<p align="center">
  <sub>Built with ⚽ for Premier League fans. Enjoy the season!</sub>
</p>
