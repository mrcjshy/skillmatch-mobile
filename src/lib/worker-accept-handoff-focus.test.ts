import { describe, expect, it, vi } from 'vitest';

import type { AcceptJobResult } from './job-opportunities';
import { createWorkerAcceptHandoff } from './worker-accept-handoff-focus';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function setup() {
  const acceptance = deferred<AcceptJobResult>();
  const bookings = deferred<{ job_id: string; booking_id: string }[]>();
  const readStarted = deferred<void>();
  // The injected functions are the mutation/read and UI/navigation boundaries.
  const acceptJob = vi.fn(() => acceptance.promise);
  const readBookings = vi.fn(() => { readStarted.resolve(); return bookings.promise; });
  const onState = vi.fn();
  const onNavigate = vi.fn();
  const options = {
    workerId: 'worker-a', sessionUserId: 'worker-a', jobId: 'job-a',
    isIdentityCurrent: () => true,
    acceptJob, readBookings, onState, onNavigate,
  };
  const handoff = createWorkerAcceptHandoff();
  const focus = handoff.focus(options);
  return { handoff, focus, options, acceptance, bookings, readStarted, acceptJob, readBookings, onState, onNavigate };
}

describe('Worker acceptance handoff', () => {
  it.each([{ rows: [] }, { rows: [{ job_id: 'other-job', booking_id: 'other-booking' }] }])(
    'keeps success with a manual Bookings fallback when no matching Booking exists ($rows)', async ({ rows }) => {
      const s = setup();
      const pending = s.focus.accept();
      s.acceptance.resolve({ status: 'accepted' });
      s.bookings.resolve(rows);
      await pending;
      expect(s.onState).toHaveBeenLastCalledWith({
        pending: false, result: { status: 'accepted' }, handoffFailed: true,
      });
      await s.focus.accept();
      expect(s.acceptJob).toHaveBeenCalledTimes(1);
      expect(s.readBookings).toHaveBeenCalledTimes(1);
      expect(s.onNavigate).not.toHaveBeenCalled();
    }
  );

  it.each(['account', 'session', 'job'])('revokes a Booking read on %s supersession', async (changed) => {
    const s = setup();
    let identity = { workerId: 'worker-a', sessionUserId: 'worker-a', jobId: 'job-a' };
    const focus = s.handoff.focus({
      ...s.options,
      isIdentityCurrent: () => identity.workerId === 'worker-a' &&
        identity.sessionUserId === 'worker-a' && identity.jobId === 'job-a',
    });
    const pending = focus.accept();
    s.acceptance.resolve({ status: 'accepted' });
    await s.readStarted.promise;
    identity = { ...identity, [changed === 'account' ? 'workerId' : changed === 'session' ? 'sessionUserId' : 'jobId']: 'changed' };
    s.onState.mockClear();
    s.bookings.resolve([{ job_id: 'job-a', booking_id: 'booking-a' }]);
    await pending;
    expect(s.onState).not.toHaveBeenCalled();
    expect(s.onNavigate).not.toHaveBeenCalled();
    expect(s.acceptJob).toHaveBeenCalledTimes(1);
  });

  it('retains committed success on refocus while the old Booking read is pending', async () => {
    const s = setup();
    const pending = s.focus.accept();
    s.acceptance.resolve({ status: 'accepted' });
    await s.readStarted.promise;
    s.focus.cancel();
    const onState = vi.fn();
    const onNavigate = vi.fn();
    const current = s.handoff.focus({ ...s.options, onState, onNavigate });
    expect(onState).toHaveBeenLastCalledWith({
      pending: false, result: { status: 'accepted' }, handoffFailed: true,
    });
    await current.accept();
    s.onState.mockClear();
    onState.mockClear();
    s.bookings.resolve([{ job_id: 'job-a', booking_id: 'booking-a' }]);
    await pending;
    expect(s.onState).not.toHaveBeenCalled();
    expect(onState).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
    expect(s.onNavigate).not.toHaveBeenCalled();
    expect(s.acceptJob).toHaveBeenCalledTimes(1);
    expect(s.readBookings).toHaveBeenCalledTimes(1);
  });

  it('does not send an Accept RPC when account and session disagree', async () => {
    const s = setup();
    const current = s.handoff.focus({ ...s.options, sessionUserId: 'worker-b' });
    s.onState.mockClear();
    await current.accept();
    expect(s.onState).not.toHaveBeenCalled();
    expect(s.acceptJob).not.toHaveBeenCalled();
    expect(s.readBookings).not.toHaveBeenCalled();
  });

  it.each(['acceptance', 'bookings'] as const)('suppresses a late rejected %s after unmount', async (phase) => {
    const s = setup();
    const pending = s.focus.accept();
    if (phase === 'bookings') {
      s.acceptance.resolve({ status: 'accepted' });
      await s.readStarted.promise;
    }
    s.focus.cancel();
    s.onState.mockClear();
    s[phase].reject(new Error('offline'));
    await pending;
    expect(s.onState).not.toHaveBeenCalled();
    expect(s.onNavigate).not.toHaveBeenCalled();
    expect(s.acceptJob).toHaveBeenCalledTimes(1);
  });

  it.each([{ status: 'unavailable' }, { status: 'ineligible', reason: 'Unavailable' }] as const)(
    'preserves the authoritative $status outcome without a Booking read', async (result) => {
      const s = setup();
      const pending = s.focus.accept();
      s.acceptance.resolve(result);
      expect(await pending).toEqual(result);
      expect(s.onState).toHaveBeenLastCalledWith({ pending: false, result, handoffFailed: false });
      expect(s.readBookings).not.toHaveBeenCalled();
      expect(s.onNavigate).not.toHaveBeenCalled();
      expect(s.acceptJob).toHaveBeenCalledTimes(1);
    }
  );

  it('settles a rejected acceptance without reading Bookings or retrying automatically', async () => {
    const s = setup();
    const pending = s.focus.accept();
    s.acceptance.reject(new Error('offline'));
    await pending;
    expect(s.onState).toHaveBeenLastCalledWith({
      pending: false, result: { status: 'generic' }, handoffFailed: false,
    });
    expect(s.acceptJob).toHaveBeenCalledTimes(1);
    expect(s.readBookings).not.toHaveBeenCalled();
    expect(s.onNavigate).not.toHaveBeenCalled();
  });

  it('keeps committed success on Booking read failure and never retries Accept', async () => {
    const s = setup();
    const pending = s.focus.accept();
    s.acceptance.resolve({ status: 'accepted' });
    await s.readStarted.promise;
    s.bookings.reject(new Error('offline'));
    await pending;
    expect(s.onState).toHaveBeenLastCalledWith({
      pending: false, result: { status: 'accepted' }, handoffFailed: true,
    });
    await s.focus.accept();
    expect(s.acceptJob).toHaveBeenCalledTimes(1);
    expect(s.readBookings).toHaveBeenCalledTimes(1);
    expect(s.onNavigate).not.toHaveBeenCalled();
  });

  it('consumes navigation before its callback and blocks duplicate completion/submission', async () => {
    const s = setup();
    s.onNavigate.mockImplementation(() => {
      expect(s.focus.isCurrent()).toBe(false);
      void s.focus.accept();
    });
    const pending = s.focus.accept();
    await s.focus.accept();
    expect(s.acceptJob).toHaveBeenCalledTimes(1);
    s.acceptance.resolve({ status: 'accepted' });
    s.bookings.resolve([{ job_id: 'job-a', booking_id: 'booking-a' }]);
    await pending;
    await s.focus.accept();
    expect(s.onNavigate).toHaveBeenCalledExactlyOnceWith('booking-a');
    expect(s.acceptJob).toHaveBeenCalledTimes(1);
    expect(s.readBookings).toHaveBeenCalledTimes(1);
  });

  it('refocus observes the original pending Accept without retrying it or inheriting navigation', async () => {
    const s = setup();
    const pending = s.focus.accept();
    s.focus.cancel();
    const currentState = vi.fn();
    const currentNavigate = vi.fn();
    const current = s.handoff.focus({ ...s.options, onState: currentState, onNavigate: currentNavigate });
    expect(currentState).toHaveBeenLastCalledWith({ pending: true, result: null, handoffFailed: false });
    await current.accept();
    expect(s.acceptJob).toHaveBeenCalledTimes(1);
    s.onState.mockClear();
    s.acceptance.resolve({ status: 'accepted' });
    await pending;
    await Promise.resolve();
    expect(s.onState).not.toHaveBeenCalled();
    expect(currentState).toHaveBeenLastCalledWith({
      pending: false, result: { status: 'accepted' }, handoffFailed: true,
    });
    await current.accept();
    expect(s.acceptJob).toHaveBeenCalledTimes(1);
    expect(s.readBookings).not.toHaveBeenCalled();
    expect(s.onNavigate).not.toHaveBeenCalled();
    expect(currentNavigate).not.toHaveBeenCalled();
  });

  it.each(['account', 'session', 'job'])('rejects a superseded %s identity before effect cleanup', async (changed) => {
    const s = setup();
    let workerId = 'worker-a';
    let sessionUserId = 'worker-a';
    let jobId = 'job-a';
    s.focus.cancel();
    const focus = s.handoff.focus({
      ...s.options,
      isIdentityCurrent: () => workerId === 'worker-a' && sessionUserId === 'worker-a' && jobId === 'job-a',
    });
    const pending = focus.accept();
    if (changed === 'account') workerId = 'worker-b';
    if (changed === 'session') sessionUserId = 'worker-b';
    if (changed === 'job') jobId = 'job-b';
    s.onState.mockClear();
    s.acceptance.resolve({ status: 'accepted' });
    s.bookings.resolve([{ job_id: 'job-a', booking_id: 'booking-a' }]);
    await pending;
    expect(s.onState).not.toHaveBeenCalled();
    expect(s.readBookings).not.toHaveBeenCalled();
    expect(s.onNavigate).not.toHaveBeenCalled();
    expect(s.acceptJob).toHaveBeenCalledTimes(1);
  });

  it('suppresses a Booking response after blur/unmount', async () => {
    const s = setup();
    const pending = s.focus.accept();
    s.acceptance.resolve({ status: 'accepted' });
    await s.readStarted.promise;
    expect(s.readBookings).toHaveBeenCalledTimes(1);
    s.focus.cancel();
    s.onState.mockClear();
    s.bookings.resolve([{ job_id: 'job-a', booking_id: 'booking-a' }]);
    await pending;
    expect(s.onState).not.toHaveBeenCalled();
    expect(s.onNavigate).not.toHaveBeenCalled();
    expect(s.acceptJob).toHaveBeenCalledTimes(1);
  });

  it('revokes a blur before acceptance resolves without a Booking read or stale UI write', async () => {
    const s = setup();
    const pending = s.focus.accept();
    s.focus.cancel();
    s.onState.mockClear();
    s.acceptance.resolve({ status: 'accepted' });
    await pending;
    expect(s.onState).not.toHaveBeenCalled();
    expect(s.readBookings).not.toHaveBeenCalled();
    expect(s.onNavigate).not.toHaveBeenCalled();
    expect(s.acceptJob).toHaveBeenCalledTimes(1);
  });

  it('rereads after committed acceptance and opens the authoritative matching Booking', async () => {
    const s = setup();
    const pending = s.focus.accept();
    expect(s.acceptJob).toHaveBeenCalledExactlyOnceWith('job-a', 'worker-a');
    expect(s.readBookings).not.toHaveBeenCalled();
    s.acceptance.resolve({ status: 'accepted' });
    await s.readStarted.promise;
    expect(s.readBookings).toHaveBeenCalledTimes(1);
    expect(s.onNavigate).not.toHaveBeenCalled();
    s.bookings.resolve([
      { job_id: 'other-job', booking_id: 'other-booking' },
      { job_id: 'job-a', booking_id: 'booking-a' },
    ]);
    await pending;
    expect(s.onNavigate).toHaveBeenCalledExactlyOnceWith('booking-a');
    expect(s.onState).toHaveBeenLastCalledWith({
      pending: false, result: { status: 'accepted' }, handoffFailed: false,
    });
  });
});
