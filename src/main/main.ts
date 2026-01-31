import { app, BrowserWindow, ipcMain, Menu, nativeImage, Notification, Tray } from 'electron';
import path from 'node:path';
import Store from 'electron-store';

type Recurrence = 'none' | 'yearly' | 'monthly' | 'weekly' | 'daily';

export type CountdownEvent = {
  id: string;
  title: string;
  dateLocal: string; // local datetime-local string: YYYY-MM-DDTHH:mm
  color: string;
  timezone: 'local';
  recurrence: Recurrence;
  notify: boolean;
  notifyMinutesBefore: number; // 0 = at time
  pinned: boolean;
};

type AppState = {
  events: CountdownEvent[];
  launchAtStartup: boolean;
};

const store = new Store<AppState>({
  name: 'countdown-reminder',
  defaults: {
    events: [],
    launchAtStartup: true
  }
});

let mainWindow: BrowserWindow | null = null;
const widgetWindows = new Map<string, BrowserWindow>();
let tray: Tray | null = null;
let isQuitting = false;

function rendererPath(file: string) {
  return path.join(app.getAppPath(), 'dist', 'renderer', file);
}

function fallbackTrayIcon() {
  // 1x1 PNG (non-empty) so Tray can initialize even without user-provided assets.
  return nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2ioAAAAASUVORK5CYII='
  );
}

function isDev() {
  return process.env.NODE_ENV === 'development';
}

function getDevServerUrl() {
  return process.env.VITE_DEV_SERVER_URL;
}

function parseLocalDate(dateLocal: string) {
  // This parses a datetime-local string in the user's local timezone.
  return new Date(dateLocal);
}

function toDateTimeLocalString(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function nextOccurrenceDate(ev: CountdownEvent) {
  const d = parseLocalDate(ev.dateLocal);
  if (ev.recurrence === 'none') return d;
  const now = new Date();
  while (d.getTime() < now.getTime()) {
    switch (ev.recurrence) {
      case 'yearly':
        d.setFullYear(d.getFullYear() + 1);
        break;
      case 'monthly':
        d.setMonth(d.getMonth() + 1);
        break;
      case 'weekly':
        d.setDate(d.getDate() + 7);
        break;
      case 'daily':
        d.setDate(d.getDate() + 1);
        break;
    }
  }
  return d;
}

function migrateIfNeeded() {
  const st = store.store;
  const migrated = st.events.map((e: any) => {
    if (typeof e.dateLocal === 'string') return e as CountdownEvent;
    if (typeof e.dateISO === 'string') {
      const d = new Date(e.dateISO);
      return { ...e, dateLocal: toDateTimeLocalString(d) } as CountdownEvent;
    }
    return e as CountdownEvent;
  });
  if (JSON.stringify(migrated) !== JSON.stringify(st.events)) {
    store.set('events', migrated);
  }
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 860,
    minHeight: 600,
    title: 'Countdown Reminder',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  win.on('close', (e) => {
    if (isQuitting) return;
    // Close-to-tray behavior on Windows.
    e.preventDefault();
    win.hide();
  });

  win.on('closed', () => {
    mainWindow = null;
  });

  const devUrl = getDevServerUrl();
  if (isDev() && devUrl) {
    win.loadURL(`${devUrl}/index.html`);
  } else {
    win.loadFile(rendererPath('index.html'));
  }

  if (isDev()) {
    win.webContents.openDevTools({ mode: 'detach' });
  }
  return win;
}

function createWidgetWindow(eventId: string) {
  const win = new BrowserWindow({
    width: 340,
    height: 170,
    resizable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    frame: false,
    transparent: false,
    title: 'Countdown Reminder Widget',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.on('closed', () => {
    widgetWindows.delete(eventId);
  });

  const devUrl = getDevServerUrl();
  if (isDev() && devUrl) {
    win.loadURL(`${devUrl}/widget.html?eventId=${encodeURIComponent(eventId)}`);
  } else {
    win.loadFile(rendererPath('widget.html'), { query: { eventId } });
  }
  return win;
}

function upsertWidgetWindows() {
  const { events } = store.store;
  for (const ev of events) {
    const existing = widgetWindows.get(ev.id);
    if (ev.pinned) {
      if (!existing) {
        widgetWindows.set(ev.id, createWidgetWindow(ev.id));
      } else {
        existing.webContents.send('events:updated');
      }
    } else if (existing) {
      existing.close();
    }
  }
}

function setStartupEnabled(enabled: boolean) {
  // On Windows, this sets a registry entry for current user.
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: false
  });
  store.set('launchAtStartup', enabled);
}

function ensureTray() {
  if (tray) return;

  try {
    const candidates = [
      path.join(app.getAppPath(), 'assets', 'tray.ico'),
      path.join(app.getAppPath(), 'assets', 'tray.png'),
      path.join(app.getAppPath(), 'assets', 'icon.ico'),
      path.join(app.getAppPath(), 'assets', 'icon.png')
    ];

    let icon = fallbackTrayIcon();
    for (const p of candidates) {
      const img = nativeImage.createFromPath(p);
      if (!img.isEmpty()) {
        icon = img;
        break;
      }
    }

    tray = new Tray(icon);
    tray.setToolTip('Countdown Reminder');

    const menu = Menu.buildFromTemplate([
      {
        label: 'Open Countdown Reminder',
        click: () => {
          if (!mainWindow) mainWindow = createMainWindow();
          mainWindow.show();
          mainWindow.focus();
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setContextMenu(menu);

    tray.on('click', () => {
      if (!mainWindow) mainWindow = createMainWindow();
      mainWindow.show();
      mainWindow.focus();
    });

    tray.on('double-click', () => {
      if (!mainWindow) mainWindow = createMainWindow();
      mainWindow.show();
      mainWindow.focus();
    });
  } catch {
    tray = null;
  }
}

function notify(title: string, body: string) {
  try {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
    }
  } catch {
    // ignore
  }
}

function getState() {
  return store.store;
}

function saveEvents(events: CountdownEvent[]) {
  store.set('events', events);
  if (mainWindow) mainWindow.webContents.send('events:updated');
  for (const win of widgetWindows.values()) win.webContents.send('events:updated');
  upsertWidgetWindows();
}

function scheduleTick() {
  // Simple periodic notification check.
  const lastNotifiedAt = new Map<string, number>();
  setInterval(() => {
    const now = Date.now();
    const { events } = store.store;

    for (const ev of events) {
      if (!ev.notify) continue;
      const target = nextOccurrenceDate(ev).getTime();
      const msBefore = ev.notifyMinutesBefore * 60 * 1000;
      const diff = target - now;

      // Fire only in a narrow window and dedupe.
      if (diff <= msBefore && diff > msBefore - 15000) {
        const last = lastNotifiedAt.get(ev.id) ?? 0;
        if (now - last > 60_000) {
          lastNotifiedAt.set(ev.id, now);
          notify('Countdown Reminder', `${ev.title} is coming up`);
        }
      }
    }
  }, 5000);
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.camda.countdownreminder');

  migrateIfNeeded();
  ensureTray();
  mainWindow = createMainWindow();

  // Apply startup preference
  setStartupEnabled(store.get('launchAtStartup'));

  upsertWidgetWindows();
  scheduleTick();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  // Keep tray + widgets alive; typical Windows tray behavior.
  if (process.platform !== 'darwin') {
    // do nothing
  }
});

ipcMain.handle('state:get', () => getState());

ipcMain.handle('settings:setStartup', (_evt, enabled: boolean) => {
  setStartupEnabled(enabled);
  return getState();
});

ipcMain.handle('events:save', (_evt, events: CountdownEvent[]) => {
  saveEvents(events);
  return getState();
});

ipcMain.handle('widget:toggle', (_evt, eventId: string, pinned: boolean) => {
  const { events } = store.store;
  const next = events.map((e) => (e.id === eventId ? { ...e, pinned } : e));
  saveEvents(next);
  return getState();
});
