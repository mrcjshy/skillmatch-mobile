import { describe, expect, it, vi } from 'vitest';
import { createHomeBookingSheet } from './home-booking-sheet';
import type { RoleBooking } from './booking-records';
import type { AuthorizedJobLocation } from './job-location';

const booking = { booking_id: 'booking-a', job_id: 'job-a', booking_status: 'confirmed', job_title: 'Plumbing', payment_status: 'pending' } as RoleBooking;
const location: AuthorizedJobLocation = { jobId: 'job-a', pin: { latitude: 14.5444514123456, longitude: 121.0720506789123 }, address: 'Confirmed address', barangay: 'Santa Ana', city: 'Pateros' };
const settle = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
function setup() {
  let current = true;
  const readBookings = vi.fn(async () => [booking]);
  const readLocation = vi.fn(async (_jobId: string) => location);
  const onBookings = vi.fn(), onNavigate = vi.fn();
  const sheet = createHomeBookingSheet({ bookingId: 'booking-a', jobId: 'job-a', isCurrent: () => current, readBookings, readLocation, onBookings, onNavigate });
  return { sheet, readBookings, readLocation, onBookings, onNavigate, revoke: () => { current = false; sheet.collapse(); } };
}
describe('Home booking sheet protected read lifetime', () => {
  it('performs no protected read while collapsed and starts only once for repeated expansion', async () => {
    const h = setup(); expect(h.readBookings).not.toHaveBeenCalled(); expect(h.sheet.snapshot().expanded).toBe(false);
    h.sheet.expand(); h.sheet.expand(); await settle();
    expect(h.readBookings).toHaveBeenCalledTimes(1); expect(h.readLocation).toHaveBeenCalledExactlyOnceWith('job-a');
    expect(h.sheet.snapshot()).toMatchObject({ expanded: true, status: 'ready', booking, location });
  });
  it('publishes the exact authorized tuple without rounding or substituting a location', async () => {
    const h = setup(); h.sheet.expand(); await settle();
    expect(h.sheet.snapshot().location?.pin).toEqual({ latitude: 14.5444514123456, longitude: 121.0720506789123 });
    expect(h.onBookings).toHaveBeenCalledWith([booking]);
  });
  it.each(['pending', 'completed', 'cancelled'])('does not load a precise location for authoritative %s status', async status => {
    const h = setup(); h.readBookings.mockResolvedValue([{ ...booking, booking_status: status } as RoleBooking]);
    h.sheet.expand(); await settle(); expect(h.readLocation).not.toHaveBeenCalled(); expect(h.sheet.snapshot().expanded).toBe(false);
  });
  it('removes an unavailable booking through the authoritative list without fabricating a replacement', async () => {
    const h = setup(); h.readBookings.mockResolvedValue([]); h.sheet.expand(); await settle();
    expect(h.onBookings).toHaveBeenCalledWith([]); expect(h.sheet.snapshot().expanded).toBe(false); expect(h.readLocation).not.toHaveBeenCalled();
  });
  it('keeps a loading expansion until the authoritative list settles', async () => {
    const h = setup(); let reply!: (rows: RoleBooking[]) => void;
    h.readBookings.mockImplementation(() => new Promise(resolve => { reply = resolve; }));
    h.sheet.expand(); expect(h.sheet.snapshot()).toMatchObject({ expanded: true, status: 'loading', booking: null, location: null });
    expect(h.onBookings).not.toHaveBeenCalled(); reply([booking]); await settle(); expect(h.sheet.snapshot().status).toBe('ready');
  });
  it('failed authoritative refresh conceals the sheet and clears the Home selection', async () => {
    const h = setup(); h.readBookings.mockRejectedValue(new Error('offline')); h.sheet.expand(); await settle();
    expect(h.sheet.snapshot()).toMatchObject({ expanded: false, booking: null, location: null }); expect(h.onBookings).toHaveBeenCalledWith([]);
  });
  it('a missing pin remains honest and leaves Details available', async () => {
    const h = setup(); h.readLocation.mockResolvedValue({ ...location, pin: null }); h.sheet.expand(); await settle();
    expect(h.sheet.snapshot().location?.pin).toBeNull(); h.sheet.navigate('details'); expect(h.onNavigate).toHaveBeenCalledWith('details', booking);
  });
  it('a location read failure offers an unavailable surface without blocking Details', async () => {
    const h = setup(); h.readLocation.mockRejectedValue(new Error('network')); h.sheet.expand(); await settle();
    expect(h.sheet.snapshot()).toMatchObject({ expanded: true, status: 'ready', location: null }); h.sheet.navigate('details'); expect(h.onNavigate).toHaveBeenCalledTimes(1);
  });
  it.each(['42501', 'SM409'])('location denial %s clears protected content', async code => {
    const h = setup(); h.readLocation.mockRejectedValue(Object.assign(new Error('denied'), { code })); h.sheet.expand(); await settle();
    expect(h.sheet.snapshot()).toMatchObject({ expanded: false, booking: null, location: null }); expect(h.onBookings).toHaveBeenCalledWith([]);
  });
  it('rejects location data for a different Job', async () => {
    const h = setup(); h.readLocation.mockResolvedValue({ ...location, jobId: 'other-job' }); h.sheet.expand(); await settle();
    expect(h.sheet.snapshot().location).toBeNull();
  });
  it('collapse clears precise location synchronously and does not navigate', async () => {
    const h = setup(); h.sheet.expand(); await settle(); h.sheet.collapse();
    expect(h.sheet.snapshot()).toMatchObject({ expanded: false, booking: null, location: null }); expect(h.onNavigate).not.toHaveBeenCalled();
  });
  it('authorization loss rejects a pending private response', async () => {
    const h = setup(); let reply!: (value: AuthorizedJobLocation) => void;
    h.readLocation.mockImplementation(() => new Promise(resolve => { reply = resolve; })); h.sheet.expand(); await settle();
    h.revoke(); reply(location); await settle(); expect(h.sheet.snapshot().location).toBeNull(); h.sheet.expand(); expect(h.readBookings).toHaveBeenCalledTimes(1);
  });
  it('rapid close and reopen serializes reads and rejects the earlier response', async () => {
    const h = setup(); let reply!: (value: AuthorizedJobLocation) => void;
    h.readLocation.mockImplementationOnce(() => new Promise(resolve => { reply = resolve; })); h.sheet.expand(); await settle();
    h.sheet.collapse(); h.sheet.expand(); h.sheet.expand(); expect(h.readBookings).toHaveBeenCalledTimes(1);
    reply({ ...location, address: 'STALE' }); await settle(); expect(h.readBookings).toHaveBeenCalledTimes(2);
    expect(h.sheet.snapshot().location?.address).toBe('Confirmed address');
  });
  it.each(['details', 'all'] as const)('a retained %s callback cannot navigate twice or after collapse', async action => {
    const h = setup(); h.sheet.expand(); await settle(); h.sheet.navigate(action); h.sheet.navigate(action);
    expect(h.onNavigate).toHaveBeenCalledExactlyOnceWith(action, booking); expect(h.sheet.snapshot().expanded).toBe(false);
  });
  it('a collapsed read cannot resurrect content or publish Home rows', async () => {
    const h = setup(); let reply!: (rows: RoleBooking[]) => void;
    h.readBookings.mockImplementation(() => new Promise(resolve => { reply = resolve; })); h.sheet.expand(); h.sheet.collapse(); reply([booking]); await settle();
    expect(h.onBookings).not.toHaveBeenCalled(); expect(h.readLocation).not.toHaveBeenCalled(); expect(h.sheet.snapshot().expanded).toBe(false);
  });
  it('coalesces a burst of status invalidations without publishing an earlier read or location', async () => {
    const h = setup(); h.sheet.expand(); await settle();
    let finish!: (rows: RoleBooking[]) => void;
    h.readBookings.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    h.sheet.revalidate(); h.sheet.revalidate(); h.sheet.revalidate();
    expect(h.sheet.snapshot().location).toBeNull(); expect(h.readBookings).toHaveBeenCalledTimes(2);
    finish([booking]); await settle(); expect(h.readBookings).toHaveBeenCalledTimes(3);
    expect(h.readLocation).toHaveBeenCalledTimes(2); expect(h.sheet.snapshot().location).toEqual(location);
    h.sheet.collapse(); h.sheet.revalidate(); expect(h.readBookings).toHaveBeenCalledTimes(3);
  });
});
