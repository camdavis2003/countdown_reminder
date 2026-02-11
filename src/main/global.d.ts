import type { AppState } from './preload';

declare global {
  interface Window {
    countdown: {
      getState: () => Promise<AppState>;
      setStartup: (enabled: boolean) => Promise<AppState>;
      saveEvents: (events: any[]) => Promise<AppState>;
      fitPreferencesHeight: (contentHeight: number) => Promise<void>;
      toggleWidget: (eventId: string, pinned: boolean) => Promise<AppState>;
      openPreferences: (eventId?: string) => Promise<void>;
      deleteEvent: (eventId: string) => Promise<AppState>;
      quitApp: () => Promise<void>;
      onSelectEvent: (handler: (eventId: string) => void) => () => void;
      onEventsUpdated: (handler: () => void) => () => void;
    };
  }
}

export {};
