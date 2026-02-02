import { app, BrowserWindow, ipcMain, Menu, nativeImage, Notification, screen, Tray } from 'electron';
import path from 'node:path';
import Store from 'electron-store';

type Recurrence =
  | 'none'
  | 'interval'
  | 'yearly'
  | 'yearly_nth_weekday'
  | 'monthly'
  | 'weekly'
  | 'daily'
  | 'monthly_day_of_month'
  | 'monthly_nth_weekday';

type IntervalUnit = 'day' | 'week' | 'month' | 'year';

export type CountdownEvent = {
  id: string;
  title: string;
  dateLocal: string; // local datetime-local string: YYYY-MM-DDTHH:mm
  color: string;
  textColor: string;
  timezone: 'local';
  recurrence: Recurrence;
  recurrenceInterval?: number;
  recurrenceIntervalUnit?: IntervalUnit;
  recurrenceDayOfMonth?: number;
  recurrenceMonth?: number;
  recurrenceWeekOfMonth?: number;
  recurrenceWeekday?: number;
  notify: boolean;
  notifyMinutesBefore: number; // 0 = at time
  pinned: boolean;
};

type AppState = {
  events: CountdownEvent[];
  launchAtStartup: boolean;
  widgetGroupBounds: Electron.Rectangle | null;
};

const store = new Store<AppState>({
  name: 'countdown-reminder',
  defaults: {
    events: [],
    launchAtStartup: true,
    widgetGroupBounds: null
  }
});

let mainWindow: BrowserWindow | null = null;
let widgetGroupWindow: BrowserWindow | null = null;
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

async function setupDevFileReload() {
  // If we are not using a dev server, reload windows when dist renderer changes.
  if (!isDev()) return;
  if (getDevServerUrl()) return;

  try {
    const chokidar = await import('chokidar');
    const watchPath = path.join(app.getAppPath(), 'dist', 'renderer');

    let reloadTimer: NodeJS.Timeout | null = null;
    chokidar
      .watch(watchPath, { ignoreInitial: true })
      .on('all', () => {
        if (reloadTimer) clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => {
          for (const win of BrowserWindow.getAllWindows()) {
            try {
              win.webContents.reloadIgnoringCache();
            } catch {
              // ignore
            }
          }
        }, 200);
      });
  } catch {
    // If chokidar isn't available, just skip live reload.
  }
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
  const base = parseLocalDate(ev.dateLocal);
  if (ev.recurrence === 'none') return base;

  const now = new Date();

  const daysInMonth = (year: number, monthIndex: number) => new Date(year, monthIndex + 1, 0).getDate();
  const weekOfMonthForDate = (d: Date) => Math.floor((d.getDate() - 1) / 7) + 1;
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
  const nthWeekdayDayOfMonth = (year: number, monthIndex: number, weekday: number, nth: number) => {
    const first = new Date(year, monthIndex, 1);
    const firstWeekday = first.getDay();
    const offset = (weekday - firstWeekday + 7) % 7;
    const firstOccurrence = 1 + offset;
    const candidate = firstOccurrence + (Math.max(1, Math.min(5, nth)) - 1) * 7;
    const lastDay = daysInMonth(year, monthIndex);
    if (candidate <= lastDay) return candidate;
    const weeksAvailable = Math.floor((lastDay - firstOccurrence) / 7);
    return firstOccurrence + weeksAvailable * 7;
  };

  const recurrence = ev.recurrence;
  const d = new Date(base);

  if (recurrence === 'interval') {
    const rawInterval = Number(ev.recurrenceInterval ?? 1);
    const interval = clamp(Number.isFinite(rawInterval) ? Math.trunc(rawInterval) : 1, 1, 10000);
    const unitRaw = String(ev.recurrenceIntervalUnit ?? 'day');
    const unit: IntervalUnit = (unitRaw === 'day' || unitRaw === 'week' || unitRaw === 'month' || unitRaw === 'year') ? (unitRaw as IntervalUnit) : 'day';

    const baseHours = base.getHours();
    const baseMinutes = base.getMinutes();
    const baseDayOfMonth = base.getDate();
    const baseMonthIndex = base.getMonth();

    const addDays = (dt: Date, days: number) => {
      const out = new Date(dt);
      out.setDate(out.getDate() + days);
      return out;
    };
    const monthIndex = (dt: Date) => dt.getFullYear() * 12 + dt.getMonth();
    const monthOccurrenceFromBase = (monthsToAdd: number) => {
      const startMonthIndex = base.getFullYear() * 12 + base.getMonth();
      const targetMonthIndex = startMonthIndex + monthsToAdd;
      const y = Math.floor(targetMonthIndex / 12);
      const m = targetMonthIndex % 12;
      const last = daysInMonth(y, m);
      const day = Math.min(baseDayOfMonth, last);
      return new Date(y, m, day, baseHours, baseMinutes, 0, 0);
    };
    const yearOccurrenceFromBase = (yearsToAdd: number) => {
      const y = base.getFullYear() + yearsToAdd;
      const m = baseMonthIndex;
      const last = daysInMonth(y, m);
      const day = Math.min(baseDayOfMonth, last);
      return new Date(y, m, day, baseHours, baseMinutes, 0, 0);
    };

    let start = new Date(base);
    start.setHours(baseHours, baseMinutes, 0, 0);

    if (unit === 'week' && typeof ev.recurrenceWeekday === 'number') {
      const weekday = clamp(Number(ev.recurrenceWeekday), 0, 6);
      const delta = (weekday - start.getDay() + 7) % 7;
      start = addDays(start, delta);
    }

    let candidate: Date;
    if (start.getTime() >= now.getTime()) {
      candidate = start;
    } else if (unit === 'day' || unit === 'week') {
      const stepDays = interval * (unit === 'week' ? 7 : 1);
      const approxSteps = Math.floor((now.getTime() - start.getTime()) / (stepDays * 24 * 60 * 60 * 1000));
      candidate = approxSteps > 0 ? addDays(start, approxSteps * stepDays) : new Date(start);
      while (candidate.getTime() < now.getTime()) candidate = addDays(candidate, stepDays);
    } else if (unit === 'month') {
      const diffMonths = Math.max(0, monthIndex(now) - monthIndex(start));
      const approxMonths = Math.floor(diffMonths / interval) * interval;
      candidate = monthOccurrenceFromBase(approxMonths);
      if (candidate.getTime() < start.getTime()) candidate = new Date(start);
      while (candidate.getTime() < now.getTime()) {
        const monthsFromBase = monthIndex(candidate) - monthIndex(base);
        candidate = monthOccurrenceFromBase(monthsFromBase + interval);
      }
    } else {
      const diffYears = Math.max(0, now.getFullYear() - start.getFullYear());
      const approxYears = Math.floor(diffYears / interval) * interval;
      candidate = yearOccurrenceFromBase(approxYears);
      if (candidate.getTime() < start.getTime()) candidate = new Date(start);
      while (candidate.getTime() < now.getTime()) {
        const yearsFromBase = candidate.getFullYear() - base.getFullYear();
        candidate = yearOccurrenceFromBase(yearsFromBase + interval);
      }
    }

    d.setTime(candidate.getTime());
    return d;
  }

  if (recurrence === 'yearly' || recurrence === 'monthly' || recurrence === 'weekly' || recurrence === 'daily') {
    if (recurrence === 'weekly' && typeof ev.recurrenceWeekday === 'number') {
      if (d.getTime() >= now.getTime()) return d;
      const targetWeekday = clamp(Number(ev.recurrenceWeekday), 0, 6);
      const candidate = new Date(now);
      candidate.setHours(base.getHours(), base.getMinutes(), 0, 0);
      const delta = (targetWeekday - candidate.getDay() + 7) % 7;
      candidate.setDate(candidate.getDate() + delta);
      if (candidate.getTime() < now.getTime()) candidate.setDate(candidate.getDate() + 7);
      return candidate;
    }

    while (d.getTime() < now.getTime()) {
      switch (recurrence) {
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

  if (recurrence === 'yearly_nth_weekday') {
    const month = clamp(Number(ev.recurrenceMonth ?? base.getMonth()), 0, 11);
    const weekday = clamp(Number(ev.recurrenceWeekday ?? base.getDay()), 0, 6);
    const nth = clamp(Number(ev.recurrenceWeekOfMonth ?? weekOfMonthForDate(base)), 1, 5);
    let y = base.getFullYear();
    for (let i = 0; i < 20; i++) {
      const day = nthWeekdayDayOfMonth(y, month, weekday, nth);
      const candidate = new Date(y, month, day, base.getHours(), base.getMinutes(), 0, 0);
      if (candidate.getTime() >= now.getTime()) return candidate;
      y += 1;
    }
    return base;
  }

  if (recurrence === 'monthly_day_of_month') {
    const desired = clamp(Number(ev.recurrenceDayOfMonth ?? base.getDate()), 1, 31);
    let y = base.getFullYear();
    let m = base.getMonth();
    for (let i = 0; i < 240; i++) {
      const last = daysInMonth(y, m);
      const day = Math.min(desired, last);
      const candidate = new Date(y, m, day, base.getHours(), base.getMinutes(), 0, 0);
      if (candidate.getTime() >= now.getTime()) return candidate;
      m += 1;
      if (m >= 12) {
        m = 0;
        y += 1;
      }
    }
    return base;
  }

  if (recurrence === 'monthly_nth_weekday') {
    const weekday = clamp(Number(ev.recurrenceWeekday ?? base.getDay()), 0, 6);
    const nth = clamp(Number(ev.recurrenceWeekOfMonth ?? weekOfMonthForDate(base)), 1, 5);
    let y = base.getFullYear();
    let m = base.getMonth();
    for (let i = 0; i < 240; i++) {
      const day = nthWeekdayDayOfMonth(y, m, weekday, nth);
      const candidate = new Date(y, m, day, base.getHours(), base.getMinutes(), 0, 0);
      if (candidate.getTime() >= now.getTime()) return candidate;
      m += 1;
      if (m >= 12) {
        m = 0;
        y += 1;
      }
    }
    return base;
  }

  return base;
}

function migrateIfNeeded() {
  const st = store.store;
  const migrated = st.events.map((e: any) => {
    let next: any = e;

    if (typeof next.dateLocal !== 'string' && typeof next.dateISO === 'string') {
      const d = new Date(next.dateISO);
      next = { ...next, dateLocal: toDateTimeLocalString(d) };
    }

    if (typeof next.textColor !== 'string') {
      next = { ...next, textColor: '#FFFFFF' };
    }

    if (typeof next.color !== 'string') {
      next = { ...next, color: '#4f46e5' };
    }

    if (next.timezone !== 'local') {
      next = { ...next, timezone: 'local' };
    }

    const allowedRecurrence = new Set([
      'none',
      'daily',
      'weekly',
      'monthly',
      'yearly',
      'interval',
      'monthly_day_of_month',
      'monthly_nth_weekday',
      'yearly_nth_weekday'
    ]);
    if (typeof next.recurrence !== 'string' || next.recurrence.trim() === '' || !allowedRecurrence.has(next.recurrence)) {
      next = { ...next, recurrence: 'none' };
    }

    // New recurrence fields (derive from dateLocal when needed)
    try {
      const d = typeof next.dateLocal === 'string' ? parseLocalDate(next.dateLocal) : new Date();
      if (next.recurrence === 'interval') {
        const n = Number(next.recurrenceInterval);
        if (!Number.isFinite(n) || n < 1) next = { ...next, recurrenceInterval: 1 };
        const unit = String(next.recurrenceIntervalUnit ?? 'day');
        const ok = unit === 'day' || unit === 'week' || unit === 'month' || unit === 'year';
        if (!ok) next = { ...next, recurrenceIntervalUnit: 'day' };
        if (String(next.recurrenceIntervalUnit) === 'week' && typeof next.recurrenceWeekday !== 'number') {
          next = { ...next, recurrenceWeekday: d.getDay() };
        }
      }
      if (typeof next.recurrenceMonth !== 'number') {
        next = { ...next, recurrenceMonth: d.getMonth() };
      }
      if (next.recurrence === 'monthly_day_of_month' && typeof next.recurrenceDayOfMonth !== 'number') {
        next = { ...next, recurrenceDayOfMonth: d.getDate() };
      }
      if (next.recurrence === 'monthly_nth_weekday') {
        const weekOfMonth = Math.floor((d.getDate() - 1) / 7) + 1;
        if (typeof next.recurrenceWeekday !== 'number') next = { ...next, recurrenceWeekday: d.getDay() };
        if (typeof next.recurrenceWeekOfMonth !== 'number') next = { ...next, recurrenceWeekOfMonth: weekOfMonth };
      }
      if (next.recurrence === 'yearly_nth_weekday') {
        const weekOfMonth = Math.floor((d.getDate() - 1) / 7) + 1;
        if (typeof next.recurrenceWeekday !== 'number') next = { ...next, recurrenceWeekday: d.getDay() };
        if (typeof next.recurrenceWeekOfMonth !== 'number') next = { ...next, recurrenceWeekOfMonth: weekOfMonth };
        if (typeof next.recurrenceMonth !== 'number') next = { ...next, recurrenceMonth: d.getMonth() };
      }
    } catch {
      // ignore
    }

    if (typeof next.notify !== 'boolean') {
      next = { ...next, notify: true };
    }

    if (typeof next.notifyMinutesBefore !== 'number') {
      next = { ...next, notifyMinutesBefore: 0 };
    }

    if (typeof next.pinned !== 'boolean') {
      next = { ...next, pinned: false };
    }

    return next as CountdownEvent;
  });
  if (JSON.stringify(migrated) !== JSON.stringify(st.events)) {
    store.set('events', migrated);
  }
}

function createMainWindow() {
  const iconPath = path.join(app.getAppPath(), 'assets', 'icon.png');
  const win = new BrowserWindow({
    width: 960,
    height: 568,
    minWidth: 860,
    minHeight: 540,
    title: 'Countdown Reminder',
    icon: iconPath,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    thickFrame: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Keep the Preferences window clean (no native menu bar).
  win.setMenuBarVisibility(false);
  win.setMenu(null);

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

function calculateWidgetGroupHeight(cardCount: number) {
  const padding = 16;
  const cardHeight = 88;
  const gap = 8;
  const contentHeight = cardCount === 0 ? 0 : cardCount * cardHeight + Math.max(0, cardCount - 1) * gap;
  return padding + contentHeight;
}

function getDefaultWidgetGroupBounds(width: number, height: number): Electron.Rectangle {
  const display = screen.getPrimaryDisplay();
  const wa = display.workArea;
  const margin = 12;
  const x = wa.x + wa.width - width - margin;
  const y = wa.y + margin;
  return { x, y, width, height };
}

function createWidgetGroupWindow() {
  const cardCount = store.store.events.length;
  const width = 390;
  const height = Math.max(120, calculateWidgetGroupHeight(cardCount));
  const saved = store.get('widgetGroupBounds');
  const bounds0 = saved ?? getDefaultWidgetGroupBounds(width, height);
  const display = screen.getPrimaryDisplay();
  const wa = display.workArea;
  const maxHeight = Math.max(220, wa.height - 24);
  const targetHeight = Math.min(Math.max(bounds0.height, height), maxHeight);
  // We don't allow resizing, so treat `width` as the authoritative current width.
  // If a saved bounds exists, keep the right edge anchored when shrinking.
  const preferredX = saved ? bounds0.x + (bounds0.width - width) : bounds0.x;
  const clampedX = Math.min(Math.max(preferredX, wa.x), wa.x + wa.width - width);
  const clampedY = Math.min(Math.max(bounds0.y, wa.y), wa.y + wa.height - targetHeight);
  const bounds = {
    x: clampedX,
    y: clampedY,
    width,
    height: targetHeight
  };

  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    resizable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: false,
    skipTaskbar: true,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    title: 'Countdown Reminder Widgets',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  try {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } catch {
    // ignore
  }

  win.on('moved', () => {
    try {
      store.set('widgetGroupBounds', win.getBounds());
    } catch {
      // ignore
    }
  });

  win.on('closed', () => {
    widgetGroupWindow = null;
  });

  const devUrl = getDevServerUrl();
  if (isDev() && devUrl) {
    win.loadURL(`${devUrl}/widget.html`);
  } else {
    win.loadFile(rendererPath('widget.html'));
  }
  return win;
}

function upsertWidgetGroupWindow() {
  const cardCount = store.store.events.length;
  if (cardCount === 0) {
    if (widgetGroupWindow) {
      widgetGroupWindow.close();
      widgetGroupWindow = null;
    }
    return;
  }

  if (!widgetGroupWindow) {
    widgetGroupWindow = createWidgetGroupWindow();
  } else {
    widgetGroupWindow.webContents.send('events:updated');
  }

  // Keep the height snug around the current number of cards.
  try {
    const b = widgetGroupWindow.getBounds();
    const display = screen.getPrimaryDisplay();
    const wa = display.workArea;
    const maxHeight = Math.max(220, wa.height - 24);
    const targetHeight = Math.min(Math.max(140, calculateWidgetGroupHeight(cardCount)), maxHeight);
    if (Math.abs(b.height - targetHeight) > 2) {
      widgetGroupWindow.setBounds({ ...b, height: targetHeight });
    }
  } catch {
    // ignore
  }
}

function openPreferences(eventId: string | null) {
  if (!mainWindow) mainWindow = createMainWindow();
  mainWindow.show();
  mainWindow.focus();

  if (!eventId) return;

  const send = () => {
    try {
      mainWindow?.webContents.send('event:select', eventId);
    } catch {
      // ignore
    }
  };

  if (mainWindow.webContents.isLoadingMainFrame()) {
    mainWindow.webContents.once('did-finish-load', send);
  } else {
    send();
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
  if (widgetGroupWindow) widgetGroupWindow.webContents.send('events:updated');
  upsertWidgetGroupWindow();
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

  // In production, remove the default application menu (File/Edit/View/Help).
  // (macOS expects an app menu, so keep it there.)
  if (!isDev() && process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
  }

  migrateIfNeeded();
  ensureTray();
  mainWindow = createMainWindow();

  setupDevFileReload();

  // Apply startup preference
  setStartupEnabled(store.get('launchAtStartup'));

  upsertWidgetGroupWindow();
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

ipcMain.handle('prefs:open', (_evt, eventId: string | null) => {
  openPreferences(eventId);
});

ipcMain.handle('event:delete', (_evt, eventId: string) => {
  const { events } = store.store;
  const next = events.filter((e) => e.id !== eventId);
  saveEvents(next);
  return getState();
});

ipcMain.handle('app:quit', () => {
  isQuitting = true;
  app.quit();
});
