/**
 * Skwibble feedback SYNC (Option A).
 * Pulls feedback from Firebase into this sheet — one tab per game,
 * named "YYYY-MM-DD · CODE", with Timestamp / Player / Rating / Comment.
 *
 * Runs entirely inside your Legal Soft workspace (as you). No public web app.
 *
 * First run: in the editor, select "syncFeedback" and click Run once to
 * authorize. After that, use the "Skwibble → Sync feedback now" menu, and/or
 * run installTrigger() once to auto-sync every 10 minutes.
 */
var FIREBASE_URL = "https://ls-engagement-games-default-rtdb.firebaseio.com";

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Skwibble")
    .addItem("Sync feedback now", "syncFeedback")
    .addToUi();
}

function syncFeedback() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var resp = UrlFetchApp.fetch(FIREBASE_URL + "/feedback.json", { muteHttpExceptions: true });
  var all = JSON.parse(resp.getContentText() || "null");
  if (!all) { ss.toast("No feedback yet."); return; }

  var synced = getSyncedSet_(ss);
  var added = 0;

  Object.keys(all).forEach(function (code) {
    var entries = all[code] || {};
    Object.keys(entries).forEach(function (key) {
      if (synced[key]) return;
      var f = entries[key] || {};
      var tabName = ((f.gameDate ? f.gameDate + " \u00B7 " : "") + code).substring(0, 90);
      var sheet = ss.getSheetByName(tabName);
      if (!sheet) {
        sheet = ss.insertSheet(tabName);
        sheet.appendRow(["Timestamp", "Player", "Rating", "Comment"]);
        sheet.setFrozenRows(1);
      }
      sheet.appendRow([new Date(f.ts || Date.now()), f.name || "", f.rating || "", f.comment || ""]);
      synced[key] = true;
      added++;
    });
  });

  saveSyncedSet_(ss, synced);
  ss.toast(added + " new feedback row(s) added.");
}

function getSyncedSet_(ss) {
  var sh = ss.getSheetByName("_synced");
  var set = {};
  if (sh && sh.getLastRow() > 0) {
    sh.getRange(1, 1, sh.getLastRow(), 1).getValues().forEach(function (r) { if (r[0]) set[r[0]] = true; });
  }
  return set;
}

function saveSyncedSet_(ss, set) {
  var sh = ss.getSheetByName("_synced");
  if (!sh) { sh = ss.insertSheet("_synced"); sh.hideSheet(); }
  sh.clearContents();
  var keys = Object.keys(set);
  if (keys.length) sh.getRange(1, 1, keys.length, 1).setValues(keys.map(function (k) { return [k]; }));
}

// Run this ONCE to auto-sync every 10 minutes (optional).
function installTrigger() {
  ScriptApp.newTrigger("syncFeedback").timeBased().everyMinutes(10).create();
}
