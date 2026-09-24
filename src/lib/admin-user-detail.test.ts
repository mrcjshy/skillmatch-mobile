import { describe, expect, it, vi } from 'vitest';

import { supabase } from './supabase';
import { AdminUserDetailAccessError, loadAdminUserDetail, parseAdminUserDetail } from './admin-user-detail';

vi.mock('./supabase', () => ({ supabase: { rpc: vi.fn() } }));

const id = '12345678-1234-1234-1234-123456789abc';
const otherId = '12345678-1234-1234-1234-123456789abd';
const common = { user_id: id, full_name: 'Example', is_active: false, created_at: null };
const worker = {
  ...common, has_profile: false, is_verified: null, availability_status: null,
  completed_bookings_count: 1,
};
const client = { ...common, posted_jobs_count: 3 };

describe('AA-05 Admin user detail response boundary', () => {
  it('accepts exact Worker and Client objects and unavailable SQL NULL', () => {
    expect(parseAdminUserDetail(worker, 'worker', id)).toEqual(worker);
    expect(parseAdminUserDetail(client, 'client', id)).toEqual(client);
    expect(parseAdminUserDetail(null, 'worker', id)).toBeNull();
  });

  it('rejects extra, missing, cross-role and privacy-sensitive keys', () => {
    for (const value of [
      { ...worker, email: 'private@example.test' },
      { ...worker, completed_bookings_count: undefined },
      { detail: worker },
      [worker],
      client,
    ]) expect(() => parseAdminUserDetail(value, 'worker', id)).toThrow();
    expect(() => parseAdminUserDetail(worker, 'client', id)).toThrow();
    expect(() => parseAdminUserDetail({ ...client, has_profile: false }, 'client', id)).toThrow();
  });

  it('keeps missing profile null and permits nullable fields on a present profile', () => {
    expect(() => parseAdminUserDetail({ ...worker, is_verified: false }, 'worker', id)).toThrow();
    expect(() => parseAdminUserDetail({ ...worker, availability_status: 'available' }, 'worker', id)).toThrow();
    expect(parseAdminUserDetail({ ...worker, has_profile: true }, 'worker', id)).toMatchObject({ has_profile: true });
  });

  it('validates canonical target and returned identity and primitive types', () => {
    expect(() => parseAdminUserDetail(worker, 'worker', id.replaceAll('-', ''))).toThrow();
    expect(() => parseAdminUserDetail({ ...worker, user_id: id.replaceAll('-', '') }, 'worker', id)).toThrow();
    expect(() => parseAdminUserDetail({ ...worker, user_id: otherId }, 'worker', id)).toThrow();
    for (const change of [{ full_name: null }, { is_active: 'false' }, { created_at: 42 }, { has_profile: 'false' }]) {
      expect(() => parseAdminUserDetail({ ...worker, ...change }, 'worker', id)).toThrow();
    }
  });

  it('accepts safe bigint strings and rejects malformed counts', () => {
    expect(parseAdminUserDetail({ ...worker, completed_bookings_count: '42' }, 'worker', id))
      .toMatchObject({ completed_bookings_count: 42 });
    for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, '01', '-1', '1.5', '9007199254740992', null]) {
      expect(() => parseAdminUserDetail({ ...worker, completed_bookings_count: value }, 'worker', id)).toThrow();
      expect(() => parseAdminUserDetail({ ...client, posted_jobs_count: value }, 'client', id)).toThrow();
    }
  });

  it('calls the single RPC and maps SQL NULL and errors without leaking backend text', async () => {
    const rpc = vi.mocked(supabase.rpc);
    rpc.mockResolvedValueOnce({ data: null, error: null } as never);
    await expect(loadAdminUserDetail('client', id)).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledWith('get_admin_user_detail', { p_user_id: id, p_expected_role: 'client' });
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'private' } } as never);
    await expect(loadAdminUserDetail('worker', id)).rejects.toBeInstanceOf(AdminUserDetailAccessError);
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'private' } } as never);
    await expect(loadAdminUserDetail('worker', id)).rejects.toThrow('Unable to load user details. Please try again.');
  });
});
