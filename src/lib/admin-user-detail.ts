import type { DirectoryKind } from './admin-directories';
import { supabase } from './supabase';

const UUID = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;
const COMMON_KEYS = ['user_id', 'full_name', 'is_active', 'created_at'];
const WORKER_KEYS = [...COMMON_KEYS, 'has_profile', 'is_verified', 'availability_status', 'completed_bookings_count'];
const CLIENT_KEYS = [...COMMON_KEYS, 'posted_jobs_count'];

type CommonDetail = {
  user_id: string;
  full_name: string;
  is_active: boolean;
  created_at: string | null;
};
export type WorkerUserDetail = CommonDetail & {
  has_profile: boolean;
  is_verified: boolean | null;
  availability_status: string | null;
  completed_bookings_count: number;
};
export type ClientUserDetail = CommonDetail & { posted_jobs_count: number };
export type AdminUserDetail = WorkerUserDetail | ClientUserDetail;

export function isCanonicalUserId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

function count(value: unknown): number {
  const number = typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)
    ? Number(value) : value;
  if (!Number.isSafeInteger(number) || (number as number) < 0) throw Error('Invalid user detail response');
  return number as number;
}

export function parseAdminUserDetail(value: unknown, kind: DirectoryKind, targetUserId: string): AdminUserDetail | null {
  if (!isCanonicalUserId(targetUserId)) throw Error('Invalid user detail target');
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid user detail response');
  const row = value as Record<string, unknown>;
  const keys = kind === 'worker' ? WORKER_KEYS : CLIENT_KEYS;
  const actualKeys = Object.keys(row);
  if (actualKeys.length !== keys.length || !actualKeys.every((key) => keys.includes(key)) ||
      !isCanonicalUserId(row.user_id) || row.user_id.toLowerCase() !== targetUserId.toLowerCase() ||
      typeof row.full_name !== 'string' || typeof row.is_active !== 'boolean' ||
      (row.created_at !== null && typeof row.created_at !== 'string')) {
    throw Error('Invalid user detail response');
  }
  if (kind === 'worker') {
    if (typeof row.has_profile !== 'boolean' ||
        (row.is_verified !== null && typeof row.is_verified !== 'boolean') ||
        (row.availability_status !== null && typeof row.availability_status !== 'string') ||
        (!row.has_profile && (row.is_verified !== null || row.availability_status !== null))) {
      throw Error('Invalid user detail response');
    }
    return { ...row, completed_bookings_count: count(row.completed_bookings_count) } as WorkerUserDetail;
  }
  return { ...row, posted_jobs_count: count(row.posted_jobs_count) } as ClientUserDetail;
}

export class AdminUserDetailAccessError extends Error {}

export async function loadAdminUserDetail(kind: DirectoryKind, targetUserId: string): Promise<AdminUserDetail | null> {
  if (!isCanonicalUserId(targetUserId)) throw Error('Invalid user detail target');
  const { data, error } = await supabase.rpc('get_admin_user_detail', {
    p_user_id: targetUserId, p_expected_role: kind,
  });
  if (error) {
    if (error.code === '42501') throw new AdminUserDetailAccessError('You no longer have access to Admin user details.');
    throw Error('Unable to load user details. Please try again.');
  }
  return parseAdminUserDetail(data, kind, targetUserId);
}
