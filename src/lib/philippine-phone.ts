const SAFE_PRESENTATION = /[\s()-]/g;
const PH_MOBILE_E164 = /^\+639\d{9}$/;

export function normalizePhilippineMobile(input: string): string | null {
  if (/[A-Za-z]/.test(input)) return null;
  const compact = input.trim().replace(SAFE_PRESENTATION, '');
  // Accepted shapes: +63 9XX…, 0 9XX…, 9XX…, and 63 9XX… (12 digits, the form Supabase Auth
  // returns in `user.phone`, which omits the plus sign). Lengths keep the shapes unambiguous.
  const national = compact.startsWith('+63')
    ? compact.slice(3)
    : compact.startsWith('0')
      ? compact.slice(1)
      : /^63\d{10}$/.test(compact)
        ? compact.slice(2)
        : compact;
  const normalized = `+63${national}`;
  return PH_MOBILE_E164.test(normalized) ? normalized : null;
}

export function formatPhilippineMobileInput(input: string): string {
  const normalized = normalizePhilippineMobile(input);
  return normalized === null
    ? input
    : `${normalized.slice(3, 6)} ${normalized.slice(6, 9)} ${normalized.slice(9)}`;
}
