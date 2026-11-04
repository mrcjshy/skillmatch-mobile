import { isCanonicalUserId } from './admin-user-detail';
import { supabase } from './supabase';

/**
 * MOD-01: Administrator ban / reinstate of one Worker or Client account. A ban is the same account
 * state as the third no-show strike (is_active = false) and lasts until an Administrator reinstates
 * it; reinstating a Worker also resets their no-show strikes to 0. The server owns every rule
 * (admin-only, never an Administrator or yourself, reason required); this module only shapes input
 * and parses the two RPCs strictly.
 */

export const MAX_STRIKES = 3;
export const MODERATION_REASON_MAX = 500;

export type ModerationAction = 'ban' | 'reinstate';

export type AccountModeration = {
  is_active: boolean;
  /** NULL for Clients and for Workers without a profile. */
  strike_count: number | null;
  last_action: ModerationAction | null;
  last_reason: string | null;
  last_action_at: string | null;
};

export type ModerationResult = {
  user_id: string;
  is_active: boolean;
  strike_count: number | null;
  changed: boolean;
};

const READ_KEYS = ['is_active', 'strike_count', 'last_action', 'last_reason', 'last_action_at'];
const WRITE_KEYS = ['user_id', 'is_active', 'strike_count', 'changed'];

export class AccountModerationError extends Error {
  constructor(message: string, readonly kind: 'access' | 'unavailable' | 'invalid' | 'failed') {
    super(message);
  }
}

function exactKeys(row: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(row);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function strikes(value: unknown): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > MAX_STRIKES) {
    throw Error('Invalid moderation response');
  }
  return value as number;
}

function onlyRow(data: unknown): Record<string, unknown> {
  const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw Error('Invalid moderation response');
  return row as Record<string, unknown>;
}

export function parseAccountModeration(data: unknown): AccountModeration {
  const row = onlyRow(data);
  const action = row.last_action;
  if (!exactKeys(row, READ_KEYS) || typeof row.is_active !== 'boolean' ||
      (action !== null && action !== 'ban' && action !== 'reinstate') ||
      (row.last_reason !== null && typeof row.last_reason !== 'string') ||
      (row.last_action_at !== null && typeof row.last_action_at !== 'string') ||
      ((action === null) !== (row.last_reason === null)) || ((action === null) !== (row.last_action_at === null))) {
    throw Error('Invalid moderation response');
  }
  return {
    is_active: row.is_active,
    strike_count: strikes(row.strike_count),
    last_action: action as ModerationAction | null,
    last_reason: row.last_reason as string | null,
    last_action_at: row.last_action_at as string | null,
  };
}

export function parseModerationResult(data: unknown, targetUserId: string): ModerationResult {
  const row = onlyRow(data);
  if (!exactKeys(row, WRITE_KEYS) || !isCanonicalUserId(row.user_id) ||
      row.user_id.toLowerCase() !== targetUserId.toLowerCase() ||
      typeof row.is_active !== 'boolean' || typeof row.changed !== 'boolean') {
    throw Error('Invalid moderation response');
  }
  return { user_id: row.user_id, is_active: row.is_active, strike_count: strikes(row.strike_count), changed: row.changed };
}

/** Returns the trimmed reason, or null when it is empty or longer than the server allows. */
export function normaliseModerationReason(reason: string): string | null {
  const trimmed = reason.trim();
  return trimmed.length > 0 && trimmed.length <= MODERATION_REASON_MAX ? trimmed : null;
}

export function strikeSummary(count: number | null): string {
  return count === null ? 'No Worker profile' : `${count} of ${MAX_STRIKES}`;
}

function rpcError(code: string | undefined): AccountModerationError {
  if (code === '42501') return new AccountModerationError('You no longer have access to account moderation.', 'access');
  if (code === 'SM409') return new AccountModerationError('This account cannot be moderated.', 'unavailable');
  if (code === '22023') return new AccountModerationError(`Enter a reason of 1 to ${MODERATION_REASON_MAX} characters.`, 'invalid');
  return new AccountModerationError('Unable to update the account. Please try again.', 'failed');
}

export async function loadAccountModeration(targetUserId: string): Promise<AccountModeration> {
  if (!isCanonicalUserId(targetUserId)) throw Error('Invalid moderation target');
  const { data, error } = await supabase.rpc('get_admin_account_moderation', { p_user_id: targetUserId });
  if (error) {
    const mapped = rpcError(error.code);
    throw mapped.kind === 'failed' ? new AccountModerationError('Unable to load moderation. Please try again.', 'failed') : mapped;
  }
  return parseAccountModeration(data);
}

export async function setAccountBanned(targetUserId: string, banned: boolean, reason: string): Promise<ModerationResult> {
  if (!isCanonicalUserId(targetUserId)) throw Error('Invalid moderation target');
  const trimmed = normaliseModerationReason(reason);
  if (trimmed === null) throw rpcError('22023');
  const { data, error } = await supabase.rpc('admin_set_account_banned', {
    p_user_id: targetUserId, p_banned: banned, p_reason: trimmed,
  });
  if (error) throw rpcError(error.code);
  return parseModerationResult(data, targetUserId);
}
