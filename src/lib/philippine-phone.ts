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

/** Live validation of a Philippine mobile number while it is typed (owner request 2026-11-05). */
export type PhilippineMobileCheck =
  | { state: 'empty' }
  | { state: 'incomplete'; remaining: number }
  | { state: 'invalid'; message: string }
  | { state: 'valid'; e164: string };

export const PHILIPPINE_MOBILE_COPY = {
  characters: 'Use digits only, such as 0917 123 4567.',
  prefix: 'Philippine mobile numbers start with 09 or +63 9.',
  tooLong: 'Too many digits. A Philippine mobile number has 11 digits, such as 0917 123 4567.',
  incomplete: 'This number is incomplete. A Philippine mobile number has 11 digits, such as 0917 123 4567.',
  valid: 'Valid Philippine mobile number',
  remaining: (n: number) => `${n} more digit${n === 1 ? '' : 's'}`,
} as const;

const NATIONAL_LENGTH = 10; // 9XX XXX XXXX after the 0 or +63

/**
 * Checks a number as the person types. A number is 'valid' exactly when normalizePhilippineMobile
 * accepts it; 'incomplete' means it can still become valid; 'invalid' means more typing cannot fix it.
 * Accepted starts: 09, 9, +63 9 and 63 9 (the form Supabase Auth returns).
 */
export function checkPhilippineMobile(input: string): PhilippineMobileCheck {
  const compact = input.trim().replace(SAFE_PRESENTATION, '');
  if (compact === '') return { state: 'empty' };
  if (!/^\+?\d*$/.test(compact)) return { state: 'invalid', message: PHILIPPINE_MOBILE_COPY.characters };

  let national: string;
  if (compact.startsWith('+')) {
    if ('+63'.startsWith(compact)) return { state: 'incomplete', remaining: NATIONAL_LENGTH };
    if (!compact.startsWith('+63')) return { state: 'invalid', message: PHILIPPINE_MOBILE_COPY.prefix };
    national = compact.slice(3);
  } else if (compact.startsWith('6')) {
    if (compact === '6' || compact === '63') return { state: 'incomplete', remaining: NATIONAL_LENGTH };
    if (!compact.startsWith('63')) return { state: 'invalid', message: PHILIPPINE_MOBILE_COPY.prefix };
    national = compact.slice(2);
  } else if (compact.startsWith('0')) {
    national = compact.slice(1);
  } else {
    national = compact;
  }

  if (national === '') return { state: 'incomplete', remaining: NATIONAL_LENGTH };
  if (!national.startsWith('9')) return { state: 'invalid', message: PHILIPPINE_MOBILE_COPY.prefix };
  if (national.length > NATIONAL_LENGTH) return { state: 'invalid', message: PHILIPPINE_MOBILE_COPY.tooLong };
  if (national.length < NATIONAL_LENGTH) return { state: 'incomplete', remaining: NATIONAL_LENGTH - national.length };
  return { state: 'valid', e164: `+63${national}` };
}

export function formatPhilippineMobileInput(input: string): string {
  const normalized = normalizePhilippineMobile(input);
  return normalized === null
    ? input
    : `${normalized.slice(3, 6)} ${normalized.slice(6, 9)} ${normalized.slice(9)}`;
}
