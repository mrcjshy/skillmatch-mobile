import { describe, expect, it, vi } from 'vitest';

import { supabase } from './supabase';
import {
  DIRECTORY_STATUS_OPTIONS, directoryEmptyMessage, loadAdminDirectory, parseDirectoryPage, prepareDirectorySearch, strikeLabel,
} from './admin-directories';

vi.mock('./supabase', () => ({ supabase: { rpc: vi.fn() } }));

describe('Admin directory response boundary', () => {
  const worker = {
    user_id: 'worker-id', full_name: 'Worker', is_active: true, created_at: null,
    has_profile: false, is_verified: null, availability_status: null, strike_count: null,
  };
  const profiled = { ...worker, has_profile: true, is_verified: true, availability_status: 'available', strike_count: 2 };

  it('accepts the exact Worker shape and a safe bigint count', () => {
    expect(parseDirectoryPage({ total_count: '21', page: 2, page_size: 20, items: [worker] }, 'worker'))
      .toMatchObject({ total_count: 21, page: 2, items: [worker] });
  });

  it('rejects a sensitive field and ambiguous missing-profile metadata', () => {
    expect(() => parseDirectoryPage({ total_count: 1, page: 1, page_size: 20,
      items: [{ ...worker, email: 'private@example.test' }] }, 'worker')).toThrow();
    expect(() => parseDirectoryPage({ total_count: 1, page: 1, page_size: 20,
      items: [{ ...worker, is_verified: false }] }, 'worker')).toThrow();
  });

  it('ADM-01: requires strike_count on Worker rows, a non-negative integer, null without a profile', () => {
    const page = (item: object) => ({ total_count: 1, page: 1, page_size: 20, items: [item] });
    expect(parseDirectoryPage(page(profiled), 'worker').items[0].strike_count).toBe(2);
    const { strike_count: _omit, ...v1Row } = profiled;
    expect(() => parseDirectoryPage(page(v1Row), 'worker')).toThrow();
    expect(() => parseDirectoryPage(page({ ...profiled, strike_count: -1 }), 'worker')).toThrow();
    expect(() => parseDirectoryPage(page({ ...profiled, strike_count: '2' }), 'worker')).toThrow();
    expect(() => parseDirectoryPage(page({ ...worker, strike_count: 0 }), 'worker')).toThrow();
    expect(strikeLabel(profiled)).toBe('2 of 3 strikes');
    expect(strikeLabel(worker)).toBeNull();
  });

  it('ADM-01: offers All, Active and Inactive and words empty results by status', () => {
    expect(DIRECTORY_STATUS_OPTIONS.map((o) => o.value)).toEqual(['all', 'active', 'inactive']);
    const empty = { total_count: 0, page: 1, page_size: 20, items: [] };
    expect(directoryEmptyMessage(empty, 'worker', '', 'inactive')).toBe('No inactive workers found.');
    expect(directoryEmptyMessage(empty, 'client', 'Ana', 'active')).toBe('No active clients match that name.');
  });

  it('accepts an empty out-of-range Client page with its total', () => {
    expect(parseDirectoryPage({ total_count: 1, page: 3, page_size: 20, items: [] }, 'client'))
      .toEqual({ total_count: 1, page: 3, page_size: 20, items: [] });
  });

  it('distinguishes an empty page from zero matching accounts', () => {
    const page = { total_count: 1, page: 3, page_size: 20, items: [] };
    expect(directoryEmptyMessage(page, 'client', 'name'))
      .toBe('No items on this page. Go to the previous page.');
    expect(directoryEmptyMessage({ ...page, page: 1 }, 'worker', ''))
      .toBe('No items on this page.');
    expect(directoryEmptyMessage({ ...page, total_count: 0 }, 'client', 'name'))
      .toBe('No clients match that name.');
    expect(directoryEmptyMessage({ ...page, total_count: 0 }, 'worker', ''))
      .toBe('No workers found.');
  });

  it('counts trimmed Unicode code points without truncation', () => {
    expect(prepareDirectorySearch('a'.repeat(100))).toEqual({ search: 'a'.repeat(100), tooLong: false });
    expect(prepareDirectorySearch('a'.repeat(101)).tooLong).toBe(true);
    expect(prepareDirectorySearch('😀'.repeat(100)).tooLong).toBe(false);
    expect(prepareDirectorySearch('😀'.repeat(101)).tooLong).toBe(true);
    expect(prepareDirectorySearch('a'.repeat(50) + '😀'.repeat(50)).tooLong).toBe(false);
    expect(prepareDirectorySearch('a'.repeat(51) + '😀'.repeat(50)).tooLong).toBe(true);
    expect(prepareDirectorySearch('\t\n' + '😀'.repeat(100) + '\r\n'))
      .toEqual({ search: '😀'.repeat(100), tooLong: false });
    expect(prepareDirectorySearch('\t\n\r ')).toEqual({ search: '', tooLong: false });
  });

  it('calls the role-specific RPC with server-side page arguments', async () => {
    const rpc = vi.mocked(supabase.rpc);
    rpc.mockResolvedValue({ data: [{ total_count: 0, page: 3, page_size: 20, items: [] }], error: null } as never);
    await loadAdminDirectory('client', 'name', 3);
    expect(rpc).toHaveBeenCalledWith('get_admin_client_directory_v2', {
      p_search: 'name', p_page: 3, p_page_size: 20, p_status: 'all',
    });
    await loadAdminDirectory('worker', '', 1, 'inactive');
    expect(rpc).toHaveBeenLastCalledWith('get_admin_worker_directory_v2', {
      p_search: '', p_page: 1, p_page_size: 20, p_status: 'inactive',
    });
  });
});
