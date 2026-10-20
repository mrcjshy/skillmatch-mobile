/** Renderable facts from the confirmed-only participant RPC; never an own-Worker resume model. */
export type ClientResume = {
  fullName: string | null;
  phone: string | null;
  barangay: string | null;
  skills: string[];
  isVerified: boolean | null;
  ratingAvg: number | null;
  ratingCount: number | null;
};

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** Pure projection, not an authorization decision. The caller must re-read its own booking. */
export function projectClientResume(booking: Record<string, unknown>): ClientResume | null {
  if (booking.booking_status !== 'confirmed') return null;
  const count = booking.worker_rating_count;
  const ratingCount = typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 ? count : null;
  const avg = booking.worker_rating_avg;
  const ratingAvg = ratingCount !== null && ratingCount > 0 && typeof avg === 'number' &&
    Number.isFinite(avg) && avg >= 1 && avg <= 5 ? avg : null;
  const skills = Array.isArray(booking.worker_skills)
    ? booking.worker_skills.map(text).filter((name): name is string => name !== null) : [];
  // Explicit allowlist: email, bio, proficiency, private location and administrative
  // fields are not part of the existing confirmed-booking professional projection.
  return {
    fullName: text(booking.worker_full_name),
    phone: text(booking.worker_phone),
    barangay: text(booking.worker_barangay),
    skills: [...new Set(skills)].sort((a, b) => a.localeCompare(b)),
    isVerified: typeof booking.worker_is_verified === 'boolean' ? booking.worker_is_verified : null,
    ratingAvg,
    ratingCount,
  };
}
