import { supabase } from './supabase';
import type { PendingLocationStop } from './location-stop-queue';

/** Pin the request to the dispatching account, even if global auth changes mid-fetch. */
export async function sendLocationStop(stop: PendingLocationStop, accessToken: string): Promise<boolean> {
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const request = stop.shareId === null
      ? supabase.rpc('stop_all_my_booking_location_shares' as never, { p_booking_id: stop.bookingId } as never)
      : supabase.rpc('stop_my_booking_location_share' as never, { p_booking_id: stop.bookingId, p_share_id: stop.shareId } as never);
    const result = await Promise.race([
      Promise.resolve(request.setHeader('Authorization', `Bearer ${accessToken}`).abortSignal(abort.signal)),
      new Promise<null>(resolve => { timer = setTimeout(() => { abort.abort(); resolve(null); }, 10_000); }),
    ]);
    if (!result || result.error) return false;
    return stop.shareId === null ? typeof result.data === 'number' && result.data >= 0 && Number.isInteger(result.data)
      : result.data === 'stopped' || result.data === 'not_current';
  } catch { return false; }
  finally { clearTimeout(timer); }
}
