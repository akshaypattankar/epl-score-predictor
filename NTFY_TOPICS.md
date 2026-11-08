# 🔔 EPL Predictor — ntfy Notification Topics Reference

This document lists all active **ntfy** push notification topics for the Premier League Score Predictor. Players can subscribe to their respective league topic(s) to receive automated push alerts directly on their phone or desktop via the free [ntfy app](https://ntfy.sh).

---

## 🏆 Active League Topics

| League Group | Topic Identifier | 1-Click Subscribe URL | Members | Scope |
| :--- | :--- | :--- | :--- | :--- |
| **Gunners Anonymous** | `epl-gunners-anonymous-2-b93cc4` | [Subscribe / View](https://ntfy.sh/epl-gunners-anonymous-2-b93cc4) | Adithya, Akshay, Rohith | Starts GW 1 |
| **Anké x Patty** | `epl-anke-x-patty-4-49e192` | [Subscribe / View](https://ntfy.sh/epl-anke-x-patty-4-49e192) | Akshay, Ankita | Starts GW 7 |
| **RARA** | `epl-rara-8-c04536` | [Subscribe / View](https://ntfy.sh/epl-rara-8-c04536) | Adithya, Akshay, Rakshith, Rohith | Starts GW 5 |
| **RARA ($)** | `epl-rara-13-c489c9` | [Subscribe / View](https://ntfy.sh/epl-rara-13-c489c9) | Adithya, Akshay, Rakshith, Rohith | Starts GW 8 |

---

## 📲 How to Subscribe

1. **Install the ntfy App**:
   - **Android**: Download from [Google Play](https://play.google.com/store/apps/details?id=io.heckel.ntfy) or [F-Droid](https://f-droid.org/packages/io.heckel.ntfy/).
   - **iOS**: Download from the [Apple App Store](https://apps.apple.com/app/ntfy/id1625396347).
   - **Web / Desktop**: Access directly via your browser at [ntfy.sh](https://ntfy.sh).
2. **Subscribe to Your League**:
   - Tap the **1-Click Subscribe URL** in the table above, or
   - Open the ntfy app, tap `+` (Add subscription), and enter your league's Topic Identifier (e.g., `epl-gunners-anonymous-2-b93cc4`).
   - *No account, registration, or phone number required.*
3. **Verify Delivery**:
   - Click the **🔔 Alerts** button in the web app header and tap **🔔 Test Alert**, **🔒 Test Kickoff Alert**, or **🏁 Test Full-Time Alert** to verify push delivery on your device.

---

## ⏰ Notification Cadence

The engine operates on a background scheduler with three automated alert triggers:

### 1. ⏰ Gameweek Prediction Reminders
* **When**: 24 hours and 2 hours before the first kickoff of each Gameweek.
* **Content**: Alerts players with pending predictions in that league to submit their scores before the deadline.

### 2. 🔒 Match Kickoff & Predictions Reveal
* **When**: Exactly at match start when predictions lock (`now >= kickoff_time` or `started: true`).
* **Content**:
  * Matchup header with official club crests and team short names (e.g., `![ARS](...) ARS vs CHE ![CHE](...)`).
  * Full reveal of everyone's predictions in the league (`Alice: 2 - 1`, `Bob: 1 - 1`, `Dave: No prediction`).

### 3. 🏁 Full-Time Results & Points Breakdown
* **When**: 10 minutes after the match finishes (`f.finished === true`), following an automated dataset refresh from the official FPL API.
* **Content**:
  * Final score with club crests and short names (e.g., `![ARS](...) ARS 2 - 1 CHE ![CHE](...)`).
  * Breakdown of points earned by every player in the league, displaying dynamic scoring tier names and icons from the active rules (e.g. `🔮 (Vishwaguru)`, `🤹 (Manager)`, `🧑‍💻 (FM Enthusiast)`, `🗣️ (Pundit)`, `🍟 (Casual Fan)`, `🤡 (Infantino)`).

---

## 👤 Personal Direct Topics

Players can optionally set a private personal topic in the app's **🔔 Alerts** modal (e.g. `epl-adithya-private-491`). When configured:
* The player receives direct private reminders for their unpredicted matches across all leagues they participate in.

---

## ⚙️ Administration & Topic Management

* **Server URL**: Default public server is `https://ntfy.sh` (customizable in the web app's Management panel under *Push Notifications & ntfy Engine*).
* **Topic Generation**: Generated automatically using the league name slug, group ID, and a secure 6-character random hex hash (`epl-<league-slug>-<id>-<hash>`).
* **Deduplication**: Monitored via the database `sent_notifications` and `match_finish_tracking` tables to prevent duplicate alerts.
