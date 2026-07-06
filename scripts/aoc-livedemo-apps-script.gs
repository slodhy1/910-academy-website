/**
 * /aoc/livedemo — Google Sheets sync endpoint (Apps Script Web App).
 *
 * SETUP (about 3 minutes)
 *  1. Create a new blank Google Sheet (sheet.new). The tabs + headers are created
 *     automatically — you do NOT need to set them up by hand.
 *  2. Extensions -> Apps Script. Delete the sample code, paste THIS whole file.
 *  3. Set SECRET below to the long random string you were given (must match the
 *     AOC_LIVEDEMO_SHEETS_SECRET env var on the site).
 *  4. (Optional) Run the `initSheets` function once (Run menu) to create the two
 *     tabs immediately and authorise the script. Grant access when prompted.
 *  5. Deploy -> New deployment -> gear icon -> Web app.
 *       Execute as: Me    ·    Who has access: Anyone
 *     Click Deploy, authorise, and COPY the "Web app" URL (ends in /exec).
 *  6. Send that URL back; it becomes AOC_LIVEDEMO_SHEETS_WEBHOOK_URL on the site.
 *
 * Tabs: phone leads -> "Call List";  Calendly leads -> "Booked Calls"
 * (Booked Calls status starts "Routed", flips to "Booked" when the booking completes).
 */

var SECRET = "PASTE_THE_SECRET_HERE";
var CALL_TAB = "Call List";
var BOOKED_TAB = "Booked Calls";
var HEADERS = ["Timestamp", "Submission ID", "Name", "Email", "Phone",
  "Q1: Time in business", "Q2: Monthly earnings", "Q3: Focus areas",
  "Q4: Willing to invest", "Bucket", "Destination", "Status"];

// Run this once from the editor to create both tabs + headers immediately.
function initSheets() {
  sheetFor(CALL_TAB);
  sheetFor(BOOKED_TAB);
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

// Friendly response if the URL is opened in a browser (the site only POSTs).
function doGet() {
  return json({ ok: true, service: "aoc-livedemo-sheets" });
}

function handleAppend(b) {
  var sheet = sheetFor(b.outcome === "booked" ? BOOKED_TAB : CALL_TAB);
  // Idempotency: skip if this submissionId is already present (col B).
  if (findRowById(sheet, b.submissionId) > 0) return json({ ok: true, deduped: true });
  sheet.appendRow([
    new Date(), b.submissionId, b.fullName, b.email, b.phone,
    b.q1, b.q2, b.q3, b.q4, b.bucket, b.destination, b.status || "",
  ]);
  return json({ ok: true });
}

function handleUpdate(b) {
  var sheet = sheetFor(BOOKED_TAB);
  var row = findRowById(sheet, b.submissionId);
  if (row > 0) sheet.getRange(row, 12).setValue(b.status || "Booked"); // col 12 = Status
  return json({ ok: true, updated: row > 0 });
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
