import {
  BookingLoadError,
  BookingStatus,
  isBookingStatus,
  toNullableBoolean,
  toNullableText,
  toNumber,
  toStringArrayOrNull,
} from '@/lib/bookings';
import { supabase } from '@/lib/supabase';

export type BookingRole = 'worker' | 'client';
export type BookingSegment = 'active' | 'history';

export type BaseBooking = {
  booking_id: string;
  job_id: string;
  booking_status: BookingStatus;
  payment_status: string | null;
  booked_at: string | null;
  completed_at: string | null;
  job_title: string;
  job_description: string | null;
  job_scheduled_at: string | null;
  job_address: string | null;
  job_barangay: string | null;
  job_city: string | null;
  job_budget: number | null;
};

export type WorkerBooking = BaseBooking & {
  client_user_id: string;
  client_full_name: string | null;
  client_phone: string | null;
};

export type ClientBooking = BaseBooking & {
  worker_user_id: string;
  worker_full_name: string | null;
  worker_phone: string | null;
  worker_barangay: string | null;
  /** null = suppressed; [] = released with no skills; values = released skills. */
  worker_skills: string[] | null;
  worker_is_verified: boolean | null;
  worker_rating_avg: number | null;
  worker_rating_count: number | null;
};

export type RoleBooking = WorkerBooking | ClientBooking;

export function segmentForBookingStatus(status: BookingStatus): BookingSegment {
  return status === 'pending' || status === 'confirmed' ? 'active' : 'history';
}

export function bookingsForSegment<T extends BaseBooking>(
  bookings: readonly T[],
  segment: BookingSegment
): T[] {
  // Filter only. The participant RPC's authoritative newest-first order stays intact.
  return bookings.filter((booking) => segmentForBookingStatus(booking.booking_status) === segment);
}

function readBaseBooking(row: Record<string, unknown>): BaseBooking | null {
  const bookingId = typeof row.booking_id === 'string' ? row.booking_id : null;
  const jobId = typeof row.job_id === 'string' ? row.job_id : null;
  const status = typeof row.booking_status === 'string' ? row.booking_status : null;
  const title = typeof row.job_title === 'string' ? row.job_title : null;

  if (bookingId === null || jobId === null || status === null || title === null) return null;
  if (!isBookingStatus(status)) return null;

  return {
    booking_id: bookingId,
    job_id: jobId,
    booking_status: status,
    payment_status: toNullableText(row.payment_status),
    booked_at: toNullableText(row.booked_at),
    completed_at: toNullableText(row.completed_at),
    job_title: title,
    job_description: toNullableText(row.job_description),
    job_scheduled_at: toNullableText(row.job_scheduled_at),
    job_address: toNullableText(row.job_address),
    job_barangay: toNullableText(row.job_barangay),
    job_city: toNullableText(row.job_city),
    job_budget: toNumber(row.job_budget),
  };
}

function toWorkerBooking(row: unknown): WorkerBooking | null {
  if (typeof row !== 'object' || row === null) return null;
  const record = row as Record<string, unknown>;
  const base = readBaseBooking(record);
  const clientUserId = typeof record.client_user_id === 'string' ? record.client_user_id : null;
  if (base === null || clientUserId === null) return null;

  return {
    ...base,
    client_user_id: clientUserId,
    client_full_name: toNullableText(record.client_full_name),
    client_phone: toNullableText(record.client_phone),
  };
}

function toClientBooking(row: unknown): ClientBooking | null {
  if (typeof row !== 'object' || row === null) return null;
  const record = row as Record<string, unknown>;
  const base = readBaseBooking(record);
  const workerUserId = typeof record.worker_user_id === 'string' ? record.worker_user_id : null;
  if (base === null || workerUserId === null) return null;

  return {
    ...base,
    worker_user_id: workerUserId,
    worker_full_name: toNullableText(record.worker_full_name),
    worker_phone: toNullableText(record.worker_phone),
    worker_barangay: toNullableText(record.worker_barangay),
    worker_skills: toStringArrayOrNull(record.worker_skills),
    worker_is_verified: toNullableBoolean(record.worker_is_verified),
    worker_rating_avg: toNumber(record.worker_rating_avg),
    worker_rating_count: toNumber(record.worker_rating_count),
  };
}

function throwLoadError(error: { message: string; code?: string | null }): never {
  throw new BookingLoadError(error.message || 'The request failed.', error.code ?? null);
}

export async function loadWorkerBookings(): Promise<WorkerBooking[]> {
  const result = await supabase.rpc('list_my_worker_bookings');
  if (result.error) throwLoadError(result.error);
  const rows = Array.isArray(result.data) ? result.data : [];
  return rows.map(toWorkerBooking).filter((booking): booking is WorkerBooking => booking !== null);
}

export async function loadClientBookings(): Promise<ClientBooking[]> {
  const result = await supabase.rpc('list_my_client_bookings');
  if (result.error) throwLoadError(result.error);
  const rows = Array.isArray(result.data) ? result.data : [];
  return rows.map(toClientBooking).filter((booking): booking is ClientBooking => booking !== null);
}

export function isWorkerBooking(booking: RoleBooking): booking is WorkerBooking {
  return 'client_user_id' in booking;
}

export function isClientBooking(booking: RoleBooking): booking is ClientBooking {
  return 'worker_user_id' in booking;
}
