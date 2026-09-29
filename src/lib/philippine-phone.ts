const SAFE_PRESENTATION = /[\s()-]/g;
const PH_MOBILE_E164 = /^\+639\d{9}$/;

export function normalizePhilippineMobile(input: string): string | null {
  if (/[A-Za-z]/.test(input)) return null;
  const compact = input.trim().replace(SAFE_PRESENTATION, '');
  const national = compact.startsWith('+63')
    ? compact.slice(3)
    : compact.startsWith('0')
      ? compact.slice(1)
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
