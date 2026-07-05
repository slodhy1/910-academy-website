// Non-blocking Google Sheets sync for /aoc/livedemo via a Google Apps Script Web App.
// One webhook URL, two actions:
//   append -> add a row to the "Call List" (phone) or "Booked Calls" (calendly) tab
//   update -> find the Booked Calls row by submissionId and set its status
// If the env vars are unset, every call is a no-op: Supabase + email remain the record.

export type SheetAppend = {
  action: "append";
  submissionId: string;
  fullName: string;
  email: string;
  phone: string;
  q1: string;
  q2: string;
  q3: string; // comma-joined
  q4: string;
  bucket: string; // LOW | MID | HIGH
  destination: string; // phone | team | existing
  outcome: string; // phone | booked
  status: string; // "" for phone, "Routed" for booked
};

export type SheetUpdate = {
  action: "update";
  submissionId: string;
  status: string; // "Booked"
  bookedAt: string; // ISO
};

export async function syncLivedemoSheet(payload: SheetAppend | SheetUpdate): Promise<void> {
  const url = process.env.AOC_LIVEDEMO_SHEETS_WEBHOOK_URL;
  const secret = process.env.AOC_LIVEDEMO_SHEETS_SECRET;
  if (!url || !secret) return; // sheets sync disabled

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, secret }),
    });
    if (!res.ok) console.error("[livedemo-sheets] non-2xx:", res.status);
  } catch (e) {
    console.error("[livedemo-sheets] failed:", e instanceof Error ? e.message : String(e));
  }
}
