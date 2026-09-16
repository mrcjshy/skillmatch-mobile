import { describe, expect, it } from 'vitest';

import {
  combineJobSchedule,
  postingScheduleError,
  scheduleMinimumDate,
} from './job-posting-schedule';

describe('combineJobSchedule', () => {
  it('assembles a valid local date and time', () => {
    const date = new Date(2026, 8, 16);
    const time = new Date(2026, 0, 1, 15, 30, 45, 123);
    const schedule = combineJobSchedule(date, time);
    expect(schedule).not.toBeNull();
    expect(schedule?.getFullYear()).toBe(2026);
    expect(schedule?.getMonth()).toBe(8);
    expect(schedule?.getDate()).toBe(16);
    expect(schedule?.getHours()).toBe(15);
    expect(schedule?.getMinutes()).toBe(30);
    expect(schedule?.getSeconds()).toBe(0);
    expect(schedule?.getMilliseconds()).toBe(0);
  });

  it('returns null when date or time is missing or invalid', () => {
    const date = new Date(2026, 8, 16);
    const time = new Date(2026, 8, 16, 9, 0);
    expect(combineJobSchedule(null, time)).toBeNull();
    expect(combineJobSchedule(date, null)).toBeNull();
    expect(combineJobSchedule(new Date(Number.NaN), time)).toBeNull();
    expect(combineJobSchedule(date, new Date(Number.NaN))).toBeNull();
  });

  it('keeps the calendar date when the time value is in another month and year', () => {
    const date = new Date(2027, 0, 1);
    const time = new Date(2026, 11, 31, 8, 5);
    const schedule = combineJobSchedule(date, time);
    expect(schedule?.getFullYear()).toBe(2027);
    expect(schedule?.getMonth()).toBe(0);
    expect(schedule?.getDate()).toBe(1);
    expect(schedule?.getHours()).toBe(8);
    expect(schedule?.getMinutes()).toBe(5);
  });
});

describe('postingScheduleError', () => {
  const now = new Date(2026, 8, 16, 14, 0, 0);

  it('requires a date before a time', () => {
    expect(postingScheduleError(null, null, now)).toBe('Please choose a date.');
    expect(postingScheduleError(null, new Date(2026, 8, 16, 15, 0), now)).toBe(
      'Please choose a date.'
    );
    expect(postingScheduleError(new Date(2026, 8, 16), null, now)).toBe(
      'Please choose a time.'
    );
  });

  it('accepts a same-day future time', () => {
    expect(
      postingScheduleError(new Date(2026, 8, 16), new Date(2026, 8, 16, 14, 1), now)
    ).toBeNull();
  });

  it('rejects a same-day past time', () => {
    expect(
      postingScheduleError(new Date(2026, 8, 16), new Date(2026, 8, 16, 13, 59), now)
    ).toBe('Please choose a schedule in the future.');
  });

  it('rejects a past date even with a later clock time', () => {
    expect(
      postingScheduleError(new Date(2026, 8, 15), new Date(2026, 8, 16, 18, 0), now)
    ).toBe('Please choose a schedule in the future.');
  });

  it('rejects the current instant', () => {
    expect(
      postingScheduleError(new Date(2026, 8, 16), new Date(2026, 8, 16, 14, 0), now)
    ).toBe('Please choose a schedule in the future.');
  });
});

describe('scheduled ISO payload', () => {
  it('emits a valid ISO string that round-trips the assembled instant', () => {
    const schedule = combineJobSchedule(new Date(2026, 11, 31), new Date(2026, 0, 1, 23, 45));
    expect(schedule).not.toBeNull();
    const iso = schedule!.toISOString();
    expect(Number.isNaN(Date.parse(iso))).toBe(false);
    expect(iso.endsWith('Z')).toBe(true);
    expect(new Date(iso).getTime()).toBe(schedule!.getTime());
  });
});

describe('scheduleMinimumDate', () => {
  it('uses the current local calendar date at midnight', () => {
    const now = new Date(2026, 8, 16, 22, 15, 30);
    const min = scheduleMinimumDate(now);
    expect(min.getFullYear()).toBe(2026);
    expect(min.getMonth()).toBe(8);
    expect(min.getDate()).toBe(16);
    expect(min.getHours()).toBe(0);
    expect(min.getMinutes()).toBe(0);
  });
});
