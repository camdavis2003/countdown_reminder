# Countdown Reminder

Electron desktop app for Windows that tracks multiple countdown events, supports pinned always-on-top widgets, and can launch at startup.

## Local dev

Prereqs:
- Node.js LTS

Install:

```bash
npm install
```

Run dev (Vite renderer + Electron main):

```bash
npm run dev
```

Dev mode is port-free (no Vite dev server). It uses `vite build --watch` and Electron loads `dist/renderer/*`.

## Packaging (Windows installer)

Build + create installer (NSIS):

```bash
npm run dist
```

Output goes to `release/`.

## Notes

- Events are stored locally using `electron-store`.
- Widgets are always-on-top frameless windows (per-event pin/unpin).
- Startup uses `app.setLoginItemSettings`.
