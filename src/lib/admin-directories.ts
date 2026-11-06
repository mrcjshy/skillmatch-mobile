import { supabase } from './supabase';

export type DirectoryKind = 'worker' | 'client';
/** ADM-01 (owner 2026-11-06): 'inactive' is banned by an Administrator or suspended at three strikes. */
export type DirectoryStatus = 'all' | 'active' | 'inactive';
export const DIRECTORY_STATUS_OPTIONS: readonly { value: DirectoryStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];
export type DirectoryItem = {
  user_id: string;
  full_name: string;
  is_active: boolean;
  created_at: string | null;
  has_profile?: boolean;
  is_verified?: boolean | null;
  availability_status?: string | null;
  /** No-show strikes, 0 to 3; null when the Worker has no profile yet. */
  strike_count?: number | null;
};
export type DirectoryPage = {
  total_count: number;
  page: number;
  page_size: number;
  items: DirectoryItem[];
};

const WORKER_KEYS = [
  'user_id', 'full_name', 'is_active', 'created_at',
  'has_profile', 'is_verified', 'availability_status', 'strike_count',
];
const CLIENT_KEYS = ['user_id', 'full_name', 'is_active', 'created_at'];

export function prepareDirectorySearch(value: string): { search: string; tooLong: boolean } {
  const search = value.trim();
  return { search, tooLong: [...search].length > 100 };
}

export function directoryEmptyMessage(page: DirectoryPage, kind: DirectoryKind, search: string, status: DirectoryStatus = 'all'): string {
  if (page.total_count > 0) return page.page > 1
    ? 'No items on this page. Go to the previous page.' : 'No items on this page.';
  const title = kind === 'worker' ? 'workers' : 'clients';
  const which = status === 'all' ? title : `${status} ${title}`;
  return search ? `No ${which} match that name.` : `No ${which} found.`;
}

/** "1 of 3 strikes" for a Worker with a profile; null otherwise. */
export function strikeLabel(item: DirectoryItem): string | null {
  return item.has_profile && Number.isSafeInteger(item.strike_count) ? `${item.strike_count} of 3 strikes` : null;
}

function count(value: unknown): number {
  const number = typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)
    ? Number(value) : value;
  if (!Number.isSafeInteger(number) || (number as number) < 0) throw Error('Invalid directory response');
  return number as number;
}

export function parseDirectoryPage(value: unknown, kind: DirectoryKind): DirectoryPage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid directory response');
  const row = value as Record<string, unknown>;
  const totalCount = count(row.total_count);
  if (Object.keys(row).sort().join() !== ['total_count', 'page', 'page_size', 'items'].sort().join() ||
      !Number.isSafeInteger(row.page) || (row.page as number) < 1 ||
      !Number.isSafeInteger(row.page_size) || (row.page_size as number) < 1 || (row.page_size as number) > 50 ||
      !Array.isArray(row.items) || row.items.length > (row.page_size as number)) {
    throw Error('Invalid directory response');
  }
  const keys = kind === 'worker' ? WORKER_KEYS : CLIENT_KEYS;
  for (const item of row.items) {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        Object.keys(item).sort().join() !== [...keys].sort().join() ||
        typeof item.user_id !== 'string' || typeof item.full_name !== 'string' ||
        typeof item.is_active !== 'boolean' ||
        (item.created_at !== null && typeof item.created_at !== 'string') ||
        (kind === 'worker' && (typeof item.has_profile !== 'boolean' ||
          (item.is_verified !== null && typeof item.is_verified !== 'boolean') ||
          (item.availability_status !== null && typeof item.availability_status !== 'string') ||
          (item.strike_count !== null && (!Number.isSafeInteger(item.strike_count) || (item.strike_count as number) < 0)) ||
          (!item.has_profile && (item.is_verified !== null || item.availability_status !== null || item.strike_count !== null))))) {
      throw Error('Invalid directory response');
    }
  }
  return { ...row, total_count: totalCount } as DirectoryPage;
}

/** ADM-01 _v2 reads: the v1 directory plus a status filter, and strike_count on Worker rows. */
export async function loadAdminDirectory(kind: DirectoryKind, search: string, page: number, status: DirectoryStatus = 'all'): Promise<DirectoryPage> {
  const name = kind === 'worker' ? 'get_admin_worker_directory_v2' : 'get_admin_client_directory_v2';
  const { data, error } = await supabase.rpc(name, {
    p_search: search, p_page: page, p_page_size: 20, p_status: status,
  });
  if (error) throw Error(error.code === '42501'
    ? 'You no longer have access to Admin directories.'
    : 'Unable to load the directory. Please try again.');
  if (!Array.isArray(data) || data.length !== 1) throw Error('Invalid directory response');
  return parseDirectoryPage(data[0], kind);
}
