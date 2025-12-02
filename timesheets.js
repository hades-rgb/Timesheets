// -----------------------------
// CONFIG
// -----------------------------
var WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxTfsz10nyLgsK_XA3tcnZgZpodmEw6IG8ZT-b9OybZxyUJdhizYy0RGHB9kdkZX5CY/exec";
var SESSION_SHEET_NAME = "_SessionData";
var AUDIT_SHEET_NAME = "AuditLog";
var DASHBOARD_SHEET_NAME = "Dashboard";
var TIMELOGS_SHEET_NAME = "TimeLogs";
var TASKS_SHEET_NAME = "Tasks";

// -----------------------------
// SESSION STORAGE
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
    sh.appendRow([emp, s.clockIn || "", s.clockOut || "", s.totalHours || ""]);
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
  try {
    var sh = _ensureAuditSheet();
    sh.appendRow([
      new Date(),
      userEmail || "Unknown",
      employeeName || "N/A",
      action || "N/A",
      status || "N/A",
      sessionID || "N/A",
      message || ""
    ]);
    SpreadsheetApp.flush();
  } catch (e) {
    Logger.log("AuditLog Failed: " + e.message);
  }
}

// -----------------------------
// DATE FORMAT — GERMANY TIME
// -----------------------------
function _fmtDateISOToDisplay(isoStr) {
  if (!isoStr) return "";
  var d = new Date(isoStr);
  var timeStr = Utilities.formatDate(d, "Europe/Berlin", "h:mm a");
  var dateStr = Utilities.formatDate(d, "Europe/Berlin", "dd MMM yyyy");
  return timeStr + " on " + dateStr;
}

// -----------------------------
// CLOCK IN
// -----------------------------
function doClockIn() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dashboard = ss.getSheetByName(DASHBOARD_SHEET_NAME);
  var employee = dashboard.getRange("B1").getValue();

  if (!employee) {
    Browser.msgBox("Please select an employee.");
    return;
  }

  var sessions = getSessionData();
  if (sessions[employee] && sessions[employee].clockIn && !sessions[employee].clockOut) {
    Browser.msgBox("Already clocked in.");
    return;
  }

  var now = new Date().toISOString();
  sessions[employee] = { clockIn: now, clockOut: null, totalHours: null };
  setSessionData(sessions);

  dashboard.getRange("B3").setValue(new Date(now));
  var display = _fmtDateISOToDisplay(now);

  Browser.msgBox("Clocked in at " + display);
  logAction("clockIn", "Success", Session.getActiveUser().getEmail(), "Clocked in at " + display, employee, "");
}

// -----------------------------
// CLOCK OUT
// -----------------------------
function doClockOut() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dashboard = ss.getSheetByName(DASHBOARD_SHEET_NAME);
  var employee = dashboard.getRange("B1").getValue();

  var sessions = getSessionData();
  var session = sessions[employee];

  if (!session || !session.clockIn) {
    Browser.msgBox("You must clock in first.");
    return;
  }

  var now = new Date();
  var hours = (now - new Date(session.clockIn)) / 3600000;

  session.clockOut = now.toISOString();
  session.totalHours = hours;
  setSessionData(sessions);

  dashboard.getRange("B4").setValue(now);
  dashboard.getRange("B5").setValue(hours);

  var display = _fmtDateISOToDisplay(session.clockOut);

  Browser.msgBox("Clocked out at " + display + ". Total hours: " + hours.toFixed(2));
  logAction("clockOut", "Success", Session.getActiveUser().getEmail(), "Clocked out at "+ display, employee, "");
}

// -----------------------------
// SAVE SESSION
// -----------------------------
function doSaveSession() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dashboard = ss.getSheetByName(DASHBOARD_SHEET_NAME);
  var timeLogs = ss.getSheetByName(TIMELOGS_SHEET_NAME);

  var employee = dashboard.getRange("B1").getValue();
  var sessions = getSessionData();
  var session = sessions[employee];

  if (!session || !session.clockOut) {
    Browser.msgBox("Clock out first.");
    return;
  }

  var sessionID = Math.floor(1000 + Math.random() * 9000);

  if (!timeLogs) {
    timeLogs = ss.insertSheet(TIMELOGS_SHEET_NAME);
    timeLogs.appendRow(["Employee","Project","ClockIn","ClockOut","Hours","SessionID"]);
  }

  var row = timeLogs.getLastRow() + 1;
  timeLogs.getRange(row,1).setValue(employee);
  timeLogs.getRange(row,2).setValue(dashboard.getRange("B2").getValue());
  timeLogs.getRange(row,3).setValue(new Date(session.clockIn));
  timeLogs.getRange(row,4).setValue(new Date(session.clockOut));
  timeLogs.getRange(row,5).setValue(session.totalHours);
  timeLogs.getRange(row,6).setValue(sessionID);

  delete sessions[employee];
  setSessionData(sessions);

  dashboard.getRange("B3:B5").clearContent();
  dashboard.getRange("A9:B13").clearContent();

  Browser.msgBox("Saved session ID: " + sessionID);
  logAction("saveSession", "Success", Session.getActiveUser().getEmail(), "Saved session ID " + sessionID, employee, sessionID);
}

// -----------------------------
// WEB APP
// -----------------------------
function doPost(e) {
  var action = e.parameter.action;
  if (action === "clockIn") doClockIn();
  if (action === "clockOut") doClockOut();
  if (action === "saveSession") doSaveSession();
  return ContentService.createTextOutput("OK");
}

function doGet() {
  return ContentService.createTextOutput("Web App Active");
}

// -----------------------------
// BUTTON FUNCTIONS
// -----------------------------
function triggerClockIn() {
  UrlFetchApp.fetch(WEB_APP_URL, { method: "post", payload: { action: "clockIn" } });
}

function triggerClockOut() {
  UrlFetchApp.fetch(WEB_APP_URL, { method: "post", payload: { action: "clockOut" } });
}

function triggerSaveSession() {
  UrlFetchApp.fetch(WEB_APP_URL, { method: "post", payload: { action: "saveSession" } });
}
