/**
 * R5C-2 Client Profile helpers — presentation only.
 *
 * Client Profile displays existing account fields. It does not introduce a
 * users-row write path. Location stays read-only because barangay/city
 * participate in matching.
 */

export const CLIENT_PROFILE_PRESENTATION_FIELDS = [
  'full_name',
  'phone',
  'email',
  'barangay',
  'city',
] as const;

export const CLIENT_ACCOUNT_LOCKED_WRITE_FIELDS = [
  'full_name',
  'phone',
  'email',
  'barangay',
  'city',
  'role',
  'is_active',
] as const;

export const CLIENT_HELP_PATH = '/client/help';

export type ClientProfileAccountInput = {
  full_name: string;
  phone: string;
  email: string;
  barangay: string;
  city: string;
};

export type ClientProfileView = {
  fullName: string;
  location: string;
  phone: string;
  email: string;
};

export function presentClientProfile(
  account: ClientProfileAccountInput | null
): ClientProfileView {
  if (!account) {
    return {
      fullName: '—',
      location: '—',
      phone: '—',
      email: '—',
    };
  }

  return {
    fullName: account.full_name,
    location: `${account.barangay}, ${account.city}`,
    phone: account.phone,
    email: account.email,
  };
}
