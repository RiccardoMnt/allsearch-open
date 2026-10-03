// Client-safe: this file must not import `server-only`, `@/libs/database/client`, or any
// `queries.ts`. The Settings UI imports it directly to describe the schedule and its next run.

/** An opt-in schedule for app-wide Collection Runs. Stored on the settings row; `null` there means
 * no schedule, which is the default and keeps ADR 0002's manual flow exactly as it was. */
export type CollectionSchedule =
  | { frequency: 'daily' }
  | { frequency: 'weekly'; weekday: number } // 0 = Sunday, matching `Date.getDay()`
  | { frequency: 'monthly'; monthDay: number } // 1..MAX_MONTH_DAY
  | { frequency: 'custom'; everyDays: number }; // MIN..MAX_CUSTOM_EVERY_DAYS

export type CollectionScheduleFrequency = CollectionSchedule['frequency'];

export const WEEKDAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/** Highest day of the month that every month has, so a monthly schedule never skips February. */
export const MAX_MONTH_DAY = 28;
export const MIN_CUSTOM_EVERY_DAYS = 2;
export const MAX_CUSTOM_EVERY_DAYS = 90;

// Days are compared in the machine's LOCAL timezone, not UTC: "every Monday" means the user's
// Monday. `getTodayISODateString` is UTC-based, which is right for grouping responses but would
// fire a Monday schedule on Sunday evening for anyone west of Greenwich.
function toLocalDayStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function countLocalDaysBetween(earlier: Date, later: Date): number {
  // Rounded so a DST day (23h or 25h) still counts as one day.
  return Math.round(
    (toLocalDayStart(later).getTime() - toLocalDayStart(earlier).getTime()) / 86_400_000
  );
}

/** Whether a scheduled Run should start now. `lastRunAt` is when the last app-wide Run was
 * started, whatever its outcome, so a failing Run is not retried on every tick (that is what the
 * existing retry offer is for). Never run before: due immediately. Weekly and monthly also catch
 * up when a whole period passed with the app closed, since the chosen day was missed. */
export function isCollectionScheduleDue(
  schedule: CollectionSchedule,
  lastRunAt: Date | null,
  now: Date
): boolean {
  if (!lastRunAt) return true;

  const daysSince = countLocalDaysBetween(lastRunAt, now);
  if (daysSince < 1) return false; // at most one scheduled Run per local day

  switch (schedule.frequency) {
    case 'daily':
      return true;
    case 'weekly':
      return now.getDay() === schedule.weekday || daysSince >= 7;
    case 'monthly':
      return now.getDate() === schedule.monthDay || daysSince >= 31;
    case 'custom':
      return daysSince >= schedule.everyDays;
  }
}

/** The local day the next scheduled Run is expected, for the Settings screen. `now` when overdue. */
export function getNextCollectionScheduleRunAt(
  schedule: CollectionSchedule,
  lastRunAt: Date | null,
  now: Date
): Date {
  if (isCollectionScheduleDue(schedule, lastRunAt, now)) return now;

  const next = toLocalDayStart(now);
  switch (schedule.frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      return next;
    case 'weekly':
      // Today is either not the weekday or already collected, so always land on a later day.
      next.setDate(next.getDate() + ((schedule.weekday - next.getDay() + 7) % 7 || 7));
      return next;
    case 'monthly':
      if (next.getDate() < schedule.monthDay) next.setDate(schedule.monthDay);
      else next.setMonth(next.getMonth() + 1, schedule.monthDay);
      return next;
    case 'custom': {
      // Not due means lastRunAt is set and fewer than everyDays have passed.
      const fromLastRun = toLocalDayStart(lastRunAt!);
      fromLastRun.setDate(fromLastRun.getDate() + schedule.everyDays);
      return fromLastRun;
    }
  }
}
