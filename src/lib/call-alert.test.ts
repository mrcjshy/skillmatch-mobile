import { describe, expect, it, vi } from 'vitest';

import { callAlert, createCallAlert, parseCallLaunch, type NativeCallAlert } from './call-alert';

// Hoisted by vitest above the import: no native module in tests.
vi.mock('expo', () => ({ requireOptionalNativeModule: () => null }));

const BOOKING = '11111111-1111-4111-8111-111111111111';
const CALL = '22222222-2222-4222-8222-222222222222';

function fake(overrides: Partial<NativeCallAlert> = {}): NativeCallAlert {
  return {
    consumeLaunchCall: vi.fn(() => ({ bookingId: BOOKING, callId: CALL, action: 'answer' })),
    cancelIncomingCall: vi.fn(), setShowWhenLocked: vi.fn(), canUseFullScreenIntent: vi.fn(() => true),
    openFullScreenIntentSettings: vi.fn(), startRingback: vi.fn(), stopRingback: vi.fn(),
    ...overrides,
  };
}

describe('RTC-03 call ringing bridge (owner, 2026-11-06)', () => {
  it('accepts only a well-formed launch, and treats an unknown action as a plain open', () => {
    expect(parseCallLaunch({ bookingId: BOOKING, callId: CALL, action: 'decline' })).toEqual({ bookingId: BOOKING, callId: CALL, action: 'decline' });
    expect(parseCallLaunch({ bookingId: BOOKING, callId: CALL, action: 'hack' })).toEqual({ bookingId: BOOKING, callId: CALL, action: 'open' });
    for (const bad of [null, 'x', { bookingId: 'nope', callId: CALL }, { bookingId: BOOKING, callId: 7 }]) expect(parseCallLaunch(bad)).toBeNull();
  });

  it('passes each request to the native module', () => {
    const native = fake();
    const alert = createCallAlert(() => native);
    expect(alert.isAvailable()).toBe(true);
    expect(alert.consumeLaunch()).toEqual({ bookingId: BOOKING, callId: CALL, action: 'answer' });
    alert.cancelIncoming(); alert.showWhenLocked(false); alert.startRingback(); alert.stopRingback(); alert.openFullScreenSettings();
    expect(native.cancelIncomingCall).toHaveBeenCalledOnce();
    expect(native.setShowWhenLocked).toHaveBeenCalledWith(false);
    expect(native.startRingback).toHaveBeenCalledOnce();
    expect(native.stopRingback).toHaveBeenCalledOnce();
    expect(native.openFullScreenIntentSettings).toHaveBeenCalledOnce();
    expect(alert.canUseFullScreen()).toBe(true);
  });

  it('does nothing, and never throws, on an older native build or a failing native call', () => {
    const none = createCallAlert(() => null);
    expect(none.isAvailable()).toBe(false);
    expect(none.consumeLaunch()).toBeNull();
    expect(none.canUseFullScreen()).toBe(true);
    expect(() => { none.cancelIncoming(); none.startRingback(); none.stopRingback(); none.showWhenLocked(true); }).not.toThrow();
    const broken = createCallAlert(() => fake({ cancelIncomingCall: () => { throw new Error('native'); }, consumeLaunchCall: () => { throw new Error('native'); } }));
    expect(() => broken.cancelIncoming()).not.toThrow();
    expect(broken.consumeLaunch()).toBeNull();
    const throwing = createCallAlert(() => { throw new Error('missing'); });
    expect(throwing.isAvailable()).toBe(false);
    expect(callAlert.isAvailable()).toBe(false);
  });
});
