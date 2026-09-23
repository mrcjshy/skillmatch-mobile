import { describe, expect, it, vi } from 'vitest';

import { supabase } from './supabase';
import { directoryEmptyMessage, loadAdminDirectory, parseDirectoryPage, prepareDirectorySearch } from './admin-directories';

vi.mock('./supabase', () => ({ supabase: { rpc: vi.fn() } }));

describe('Admin directory response boundary', () => {
  const worker = {
    user_id: 'worker-id', full_name: 'Worker', is_active: true, created_at: null,
    has_profile: false, is_verified: null, availability_status: null,
  };

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
    expect(rpc).toHaveBeenCalledWith('get_admin_client_directory', {
      p_search: 'name', p_page: 3, p_page_size: 20,
    });
  });
});
