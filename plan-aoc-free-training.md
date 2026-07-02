# Plan — /aoc/free-training (24-hour expiring free-training funnel)

> **Phase 2 — plan only. No code written.** Builds on `research-aoc-free-training.md`. This is the implementation spec for a single, self-contained static page at `public/aoc/free-training.html`, native to the `/aoc/join` design system, with a **real** fixed-deadline expiry gate. Phase 3 (build) starts only after you approve this.

---

## 1. Deliverables & files touched

| File | Change |
|---|---|
| `public/aoc/free-training.html` | **New** — the entire page (self-contained: HTML + inline `<style>` + inline `<script>`). |
| `next.config.ts` | **One line** added to `rewrites()`: `{ source: "/aoc/free-training", destination: "/aoc/free-training.html" }` — dev-parity only (prod uses `cleanUrls`). Lands with the page. |

Nothing else. `public/aoc/join.html` is **not** modified. No new assets required (OG image reuses an existing file; Vimeo is remote).

---

## 2. Page structure (top → bottom, exactly per brief)

Two sibling containers inside `<main>` — a **live** funnel and an **expired** state — plus a shared footer. Only one container is ever visible (CSS-gated, see §4).

```
<html>  ← head inline script may add class="ft-expired" (no-FOUC gate, §4)
<body>
  <main class="ft">

    <!-- ============ LIVE STATE (default) ============ -->
    <section class="ft-live">
      1. VIDEO (hero, above the fold)
         .video-embed > <iframe data-src="…vimeo…">   ← src injected by JS only when live
      2. HEADLINE (non-time) + SUBHEAD
         h1: [PLACEHOLDER — non-time hook; time pressure lives in the countdown, not the headline]
         p.ft-sub: [PLACEHOLDER — Claudio's line, ~"Do you want to keep this training, plus so much more?"]
      3. COUNTDOWN TIMER
         "Training expires in" + live HH:MM:SS (ticks to fixed EXPIRY)
      4. WHAT'S IN THE TRAINING
         h2 + [PLACEHOLDER copy — seeded from the Higgsfield/AI-editing description, flagged placeholder]
      5. PRIMARY CTA
         a.ft-cta "Join 910 Academy" → https://www.skool.com/910-academy/about?ref=301e640acfa44e85b6a6a11761baaf6d
         (framing line: keep this training + everything else inside Skool)
    </section>

    <!-- ============ EXPIRED STATE (hidden until EXPIRY) ============ -->
    <section class="ft-expired">
         h1: "This free training has closed."
         p: [PLACEHOLDER — "…join 910 Academy to get it back + everything else"]
         a.ft-cta "Join 910 Academy" → https://www.skool.com/910-academy/about?ref=301e640acfa44e85b6a6a11761baaf6d
      (NO video, NO countdown in this state.)
    </section>

  </main>

  <!-- 6. FOOTER (verbatim from join.html) -->
  <footer class="footer">…logo + YouTube/IG/Facebook + copy…</footer>

  <script> /* countdown + expire() gate */ </script>
</body>
```

**Section order matches the brief exactly:** video → headline/expiry → countdown → what's-in-it → CTA → footer.

**Optional (flagged, off by default):** a second CTA directly under the video/countdown often lifts conversion. Brief specifies one primary CTA after "what's in the training," so I'll build that; say the word to add a secondary one under the countdown.

---

## 3. Styling — port a lean subset from join.html (stay native, stay light)

New page is self-contained. Rather than duplicate join.html's ~2,000 lines of CSS (much is dead here), **copy only these blocks/classes** so it looks native but stays lean and mobile-first:

| Port from join.html | What it gives |
|---|---|
| `@font-face` (Montserrat 300/400/500/700) + the two `<link rel="preload">` font tags | self-hosted fonts, no CDN |
| `:root` design tokens (colors, `--space-*`, `--radius-*`, `--ease-out`, glass/shadow) | the whole token system (`#0a0a0a` bg, `#38B6FF` accent) |
| base reset: `*{box-sizing}`, `body` (bg/font/`--fg`), `img,video,iframe{max-width:100%}`, heading/`a`/`button` resets | consistent baseline |
| **`.video-embed` + `.video-embed iframe`** (lines 1751–1767) | responsive **16:9, no overflow** wrapper for the Vimeo iframe |
| `.section` / `.section-label` / `.section-heading` / `.section-sub` | the standard section header stack |
| **`.hero-cta`** button styles + `@keyframes fadeUp` | the primary blue CTA button (reused as `.ft-cta`) |
| **`.hero-timer` / `.deal-label` / `.deal-timer`** (lines 2283–2287) | the on-brand big-accent countdown visual (styling only — logic is replaced, see §4/§5) |
| `.footer` / `.footer-logo` / `.footer-socials` / `.footer-copy` / `.footer-credit-link` | footer, verbatim |

Page-specific CSS (new, small): `.ft` wrapper layout (centered column, max-width ~760–860px, vertical rhythm), `.ft-live`/`.ft-expired` show/hide rules (§4), `.ft-sub`, and the "what's in the training" block.

**Layout:** single centered column, mobile-first. Video is full-width of the column at the top (16:9 via `.video-embed`). Comfortable padding; generous top space so the video sits nicely above the fold on phones. No horizontal scroll at any width (guaranteed by `.video-embed` + `max-width:100%`).

---

## 4. Expiry gate — the important part (real, not cosmetic)

### 4.1 One constant, one source of truth
At the **very top of the file**, in a small inline `<head>` script, define the deadline **once**:

```html
<script>
  /* ==================================================================
     FREE-TRAINING EXPIRY — EDIT THIS ONE LINE ONLY.
     ISO-8601 with explicit timezone offset. Same deadline for everyone
     (it's an absolute instant, independent of the visitor's timezone).
     FINALIZED: midnight Eastern at the START of Fri Jul 4, 2026 (~48h window).
     NY observes daylight time (EDT = UTC-4) in July, so midnight Eastern = -04:00.
     ================================================================== */
  var EXPIRY = "2026-07-04T00:00:00-04:00";

  window.__FT_TARGET__ = Date.parse(EXPIRY);              // absolute ms
  // No-FOUC gate: decide state BEFORE the body paints.
  if (Date.now() >= window.__FT_TARGET__) {
    document.documentElement.classList.add("ft-expired");
  }
</script>
```
The body countdown script (bottom of page) reads `window.__FT_TARGET__` — **the constant is never written twice.**

### 4.2 CSS does the show/hide (no flash of wrong state)
```css
.ft-expired { display: none; }                 /* expired block hidden while live */
html.ft-expired .ft-live    { display: none; } /* after EXPIRY: live funnel gone… */
html.ft-expired .ft-expired { display: block; }/* …expired state shown */
```
Because the `html.ft-expired` class is set in `<head>` **before** the body renders, an expired visitor **never sees a flash** of the video/countdown — the live section is `display:none` from first paint.

### 4.3 The video genuinely does not load/play after expiry (belt + suspenders)
- The Vimeo iframe ships with **`data-src`, no `src`** → the browser makes **no request to Vimeo** until JS promotes it.
- JS promotes `data-src` → `src` **only if not expired**. So an expired visitor's iframe never gets a `src` — it never loads or plays. (Combined with §4.2's `display:none`, it's doubly gated.)
- When the countdown hits zero **while someone is watching**, `expire()` also **clears the iframe `src`** (stops playback/audio) before hiding it.

### 4.4 Gate fires on load AND on tick-zero (one shared function)
```js
(function () {
  var TARGET = window.__FT_TARGET__;
  var live    = document.querySelector('.ft-live');
  var iframe  = document.querySelector('.ft-live .video-embed iframe');
  var timerEl = document.getElementById('ftTimer');
  var ticker  = null;

  function expire() {
    if (iframe) iframe.src = '';                      // stop + unload the video
    document.documentElement.classList.add('ft-expired'); // CSS swaps to expired state
    if (ticker) { clearInterval(ticker); ticker = null; }
  }

  // ON LOAD:
  if (Date.now() >= TARGET) { expire(); return; }     // already closed → never load video
  if (iframe && iframe.dataset.src) iframe.src = iframe.dataset.src; // live → load the video

  function pad(n){ return (n<10?'0':'')+n; }
  function tick() {
    var diff = TARGET - Date.now();
    if (diff <= 0) { timerEl.textContent = '00:00:00'; expire(); return; } // ON ZERO
    var s = Math.floor(diff/1000);
    var h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
    timerEl.textContent = pad(h)+':'+pad(m)+':'+pad(sec);                  // HH:MM:SS
  }
  tick();
  ticker = setInterval(tick, 1000);
})();
```
This mirrors the **existing** fixed-deadline pattern in `public/aoc.html` (lines 758–784) — proven on this site — inverted so zero → hide video + show closed state.

### 4.5 Security caveat (acknowledged, acceptable)
Client-side only, **not cryptographically secure**: the Vimeo player URL is in page source, so a determined visitor could extract and play it after expiry, and a badly-skewed clock skews the countdown. That's fine for this funnel — the goal is to gate normal visitors. No `localStorage`, no per-visitor logic; **fixed deadline, same for everyone.**

---

## 5. Countdown display

- **Format:** `HH:MM:SS` (hours accumulate past 24 if EXPIRY is >1 day out — no rollover cap), rendered in the on-brand `.hero-timer` visual ported from join.html: uppercase `.deal-label` "Training expires in" + big `#38B6FF` `.deal-timer` with `tabular-nums`. Reads urgent and native.
- **Alternative** (say the word): the 4-segment `Days / Hrs / Min / Sec` markup from `levels.html`. I recommend `HH:MM:SS` for a ≤24h window.
- **Honesty note about "24 hours":** the deadline is fixed and shared, so a visitor arriving 20h after publish sees ~4h on the timer, not 24. The `<h1>` "expires in 24 hours" is the *window framing / promise*; the timer shows *true* remaining time. This is the intended trade-off of a fixed deadline (per brief). If you'd rather the headline never contradict the timer, we can soften it to "expires in less than 24 hours" / "expires soon" — a **copy decision for you**, not a code change.

---

## 6. Video embed (from research §3C)

```html
<div class="video-embed">
  <iframe
    data-src="https://player.vimeo.com/video/1164998439?h=258b8faaea&badge=0&autopause=0&player_id=0&app_id=58479"
    title="910 Academy — Free AI Editing Training"
    allow="autoplay; fullscreen; picture-in-picture"
    allowfullscreen loading="eager"></iframe>
</div>
```
- ID `1164998439` + privacy hash `h=258b8faaea` (required for the unlisted video).
- **`data-src`, not `src`** — so JS controls loading per the gate (§4.3).
- **Autoplay: OFF** (recommended) — it's a training video, viewer presses play. Flip to autoplay-muted if you prefer (add `&autoplay=1&muted=1` and `muted` semantics) — a **decision for you**.

---

## 7. `<head>` / meta / SEO

Reuse join.html's meta scaffold, with free-training values:
- `<title>` — draft: **"Free AI Editing Training — 910 Academy"** `[PLACEHOLDER-ish; confirm]`
- `<meta name="description">` — `[PLACEHOLDER]`
- `og:url` = `https://www.910academy.com/aoc/free-training`; `og:title`/`og:description` mirror above; `og:image` = reuse existing `/images/aoc-og.jpg` (exists) unless you want a custom one.
- Favicon/apple-touch = `/logo-white.svg` (same as join.html).
- **Robots decision:** recommend `<meta name="robots" content="noindex,follow">` — it's a temporary, expiring funnel page for direct/paid traffic, not organic search. Confirm or override.

---

## 8. Build order & commits (two, per brief)

**Commit 1 — "page built" (live state + ticking countdown):**
- Create `public/aoc/free-training.html`: head/meta, ported CSS subset, LIVE section (video via `data-src`, headline+subhead, countdown visual, what's-in-it, CTA), footer.
- Countdown ticks to `EXPIRY` (live HH:MM:SS). Video loads/plays.
- Add the `next.config.ts` rewrite.
- Message: `aoc/free-training: add 24h expiring free-training landing page (Vimeo + countdown + Skool CTA)`

**Commit 2 — "expiry logic works" (the gate):**
- Add the `<head>` no-FOUC constant/gate, the `.ft-expired` section + show/hide CSS, `data-src`→`src` promotion, and `expire()` (clears video + swaps state) on both load and tick-zero.
- Message: `aoc/free-training: wire fixed-deadline expiry gate (hide video + show closed state after EXPIRY)`

---

## 9. Verification (before each commit; done in Phase 3, not now)

Run `next dev`, open `http://localhost:3000/aoc/free-training`:

**Live state**
- Video renders, is responsive 16:9, **no horizontal overflow** at 375px / 768px / 1280px.
- Countdown ticks every second toward EXPIRY; CTA href = `https://www.skool.com/910-academy/about?ref=301e640acfa44e85b6a6a11761baaf6d`, opens new tab.

**Expiry gate — tested without waiting 24h:**
1. Set `EXPIRY` to a **past** time → reload → **no network request to `player.vimeo.com`** (check devtools/Network), live section absent, "This free training has closed." + CTA shown.
2. Set `EXPIRY` to **~30s out** → watch the timer hit `00:00:00` → confirm it flips to the closed state and video playback stops.
3. **Restore the real `EXPIRY`.**
- Verify with Chrome automation (screenshot both states, confirm the Network tab shows no Vimeo request in the expired case).

---

## 10. Decisions — FINALIZED (build to these)

1. **`EXPIRY`** — ✔ `2026-07-04T00:00:00-04:00` (midnight ET, start of Fri Jul 4, 2026; ~48h window). Single editable constant.
2. **Autoplay** — ✔ OFF (press-to-play).
3. **Countdown format** — ✔ `HH:MM:SS`, join.html big-accent `.hero-timer` styling.
4. **Headline** — ✔ **non-time** (no "24 hours" claim); the countdown carries the time pressure. H1 copy stays `[PLACEHOLDER]`. **Skool CTA** = affiliate `…/about?ref=301e640acfa44e85b6a6a11761baaf6d` on every button.
5. **Robots** — ✅ `noindex,follow`. Or index it?
6. **Secondary CTA under the video** — ✅ no (one primary CTA per brief). Add one?
7. **Placeholder copy** — subhead, "what's in the training," and expired-state body stay `[PLACEHOLDER]`; I'll seed the "what's in the training" block from your Higgsfield description and clearly mark it placeholder until you finalize.

---

## Open command

```
open plan-aoc-free-training.md
```

*End of Phase 2 plan. Stopping for review before Phase 3 (build).*
