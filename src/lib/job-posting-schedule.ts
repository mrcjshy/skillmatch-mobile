/**
 * Client Post Job schedule assembly.
 *
 * Native date and time pickers own calendar/clock state. This helper combines
 * those parts into one local Date. The RPC payload remains Date.toISOString().
 * Timezone contract is unchanged.
 */

export function scheduleMinimumDate(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
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
