# Google Sheets Time Clock System ⏰

A fully automated **employee time-tracking system** built using **Google Apps Script** and **Google Sheets**.  
This script allows employees to clock in, clock out, and log their work sessions with total hours calculated automatically.  
Each session and related tasks are saved into a structured Google Sheet with audit logging.

---

## 🚀 Features

- ✅ Clock In / Clock Out system using Google Sheets
- 🧾 Automatic session storage (in `ScriptProperties`)
- 📊 Auto-calculation of total hours worked
- 🗂️ Task logging per session
- 🧠 Web App API integration (`doGet` / `doPost`)
- 🔐 Owner-level web app execution (ensures data safety)
- 📘 Audit logging of all user actions (with email and timestamp)

---

## 📂 Google Sheets Structure

The project expects the following sheets in your spreadsheet:

| Sheet Name  | Purpose |
|--------------|----------|
| **Dashboard** | User interface for employee, date, and tasks |
| **TimeLogs** | Stores clock-in, clock-out, and total hours per session |
| **Tasks** | Stores tasks performed during each session |
| **AuditLog** | Hidden log of all actions and events (auto-generated if missing) |

### 🧩 Dashboard Layout Example

| Cell | Purpose |
|------|----------|
| `B1` | Employee name |
| `B2` | Date |
| `B3` | Clock-In Time |
| `B4` | Clock-Out Time |
| `B5` | Total Hours |
| `A9:B13` | Task descriptions and details |

---

## ⚙️ Script Functions Overview

### Session Management
- **`getSessionData()` / `setSessionData()`**  
  Stores temporary clock-in data using `PropertiesService`.

### Core Actions
- **`doClockIn()`** – Records start time of a session.
- **`doClockOut()`** – Records end time, calculates total hours.
- **`doSaveSession()`** – Saves the session and related tasks into sheets.

### Web API
- **`doGet(e)`** – Simple “health check” endpoint.
- **`doPost(e)`** – Accepts actions: `"clockIn"`, `"clockOut"`, `"saveSession"`.

### Audit
- **`logAction(action, status, userEmail, message)`** – Records each user’s action.

### Triggers (for Button Links)
- **`triggerClockIn()`**, **`triggerClockOut()`**, **`triggerSaveSession()`**  
  Post data to your **published Web App URL** from within Google Sheets.

---

## 🌐 Deployment (Web App)

1. In the Apps Script editor, click **Deploy > New Deployment**.  
2. Select **Web App**.
3. Under **Execute as**, choose **Me (the owner)**.
4. Under **Who has access**, choose **Anyone** (or as required).
5. Deploy and copy the **Web App URL**.
6. Replace the placeholder in the code:

```js
var WEB_APP_URL = "YOUR_DEPLOYED_WEB_APP_URL";
