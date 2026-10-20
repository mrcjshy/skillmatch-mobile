import { describe, expect, it } from 'vitest';
import { createSessionRouteContinuation } from './session-route-continuation';

const bookingId = '11111111-1111-4111-8111-111111111111';
const lifetime = () => ({ ownerId: 'owner', isCurrent: () => true });

describe('navigation intent across a same-session authoritative account recheck', () => {
  it.each([
    ['client', '/client/job-details', { jobId: bookingId }],
    ['client', '/client/booking-details', { bookingId }],
    ['worker', '/worker/booking-details', { bookingId }],
  ])('retains only the %s exact map detent through fresh account re-entry', (access, pathname, params) => {
    const memory = createSessionRouteContinuation(), handle = lifetime();
    const current = { access, pathname, params, ownerId: 'owner', lifetime: handle };
    memory.observe(current); memory.rememberSheetPosition(current, 'expanded');
    memory.observe({ ...current, access: 'account-pending', pathname: '/', params: {} });
    expect(memory.sheetPosition({ ...current, access: 'account-pending' })).toBeUndefined();
    // A stale unmount/late callback cannot overwrite the saved detent while pending.
    memory.rememberSheetPosition(current, 'collapsed');
    expect(memory.destination(access, 'owner', handle)).toEqual({ pathname, params });
    // Only a freshly guarded role route may consume this UI preference.
    expect(memory.sheetPosition(current)).toBe('expanded');
    memory.observe(current); expect(memory.sheetPosition(current)).toBe('expanded');
    memory.rememberSheetPosition(current, 'collapsed');
    expect(memory.sheetPosition(current)).toBe('collapsed');
  });
  it('does not let UI-state calls introduce another destination or cross owner, lifetime, role or exact-ID boundaries', () => {
    const memory = createSessionRouteContinuation(), handle = lifetime();
    const current = { access: 'client', pathname: '/client/job-details', params: { jobId: bookingId }, ownerId: 'owner', lifetime: handle };
    memory.rememberSheetPosition(current, 'expanded');
    expect(memory.sheetPosition(current)).toBeUndefined();
    memory.observe(current); memory.rememberSheetPosition(current, 'expanded');
    for (const changed of [
      { ownerId: 'other' }, { lifetime: lifetime() }, { access: 'worker' },
      { pathname: '/client/booking-details', params: { bookingId } },
      { params: { jobId: '22222222-2222-4222-8222-222222222222' } },
      { params: { jobId: 'not-an-id' } }, { params: { jobId: [bookingId] } },
    ]) {
      const other = { ...current, ...changed };
      expect(memory.sheetPosition(other)).toBeUndefined();
      memory.rememberSheetPosition(other, 'collapsed');
      expect(memory.sheetPosition(current)).toBe('expanded');
    }
    const next = { ...current, params: { jobId: '22222222-2222-4222-8222-222222222222' } };
    memory.observe(next);
    expect(memory.sheetPosition(next)).toBeUndefined(); expect(memory.sheetPosition(current)).toBeUndefined();
  });
  it.each(['signed-out', 'blocked', 'password-recovery', 'needs-consent', 'worker-identity', 'account-failure', 'session-error', 'session-reconnecting'])('clears map presentation on %s without reviving it on later resolution', access => {
    const memory = createSessionRouteContinuation(), handle = lifetime();
    const current = { access: 'client', pathname: '/client/job-details', params: { jobId: bookingId }, ownerId: 'owner', lifetime: handle };
    memory.observe(current); memory.rememberSheetPosition(current, 'expanded');
    memory.observe({ ...current, access, pathname: '/', params: {} });
    memory.observe(current); expect(memory.sheetPosition(current)).toBeUndefined();
  });
  it('forgets the map detent when another ordinary route becomes current', () => {
    const memory = createSessionRouteContinuation(), handle = lifetime();
    const current = { access: 'client', pathname: '/client/job-details', params: { jobId: bookingId }, ownerId: 'owner', lifetime: handle };
    memory.observe(current); memory.rememberSheetPosition(current, 'expanded');
    const chat = { ...current, pathname: '/client/chat', params: { bookingId } };
    memory.observe(chat); memory.rememberSheetPosition(chat, 'expanded');
    expect(memory.sheetPosition(chat)).toBeUndefined();
    memory.observe(current); expect(memory.sheetPosition(current)).toBeUndefined();
  });
  it.each([['worker', '/worker'], ['client', '/client'], ['administrator', '/admin']])('restores %s only after fresh matching access', (access, prefix) => {
    const memory = createSessionRouteContinuation(), handle = lifetime();
    memory.observe({ access, ownerId: 'owner', lifetime: handle, pathname: prefix + '/chat', params: { bookingId } });
    expect(memory.destination(access, 'owner', handle)).toBeNull();
    memory.observe({ access: 'account-pending', ownerId: 'owner', lifetime: handle, pathname: '/', params: {} });
    expect(memory.destination('account-pending', 'owner', handle)).toBeNull();
    expect(memory.destination(access, 'owner', handle)).toEqual({ pathname: prefix + '/chat', params: { bookingId } });
    memory.observe({ access, ownerId: 'owner', lifetime: handle, pathname: prefix + '/chat', params: { bookingId } });
    expect(memory.destination(access, 'owner', handle)).toBeNull();
  });
  it.each(['signed-out', 'blocked', 'password-recovery', 'needs-consent', 'worker-identity', 'account-failure', 'session-error', 'session-reconnecting'])('clears saved intent on %s', access => {
    const memory = createSessionRouteContinuation(), handle = lifetime();
    memory.observe({ access: 'worker', ownerId: 'owner', lifetime: handle, pathname: '/worker/chat', params: { bookingId } });
    memory.observe({ access, ownerId: 'owner', lifetime: handle, pathname: '/', params: {} });
    expect(memory.destination('worker', 'owner', handle)).toBeNull();
  });
  it('does not inherit across a different owner, same-owner new login, expired handle or changed role', () => {
    for (const change of ['owner', 'login', 'expired', 'role']) {
      const memory = createSessionRouteContinuation(), handle = lifetime();
      memory.observe({ access: 'client', ownerId: 'owner', lifetime: handle, pathname: '/client/chat', params: { bookingId } });
      memory.observe({ access: 'account-pending', ownerId: 'owner', lifetime: handle, pathname: '/', params: {} });
      if (change === 'expired') handle.isCurrent = () => false;
      expect(memory.destination(change === 'role' ? 'worker' : 'client', change === 'owner' ? 'other' : 'owner', change === 'login' ? lifetime() : handle)).toBeNull();
    }
  });
  it('accepts only an own-role URL and known opaque IDs, never URL/auth material', () => {
    const memory = createSessionRouteContinuation(), handle = lifetime();
    memory.observe({ access: 'client', ownerId: 'owner', lifetime: handle, pathname: '/client/chat', params: { bookingId, token: 'secret', jobId: ['ambiguous'], reportId: 'external-url' } });
    memory.observe({ access: 'account-pending', ownerId: 'owner', lifetime: handle, pathname: '/', params: {} });
    expect(memory.destination('client', 'owner', handle)?.params).toEqual({ bookingId });
    for (const pathname of ['https://example.test', '/worker/chat', '/client-extra/chat', '/update-password']) {
      const other = createSessionRouteContinuation();
      other.observe({ access: 'client', ownerId: 'owner', lifetime: handle, pathname, params: {} });
      other.observe({ access: 'account-pending', ownerId: 'owner', lifetime: handle, pathname: '/', params: {} });
      expect(other.destination('client', 'owner', handle)).toBeNull();
    }
  });
});
