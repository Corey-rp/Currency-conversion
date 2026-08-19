# Currency & Travel Converter

A single-page, mobile-first web app for converting between any world currency and checking the best time of year to visit popular travel destinations.

## Features

- **Live currency conversion** for 150+ currencies, powered by the free [exchangerate-api.com](https://www.exchangerate-api.com) API (no key required).
- **Swap button**, favorites (pinned currencies saved to your device), and the last-used currency pair remembered between visits.
- **Best Time to Travel** tab with a searchable list of popular countries, each showing the recommended months to visit, why, and a visual month strip.
- **Dark mode** toggle (remembers your choice, defaults to your device setting).
- **Installable as an app**: on mobile, use your browser's "Add to Home Screen" option to launch it full-screen like a native app (via the included web manifest).
- No build step, no backend — just static HTML/CSS/JS.

## Running locally

Just open `index.html` in a browser, or serve the folder with any static file server, e.g.:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Deploying

Because it's fully static, it can be hosted for free on GitHub Pages, Netlify, Vercel, or Cloudflare Pages — just point them at this repo/folder.

## Notes

- Exchange rates update roughly once every 24 hours (typical for the free tier of the rates API).
- Travel timing guidance in `js/travelData.js` is general seasonal advice — always check current local conditions and travel advisories before booking.
