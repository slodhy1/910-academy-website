/**
 * 910 Academy — Email capture → Google Sheet
 *
 * Setup:
 *  1. Create a new Google Sheet. Rename the first tab to "Sheet1" (default).
 *  2. Extensions → Apps Script. Delete boilerplate and paste this file.
 *  3. Deploy → New deployment → Type: Web app.
 *       - Execute as: Me
 *       - Who has access: Anyone
 *  4. Copy the Web App URL.
 *  5. In index.html, replace APPS_SCRIPT_URL with that URL.
 *
 * The homepage posts FormData with `email` and `source`. The fetch uses
 * mode: 'no-cors' so no response is read — we just append and return OK.
 */
function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sheet1');
    var email = (e.parameter.email || '').toString().trim();
    var source = (e.parameter.source || 'unknown').toString();
    if (!email) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'missing email' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    sheet.appendRow([new Date(), email, source]);
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService.createTextOutput('910 Academy email endpoint OK');
}
