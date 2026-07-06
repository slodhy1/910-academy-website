/**
 * /aoc/livedemo — Google Sheets sync endpoint (Apps Script Web App).
 *
 * TABS (auto-created):
 *   "Call List"     — phone leads (team reaches out)
 *   "Team Calls"    — MID ($1k–$5k) live-demo bookings   (destination "team")
 *   "Claudio Calls" — HIGH ($5k+) bookings               (destination "existing")
 * Booked status starts "Routed", flips to "Booked" when the booking completes.
 *
 * SETUP / UPDATE (about 2 minutes)
 *  1. In your Sheet: Extensions -> Apps Script. Replace the whole file with this,
 *     keeping your own SECRET value on the line below.
 *  2. (Optional) Run the `initSheets` function once (Run menu) to create the tabs now.
 *  3. Deploy -> Manage deployments -> edit (pencil icon) -> Version: "New version"
 *     -> Deploy. The Web app /exec URL stays the same (no env change needed).
 *  4. You can delete the old "Booked Calls" tab once the new tabs are in use.
 */

var SECRET = "PASTE_THE_SECRET_HERE";
var CALL_TAB = "Call List";
var TEAM_TAB = "Team Calls";        // MID  -> destination "team"
var CLAUDIO_TAB = "Claudio Calls";  // HIGH -> destination "existing"
var BOOKED_TABS = [TEAM_TAB, CLAUDIO_TAB];
var HEADERS = ["Timestamp", "Submission ID", "Name", "Email", "Phone",
  "Q1: Time in business", "Q2: Monthly earnings", "Q3: Focus areas",
  "Q4: Willing to invest", "Bucket", "Destination", "Status"];

// Run this once from the editor to create all tabs + headers immediately.
function initSheets() {
  sheetFor(CALL_TAB);
  sheetFor(TEAM_TAB);
  sheetFor(CLAUDIO_TAB);
}

// Which booked tab a lead belongs to (MID team-demo vs HIGH Claudio call).
function bookedTabFor(destination) {
  return destination === "team" ? TEAM_TAB : CLAUDIO_TAB;
}

// Get-or-create a tab, ensuring the bold, frozen header row exists.
function sheetFor(tabName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(tabName) || ss.insertSheet(tabName);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (!body || body.secret !== SECRET) {
      return json({ ok: false, error: "unauthorized" });
    }
    if (body.action === "append") return handleAppend(body);
    if (body.action === "update") return handleUpdate(body);
    return json({ ok: false, error: "unknown action" });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// Friendly status endpoint (the site only POSTs): lists tabs + row counts.
function doGet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rows = {};
  [CALL_TAB, TEAM_TAB, CLAUDIO_TAB].forEach(function (t) {
    var s = ss.getSheetByName(t);
    rows[t] = s ? Math.max(s.getLastRow() - 1, 0) : null;
  });
  return json({ ok: true, service: "aoc-livedemo-sheets", rows: rows });
}

function handleAppend(b) {
  var tab = b.outcome === "booked" ? bookedTabFor(b.destination) : CALL_TAB;
  var sheet = sheetFor(tab);
  // Idempotency: skip if this submissionId is already present (col B).
  if (findRowById(sheet, b.submissionId) > 0) return json({ ok: true, deduped: true, tab: tab });
  sheet.appendRow([
    new Date(), b.submissionId, b.fullName, b.email, b.phone,
    b.q1, b.q2, b.q3, b.q4, b.bucket, b.destination, b.status || "",
  ]);
  return json({ ok: true, tab: tab });
}

function handleUpdate(b) {
  // The status flip carries no destination, so search both booked tabs.
  for (var i = 0; i < BOOKED_TABS.length; i++) {
    var sheet = sheetFor(BOOKED_TABS[i]);
    var row = findRowById(sheet, b.submissionId);
    if (row > 0) {
      sheet.getRange(row, 12).setValue(b.status || "Booked"); // col 12 = Status
      return json({ ok: true, updated: true, tab: BOOKED_TABS[i] });
    }
  }
  return json({ ok: true, updated: false });
}

function findRowById(sheet, id) {
  if (!id) return -1;
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var ids = sheet.getRange(2, 2, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
