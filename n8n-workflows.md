# n8n Workflows — 910 Academy

This document describes the n8n workflows that power the 910 Academy website forms, plus the Supabase schemas they write to.

---

## Workflow 1: Coaching Application

**Trigger source:** `coaching.html` form (`WEBHOOK_URL` in page script)

### Nodes
1. **Webhook (POST)** — receives JSON:
   ```json
   {
     "full_name": "string",
     "email": "string",
     "instagram": "string",
     "revenue_level": "string",
     "biggest_challenge": "string",
     "ninety_day_goal": "string",
     "referral_source": "string",
     "submitted_at": "ISO-8601 timestamp"
   }
   ```
   - Response mode: `Respond immediately` (200 OK) so the browser fetch resolves.
2. **Supabase — Insert Row**
   - Table: `coaching_applications`
   - Map each webhook field to its matching column. `status` defaults to `'new'` in the DB.
3. **Email (SMTP / Gmail node)**
   - To: `academy@studio910pb.com`
   - Subject: `New coaching application — {{ $json.full_name }}`
   - Body: formatted summary of all fields (name, email, Instagram, revenue level, biggest challenge, 90-day goal, referral source, submitted_at).
4. **(Future) Slack Notification**
   - Post a short summary to the internal Slack channel with a link to the Supabase row.

---

## Workflow 2: Email List Capture (910 Colors LUT opt-in)

**Trigger source:** `index.html` homepage email form (`EMAIL_WEBHOOK_URL`)

> **TODO (Shayan):** the homepage email capture is now positioned as a free LUT opt-in.
> The n8n workflow should:
> 1. Insert email into Supabase `email_subscribers` table (with `source: "homepage_lut_optin"`).
> 2. Send an automated email to the submitter with the 910 Colors LUT download link.
>    - **Subject:** `Your 910 Colors LUT is ready`
>    - **Body:** short message containing the download link (link to be added by Shayan).

### Nodes
1. **Webhook (POST)** — receives JSON:
   ```json
   {
     "email": "string",
     "submitted_at": "ISO-8601 timestamp",
     "source": "homepage_lut_optin"
   }
   ```
   - Response mode: `Respond immediately`.
2. **Supabase — Insert Row**
   - Table: `email_subscribers`
   - Map `email` and `source`. The `unique` constraint on `email` will reject duplicates, configure the node to ignore conflicts (upsert or on-conflict-do-nothing).
3. **Send LUT Email (SMTP / Gmail node)**
   - To: `{{ $json.email }}`
   - From: `academy@studio910pb.com`
   - Subject: `Your 910 Colors LUT is ready`
   - Body: short HTML message with the download link to the 910 Colors LUT. **TODO:** Shayan to provide the hosted LUT URL (Google Drive / Dropbox / Supabase Storage / etc.).
4. **(Future) Email Marketing Tool**
   - Push the subscriber to ConvertKit / Mailchimp / Beehiiv via their native n8n node.

---

## Supabase Schemas

Run these in the Supabase SQL editor.

### `coaching_applications`

```sql
create table public.coaching_applications (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  full_name text not null,
  email text not null,
  instagram text,
  revenue_level text,
  biggest_challenge text,
  ninety_day_goal text,
  referral_source text,
  status text default 'new',
  admin_notes text
);
```

### `email_subscribers`

```sql
create table public.email_subscribers (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  email text not null unique,
  source text
);
```

---

## Workflow 3 — Mentorship Waitlist

**Trigger:** Webhook (POST, JSON body from `waitlist.html`)

**Nodes:**
1. Webhook — Method POST, path `/mentorship-waitlist`, response mode `onReceived`.
2. Supabase — Insert into `mentorship_waitlist` with mapped fields.
3. Send Email (SMTP / Gmail) — Notification to `academy@studio910pb.com` with all submitted fields.

**Supabase schema:**

```sql
create table mentorship_waitlist (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  full_name text not null,
  email text not null,
  instagram text,
  revenue_level text,
  focus_area text,
  status text default 'waitlisted'
);
```

---

## Deployment checklist

- [ ] Create all Supabase tables.
- [ ] Build all n8n workflows and activate them.
- [ ] Copy the production webhook URLs from n8n.
- [ ] Replace `REPLACE_WITH_N8N_WEBHOOK_URL` in `coaching.html`.
- [ ] Replace `REPLACE_WITH_N8N_EMAIL_WEBHOOK_URL` in `index.html`.
- [ ] Replace `REPLACE_WITH_N8N_WAITLIST_WEBHOOK_URL` in `waitlist.html`.
- [ ] Redeploy the site.
- [ ] Submit a test application and a test email to confirm end-to-end delivery.
