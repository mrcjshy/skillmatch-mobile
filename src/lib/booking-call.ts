import { normalizePhilippineMobile } from './philippine-phone';

export function bookingDialUrl(released: boolean, phone: string | null): string | null {
  if (!released || phone === null) return null;
  const normalized = normalizePhilippineMobile(phone);
  return normalized === null ? null : `tel:${normalized}`;
}
