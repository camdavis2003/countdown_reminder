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

### Troubleshooting (Windows)

- If you see `Cannot create symbolic link : A required privilege is not held by the client`, enable Windows **Developer Mode** (Settings → System → For developers) or run the build from an Administrator terminal.
- If you see `...app.asar: The process cannot access the file because it is being used by another process`, close any running packaged app (including tray), close File Explorer windows open in `release/`, and re-run. You can also run `npm run builder:clean-output` to delete `release/` first.

## Notes

- Events are stored locally using `electron-store`.
- Widgets are always-on-top frameless windows (per-event pin/unpin).
- Startup uses `app.setLoginItemSettings`.
