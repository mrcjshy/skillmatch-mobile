import { describe, expect, it } from 'vitest';

import {
  availableScheduleSlots,
  combineJobSchedule,
  firstOpenSchedulePeriod,
  isScheduleDayOpen,
  isScheduleDaySelectable,
  isScheduleSlotOpen,
  postingScheduleError,
  scheduleDayStrip,
  scheduleMinimumDate,
  scheduleMonthWeeks,
  schedulePeriodForTime,
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

describe('same-day booking slots', () => {
  const evening = new Date(2026, 9, 30, 19, 10);
  const label = (slots: Date[]) => slots.map(slot => `${slot.getHours()}:${String(slot.getMinutes()).padStart(2, '0')}`);

  it('offers today as a real choice, starting half an hour from now', () => {
    expect(label(availableScheduleSlots(new Date(2026, 9, 30), 'evening', evening)).slice(0, 3)).toEqual(['20:00', '20:30', '21:00']);
    expect(isScheduleDayOpen(new Date(2026, 9, 30), evening)).toBe(true);
  });

  it('keeps a slot that starts exactly half an hour out', () => {
    expect(label(availableScheduleSlots(new Date(2026, 9, 30), 'evening', new Date(2026, 9, 30, 19, 30)))[0]).toBe('20:00');
    expect(label(availableScheduleSlots(new Date(2026, 9, 30), 'evening', new Date(2026, 9, 30, 19, 29)))[0]).toBe('20:00');
    expect(label(availableScheduleSlots(new Date(2026, 9, 30), 'evening', new Date(2026, 9, 30, 19, 0)))[0]).toBe('19:30');
  });

  it('gives every period twelve half-hour slots on a future day', () => {
    const tomorrow = new Date(2026, 9, 31);
    expect(label(availableScheduleSlots(tomorrow, 'morning', evening))).toHaveLength(12);
    expect(label(availableScheduleSlots(tomorrow, 'morning', evening))[0]).toBe('6:00');
    expect(label(availableScheduleSlots(tomorrow, 'afternoon', evening))[0]).toBe('12:00');
    expect(label(availableScheduleSlots(tomorrow, 'evening', evening)).at(-1)).toBe('23:30');
  });

  it('every offered slot passes the posting check', () => {
    for (const period of ['morning', 'afternoon', 'evening'] as const) {
      for (const slot of availableScheduleSlots(new Date(2026, 9, 30), period, evening)) {
        expect(postingScheduleError(new Date(2026, 9, 30), slot, evening)).toBeNull();
      }
    }
  });

  it('closes today once no slot is left, and never closes a later day', () => {
    const late = new Date(2026, 9, 30, 23, 15);
    expect(isScheduleDayOpen(new Date(2026, 9, 30), late)).toBe(false);
    expect(isScheduleDayOpen(new Date(2026, 9, 31), late)).toBe(true);
    expect(firstOpenSchedulePeriod(new Date(2026, 9, 30), late)).toBeNull();
  });

  it('opens on the first period that still has times', () => {
    expect(firstOpenSchedulePeriod(new Date(2026, 9, 30), evening)).toBe('evening');
    expect(firstOpenSchedulePeriod(new Date(2026, 9, 30), new Date(2026, 9, 30, 13, 0))).toBe('afternoon');
    expect(firstOpenSchedulePeriod(new Date(2026, 9, 31), evening)).toBe('morning');
  });

  it('places a chosen time back in its period', () => {
    expect(schedulePeriodForTime(new Date(2026, 9, 30, 5, 0))).toBe('morning');
    expect(schedulePeriodForTime(new Date(2026, 9, 30, 11, 30))).toBe('morning');
    expect(schedulePeriodForTime(new Date(2026, 9, 30, 12, 0))).toBe('afternoon');
    expect(schedulePeriodForTime(new Date(2026, 9, 30, 18, 0))).toBe('evening');
  });

  it('notices when a chosen time has slipped out of reach on the chosen day', () => {
    expect(isScheduleSlotOpen(new Date(2026, 9, 30), new Date(2026, 9, 30, 8, 0), evening)).toBe(false);
    expect(isScheduleSlotOpen(new Date(2026, 9, 30), new Date(2026, 9, 30, 21, 0), evening)).toBe(true);
    expect(isScheduleSlotOpen(new Date(2026, 9, 31), new Date(2026, 9, 30, 8, 0), evening)).toBe(true);
  });
});

describe('date choices', () => {
  const now = new Date(2026, 9, 30, 19, 10);

  it('starts the strip with Today and Tomorrow, then named days', () => {
    const days = scheduleDayStrip(now, 5);
    expect(days.map(day => day.title)).toEqual(['Today', 'Tomorrow', 'Sun', 'Mon', 'Tue']);
    expect(days.map(day => day.date.getDate())).toEqual([30, 31, 1, 2, 3]);
    expect(days[2].date.getMonth()).toBe(10);
  });

  it('crosses a year end without drifting', () => {
    const days = scheduleDayStrip(new Date(2026, 11, 31, 10, 0), 2);
    expect(days[1].date.getFullYear()).toBe(2027); expect(days[1].date.getMonth()).toBe(0); expect(days[1].date.getDate()).toBe(1);
  });

  it('lays a month out in full Sunday-first weeks', () => {
    const weeks = scheduleMonthWeeks(2026, 9);
    expect(weeks.every(week => week.length === 7)).toBe(true);
    expect(weeks[0].slice(0, 4)).toEqual([null, null, null, null]);
    expect(weeks[0][4]?.getDate()).toBe(1); // Oct 1 2026 is a Thursday.
    expect(weeks.flat().filter(day => day !== null)).toHaveLength(31);
  });

  it('allows today through a year ahead, and nothing earlier', () => {
    expect(isScheduleDaySelectable(new Date(2026, 9, 30), now)).toBe(true);
    expect(isScheduleDaySelectable(new Date(2026, 9, 29), now)).toBe(false);
    expect(isScheduleDaySelectable(new Date(2027, 9, 30), now)).toBe(true);
    expect(isScheduleDaySelectable(new Date(2027, 9, 31), now)).toBe(false);
  });
});
