import { beforeEach, describe, expect, it, vi } from 'vitest';

import { supabase } from './supabase';
import {
  AccountModerationError, MODERATION_REASON_MAX, loadAccountModeration, normaliseModerationReason,
  parseAccountModeration, parseModerationResult, setAccountBanned, strikeSummary,
} from './admin-account-moderation';

vi.mock('./supabase', () => ({ supabase: { rpc: vi.fn() } }));

const id = '12345678-1234-1234-1234-123456789abc';
const read = { is_active: false, strike_count: 3, last_action: null, last_reason: null, last_action_at: null };
const banned = { is_active: false, strike_count: null, last_action: 'ban', last_reason: 'Abuse', last_action_at: '2026-11-03T12:00:00Z' };
const result = { user_id: id, is_active: true, strike_count: 0, changed: true };
const rpc = vi.mocked(supabase.rpc);

beforeEach(() => rpc.mockReset());

describe('MOD-01 moderation response boundary', () => {
  it('accepts the exact single-row read for a 3-strike Worker and a banned Client', () => {
    expect(parseAccountModeration([read])).toEqual(read);
    expect(parseAccountModeration([banned])).toEqual(banned);
  });

  it('rejects extra keys, several rows, strikes outside 0..3, unknown actions and half-filled history', () => {
    for (const value of [
      [{ ...read, email: 'private@example.test' }], [read, read], [], read, null,
      [{ ...read, strike_count: 4 }], [{ ...read, strike_count: -1 }], [{ ...read, strike_count: 1.5 }],
      [{ ...banned, last_action: 'warn' }], [{ ...banned, last_reason: null }], [{ ...read, last_reason: 'x' }],
    ]) expect(() => parseAccountModeration(value)).toThrow();
  });

  it('accepts a write result only for the requested account', () => {
    expect(parseModerationResult([result], id)).toEqual(result);
    expect(parseModerationResult([result], id.toUpperCase())).toEqual(result);
    expect(() => parseModerationResult([{ ...result, user_id: '12345678-1234-1234-1234-123456789abd' }], id)).toThrow();
    expect(() => parseModerationResult([{ ...result, changed: 'yes' }], id)).toThrow();
  });
});

describe('MOD-01 reason and strike copy', () => {
  it('trims the reason and enforces 1 to 500 characters', () => {
    expect(normaliseModerationReason('  Abuse  ')).toBe('Abuse');
    expect(normaliseModerationReason('   ')).toBeNull();
    expect(normaliseModerationReason('a'.repeat(MODERATION_REASON_MAX))).toHaveLength(MODERATION_REASON_MAX);
    expect(normaliseModerationReason('a'.repeat(MODERATION_REASON_MAX + 1))).toBeNull();
  });

  it('reads strikes as N of 3', () => {
    expect(strikeSummary(0)).toBe('0 of 3');
    expect(strikeSummary(2)).toBe('2 of 3');
    expect(strikeSummary(null)).toBe('No Worker profile');
  });
});

describe('MOD-01 RPC calls', () => {
  it('bans with the trimmed reason and the exact arguments', async () => {
    rpc.mockResolvedValueOnce({ data: [{ ...result, is_active: false }], error: null } as never);
    await expect(setAccountBanned(id, true, '  Abuse ')).resolves.toMatchObject({ is_active: false, changed: true });
    expect(rpc).toHaveBeenCalledWith('admin_set_account_banned', { p_user_id: id, p_banned: true, p_reason: 'Abuse' });
  });

  it('never calls the server with a blank reason or a malformed id', async () => {
    await expect(setAccountBanned(id, false, '  ')).rejects.toMatchObject({ kind: 'invalid' });
    await expect(setAccountBanned('not-an-id', true, 'x')).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('maps server denials to plain copy', async () => {
    for (const [code, kind] of [['42501', 'access'], ['SM409', 'unavailable'], ['22023', 'invalid'], ['XX000', 'failed']] as const) {
      rpc.mockResolvedValueOnce({ data: null, error: { code, message: 'raw server text' } } as never);
      const error = await setAccountBanned(id, true, 'x').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AccountModerationError);
      expect((error as AccountModerationError).kind).toBe(kind);
      expect((error as Error).message).not.toContain('raw server text');
    }
  });

  it('loads moderation through the read RPC', async () => {
    rpc.mockResolvedValueOnce({ data: [read], error: null } as never);
    await expect(loadAccountModeration(id)).resolves.toEqual(read);
    expect(rpc).toHaveBeenCalledWith('get_admin_account_moderation', { p_user_id: id });
  });
});
