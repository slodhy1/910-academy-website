/**
 * /aoc/livedemo — Google Sheets sync endpoint.
 *
 * SETUP
 *  1. Create a Google Sheet with two tabs named exactly:  Call List   Booked Calls
 *     Put this header row (row 1) on BOTH tabs:
 *       Timestamp | Submission ID | Name | Email | Phone | Q1 | Q2 | Q3 | Q4 | Bucket | Destination | Status
 *  2. Extensions -> Apps Script. Paste this file. Set SECRET below to a long random string.
 *  3. Deploy -> New deployment -> Web app. Execute as: Me. Who has access: Anyone.
 *     Copy the Web app URL.
 *  4. In the site env: AOC_LIVEDEMO_SHEETS_WEBHOOK_URL = that URL,
 *     AOC_LIVEDEMO_SHEETS_SECRET = the same SECRET string.
 *
 * Tabs: phone leads go to "Call List"; Calendly leads go to "Booked Calls"
 * (status starts "Routed", flips to "Booked" when the booking completes).
 */

var SECRET = "PASTE_A_LONG_RANDOM_STRING_HERE";
var CALL_TAB = "Call List";
var BOOKED_TAB = "Booked Calls";

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

function handleAppend(b) {
  var tabName = b.outcome === "booked" ? BOOKED_TAB : CALL_TAB;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(tabName);
  // Idempotency: skip if this submissionId is already present (col B).
  if (findRowById(sheet, b.submissionId) > 0) return json({ ok: true, deduped: true });
  sheet.appendRow([
    new Date(), b.submissionId, b.fullName, b.email, b.phone,
    b.q1, b.q2, b.q3, b.q4, b.bucket, b.destination, b.status || "",
  ]);
  return json({ ok: true });
}

function handleUpdate(b) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BOOKED_TAB);
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
