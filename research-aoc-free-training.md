# Research — /aoc/free-training (24-hour expiring free-training funnel)

> **Phase 1 — research only. No code written.** Documents the existing foundation (`/aoc/join`), the repo's video-embed conventions, the Skool CTA wiring, and — importantly — the **countdown/timer components that already exist and can be reused** instead of building new. Phase 2 (plan) follows after review.

---

## 0. TL;DR (the three questions asked)

1. **File that renders `/aoc/join`** → **`public/aoc/join.html`** (single self-contained static file, 3,483 lines: HTML + inline `<style>` + inline `<script>`). This is the foundation and design system. New page = **`public/aoc/free-training.html`**.
2. **Video embeds** → repo uses two patterns: a lazy-loaded background `<video>` (hero) and iframes inside a **`.video-embed`** responsive 16:9 wrapper. **Vimeo is already embedded on 4 product pages** with a known iframe pattern — mirror that. **CTAs** → all point to `https://www.skool.com/910-academy/about` (`target="_blank" rel="noopener noreferrer"`).
3. **Existing countdown to reuse?** → **Yes — three of them.** The best match is the **fixed-deadline** countdown in `public/aoc.html` (and `public/levels.html`): a single hardcoded `TARGET` timestamp, `TARGET - Date.now()`, and a `diff <= 0` branch that flips the page into a different state. **This is exactly the expiry-gate model the free-training page needs — do not build a timer from scratch, adapt this one.** (join.html's hero timer is a *daily-reset* timer — wrong model, do not copy it.)

---

## 1. Target file & routing (confirmed)

| Item | Value |
|---|---|
| **Foundation file** | `public/aoc/join.html` — self-contained (HTML + inline CSS + inline JS). No shared component; no `src/app` route renders it. |
| **New file to create** | `public/aoc/free-training.html` |
| **Prod routing** | `vercel.json` → `"cleanUrls": true` (line 5) auto-serves `public/aoc/free-training.html` at `/aoc/free-training`. **No prod config change needed.** |
| **Local-dev routing** | `next.config.ts` needs an explicit rewrite (nested `/aoc/*` paths aren't covered by the `STATIC_PAGES` map). Mirror line 72 (`/aoc/join`): add `{ source: "/aoc/free-training", destination: "/aoc/free-training.html" }` to the `rewrites()` array. **This is the one config edit required** (Phase 2 will call it out; it is not "the page" so it can land with the page commit). |
| Optional redirect | `vercel.json` already redirects `/aoc-purchase` → `/aoc/join`. No redirect is required for free-training, but a short vanity alias (e.g. `/free-training` → `/aoc/free-training`) could be added later if wanted — out of scope unless asked. |

### Embedding Vimeo is safe on this site (verified)
- **No CSP** is set (`next.config.ts` lines 24–26 explicitly document CSP is intentionally omitted so inline `<style>/<script>` work). → No `frame-src` restriction to block an external Vimeo iframe.
- **`X-Frame-Options: SAMEORIGIN`** (next.config.ts) only stops *our* pages from being framed by others; it does **not** stop us from framing Vimeo. Fine.
- **`Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()`** — does **not** restrict `autoplay`, `fullscreen`, or `picture-in-picture`, which are what Vimeo's iframe requests. Fine.
- **Proof it works:** Vimeo is already live in 4 product pages (see §3). No new headers/config needed.

---

## 2. Design system (must match — inherited from join.html)

**CSS delivery:** 100% **inline**, in `<head>` `<style>` blocks. No Tailwind, no external stylesheet, no Google-Fonts CDN. New page should follow the same self-contained pattern (copy the token + base CSS blocks from join.html, then add page-specific `<style>`).

**Fonts:** **Montserrat only**, self-hosted woff2 at `/fonts/montserrat-{300,400,500,700}.woff2`, declared via `@font-face` and preloaded (join.html lines 23–29). Token `--font: 'Montserrat', sans-serif`.

**Color tokens (`:root`, join.html lines 36+):** this is **near-black, not literal navy**. Only chromatic color is the 910 blue.

| Token | Value | Use |
|---|---|---|
| `--bg-deep` | `#050506` | deepest bg |
| `--bg-base` | `#0a0a0a` | **page background** |
| `--bg-elevated` | `#0f0f10` | cards / surfaces |
| `--bg-surface` / `-hover` | `rgba(255,255,255,.05)` / `.08` | glass surfaces |
| `--accent` | **`#38B6FF`** | 910 blue (the only accent) |
| `--accent-hover` | `#5ac4ff` | hover |
| `--accent-glow / -muted / -border …` | `rgba(56,182,255, …)` | glows / borders / badges |
| `--fg` | `#FFFFFF` | text |
| `--fg-muted / -dim / -ghost` | `rgba(255,255,255, .7 / .4 / .2)` | secondary text |

> ⚠️ "Dark navy" in the brief is a slight misnomer for this page: the backgrounds are **pure near-black** (`#0a0a0a`/`#050506`) with the `#38B6FF` accent. Do **not** introduce an actual navy bg or it'll look foreign to join.html.

**Reusable structural classes already in join.html** (use these so the page reads native):
- `.section`, `.section-label` (small uppercase kicker), `.section-heading` (H2), `.section-sub` (muted subhead) — the standard section header stack.
- `.reveal` / `.reveal-left` — scroll-in animation hooks.
- `.video-stack` / `.video-wrap` / **`.video-embed`** / `.video-title` / `.video-desc` — the video block system (see §3).
- `.hero`, `.hero-overlay`, `.hero-content`, `.hero-cta` — hero scaffolding.
- `.footer`, `.footer-logo`, `.footer-socials`, `.footer-copy` — footer (see §4).

---

## 3. Video-embed conventions (verified)

**A. `.video-embed` — the responsive 16:9 wrapper (join.html lines 1751–1767).** This is the component to reuse for the Vimeo hero. It already guarantees "16:9, no overflow, mobile-safe":
```css
.video-embed { position:relative; width:100%; aspect-ratio:16/9; border-radius:var(--radius-md);
  overflow:hidden; border:1px solid var(--border); background:#000;
  box-shadow:0 30px 80px rgba(0,0,0,.5), 0 0 0 1px rgba(56,182,255,.04); }
.video-embed iframe { position:absolute; inset:0; width:100%; height:100%; border:0; }
```
Also `img, video, iframe { max-width:100%; height:auto; }` is set globally (line 1977).

**B. YouTube (proof section, join.html lines 3005–3016)** — iframes go inside `.video-embed`, using `youtube-nocookie.com/embed/<id>`:
```html
<div class="video-embed">
  <iframe src="https://www.youtube-nocookie.com/embed/kY_cZKMM6TY" title="…" frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    allowfullscreen loading="lazy"></iframe>
</div>
```

**C. Vimeo — already used on 4 product pages** (`public/products/{known-productions,jt-visuals,lucid-horizon,four-horsemen}-workshop.html`). Established iframe pattern:
```html
<iframe src="https://player.vimeo.com/video/1075782631?h=63baf05123&badge=0&autopause=0&player_id=0&app_id=58479"
  title="…, trailer" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe>
```
Mapping to **this page's video** — the brief gives `https://vimeo.com/1164998439/258b8faaea`:
- **Video ID** = `1164998439`
- **Privacy hash** (`h=`) = `258b8faaea`  ← the `/xxxx` after the ID is Vimeo's unlisted-video hash and **must** be passed as `h=`, or the embed 404s.
- **Resulting embed src** = `https://player.vimeo.com/video/1164998439?h=258b8faaea&badge=0&autopause=0&player_id=0&app_id=58479`

**Recommendation for the hero:** wrap the Vimeo iframe in `.video-embed` (or a lightly-restyled variant) to inherit the responsive 16:9 box. Since this is a training page (not a trailer), **do not autoplay** — let the user press play. (Autoplay muted is possible but not required; the only conversion action is joining Skool.)

**D. Hero background `<video>` (join.html lines 2250–2270)** — this is join.html's decorative hero; a lazy `data-src`/`data-src-mobile` swap + poster. **Not needed** for free-training (the Vimeo player *is* the hero), but noted so we know the join.html hero markup will be **replaced**, not kept.

---

## 4. CTA wiring & footer (verified)

**All Skool CTAs on join.html point to the same URL:** `https://www.skool.com/910-academy/about` with `target="_blank" rel="noopener noreferrer"`. Occurrences (join.html): `.glass-nav-cta` (2228), `.hero-cta` (2279), `.value-cta` (3117), `.aoc-promo-cta` (3181), plus a commented `.school-cta` (3448). For free-training, the primary CTA reuses this exact URL + rel + target; label per brief = **"Join 910 Academy"** (join.html labels them "Sign Up Now" — copy differs, target is identical).

**Footer to match (join.html lines 3203–3213):**
```html
<footer class="footer">
  <div class="footer-logo"><img src="/logo-white.svg" alt="910 Academy" width="36" height="36" decoding="async"></div>
  <div class="footer-socials">
    <a href="https://www.youtube.com/@910Academy" target="_blank">YouTube</a>
    <a href="https://www.instagram.com/claudiorivera.910/" target="_blank">Instagram</a>
    <a href="https://www.facebook.com/groups/415895414544196/" target="_blank">Facebook</a>
  </div>
  <p class="footer-copy">© 2026 910 Academy. All rights reserved. · Built by <a class="footer-credit-link" href="https://instagram.com/slodhy" target="_blank" rel="noopener noreferrer">@slodhy</a></p>
</footer>
```

---

## 5. Countdown / timer components — reuse, don't rebuild (the key finding)

There are **three** timers in the repo. Ranked by fit for the free-training expiry gate:

### ✅ BEST: `public/aoc.html` lines 758–784 — fixed deadline that *flips page state on zero*
```js
var TARGET = Date.parse('2026-07-02T02:00:00Z'); // single hardcoded instant
function tick() {
  var diff = TARGET - Date.now();
  if (diff <= 0) {                       // ← the gate: on expiry, reveal a different state
    document.getElementById('countbar').classList.add('is-open');
    document.getElementById('bigcount').classList.add('is-open');
    document.getElementById('timerblock').classList.add('is-open');
    clearInterval(timer); return;
  }
  var secs = Math.floor(diff/1000);
  var days = Math.floor(secs/86400); secs -= days*86400;
  var hrs  = Math.floor(secs/3600);  secs -= hrs*3600;
  var mins = Math.floor(secs/60);    secs -= mins*60;
  setAll('.js-cd-days', pad(days)); setAll('.js-cd-hours', pad(hrs));
  setAll('.js-cd-mins', pad(mins)); setAll('.js-cd-secs', pad(secs));
}
tick(); timer = setInterval(tick, 1000);
```
This is **structurally the exact expiry gate the brief wants**: one editable `TARGET` constant, `TARGET - Date.now()`, and a `diff <= 0` branch that switches state (currently *opens* a "doors are open" block; for free-training we invert it to *hide the video + show the EXPIRED block*). Also note it **checks on load** (`tick()` runs immediately) *and* every second — satisfying "checks on load AND when the countdown hits zero."

### ✅ GOOD: `public/levels.html` lines 300–321 — clean fixed-deadline markup (days/hrs/mins/secs)
Same `TARGET = Date.parse('…Z')` + `TARGET - Date.now()` shape; zeroes the segments at `diff <= 0`. Its **markup** is the cleanest to lift for the visible timer UI:
```html
<div class="countdown" aria-label="Time until the training">
  <div class="cd-seg"><b class="js-cd-days">00</b><span>Days</span></div>
  <div class="cd-seg"><b class="js-cd-hours">00</b><span>Hrs</span></div>
  <div class="cd-seg"><b class="js-cd-mins">00</b><span>Min</span></div>
  <div class="cd-seg"><b class="js-cd-secs">00</b><span>Sec</span></div>
</div>
```

### ❌ DO NOT COPY: `public/aoc/join.html` lines 2281–2303 — *daily-reset* hero timer
Its `.hero-timer` styling (`.deal-label` + `.deal-timer`, tabular-nums, accent color) is nice and on-brand, **but its logic counts down to the next midnight ET and resets every day** (`86400 - (h*3600+m*60+s)`). That's the wrong model for a fixed 24-hour expiry. Reuse its *visual styling* if desired; **ignore its logic.**

### "Same deadline for everyone" — confirmed correct approach
`TARGET - Date.now()` compares against an **absolute UTC instant**, so every visitor counts down to the same moment regardless of their local timezone. The brief's format `EXPIRY = "2026-07-02T20:00:00-04:00"` (ISO string with an explicit offset) is equivalent to `Date.parse('2026-07-03T00:00:00Z')` and is the clearer way to write the constant. **No `localStorage`, no per-visitor logic** — matches the brief. (Aside: `Date.parse` on an offset-bearing ISO string is universally supported; the repo's own examples use the `…Z` form.)

### Security note (acknowledged, acceptable per brief)
The gate is **client-side only** and **not cryptographically secure**: the Vimeo player URL sits in page source, so a determined visitor could extract and play it directly after expiry, and someone with a skewed clock sees a skewed countdown. That's fine for this funnel — the goal is to gate *normal* visitors. Phase 2 will still make the gate *real* (not cosmetic): after expiry the iframe **never receives a `src`** (hold it in `data-src` and only promote to `src` when `Date.now() < TARGET`), so the video does not load or play in the expired state — it's not merely hidden with CSS.

---

## 6. Inputs still needed before/at Phase 2 (placeholders per brief)

| Item | Status |
|---|---|
| `EXPIRY` constant value | Brief example `2026-07-02T20:00:00-04:00`; **you'll set the real one** (single commented constant at top of file). |
| Subhead under headline ("Do you want to keep this training, plus so much more?") | `[PLACEHOLDER — Claudio's exact line]` |
| "What's in the training" block copy | `[PLACEHOLDER]` — Phase 2 will seed from the Higgsfield/AI-editing description in the brief, marked as placeholder. |
| Expired-state headline/body ("This free training has closed." + CTA framing) | `[PLACEHOLDER]` — Phase 2 proposes copy, marked placeholder. |
| Primary CTA label | "Join 910 Academy" (confirmed) → `https://www.skool.com/910-academy/about` (confirmed). |
| OG/meta (title, description, `og:image`, canonical `og:url`) | Reuse join.html's meta scaffold; new `og:url` = `https://www.910academy.com/aoc/free-training`. Needs its own title/description (Phase 2 draft, placeholder-flagged). |

---

## 7. What gets kept vs. replaced from join.html

- **Keep (copy verbatim):** `<head>` font `@font-face` + preloads, the design-token `:root` + base CSS blocks, `.video-embed` system, `.section*` header classes, `.footer`.
- **Replace:** join.html's hero (bg video + AOC logo + "AGENT ON CAMERA" H1) → **Vimeo player + expiry headline + countdown**. join.html's long body (coverflow, curriculum, pricing, proof, etc.) is **not** carried over — free-training is a short, single-purpose funnel (video → expiry framing → countdown → what's-in-it → CTA → footer).
- **Do not touch:** `public/aoc/join.html` itself, or any Skool purchase flow. New page is additive.

---

## Open command

```
open research-aoc-free-training.md
```

*End of Phase 1 research. Stopping for review before Phase 2 (plan).*
