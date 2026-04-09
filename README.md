# 910 Academy Website

Static HTML site deployed to Vercel.

## Pages
- `/` — homepage (`index.html`)
- `/skool` — Skool landing (`skool.html`)
- `/affiliate-links` — Gear / Plugins / Software (`affiliate-links.html`)
- `/products` — Workshops & products (`products.html`, not in nav)
- `/toolkit` — Toolkit (`toolkit.html`, not in nav)

## Local dev
Any static server works:
```
npx serve .
```

## Deploy
`vercel --prod` (project is already linked).

## Email capture
The homepage email form posts to a Google Apps Script web app.
See `apps-script.gs` for setup. After deploying the Apps Script web app,
replace `APPS_SCRIPT_URL` in `index.html` with the real URL.

## TODOs
- Replace 6 duplicate event carousel images with distinct photos (see TODO in `index.html`).
- Set real Apps Script URL in `index.html`.
- Replace `/og-image.jpg` (currently a copy of hero-bg.jpg) with a proper 1200×630 social card.
