Place your app icons in this folder.

Required for app/desktop icon:
- icon.png (recommended: 256x256 or 512x512)

Optional (tray can be different):
- tray.png (recommended: 16x16, 24x24, 32x32 with transparent background)

Notes:
- The main process will automatically prefer tray.png/tray.ico, then icon.png/icon.ico.
- Packaging (electron-builder) is configured to use assets/icon.png for the Windows app icon.
