import { isUnread, NotificationError } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';

/** Existence only: the inbox's recipient RLS and nullable is_read semantics remain authoritative. */
export async function loadHasUnreadNotifications(): Promise<boolean> {
  const result = await supabase.from('notifications').select('is_read')
    .or('is_read.eq.false,is_read.is.null').limit(1);
  if (result.error) throw new NotificationError('Unread notifications unavailable.', result.error.code ?? null);
  return Array.isArray(result.data) && result.data.some(row => isUnread(row.is_read));
}
