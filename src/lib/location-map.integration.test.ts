import { expect, it, vi } from 'vitest';
import { createPinsApi } from './location-pins';
import { createPinsReader, createSharingController, type SharingDeps } from './location-sharing';
vi.mock('./supabase', () => ({ supabase: {} }));

it('integrates device collection, session RPCs, authorization denial and map teardown', async () => {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === 'start_my_booking_location_share') return { data: 'session-a', error: null };
    if (name === 'publish_my_booking_location') return { data: 'ok', error: null };
    if (name === 'stop_my_booking_location_share') return { data: 'stopped', error: null };
    if (name === 'get_booking_location_pins') return { data: null, error: { code: '42501' } };
    throw new Error(`Unexpected RPC ${name} ${JSON.stringify(args)}`);
  });
  const api = createPinsApi({ rpc } as unknown as Parameters<typeof createPinsApi>[0]);
  let reading!: Parameters<SharingDeps['watch']>[0];
  const remove = vi.fn();
  const sharing = createSharingController({ bookingId: 'booking-a', api, now: () => 1000, onChange: () => {},
    permission: async () => 'granted', servicesEnabled: async () => true,
    watch: async cb => { reading = cb; return { remove }; } });
  sharing.setActive(true);
  expect(rpc).not.toHaveBeenCalled();
  await sharing.start();
  reading({ latitude: 14.54, longitude: 121.07, accuracy: 30, timestampMs: 1000 });
  await Promise.resolve();
  expect(rpc).toHaveBeenCalledWith('publish_my_booking_location', expect.objectContaining({ p_share_id: 'session-a', p_seq: 1 }));
  const reader = createPinsReader({ bookingId: 'booking-a', read: api.read, now: () => 1000,
    subscribe: () => () => {}, setInterval: () => 1, clearInterval: () => {},
    onChange: view => { if (view.status === 'denied') sharing.stop(); } });
  reader.setActive(true, sharing.currentShareId);
  await reader.refresh();
  expect(reader.view).toMatchObject({ status: 'denied', counterpart: null });
  expect(remove).toHaveBeenCalledOnce();
  expect(rpc).toHaveBeenCalledWith('stop_my_booking_location_share', { p_booking_id: 'booking-a', p_share_id: 'session-a' });
  sharing.setActive(false); sharing.setActive(true);
  expect(sharing.state.status).toBe('off');
  reader.dispose(); sharing.dispose({ stopServerShare: true });
});
