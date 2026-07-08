/**
 * /aoc/livedemo — Google Sheets sync endpoint (Apps Script Web App).
 *
 * TABS (auto-created):
 *   "Call List"     — phone leads (team reaches out)
 *   "Team Calls"    — MID ($1k–$5k) live-demo bookings   (destination "team")
 *   "Claudio Calls" — HIGH ($5k+) bookings               (destination "existing")
 *   "Funnel"        — A/B analytics: one row per lead, variant-stamped, lifecycle timestamps
 *   "Unmatched"     — Calendly bookings whose email matched no lead
 *   "A/B Summary"   — formula report (booking rate per variant + sample-size caution)
 * Booked status starts "Routed", flips to "Booked" when the booking completes.
 *
 * After pasting this, run initSheets() once (Run menu) to create the new tabs +
 * the A/B Summary. Re-run buildSummary() any time to rebuild just the summary tab.
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

// --- A/B funnel analytics (added for the interstitial-vs-direct test) ---
var FUNNEL_TAB = "Funnel";        // one row per lead, variant-stamped, lifecycle timestamps
var UNMATCHED_TAB = "Unmatched";  // Calendly bookings whose email matched no lead
var SUMMARY_TAB = "A/B Summary";  // formula report Ryan reads
var FUNNEL_HEADERS = ["Submission ID", "Variant", "Bucket", "Destination",
  "Started At", "Completed At", "Booked At", "Status"];
var UNMATCHED_HEADERS = ["Booked At", "Email", "Name", "Source"];

// Run this once from the editor to create all tabs + headers immediately.
function initSheets() {
  sheetFor(CALL_TAB);
  sheetFor(TEAM_TAB);
  sheetFor(CLAUDIO_TAB);
  sheetForHeaders(FUNNEL_TAB, FUNNEL_HEADERS);
  sheetForHeaders(UNMATCHED_TAB, UNMATCHED_HEADERS);
  buildSummary();
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
    if (body.action === "funnel") return handleFunnel(body);
    if (body.action === "funnel_unmatched") return handleFunnelUnmatched(body);
    return json({ ok: false, error: "unknown action" });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// Friendly status endpoint (the site only POSTs): lists tabs + row counts.
function doGet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rows = {};
  [CALL_TAB, TEAM_TAB, CLAUDIO_TAB, FUNNEL_TAB, UNMATCHED_TAB].forEach(function (t) {
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
  return findRowByIdCol(sheet, id, 2); // Call/Team/Claudio tabs keep submission id in col B
}

// Generalised: find a row whose id lives in an arbitrary column (Funnel tab uses col A).
function findRowByIdCol(sheet, id, col) {
  if (!id) return -1;
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var ids = sheet.getRange(2, col, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

// Get-or-create a tab with an explicit header row (Funnel/Unmatched have their own headers).
function sheetForHeaders(tabName, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(tabName) || ss.insertSheet(tabName);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Upsert one Funnel row (keyed by submissionId in col A); set only the provided fields.
function handleFunnel(b) {
  var sheet = sheetForHeaders(FUNNEL_TAB, FUNNEL_HEADERS);
  var row = findRowByIdCol(sheet, b.submissionId, 1);
  if (row < 0) {
    sheet.appendRow([b.submissionId, "", "", "", "", "", "", ""]);
    row = sheet.getLastRow();
  }
  if (b.abVariant)   sheet.getRange(row, 2).setValue(b.abVariant);
  if (b.bucket)      sheet.getRange(row, 3).setValue(b.bucket);
  if (b.destination) sheet.getRange(row, 4).setValue(b.destination);
  if (b.startedAt)   sheet.getRange(row, 5).setValue(b.startedAt);
  if (b.completedAt) sheet.getRange(row, 6).setValue(b.completedAt);
  if (b.bookedAt)    sheet.getRange(row, 7).setValue(b.bookedAt);
  if (b.status)      sheet.getRange(row, 8).setValue(b.status);
  return json({ ok: true, tab: FUNNEL_TAB, row: row });
}

// A booking whose email matched no lead: keep it visible for manual reconciliation.
function handleFunnelUnmatched(b) {
  var sheet = sheetForHeaders(UNMATCHED_TAB, UNMATCHED_HEADERS);
  sheet.appendRow([b.bookedAt || new Date(), b.email || "", b.name || "", b.source || ""]);
  return json({ ok: true, tab: UNMATCHED_TAB });
}

// Build/refresh the two-section A/B report. Formulas recompute live from the Funnel tab.
// Run from the editor (or via initSheets) whenever you want to (re)create the tab.
function buildSummary() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName(SUMMARY_TAB) || ss.insertSheet(SUMMARY_TAB);
  s.clear();
  var F = FUNNEL_TAB; // Funnel cols: B=Variant, C=Bucket, F=Completed At, G=Booked At, E=Started At
  function cif() { return "=COUNTIFS(" + Array.prototype.join.call(arguments, ",") + ")"; }

  s.getRange("A1").setValue("A/B Test - Booking Funnel").setFontWeight("bold").setFontSize(14);
  s.getRange("A2").setValue("Live from the Funnel tab. Booking rate = booked / completed. Excludes phone leads and unmatched bookings.");
  s.getRange("A4:C4").setValues([["Metric", "Variant A (interstitial)", "Variant B (direct)"]]).setFontWeight("bold");

  s.getRange("A5:C10").setValues([
    ["Survey started",   cif(F + "!B:B", '"A"', F + "!E:E", '"<>"'), cif(F + "!B:B", '"B"', F + "!E:E", '"<>"')],
    ["Survey completed", cif(F + "!B:B", '"A"', F + "!F:F", '"<>"'), cif(F + "!B:B", '"B"', F + "!F:F", '"<>"')],
    ["Booked",           cif(F + "!B:B", '"A"', F + "!G:G", '"<>"'), cif(F + "!B:B", '"B"', F + "!G:G", '"<>"')],
    ["Drop-off  started to completed", '=IF(B5=0,"-",1-B6/B5)', '=IF(C5=0,"-",1-C6/C5)'],
    ["Drop-off  completed to booked",  '=IF(B6=0,"-",1-B7/B6)', '=IF(C6=0,"-",1-C7/C6)'],
    ["BOOKING RATE (booked / completed)", '=IF(B6=0,"-",B7/B6)', '=IF(C6=0,"-",C7/C6)'],
  ]);
  s.getRange("B8:C9").setNumberFormat("0.0%");
  s.getRange("B10:C10").setNumberFormat("0.0%").setFontWeight("bold");

  // Per-bucket split (completed + booked + rate) for HIGH and MID.
  function done(v, bk) { return cif(F + "!B:B", '"' + v + '"', F + "!C:C", '"' + bk + '"', F + "!F:F", '"<>"'); }
  function bkd(v, bk) { return cif(F + "!B:B", '"' + v + '"', F + "!C:C", '"' + bk + '"', F + "!G:G", '"<>"'); }
  s.getRange("A12").setValue("Split by bucket").setFontWeight("bold");
  s.getRange("A13:C18").setValues([
    ["HIGH completed", done("A", "HIGH"), done("B", "HIGH")],
    ["HIGH booked",    bkd("A", "HIGH"),  bkd("B", "HIGH")],
    ["HIGH booking rate", '=IF(B13=0,"-",B14/B13)', '=IF(C13=0,"-",C14/C13)'],
    ["MID completed",  done("A", "MID"),  done("B", "MID")],
    ["MID booked",     bkd("A", "MID"),   bkd("B", "MID")],
    ["MID booking rate", '=IF(B16=0,"-",B17/B16)', '=IF(C16=0,"-",C17/C16)'],
  ]);
  s.getRange("B15:C15").setNumberFormat("0.0%");
  s.getRange("B18:C18").setNumberFormat("0.0%");

  // Headline: winner + sample-size caution (30 completed per arm).
  s.getRange("A20").setValue("Result").setFontWeight("bold");
  s.getRange("A21").setFormula(
    '=IF(OR(B6<30,C6<30),"Not yet conclusive - sample too small (need 30+ completed per variant).",' +
    'IF(B10>C10,"Variant A leading: "&TEXT(B10,"0.0%")&" vs "&TEXT(C10,"0.0%"),' +
    'IF(C10>B10,"Variant B leading: "&TEXT(C10,"0.0%")&" vs "&TEXT(B10,"0.0%"),' +
    '"Tied at "&TEXT(B10,"0.0%")&".")))'
  );
  s.getRange("A22").setValue("Unmatched bookings (email did not match a lead)");
  s.getRange("B22").setFormula("=MAX(0,COUNTA(Unmatched!A:A)-1)");
  s.setColumnWidth(1, 260); s.setColumnWidth(2, 190); s.setColumnWidth(3, 190);
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
