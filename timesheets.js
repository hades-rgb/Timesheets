/***************************************************
 * Helper Functions – Session Data Management
 ***************************************************/
function getSessionData() {
  var scriptProperties = PropertiesService.getScriptProperties();
  var data = scriptProperties.getProperty("employeeSessions");
  return data ? JSON.parse(data) : {};
}

function setSessionData(data) {
  var scriptProperties = PropertiesService.getScriptProperties();
  scriptProperties.setProperty("employeeSessions", JSON.stringify(data));
}

/***************************************************
 * Core Time Clock Functions
 ***************************************************/
function doClockIn() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dashboard = ss.getSheetByName("Dashboard");
  
  var employee = dashboard.getRange("B1").getValue();
  if (!employee) {
    Browser.msgBox("Please select an employee first.");
    return;
  }
  
  var sessions = getSessionData();
  
  if (sessions[employee] && sessions[employee].clockIn && !sessions[employee].clockOut) {
    Browser.msgBox("You are already clocked in. Clock out first.");
    return;
  }
  
  var now = new Date();
  sessions[employee] = {
    clockIn: now.toISOString(),
    clockOut: null,
    totalHours: null
  };
  setSessionData(sessions);
  
  dashboard.getRange("B3").setValue(now);
  var timeStr = Utilities.formatDate(now, "Europe/Berlin", "h:mm a");
  Browser.msgBox("Clocked in at " + timeStr);
}

function doClockOut() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dashboard = ss.getSheetByName("Dashboard");
  
  var employee = dashboard.getRange("B1").getValue();
  if (!employee) {
    Browser.msgBox("Please select an employee first.");
    return;
  }
  
  var sessions = getSessionData();
  
  if (!sessions[employee] || !sessions[employee].clockIn) {
    Browser.msgBox("You must clock in first.");
    return;
  }
  
  if (sessions[employee].clockOut) {
    Browser.msgBox("You are already clocked out.");
    return;
  }
  
  var now = new Date();
  var clockIn = new Date(sessions[employee].clockIn);
  var hours = (now - clockIn) / (1000 * 60 * 60);
  sessions[employee].clockOut = now.toISOString();
  sessions[employee].totalHours = hours;
  setSessionData(sessions);
  
  dashboard.getRange("B4").setValue(now);
  dashboard.getRange("B5").setValue(hours);
  
  var timeStr = Utilities.formatDate(now, "Europe/Berlin", "h:mm a");
  Browser.msgBox("Clocked out at " + timeStr + ". Total hours: " + hours.toFixed(2));
}

function doSaveSession() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dashboard = ss.getSheetByName("Dashboard");
  var timeLogs = ss.getSheetByName("TimeLogs");
  var tasks = ss.getSheetByName("Tasks");
  
  var employee = dashboard.getRange("B1").getValue();
  if (!employee) {
    Browser.msgBox("Please select an employee first.");
    return;
  }
  
  var sessions = getSessionData();
  
  if (!sessions[employee] || !sessions[employee].clockOut) {
    Browser.msgBox("You must clock out first.");
    return;
  }
  
  var totalHours = sessions[employee].totalHours;
  
  // Generate random 4-digit Session ID
  var sessionID = Math.floor(1000 + Math.random() * 9000);
  
  var newRowLogs = timeLogs.getLastRow() + 1;
  timeLogs.getRange(newRowLogs, 1).setValue(employee);
  timeLogs.getRange(newRowLogs, 2).setValue(dashboard.getRange("B2").getValue());
  timeLogs.getRange(newRowLogs, 3).setValue(new Date(sessions[employee].clockIn));
  timeLogs.getRange(newRowLogs, 4).setValue(new Date(sessions[employee].clockOut));
  timeLogs.getRange(newRowLogs, 5).setValue(totalHours);
  timeLogs.getRange(newRowLogs, 6).setValue(sessionID);
  
  // Record tasks and associate with employee and session ID
  var lastRowTasks = tasks.getLastRow();
  for (var i = 9; i <= 13; i++) {
    var taskDesc = dashboard.getRange(i, 1).getValue();
    if (taskDesc !== "") {
      var newRowTasks = lastRowTasks + 1;
      tasks.getRange(newRowTasks, 1).setValue(employee);
      tasks.getRange(newRowTasks, 2).setValue(sessionID);
      tasks.getRange(newRowTasks, 3).setValue(taskDesc);
      tasks.getRange(newRowTasks, 4).setValue(dashboard.getRange(i, 2).getValue());
      lastRowTasks = newRowTasks;
    }
  }
  
  // Log action in AuditLog
  var email = Session.getActiveUser().getEmail() || "External User";
  logAction("saveSession", "Success", email, "Session saved with ID: " + sessionID + " for " + employee, employee, sessionID);
  
  delete sessions[employee];
  setSessionData(sessions);
  
  dashboard.getRange("B3:B5").clearContent();
  dashboard.getRange("A9:B13").clearContent();
  
  Browser.msgBox("Session saved successfully! Session ID: " + sessionID);
}

/***************************************************
 * Audit Log Utility
 ***************************************************/
function logAction(action, status, userEmail, message, employeeName, sessionID) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var auditSheet = ss.getSheetByName("AuditLog");
  
  if (!auditSheet) {
    auditSheet = ss.insertSheet("AuditLog");
    auditSheet.appendRow(["Timestamp", "User Email", "Employee", "Action", "Status", "Session ID", "Message"]);
    auditSheet.hideSheet();
  }
  
  var timestamp = new Date();
  auditSheet.appendRow([timestamp, userEmail, employeeName || "N/A", action, status, sessionID || "N/A", message]);
}

/***************************************************
 * Web App Wrappers (run as owner)
 ***************************************************/
function doGet(e) {
  return HtmlService.createHtmlOutput("Web App is active and ready.");
}

function doPost(e) {
  var action = e.parameter.action;
  var result = "";
  var status = "Success";
  var message = "";
  var email = Session.getActiveUser().getEmail() || "External User";
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dashboard = ss.getSheetByName("Dashboard");
  var employee = dashboard.getRange("B1").getValue() || "Unknown Employee";
  
  try {
    if (action === "clockIn") {
      doClockIn();
      message = "Clock In successful";
    } else if (action === "clockOut") {
      doClockOut();
      message = "Clock Out successful";
    } else if (action === "saveSession") {
      doSaveSession();
      message = "Session saved successfully";
    } else {
      status = "Failed";
      message = "Unknown action: " + action;
    }
  } catch (err) {
    status = "Error";
    message = err.message;
  }
  
  logAction(action, status, email, message, employee, "");
  result = status + ": " + message;
  return ContentService.createTextOutput(result);
}

/***************************************************
 * Dashboard Button Triggers (used by users)
 ***************************************************/
var WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzVHLzYFYWkukCjN1uAtrVRm-RmaY3N4hxSWtE0ShrZwDXjDw9f-09aB9XWHqL_phK1/exec"; // <-- Replace this

function triggerClockIn() {
  var payload = { action: "clockIn" };
  var options = {
    method: "post",
    payload: payload,
    muteHttpExceptions: true
  };
  var response = UrlFetchApp.fetch(WEB_APP_URL, options);
  Browser.msgBox(response.getContentText());
}

function triggerClockOut() {
  var payload = { action: "clockOut" };
  var options = {
    method: "post",
    payload: payload,
    muteHttpExceptions: true
  };
  var response = UrlFetchApp.fetch(WEB_APP_URL, options);
  Browser.msgBox(response.getContentText());
}

function triggerSaveSession() {
  var payload = { action: "saveSession" };
  var options = {
    method: "post",
    payload: payload,
    muteHttpExceptions: true
  };
  var response = UrlFetchApp.fetch(WEB_APP_URL, options);
  Browser.msgBox(response.getContentText());
}