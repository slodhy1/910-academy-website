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

// Upserts one row (keyed by submissionId) in the analytics "Funnel" tab, setting only
// the fields present. Called at survey_started, survey_completed, and booked.
export type SheetFunnel = {
  action: "funnel";
  submissionId: string;
  abVariant?: string; // 'A' | 'B'
  bucket?: string; // HIGH | MID | LOW (set at completion)
  destination?: string; // phone | team | existing
  startedAt?: string; // ISO
  completedAt?: string; // ISO
  bookedAt?: string; // ISO
  status?: string; // 'Booked'
};

// A Calendly booking whose email did not match any lead: kept visible, never dropped.
export type SheetFunnelUnmatched = {
  action: "funnel_unmatched";
  email: string;
  name?: string;
  bookedAt: string; // ISO
  source?: string; // calendly event type / calendar, best-effort
};

export async function syncLivedemoSheet(
  payload: SheetAppend | SheetUpdate | SheetFunnel | SheetFunnelUnmatched
): Promise<void> {
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
