import type { AppState } from './preload';

declare global {
  interface Window {
    countdown: {
      getState: () => Promise<AppState>;
      setStartup: (enabled: boolean) => Promise<AppState>;
      saveEvents: (events: any[]) => Promise<AppState>;
      toggleWidget: (eventId: string, pinned: boolean) => Promise<AppState>;
      onEventsUpdated: (handler: () => void) => () => void;
    };
  }
}

export {};
