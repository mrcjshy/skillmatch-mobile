import { describe, expect, it } from 'vitest';
import { formatNotificationTime, groupNotificationsByDay, notificationKind, type NotificationRow } from './notifications';

const row = (id: string, created_at: string | null, type = 'booking_confirmed'): NotificationRow =>
  ({ id, type, message: `Message ${id}`, is_read: false, created_at }) as NotificationRow;
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).toISOString();

describe('notification inbox presentation', () => {
  it('groups consecutive rows by local day, keeping the server order', () => {
    const now = new Date(2026, 10, 3, 19, 0);
    const rows = [row('a', at(2026, 10, 3, 17)), row('b', at(2026, 10, 3, 9)), row('c', at(2026, 10, 2, 15)), row('d', at(2026, 9, 30, 22)), row('e', at(2026, 9, 30, 19))];
    const days = groupNotificationsByDay(rows, now);
    expect(days.map(d => d.title)).toEqual([
      'Today', 'Yesterday',
      new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(2026, 9, 30)),
    ]);
    expect(days.map(d => d.rows.map(r => r.id))).toEqual([['a', 'b'], ['c'], ['d', 'e']]);
    expect(days.flatMap(d => d.rows)).toEqual(rows);
  });
  it('adds the year for an older year and keeps undated rows in a final Earlier section', () => {
    const now = new Date(2026, 0, 2, 10);
    const days = groupNotificationsByDay([row('x', at(2025, 11, 20)), row('y', null), row('z', 'not a date')], now);
    expect(days[0].title).toBe(new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(2025, 11, 20)));
    expect(days[1]).toMatchObject({ key: 'undated', title: 'Earlier' });
    expect(days[1].rows.map(r => r.id)).toEqual(['y', 'z']);
    expect(groupNotificationsByDay([], now)).toEqual([]);
  });
  it('maps each type to a kind and never leaks an unknown type', () => {
    expect(notificationKind('booking_confirmed')).toBe('confirmed');
    expect(notificationKind('booking_cancelled')).toBe('cancelled');
    expect(notificationKind('payment_received')).toBe('payment');
    expect(notificationKind('no_show_strike')).toBe('warning');
    expect(notificationKind('something_new')).toBe('general');
  });
  it('shows only the local time of day', () => {
    const iso = new Date(2026, 10, 2, 17, 21).toISOString();
    expect(formatNotificationTime(iso)).toBe(new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso)));
    expect(formatNotificationTime(null)).toBeNull();
    expect(formatNotificationTime('nope')).toBeNull();
  });
});
