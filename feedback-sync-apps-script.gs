/**
 * Engagement Games — feedback SYNC.
 * Pulls feedback from Firebase into this sheet, consolidated into ONE master
 * tab PER GAME ("Skwibble Feedback", "Bingo Feedback", …) rather than a tab
 * per session. Each row carries the game, room code, and date so you can
 * filter/sort in place.
 *
 * Runs entirely inside your Legal Soft workspace (as you). No public web app.
 *
 * First run: in the editor, select "syncFeedback" and click Run once to
 * authorize. After that, use the "Engagement Games → Sync feedback now" menu,
 * and/or run installTrigger() once to auto-sync every 10 minutes.
 *
 * Note: existing per-session tabs from the previous version are left untouched;
 * new feedback from here on lands in the master tabs.
 */
var FIREBASE_URL = "https://ls-engagement-games-default-rtdb.firebaseio.com";
var HEADERS = ["Timestamp", "Game", "Code", "Game date", "Player", "Rating", "Comment"];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Engagement Games")
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
      var game = (f.game || "Skwibble").toString().trim() || "Skwibble"; // legacy rows have no game
      var sheet = getGameSheet_(ss, game);
      sheet.appendRow([
        new Date(f.ts || Date.now()),
        game,
        code,
        f.gameDate || "",
        f.name || "",
        f.rating || "",
        f.comment || "",
      ]);
      synced[key] = true;
      added++;
    });
  });

  saveSyncedSet_(ss, synced);
  ss.toast(added + " new feedback row(s) added.");
}

function getGameSheet_(ss, game) {
  var tabName = (game + " Feedback").substring(0, 90);
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
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
