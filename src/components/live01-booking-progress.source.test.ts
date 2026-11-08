// @ts-expect-error -- Node-only source contract, not native rendering evidence.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- Node-only source contract.
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// LIVE-01 (owner 2026-11-08): "need pa i pull refresh bago makita yung updates ... gusto ko live lahat",
// and every step reloaded the details and buttons. Hosted migration 20261108140000 emits
// booking_progress_changed on the Booking topic when the Worker's arrival or completion, or the payment,
// changes while the Booking stays confirmed.
const source = readFileSync(path.resolve('src/components/booking-details.tsx'), 'utf8');

describe('LIVE-01: Booking Details follows the other participant live, without blanking', () => {
  it('names the hosted event exactly', () => {
    const realtime = readFileSync(path.resolve('src/lib/realtime.ts'), 'utf8');
    expect(realtime).toContain("export const BOOKING_PROGRESS_CHANGED = 'booking_progress_changed';");
  });

  it('listens for progress on the Booking topic and re-reads while keeping the details on screen', () => {
    const start = source.indexOf('const cleanupProgress = subscribeInvalidation({');
    const block = source.slice(start, source.indexOf('});', start));
    expect(block).toContain('events: [BOOKING_PROGRESS_CHANGED]');
    expect(block).toContain('topic: bookingMessagesTopic(bookingId)');
    expect(block).toContain('onInvalidate: reloadKeepingDetails');
    // A progress event never hides: the Booking is still confirmed (the status listener hides when it is not).
    expect(block).not.toContain('onBroadcastEvent');
    expect(block).not.toContain('hideProtectedProjection');
    expect(source).toMatch(/load\(\{ preserveProtected: true \}\)/);
  });

  it('the status listener still hides on its own event, and own status-changing actions still re-read with hiding', () => {
    expect(source).toMatch(/events: \[BOOKING_STATUS_CHANGED\],\s*\n\s*onBroadcastEvent: hideProtectedProjection,/);
    expect(source.match(/<BookingLifecycle[^>]*onChanged=\{load\}/gs)?.length).toBe(3);
  });

  it('own payment and progress steps keep the screen: they cannot leave confirmed', () => {
    expect(source).toMatch(/<BookingPayment [^>]*onChanged=\{refreshKeepingDetails\}/s);
    expect(source).toMatch(/<WorkerBookingProgress [^>]*onChanged=\{refreshKeepingDetails\}/s);
  });

  it('LIVE-02 (owner 2026-11-08, "remove the pulldown refresh ... i want it live everytime"): no pull-to-refresh', () => {
    expect(source).not.toMatch(/RefreshControl|onRefresh|isRefreshing|refreshControl/);
    // What keeps the screen current instead: live events, the channel's reconnect catch-up and app foreground.
    expect(source).toContain('onUnavailable: hideProtectedProjection');
    expect(source).toContain('createDetailsAppStateHandler');
  });

  it('a burst of events never downgrades a pending hiding re-read', () => {
    expect(source).toMatch(/run\.pending = run\.pending === 'hide' \? 'hide' : 'keep'/);
    expect(source).toMatch(/run\.pending = 'hide'/);
  });
});
