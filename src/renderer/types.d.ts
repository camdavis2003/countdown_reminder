export type Recurrence =
  | 'none'
  | 'interval'
  | 'yearly'
  | 'yearly_nth_weekday'
  | 'monthly'
  | 'weekly'
  | 'daily'
  | 'monthly_day_of_month'
  | 'monthly_nth_weekday';

export type IntervalUnit = 'day' | 'week' | 'month' | 'year';

export type CountdownEvent = {
  id: string;
  title: string;
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

declare global {
  interface Window {
    countdown: {
      getState: () => Promise<AppState>;
      setStartup: (enabled: boolean) => Promise<AppState>;
      saveEvents: (events: CountdownEvent[]) => Promise<AppState>;
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
