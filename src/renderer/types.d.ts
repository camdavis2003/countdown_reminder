export type Recurrence = 'none' | 'yearly' | 'monthly' | 'weekly' | 'daily';

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

declare global {
  interface Window {
    countdown: {
      getState: () => Promise<AppState>;
      setStartup: (enabled: boolean) => Promise<AppState>;
      saveEvents: (events: CountdownEvent[]) => Promise<AppState>;
      toggleWidget: (eventId: string, pinned: boolean) => Promise<AppState>;
      onEventsUpdated: (handler: () => void) => () => void;
    };
  }
}

export {};
