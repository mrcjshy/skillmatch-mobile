export type HomeGreeting = 'Good morning' | 'Good afternoon' | 'Good evening';

/** Device-local hour buckets. Hour must be an integer in 0–23. */
export function greetingForLocalHour(hour: number): HomeGreeting {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new RangeError('hour must be an integer from 0 to 23');
  }
  if (hour >= 5 && hour <= 11) return 'Good morning';
  if (hour >= 12 && hour <= 17) return 'Good afternoon';
  return 'Good evening';
}

/** Greeting from a device-local Date. Defaults to now. */
export function homeGreeting(now: Date = new Date()): HomeGreeting {
  return greetingForLocalHour(now.getHours());
}

/**
 * Today's device-local calendar date as "Friday · October 3": the weekday, then the locale's own
 * month-and-day wording, so the order and spelling still follow the device locale.
 */
export function homeDate(now: Date = new Date()): string {
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(now);
  const day = new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric' }).format(now);
  return `${weekday} · ${day}`;
}
