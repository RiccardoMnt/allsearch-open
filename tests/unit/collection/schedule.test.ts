import { describe, expect, it } from 'bun:test';

import {
  getNextCollectionScheduleRunAt,
  isCollectionScheduleDue,
} from '@/libs/collection/schedule';

/** Local-time constructor, matching how the schedule compares days. 27 Jul 2026 is a Monday. */
const at = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h);

describe('isCollectionScheduleDue', () => {
  it('is due immediately when no app-wide Run has ever started', () => {
    expect(
      isCollectionScheduleDue({ frequency: 'weekly', weekday: 5 }, null, at(2026, 7, 27))
    ).toBe(true);
  });

  it('never runs twice on the same local day', () => {
    expect(
      isCollectionScheduleDue({ frequency: 'daily' }, at(2026, 7, 27, 0), at(2026, 7, 27, 23))
    ).toBe(false);
  });

  it('runs daily once the local day has changed, even an hour later', () => {
    expect(
      isCollectionScheduleDue({ frequency: 'daily' }, at(2026, 7, 26, 23), at(2026, 7, 27, 0))
    ).toBe(true);
  });

  it('runs weekly only on the chosen weekday', () => {
    const lastFriday = at(2026, 7, 24);
    expect(
      isCollectionScheduleDue({ frequency: 'weekly', weekday: 1 }, lastFriday, at(2026, 7, 27))
    ).toBe(true);
    expect(
      isCollectionScheduleDue({ frequency: 'weekly', weekday: 5 }, lastFriday, at(2026, 7, 27))
    ).toBe(false);
  });

  it('catches up a weekly Run missed while the app was closed', () => {
    expect(
      isCollectionScheduleDue({ frequency: 'weekly', weekday: 1 }, at(2026, 7, 10), at(2026, 7, 29))
    ).toBe(true);
  });

  it('runs monthly on the chosen date, and catches up when overdue', () => {
    const schedule = { frequency: 'monthly', monthDay: 15 } as const;
    expect(isCollectionScheduleDue(schedule, at(2026, 6, 15), at(2026, 7, 15))).toBe(true);
    expect(isCollectionScheduleDue(schedule, at(2026, 7, 20), at(2026, 7, 25))).toBe(false);
    expect(isCollectionScheduleDue(schedule, at(2026, 6, 1), at(2026, 7, 20))).toBe(true);
  });

  it('runs a custom schedule once N local days have passed', () => {
    const schedule = { frequency: 'custom', everyDays: 3 } as const;
    expect(isCollectionScheduleDue(schedule, at(2026, 7, 27, 22), at(2026, 7, 29, 23))).toBe(false);
    expect(isCollectionScheduleDue(schedule, at(2026, 7, 27, 22), at(2026, 7, 30, 1))).toBe(true);
  });
});

describe('getNextCollectionScheduleRunAt', () => {
  it('returns now when a Run is due', () => {
    const now = at(2026, 7, 27);
    expect(getNextCollectionScheduleRunAt({ frequency: 'daily' }, null, now)).toBe(now);
  });

  it('returns tomorrow for daily once today has run', () => {
    expect(
      getNextCollectionScheduleRunAt({ frequency: 'daily' }, at(2026, 7, 27, 8), at(2026, 7, 27))
    ).toEqual(at(2026, 7, 28, 0));
  });

  it('returns next week when today is the weekday and it already ran', () => {
    expect(
      getNextCollectionScheduleRunAt(
        { frequency: 'weekly', weekday: 1 },
        at(2026, 7, 27, 8),
        at(2026, 7, 27)
      )
    ).toEqual(at(2026, 8, 3, 0));
  });

  it('rolls monthly into the next month once the date has passed', () => {
    expect(
      getNextCollectionScheduleRunAt(
        { frequency: 'monthly', monthDay: 15 },
        at(2026, 7, 15),
        at(2026, 7, 20)
      )
    ).toEqual(at(2026, 8, 15, 0));
  });

  it('counts a custom schedule from the last Run', () => {
    expect(
      getNextCollectionScheduleRunAt(
        { frequency: 'custom', everyDays: 5 },
        at(2026, 7, 27, 22),
        at(2026, 7, 28)
      )
    ).toEqual(at(2026, 8, 1, 0));
  });
});
