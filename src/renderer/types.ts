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
  location?: string;
  dateLocal: string;
  color: string;
  textColor: string;
  timezone: 'local';
  recurrence: Recurrence;
  /** When set, the widget treats occurrences <= this time as completed and shows the next one. */
  completedThroughLocal?: string;
  /** Used when recurrence is 'interval' */
  recurrenceInterval?: number; // >= 1
  /** Used when recurrence is 'interval' */
  recurrenceIntervalUnit?: IntervalUnit;
  /** Used when recurrence is 'monthly_day_of_month' */
  recurrenceDayOfMonth?: number; // 1-31
  /** Used by some yearly rules */
  recurrenceMonth?: number; // 0=Jan .. 11=Dec
  /** Used when recurrence is 'monthly_nth_weekday' */
  recurrenceWeekOfMonth?: number; // 1-5 (5 treated as last if month has only 4)
  /** Used when recurrence is 'monthly_nth_weekday' */
  recurrenceWeekday?: number; // 0=Sun .. 6=Sat
  notify: boolean;
  notifyMinutesBefore: number;
  pinned: boolean;
};

export type AppState = {
  events: CountdownEvent[];
  launchAtStartup: boolean;
};
