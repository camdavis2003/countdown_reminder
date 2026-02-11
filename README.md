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

## Windows “Unknown Publisher” warning

Windows shows **Unknown Publisher** when the `.exe` isn’t **code-signed** with a trusted certificate.

- Without a code-signing certificate, you can’t fully remove this warning for other users.
- Even after signing, Windows SmartScreen may still warn until your app builds **reputation** (EV certs generally help more than OV certs).

### Code signing (electron-builder)

electron-builder will sign your app + NSIS installer automatically if you provide a Windows code-signing certificate.

1) Get a code-signing certificate
- **OV** (Organization Validation): cheaper, works, but SmartScreen reputation can take time.
- **EV** (Extended Validation): more expensive, typically builds reputation faster, often delivered on a hardware token.

2) Export your cert to a `.pfx`
- Ensure it includes the private key.
- Set a strong password.

If your CA issues the cert on a **hardware token** or via **cloud signing**, you may not get a `.pfx` at all. In that case you’ll typically sign using the Windows certificate store / token provider (still supported by `signtool`), and electron-builder can be configured to use that approach.

3) Set signing environment variables

PowerShell (recommended):

```powershell
$env:CSC_LINK = "C:\\path\\to\\codesign.pfx"
$env:CSC_KEY_PASSWORD = "your-pfx-password"
```

Then build normally:

```bash
npm run dist
```

Notes:
- If you prefer Windows-specific variables, electron-builder also supports `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD`.
- You may need the Windows SDK (for `signtool.exe`) or Visual Studio Build Tools installed.

4) Verify the signature

```powershell
signtool verify /pa /v "release\\Countdown Reminder Setup *.exe"
```

### No cert yet (what you can do)

- For personal/internal use: you can create a self-signed cert and sign locally, but other machines will still warn unless they trust that cert.
- For public distribution: you’ll need OV/EV code signing (or distribute via a store channel that signs/attests your binaries).

### Troubleshooting (Windows)

- If you see `Cannot create symbolic link : A required privilege is not held by the client`, enable Windows **Developer Mode** (Settings → System → For developers) or run the build from an Administrator terminal.
- If you see `...app.asar: The process cannot access the file because it is being used by another process`, close any running packaged app (including tray), close File Explorer windows open in `release/`, and re-run. You can also run `npm run builder:clean-output` to delete `release/` first.

## Notes

- Events are stored locally using `electron-store`.
- Widgets are always-on-top frameless windows (per-event pin/unpin).
- Startup uses `app.setLoginItemSettings`.
