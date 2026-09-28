import { isBookingChatAvailable } from './bookings';
import { firstNameFromFullName, initialsFromName } from './initials';

export type ChatRole = 'worker' | 'client';

export type ChatBooking = {
  status: string;
  jobTitle: string;
  counterpartName: string | null;
};

/** Missing and unrelated bookings have the same result. */
export function findChatBooking(
  role: ChatRole,
  rows: unknown,
  bookingId: string
): ChatBooking | null {
  if (!Array.isArray(rows)) return null;
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const record = row as Record<string, unknown>;
    if (record.booking_id === bookingId) return chatBookingFromRow(role, record);
  }
  return null;
}

/** Consume only the status, title and role-specific name from an authorized list row. */
export function chatBookingFromRow(role: ChatRole, row: unknown): ChatBooking | null {
  if (typeof row !== 'object' || row === null) return null;
  const record = row as Record<string, unknown>;
  const status = typeof record.booking_status === 'string' ? record.booking_status : null;
  const jobTitle = typeof record.job_title === 'string' ? record.job_title : null;
  if (status === null || jobTitle === null) return null;

  const nameField = role === 'worker' ? record.client_full_name : record.worker_full_name;
  const name = typeof nameField === 'string' ? nameField.trim().replace(/\s+/g, ' ') : '';
  return {
    status,
    jobTitle,
    counterpartName: isBookingChatAvailable(status) && name ? name : null,
  };
}

export type CounterpartPresentation = {
  name: string;
  firstName: string;
  initials: string;
};

/** No identity is produced for a booking whose chat is unavailable. */
export function counterpartPresentation(
  role: ChatRole,
  booking: ChatBooking | null
): CounterpartPresentation | null {
  if (booking === null || !isBookingChatAvailable(booking.status)) return null;
  const fallback = role === 'worker' ? 'Client' : 'Worker';
  const name = booking.counterpartName?.trim() || fallback;
  // Chat uses one letter for a single-word name or role fallback.
  const initials = name.includes(' ') ? initialsFromName(name) : name[0].toUpperCase();
  return { name, firstName: firstNameFromFullName(name), initials };
}

export function messageAuthor(
  senderId: string,
  authenticatedUserId: string,
  counterpart: CounterpartPresentation
): string {
  return senderId === authenticatedUserId ? 'You' : counterpart.firstName;
}
