
// -----------------------------
// CONFIG
// -----------------------------
var WEB_APP_URL = "https://script.google.com/macros/s/AKfycbyzjW-6LnsS0oj_6wv_ewIwUUZ3sENbhovgFUaF2HSBe5OaLQSibiMAs3sm6QBCaXnO/exec"; // Replace after deploying
var SESSION_SHEET_NAME = "_SessionData"; // hidden sheet to persist session state
var AUDIT_SHEET_NAME = "AuditLog";
var DASHBOARD_SHEET_NAME = "Dashboard";
var TIMELOGS_SHEET_NAME = "TimeLogs";
var TASKS_SHEET_NAME = "Tasks";

// -----------------------------
// SESSION STORAGE (sheet-backed)
// -----------------------------
function _ensureSessionSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SESSION_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SESSION_SHEET_NAME);
    sh.appendRow(["Employee","ClockInISO","ClockOutISO","TotalHours"]);
    sh.hideSheet();
  }
  return sh;
}

function getSessionData() {
  var sh = _ensureSessionSheet();
  var values = sh.getDataRange().getValues();
  var data = {};
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var emp = row[0];
    if (!emp) continue;
    data[emp] = {
      clockIn: row[1] ? String(row[1]) : null,   // store ISO string
      clockOut: row[2] ? String(row[2]) : null,  // store ISO string
      totalHours: row[3] !== "" ? Number(row[3]) : null
    };
  }
  return data;
}

function setSessionData(sessions) {
  var sh = _ensureSessionSheet();
  sh.clear();
  sh.appendRow(["Employee","ClockInISO","ClockOutISO","TotalHours"]);
  for (var emp in sessions) {
    var s = sessions[emp];
    sh.appendRow([emp,
                  s.clockIn ? String(s.clockIn) : "",
                  s.clockOut ? String(s.clockOut) : "",
                  (s.totalHours !== null && s.totalHours !== undefined) ? s.totalHours : ""]);
  }
}

// -----------------------------
// AUDIT LOG
// -----------------------------
function _ensureAuditSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(AUDIT_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(AUDIT_SHEET_NAME);
    sh.appendRow(["Timestamp","User Email","Employee","Action","Status","Session ID","Message"]);
    sh.hideSheet();
  }
  return sh;
}

function logAction(action, status, userEmail, message, employeeName, sessionID) {
  var sh = _ensureAuditSheet();
  sh.appendRow([new Date(), userEmail || "Unknown", employeeName || "N/A", action, status || "N/A", sessionID || "N/A", message || ""]);
}

// -----------------------------
// UTIL: formatting
// -----------------------------
function _fmtDateISOToDisplay(isoStr) {
  if (!isoStr) return "";
  try {
    var d = new Date(isoStr);
    var timeStr = Utilities.formatDate(d, "Europe/Berlin", "h:mm a");
    var dateStr = Utilities.formatDate(d, "Europe/Berlin", "dd MMM yyyy");
    return timeStr + " on " + dateStr;
  } catch (e) {
    return isoStr;
  }
}

// -----------------------------
// CORE: Clock In / Out / Save
// -----------------------------
function doClockIn() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dashboard = ss.getSheetByName(DASHBOARD_SHEET_NAME);
  var employee = dashboard ? dashboard.getRange("B1").getValue() : null;
  if (!employee) {
    Browser.msgBox("Please select an employee first (cell B1 on Dashboard).");
    return { status: "Failed", message: "No employee selected." };
  }

  var sessions = getSessionData();
  if (sessions[employee] && sessions[employee].clockIn && !sessions[employee].clockOut) {
    var msg = "You are already clocked in (since " + _fmtDateISOToDisplay(sessions[employee].clockIn) + "). Please clock out first.";
    Browser.msgBox("⚠️ " + msg);
    return { status: "Failed", message: msg };
  }

  var now = new Date();
  var iso = now.toISOString();
  sessions[employee] = { clockIn: iso, clockOut: null, totalHours: null };
  setSessionData(sessions);

  if (dashboard) dashboard.getRange("B3").setValue(now);

  var display = _fmtDateISOToDisplay(iso);
  var msg = "Clocked in at " + display;
  Browser.msgBox("✅ " + employee + " — " + msg);

  logAction("clockIn", "Success", Session.getActiveUser().getEmail() || "External User", msg, employee, "");
  return { status: "Success", message: msg, clockInISO: iso };
}

function doClockOut() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dashboard = ss.getSheetByName(DASHBOARD_SHEET_NAME);
  var employee = dashboard ? dashboard.getRange("B1").getValue() : null;
  if (!employee) {
    Browser.msgBox("⚠️ Please select an employee first (cell B1 on Dashboard).");
    return { status: "Failed", message: "No employee selected." };
  }

  var sessions = getSessionData();
  if (!sessions[employee] || !sessions[employee].clockIn) {
    var msg = "You must clock in before you can clock out.";
    Browser.msgBox("⚠️ " + msg);
    return { status: "Failed", message: msg };
  }
  if (sessions[employee].clockOut) {
    var msgA = "You have already clocked out at " + _fmtDateISOToDisplay(sessions[employee].clockOut) + ".";
    Browser.msgBox("⚠️ " + msgA);
    return { status: "Failed", message: msgA };
  }

  var now = new Date();
  var clockIn = new Date(sessions[employee].clockIn);
  var hours = (now - clockIn) / (1000 * 60 * 60);
  sessions[employee].clockOut = now.toISOString();
  sessions[employee].totalHours = hours;
  setSessionData(sessions);

  if (dashboard) {
    dashboard.getRange("B4").setValue(now);
    dashboard.getRange("B5").setValue(hours);
  }

  var display = _fmtDateISOToDisplay(sessions[employee].clockOut);
  var msg = "Clocked out at " + display + ". Total hours: " + hours.toFixed(2);
  Browser.msgBox("✅ " + employee + " — " + msg);

  logAction("clockOut", "Success", Session.getActiveUser().getEmail() || "External User", msg, employee, "");
  return { status: "Success", message: msg, clockOutISO: sessions[employee].clockOut, totalHours: hours };
}

function doSaveSession() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dashboard = ss.getSheetByName(DASHBOARD_SHEET_NAME);
  var timeLogs = ss.getSheetByName(TIMELOGS_SHEET_NAME);
  var tasks = ss.getSheetByName(TASKS_SHEET_NAME);

  var employee = dashboard ? dashboard.getRange("B1").getValue() : null;
  if (!employee) {
    Browser.msgBox("⚠️ Please select an employee first (cell B1 on Dashboard).");
    return { status: "Failed", message: "No employee selected." };
  }

  var sessions = getSessionData();
  if (!sessions[employee] || !sessions[employee].clockOut) {
    var msg = "You must clock out before saving the session.";
    Browser.msgBox("⚠️ " + msg);
    return { status: "Failed", message: msg };
  }

  var sessionRecord = sessions[employee];
  var totalHours = sessionRecord.totalHours;
  var sessionID = Math.floor(1000 + Math.random() * 9000);

  // Ensure TimeLogs sheet exists
  if (!timeLogs) {
    timeLogs = ss.insertSheet(TIMELOGS_SHEET_NAME);
    timeLogs.appendRow(["Employee","Project/Job","ClockIn","ClockOut","Hours","SessionID"]);
  }
  var newRowLogs = timeLogs.getLastRow() + 1;
  timeLogs.getRange(newRowLogs,1).setValue(employee);
  // B2 on dashboard used earlier in your original code for project/job
  var projectVal = dashboard ? dashboard.getRange("B2").getValue() : "";
  timeLogs.getRange(newRowLogs,2).setValue(projectVal);
  timeLogs.getRange(newRowLogs,3).setValue(new Date(sessionRecord.clockIn));
  timeLogs.getRange(newRowLogs,4).setValue(new Date(sessionRecord.clockOut));
  timeLogs.getRange(newRowLogs,5).setValue(totalHours);
  timeLogs.getRange(newRowLogs,6).setValue(sessionID);

  // Tasks: rows A9:B13 on Dashboard (original code)
  if (!tasks) {
    tasks = ss.insertSheet(TASKS_SHEET_NAME);
    tasks.appendRow(["Employee","SessionID","TaskDesc","TaskNotes/Value"]);
  }
  var lastRowTasks = tasks.getLastRow();
  for (var r = 9; r <= 13; r++) {
    var taskDesc = dashboard.getRange(r,1).getValue();
    if (taskDesc && String(taskDesc).trim() !== "") {
      var newRowTask = lastRowTasks + 1;
      tasks.getRange(newRowTask,1).setValue(employee);
      tasks.getRange(newRowTask,2).setValue(sessionID);
      tasks.getRange(newRowTask,3).setValue(taskDesc);
      tasks.getRange(newRowTask,4).setValue(dashboard.getRange(r,2).getValue());
      lastRowTasks = newRowTask;
    }
  }

  var now = new Date();
  var displayNow = _fmtDateISOToDisplay(now.toISOString());
  var msg = "Session saved (ID: " + sessionID + ") at " + displayNow + ". Hours: " + (totalHours !== null ? totalHours.toFixed(2) : "N/A");
  Browser.msgBox("✅ " + employee + " — " + msg);

  // Log it
  logAction("saveSession", "Success", Session.getActiveUser().getEmail() || "External User", "Saved session ID: " + sessionID, employee, sessionID);

  // Remove the session from session store
  delete sessions[employee];
  setSessionData(sessions);

  // Clear Dashboard fields used for live session display and tasks
  if (dashboard) {
    dashboard.getRange("B3:B5").clearContent();
    dashboard.getRange("A9:B13").clearContent();
  }

  return { status: "Success", message: msg, sessionID: sessionID };
}

// -----------------------------
// Web App endpoints (doGet/doPost)
// -----------------------------
function doGet(e) {
  // Simple GET endpoint — useful to check deployment
  return ContentService.createTextOutput("Web App is active and ready.");
}

function doPost(e) {
  // Accepts POST or GET parameters. Use parameter "action" = clockIn|clockOut|saveSession
  var action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action) : "";
  var result;
  try {
    if (action === "clockIn") {
      result = doClockIn();
    } else if (action === "clockOut") {
      result = doClockOut();
    } else if (action === "saveSession") {
      result = doSaveSession();
    } else {
      result = { status: "Info", message: "Web App is active. No action executed." };
    }
  } catch (err) {
    var errMsg = "Error executing action: " + err.message;
    logAction(action || "unknown", "Error", Session.getActiveUser().getEmail() || "External User", errMsg, "", "");
    return ContentService.createTextOutput("Error: " + errMsg);
  }

  var out = (result && result.status ? result.status + ": " + result.message : "Unknown result");
  return ContentService.createTextOutput(out);
}

// -----------------------------
// Dashboard button helpers (call the Web App)
// -----------------------------
function triggerClockIn() {
  if (!WEB_APP_URL || WEB_APP_URL.indexOf("PASTE_YOUR_NEW_WEB_APP_URL_HERE") > -1) {
    Browser.msgBox("⚠️ Please set WEB_APP_URL in the script to your deployed Web App URL.");
    return;
  }
  var payload = { action: "clockIn" };
  var options = { method: "post", payload: payload, muteHttpExceptions: true };
  var response = UrlFetchApp.fetch(WEB_APP_URL, options);
  Browser.msgBox(response.getContentText());
}

function triggerClockOut() {
  if (!WEB_APP_URL || WEB_APP_URL.indexOf("PASTE_YOUR_NEW_WEB_APP_URL_HERE") > -1) {
    Browser.msgBox("⚠️ Please set WEB_APP_URL in the script to your deployed Web App URL.");
    return;
  }
  var payload = { action: "clockOut" };
  var options = { method: "post", payload: payload, muteHttpExceptions: true };
  var response = UrlFetchApp.fetch(WEB_APP_URL, options);
  Browser.msgBox(response.getContentText());
}

function triggerSaveSession() {
  if (!WEB_APP_URL || WEB_APP_URL.indexOf("PASTE_YOUR_NEW_WEB_APP_URL_HERE") > -1) {
    Browser.msgBox("⚠️ Please set WEB_APP_URL in the script to your deployed Web App URL.");
    return;
  }
  var payload = { action: "saveSession" };
  var options = { method: "post", payload: payload, muteHttpExceptions: true };
  var response = UrlFetchApp.fetch(WEB_APP_URL, options);
  Browser.msgBox(response.getContentText());
}

// -----------------------------
// Optional testing helpers
// -----------------------------
function testFlow() {
  Logger.log(doClockIn());
  Utilities.sleep(1000);
  Logger.log(doClockOut());
  Utilities.sleep(1000);
  Logger.log(doSaveSession());
}
