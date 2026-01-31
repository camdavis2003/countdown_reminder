import { contextBridge, ipcRenderer } from 'electron';

type Recurrence = 'none' | 'yearly' | 'monthly' | 'weekly' | 'daily';

export type CountdownEvent = {
  id: string;
  title: string;
  dateLocal: string;
  color: string;
  timezone: 'local';
  recurrence: Recurrence;
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
  toggleWidget: async (eventId: string, pinned: boolean): Promise<AppState> =>
    ipcRenderer.invoke('widget:toggle', eventId, pinned),
  onEventsUpdated: (handler: () => void) => {
    const listener = () => handler();
    ipcRenderer.on('events:updated', listener);
    return () => ipcRenderer.off('events:updated', listener);
  }
});
