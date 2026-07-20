# Photos — iPhone-style Gallery

A fast, dependency-free gallery web app with an iOS Photos aesthetic.

## Run

```bash
python3 -m http.server 8123
# open http://localhost:8123
```

Or any static file server — there is no build step.

## Features

- **Library** — all photos/videos in one chronological grid (no album filters), grouped by month, with **Years / Months / All Photos** views like iPhone Photos. Opens at the newest items.
- **Time scroller** — the bar at the bottom of Library. Drag it to scrub through time: every month is a detent with a **haptic tap** (`navigator.vibrate`, on phones) and an **audible tick** (WebAudio); year boundaries get a heavier detent. A floating pill shows the month while scrubbing, and the grid follows live.
- **Albums** — My Albums (Camera, Screenshots, Downloads, WhatsApp, Selfies, Travel), Media Types (Videos, Favourites) and Utilities (Hidden, Recently Deleted).
- **Favourites** — heart any item in the viewer or via multi-select.
- **Viewer** — swipe between items, double-tap / pinch / scroll-wheel zoom with pan, swipe down to close, tap to hide chrome, info sheet, share, delete.
- **Multi-select** — Select button or long-press a thumbnail; share / favourite / delete in bulk.
- **Recently Deleted** — deleted items go to a bin; restore or delete forever.
- **Search** — by month, year, album name, or "photo"/"video".
- Dark/light theme follows the system; installable as a PWA (manifest included).

Demo media is generated deterministically as inline SVGs (no network, instant loads). Favourites/deleted/hidden state persists in `localStorage`.

## Structure

- [index.html](index.html) — app shell, views, tab bar
- [css/styles.css](css/styles.css) — iOS look: blur bars, large titles, segmented control
- [js/data.js](js/data.js) — demo media generation + persistence
- [js/app.js](js/app.js) — views, grids, selection, search, navigation
- [js/scrubber.js](js/scrubber.js) — the bottom time scroller
- [js/viewer.js](js/viewer.js) — full-screen viewer with gestures
- [js/haptics.js](js/haptics.js) — vibration + WebAudio tick sounds
