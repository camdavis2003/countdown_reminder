import { contextBridge, ipcRenderer } from 'electron';

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
  location?: string;
  dateLocal: string;
  color: string;
  textColor: string;
  timezone: 'local';
  recurrence: Recurrence;
  completedThroughLocal?: string;
  recurrenceInterval?: number;
  recurrenceIntervalUnit?: IntervalUnit;
  recurrenceDayOfMonth?: number;
  recurrenceMonth?: number;
  recurrenceWeekOfMonth?: number;
  recurrenceWeekday?: number;
  notify: boolean;
  notifyMinutesBefore: number;
  pinned: boolean;
};

export type AppState = {
  events: CountdownEvent[];
  launchAtStartup: boolean;
};

contextBridge.exposeInMainWorld('countdown', {
  getState: async (): Promise<AppState> => ipcRenderer.invoke('state:get'),
  setStartup: async (enabled: boolean): Promise<AppState> => ipcRenderer.invoke('settings:setStartup', enabled),
  saveEvents: async (events: CountdownEvent[]): Promise<AppState> => ipcRenderer.invoke('events:save', events),
  fitPreferencesHeight: async (contentHeight: number): Promise<void> => {
    await ipcRenderer.invoke('prefs:fitHeight', contentHeight);
  },
  toggleWidget: async (eventId: string, pinned: boolean): Promise<AppState> =>
    ipcRenderer.invoke('widget:toggle', eventId, pinned),
  openPreferences: async (eventId?: string): Promise<void> => {
    await ipcRenderer.invoke('prefs:open', eventId ?? null);
  },
  deleteEvent: async (eventId: string): Promise<AppState> => ipcRenderer.invoke('event:delete', eventId),
  openExternal: async (url: string): Promise<void> => {
    await ipcRenderer.invoke('shell:openExternal', url);
  },
  quitApp: async (): Promise<void> => {
    await ipcRenderer.invoke('app:quit');
  },
  onSelectEvent: (handler: (eventId: string) => void) => {
    const listener = (_evt: Electron.IpcRendererEvent, eventId: string) => handler(eventId);
    ipcRenderer.on('event:select', listener);
    return () => ipcRenderer.off('event:select', listener);
  },
  onEventsUpdated: (handler: () => void) => {
    const listener = () => handler();
    ipcRenderer.on('events:updated', listener);
    return () => ipcRenderer.off('events:updated', listener);
  }
});
