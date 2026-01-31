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
