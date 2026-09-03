# Atlas Cube Coach — Prototype 0.1

A local-first web prototype for recording solves from a Bluetooth smart cube, starting with **Rubik's Connected / GoCube-compatible hardware**.

## What this first build does

- Connects through the generic `connectSmartCube()` API from `smartcube-web-bluetooth`.
- Listens for MOVE, FACELETS and BATTERY events.
- Arms a solve and starts timing on the first detected move.
- Records each move with host timestamps and any cube timestamp exposed by the library.
- Calculates move count, TPS, longest pause and pauses over 2 seconds.
- Saves solve history in browser `localStorage`.
- Provides a move-by-move replay timeline.
- Includes a basic early-analysis panel for large pauses and immediate reversals.
- Includes a diagnostic event log for the first physical-cube test.
- Includes a Demo mode so the recorder/UI can be tested without hardware.
- Includes a PWA manifest/service worker foundation.

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints. For Bluetooth testing, use a secure context. `localhost` is normally allowed during development; a deployed site should use HTTPS.

## Build

```bash
npm run build
```

The generated `dist/` folder is suitable for static HTTPS hosting. `vite.config.js` uses a relative base so the app is friendly to GitHub Pages project URLs.

## First phone test

1. Deploy the build to an HTTPS host (GitHub Pages is fine for this prototype).
2. Open it in Chrome on Android.
3. Wake the Rubik's Connected cube.
4. Tap **Connect cube**.
5. Select the cube in Chrome's Bluetooth chooser.
6. Open **Connection diagnostics** if anything unexpected happens.
7. Tap **Arm solve**, then make a turn.
8. Do a short solve or movement sequence and press **Finish & save**.

If the cube provides FACELETS events and returns to a solved state, the prototype will also attempt to auto-save the solve.

## Architecture direction

Prototype 0.1 intentionally keeps coaching deterministic and local. Later versions can add:

- robust cube-state reconstruction and full visual replay;
- scramble detection and automatic start/stop;
- beginner-method / CFOP stage detection;
- rotations, recognition pauses and move-efficiency analysis;
- drills based on repeated weaknesses;
- a beginner teaching mode: “I want this piece to go here — show me how”;
- optional AI-generated explanations based only on verified solve analytics.

No OpenAI API key is required for this version.

## Third-party library

This project depends on `poliva/smartcube-web-bluetooth`, which is MIT-licensed and supports GoCube / Rubik's Connected among other smart cubes.

Repository: https://github.com/poliva/smartcube-web-bluetooth
