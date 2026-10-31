/**
 * Client Post Job schedule assembly.
 *
 * The in-app date strip, month calendar and time slots own the choices; this
 * helper offers them and combines the parts into one local Date. The RPC
 * payload remains Date.toISOString(). Timezone contract is unchanged.
 */

export type SchedulePeriod = 'morning' | 'afternoon' | 'evening';

export const SCHEDULE_PERIODS: readonly { value: SchedulePeriod; label: string }[] = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
];

/** A same-day slot must leave a Worker time to see the job and the Client time to finish posting. */
const SAME_DAY_LEAD_MINUTES = 30;
const SLOT_MINUTES = 30;
const SLOTS_PER_PERIOD = 12;
const PERIOD_START_HOUR: Record<SchedulePeriod, number> = { morning: 6, afternoon: 12, evening: 18 };
const SCHEDULE_HORIZON_YEARS = 1;

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function earliestSlotStart(now: Date): number {
  return now.getTime() + SAME_DAY_LEAD_MINUTES * 60_000;
}

export function scheduleMinimumDate(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

/** The slots of one period still open on `day`: every slot on a later day, only reachable ones today. */
export function availableScheduleSlots(day: Date, period: SchedulePeriod, now: Date = new Date()): Date[] {
  const slots: Date[] = [];
  for (let index = 0; index < SLOTS_PER_PERIOD; index++) {
    slots.push(new Date(day.getFullYear(), day.getMonth(), day.getDate(), PERIOD_START_HOUR[period], index * SLOT_MINUTES, 0, 0));
  }
  return sameDay(day, now) ? slots.filter(slot => slot.getTime() >= earliestSlotStart(now)) : slots;
}

export function firstOpenSchedulePeriod(day: Date, now: Date = new Date()): SchedulePeriod | null {
  return SCHEDULE_PERIODS.find(({ value }) => availableScheduleSlots(day, value, now).length > 0)?.value ?? null;
}

export function isScheduleDayOpen(day: Date, now: Date = new Date()): boolean {
  return firstOpenSchedulePeriod(day, now) !== null;
}

/** False once a chosen time has slipped out of reach on the chosen day (only today can do that). */
export function isScheduleSlotOpen(day: Date, time: Date, now: Date = new Date()): boolean {
  if (!sameDay(day, now)) return true;
  const slot = new Date(day.getFullYear(), day.getMonth(), day.getDate(), time.getHours(), time.getMinutes(), 0, 0);
  return slot.getTime() >= earliestSlotStart(now);
}

export function schedulePeriodForTime(time: Date): SchedulePeriod {
  const hour = time.getHours();
  if (hour < PERIOD_START_HOUR.afternoon) return 'morning';
  return hour < PERIOD_START_HOUR.evening ? 'afternoon' : 'evening';
}

export type ScheduleDay = { date: Date; title: string };

/** The next `count` days, nearest first. Today and Tomorrow read as words, later days by weekday. */
export function scheduleDayStrip(now: Date, count: number): ScheduleDay[] {
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
  return Array.from({ length: count }, (_unused, offset) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    return { date, title: offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : weekday.format(date) };
  });
}

/** Full Sunday-first weeks of one month. Days outside the month are null. */
export function scheduleMonthWeeks(year: number, month: number): (Date | null)[][] {
  const cells: (Date | null)[] = Array.from({ length: new Date(year, month, 1).getDay() }, () => null);
  const days = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= days; day++) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_unused, week) => cells.slice(week * 7, week * 7 + 7));
}

export function isScheduleDaySelectable(day: Date, now: Date = new Date()): boolean {
  const last = new Date(now.getFullYear() + SCHEDULE_HORIZON_YEARS, now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return day.getTime() >= scheduleMinimumDate(now).getTime() && day.getTime() <= last.getTime();
}

export function combineJobSchedule(date: Date | null, time: Date | null): Date | null {
  if (date === null || time === null) return null;
  if (Number.isNaN(date.getTime()) || Number.isNaN(time.getTime())) return null;
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    time.getHours(),
    time.getMinutes(),
    0,
    0
  );
}

export function postingScheduleError(
  date: Date | null,
  time: Date | null,
  now: Date = new Date()
): string | null {
  if (date === null || Number.isNaN(date.getTime())) {
    return 'Please choose a date.';
  }
  if (time === null || Number.isNaN(time.getTime())) {
    return 'Please choose a time.';
  }
  const schedule = combineJobSchedule(date, time);
  if (schedule === null) {
    return 'Please choose a valid date and time.';
  }
  if (schedule.getTime() <= now.getTime()) {
    return 'Please choose a schedule in the future.';
  }
  return null;
}
