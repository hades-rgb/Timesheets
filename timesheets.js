// -----------------------------
// CONFIG
// -----------------------------
var WEB_APP_URL = "https://script.google.com/macros/s/AKfycbyIlsmeurGP5CVZ89efyaq6Zu5U9imwOAqaW6I0ukoC7VfTPi-NZkk0tuEc5aWGL7ri/exec"; // your deployed web app URL
var SESSION_SHEET_NAME = "_SessionData";
var AUDIT_SHEET_NAME = "AuditLog";
var DASHBOARD_SHEET_NAME = "Dashboard";
var TIMELOGS_SHEET_NAME = "TimeLogs";
var TASKS_SHEET_NAME = "Tasks";

// -----------------------------
// Helpers
// -----------------------------
function amIRunningAsOwner() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var owner = ss.getOwner();
    if (!owner) return false;
    var eff = Session.getEffectiveUser();
    return owner.getEmail() === eff.getEmail();
  } catch (e) {
    return false;
  }
}

function callWebAppAction(action) {
  try {
    var options = {
      method: "post",
      payload: { action: action },
      muteHttpExceptions: true
    };
    var resp = UrlFetchApp.fetch(WEB_APP_URL, options);
    return resp.getContentText();
  } catch (err) {
    // Return a useful message (won't throw)
    return "Error calling WebApp: " + err.message;
  }
}

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
      clockIn: row[1] ? String(row[1]) : null,
      clockOut: row[2] ? String(row[2]) : null,
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
// CORE: Owner-only implementations (unchanged logic)
// Keep these private and call them only when running as owner.
// -----------------------------
function doClockInCore() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dashboard = ss.getSheetByName(DASHBOARD_SHEET_NAME);
  var employee = dashboard ? dashboard.getRange("B1").getValue() : null;
  if (!employee) {
    return { status: "Failed", message: "No employee selected." };
  }

  var sessions = getSessionData();
  if (sessions[employee] && sessions[employee].clockIn && !sessions[employee].clockOut) {
    var msg = "You are already clocked in (since " + _fmtDateISOToDisplay(sessions[employee].clockIn) + "). Please clock out first.";
    return { status: "Failed", message: msg };
  }

  var now = new Date();
  var iso = now.toISOString();
  sessions[employee] = { clockIn: iso, clockOut: null, totalHours: null };
  setSessionData(sessions);

  if (dashboard) {
    dashboard.getRange("B3").setValue(now);
  }

  var display = _fmtDateISOToDisplay(iso);
  var msg = "Clocked in at " + display;

  logAction("clockIn", "Success", Session.getActiveUser().getEmail() || "External User", msg, employee, "");
  return { status: "Success", message: msg, clockInISO: iso };
}

function doClockOutCore() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dashboard = ss.getSheetByName(DASHBOARD_SHEET_NAME);
  var employee = dashboard ? dashboard.getRange("B1").getValue() : null;
  if (!employee) {
    return { status: "Failed", message: "No employee selected." };
  }

  var sessions = getSessionData();
  if (!sessions[employee] || !sessions[employee].clockIn) {
    var msg = "You must clock in before you can clock out.";
    return { status: "Failed", message: msg };
  }
  if (sessions[employee].clockOut) {
    var msgA = "You have already clocked out at " + _fmtDateISOToDisplay(sessions[employee].clockOut) + ".";
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

  logAction("clockOut", "Success", Session.getActiveUser().getEmail() || "External User", msg, employee, "");
  return { status: "Success", message: msg, clockOutISO: sessions[employee].clockOut, totalHours: hours };
}

function doSaveSessionCore() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dashboard = ss.getSheetByName(DASHBOARD_SHEET_NAME);
  var timeLogs = ss.getSheetByName(TIMELOGS_SHEET_NAME);
  var tasks = ss.getSheetByName(TASKS_SHEET_NAME);

  var employee = dashboard ? dashboard.getRange("B1").getValue() : null;
  if (!employee) {
    return { status: "Failed", message: "No employee selected." };
  }

  var sessions = getSessionData();
  if (!sessions[employee] || !sessions[employee].clockOut) {
    var msg = "You must clock out before saving the session.";
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
  var projectVal = dashboard ? dashboard.getRange("B2").getValue() : "";
  timeLogs.getRange(newRowLogs,2).setValue(projectVal);
  timeLogs.getRange(newRowLogs,3).setValue(new Date(sessionRecord.clockIn));
  timeLogs.getRange(newRowLogs,4).setValue(new Date(sessionRecord.clockOut));
  timeLogs.getRange(newRowLogs,5).setValue(totalHours);
  timeLogs.getRange(newRowLogs,6).setValue(sessionID);

  // Tasks: rows A9:B13 on Dashboard
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
// PUBLIC FUNCTIONS (keeps original names)
// These are the functions your buttons or integrations can call directly.
// They will run locally if owner, otherwise call the WebApp so the owner runs the write.
// -----------------------------
function doClockIn() {
  if (amIRunningAsOwner()) {
    try {
      var res = doClockInCore();
      // Show result for interactive use
      Browser.msgBox(res.status + ": " + res.message);
      return res;
    } catch (err) {
      // As a fallback call web app
      var txt = callWebAppAction("clockIn");
      Browser.msgBox(txt);
      return { status: "Fallback", message: txt };
    }
  } else {
    var txt = callWebAppAction("clockIn");
    try { Browser.msgBox(txt); } catch(e) {}
    return { status: "Remote", message: txt };
  }
}

function doClockOut() {
  if (amIRunningAsOwner()) {
    try {
      var res = doClockOutCore();
      Browser.msgBox(res.status + ": " + res.message);
      return res;
    } catch (err) {
      var txt = callWebAppAction("clockOut");
      Browser.msgBox(txt);
      return { status: "Fallback", message: txt };
    }
  } else {
    var txt = callWebAppAction("clockOut");
    try { Browser.msgBox(txt); } catch(e) {}
    return { status: "Remote", message: txt };
  }
}

function doSaveSession() {
  if (amIRunningAsOwner()) {
    try {
      var res = doSaveSessionCore();
      Browser.msgBox(res.status + ": " + res.message);
      return res;
    } catch (err) {
      var txt = callWebAppAction("saveSession");
      Browser.msgBox(txt);
      return { status: "Fallback", message: txt };
    }
  } else {
    var txt = callWebAppAction("saveSession");
    try { Browser.msgBox(txt); } catch(e) {}
    return { status: "Remote", message: txt };
  }
}

// -----------------------------
// Web App endpoints (doGet/doPost)
// doPost runs the core actions as the script's execution identity (owner if deployed that way)
// -----------------------------
function doGet(e) {
  return ContentService.createTextOutput("Web App active.");
}

function doPost(e) {
  var action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action) : "";
  var result;
  try {
    if (action === "clockIn") {
      result = doClockInCore();
    } else if (action === "clockOut") {
      result = doClockOutCore();
    } else if (action === "saveSession") {
      result = doSaveSessionCore();
    } else {
      result = { status: "Info", message: "No action executed." };
    }
  } catch (err) {
    var errMsg = "Error executing action: " + (err.message || err);
    logAction(action || "unknown", "Error", Session.getActiveUser().getEmail() || "External User", errMsg, "", "");
    return ContentService.createTextOutput("Error: " + errMsg);
  }
  var out = (result && result.status ? result.status + ": " + result.message : "Unknown result");
  return ContentService.createTextOutput(out);
}

// -----------------------------
// Optional: direct button helpers (if you prefer these on the drawing/button)
// They always call the Web App (safe; owner executes).
// -----------------------------
function triggerClockIn() {
  var txt = callWebAppAction("clockIn");
  try { Browser.msgBox(txt); } catch(e) {}
}
function triggerClockOut() {
  var txt = callWebAppAction("clockOut");
  try { Browser.msgBox(txt); } catch(e) {}
}
function triggerSaveSession() {
  var txt = callWebAppAction("saveSession");
  try { Browser.msgBox(txt); } catch(e) {}
}