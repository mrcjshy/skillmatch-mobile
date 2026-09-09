type DateTimeValue = string | Date | null | undefined;

function parseDateTime(value: DateTimeValue): Date | null {
  if (value === null || value === undefined) return null;
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function format(value: DateTimeValue, options: Intl.DateTimeFormatOptions): string | null {
  const parsed = parseDateTime(value);
  if (parsed === null) return null;
  return new Intl.DateTimeFormat(undefined, { ...options, hour12: true }).format(parsed);
}

/** Device-local compact card timestamp, for example "Sep 18 • 9:00 AM". */
export function formatCardDateTime(value: DateTimeValue): string | null {
  const parsed = parseDateTime(value);
  if (parsed === null) return null;
  const date = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(parsed);
  const time = format(parsed, { hour: 'numeric', minute: '2-digit' });
  return time === null ? null : `${date} • ${time}`;
}

/** Device-local detail timestamp, for example "September 18, 2026 at 9:00 AM". */
export function formatDetailDateTime(value: DateTimeValue): string | null {
  return format(value, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Same-day values show only the time; older values use the compact card form. */
export function formatCompactDateTime(
  value: DateTimeValue,
  now: Date = new Date()
): string | null {
  const parsed = parseDateTime(value);
  const current = parseDateTime(now);
  if (parsed === null || current === null) return null;
  const sameDay =
    parsed.getFullYear() === current.getFullYear() &&
    parsed.getMonth() === current.getMonth() &&
    parsed.getDate() === current.getDate();
  return sameDay
    ? format(parsed, { hour: 'numeric', minute: '2-digit' })
    : formatCardDateTime(parsed);
}
