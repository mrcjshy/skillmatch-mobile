// @ts-expect-error -- Vitest runs in Node; the Expo app tsconfig omits Node declarations.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- Vitest runs in Node; the Expo app tsconfig omits Node declarations.
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { supabase } from './supabase';
import {
  AdminAnalyticsCoordinator, AdminAnalyticsError, BOOKING_LABELS, JOB_LABELS,
  PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, REPORT_LABELS,
  loadAdminAnalyticsSummary, parseAdminAnalytics, sumBucket,
  type AdminAnalyticsSummary,
} from './admin-analytics';

vi.mock('./supabase', () => ({ supabase: { rpc: vi.fn() } }));
const rpc = vi.mocked(supabase.rpc);

function row(): Record<string, unknown> {
  return {
    as_of: '2026-09-23T02:12:26.65146+00:00',
    total_workers: '7', verified_workers: 2, pending_worker_verifications: 0,
    total_clients: 5,
    jobs_by_status: { open: 5, matched: 1, completed: 8, cancelled: 1, unset: 0 },
    bookings_by_status: { pending: 0, confirmed: 1, completed: 8, cancelled: 1, no_show: 0 },
    completed_bookings: 8,
    payments_by_method_status: {
      gcash: { pending: 0, paid: 0, refunded: 0, unset: 0 },
      maya: { pending: 0, paid: 0, refunded: 0, unset: 0 },
      qrph: { pending: 2, paid: 2, refunded: 0, unset: 0 },
      cod: { pending: 0, paid: 3, refunded: 0, unset: 0 },
      unset: { pending: 3, paid: 0, refunded: 0, unset: 0 },
    },
    reports_by_status: { submitted: 1, under_review: 0, resolved: 0, dismissed: 1 },
    reports_needing_attention: 1,
  };
}

function summary(): AdminAnalyticsSummary { return parseAdminAnalytics(row()); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function settle() { for (let i = 0; i < 8; i++) await Promise.resolve(); }

describe('Admin analytics RPC contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads one valid row through exactly the zero-argument aggregate RPC', async () => {
    rpc.mockResolvedValue({ data: [row()], error: null } as never);
    const result = await loadAdminAnalyticsSummary();
    expect(rpc).toHaveBeenCalledExactlyOnceWith('get_admin_analytics_summary');
    expect(result.totalWorkers).toBe(7);
    expect(result.asOf).toBe('2026-09-23T02:12:26.65146+00:00');
    expect(Object.keys(result)).toEqual([
      'asOf', 'totalWorkers', 'verifiedWorkers', 'pendingWorkerVerifications',
      'totalClients', 'jobsByStatus', 'bookingsByStatus', 'completedBookings',
      'paymentsByMethodStatus', 'reportsByStatus', 'reportsNeedingAttention',
    ]);
  });

  it.each([[], [row(), row()], null, {}])('rejects non-single-row responses: %s', async (data) => {
    rpc.mockResolvedValue({ data, error: null } as never);
    await expect(loadAdminAnalyticsSummary()).rejects.toBeInstanceOf(AdminAnalyticsError);
  });

  it('rejects absent scalar fields and malformed timestamps', () => {
    for (const field of ['total_workers', 'verified_workers', 'pending_worker_verifications',
      'total_clients', 'completed_bookings', 'reports_needing_attention']) {
      const invalid = row(); delete invalid[field];
      expect(() => parseAdminAnalytics(invalid)).toThrow(AdminAnalyticsError);
    }
    for (const value of [null, '', '2026-02-30T00:00:00Z', '2026-09-23', 'not a date']) {
      expect(() => parseAdminAnalytics({ ...row(), as_of: value })).toThrow(AdminAnalyticsError);
    }
  });

  it.each([-1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1,
    '-1', '1.5', '1e3', '2abc', ' 2', '9007199254740992', null])(
    'rejects unsafe or malformed count %s', (value) => {
      expect(() => parseAdminAnalytics({ ...row(), total_workers: value })).toThrow(AdminAnalyticsError);
    }
  );

  it('requires every fixed bucket key and rejects malformed nested values', () => {
    const missingJob = row(); missingJob.jobs_by_status = { open: 1 };
    expect(() => parseAdminAnalytics(missingJob)).toThrow(AdminAnalyticsError);
    const missingBooking = row(); missingBooking.bookings_by_status = { pending: 0 };
    expect(() => parseAdminAnalytics(missingBooking)).toThrow(AdminAnalyticsError);
    const missingReport = row(); missingReport.reports_by_status = { submitted: 1 };
    expect(() => parseAdminAnalytics(missingReport)).toThrow(AdminAnalyticsError);
    const missingMethod = row(); missingMethod.payments_by_method_status = { cod: {} };
    expect(() => parseAdminAnalytics(missingMethod)).toThrow(AdminAnalyticsError);
    const badCell = row();
    badCell.payments_by_method_status = {
      ...(badCell.payments_by_method_status as object),
      cod: { pending: 0, paid: '1.5', refunded: 0, unset: 0 },
    };
    expect(() => parseAdminAnalytics(badCell)).toThrow(AdminAnalyticsError);
    const overflowingTotal = row();
    overflowingTotal.jobs_by_status = {
      open: Number.MAX_SAFE_INTEGER, matched: 1, completed: 0, cancelled: 0, unset: 0,
    };
    expect(() => parseAdminAnalytics(overflowingTotal)).toThrow(AdminAnalyticsError);
  });

  it('retains zero and unset buckets, and selects no extra response fields', () => {
    const parsed = parseAdminAnalytics({ ...row(), email: 'private@example.test' });
    expect(parsed.jobsByStatus.unset).toBe(0);
    expect(parsed.bookingsByStatus.no_show).toBe(0);
    expect(parsed.paymentsByMethodStatus.unset.pending).toBe(3);
    expect(parsed.paymentsByMethodStatus.gcash.refunded).toBe(0);
    expect(parsed).not.toHaveProperty('email');
    expect(JOB_LABELS.unset).toBe('Not set');
    expect(PAYMENT_METHOD_LABELS.unset).toBe('Not set');
    expect(PAYMENT_METHOD_LABELS.cod).toBe('Cash');
    expect(PAYMENT_METHOD_LABELS.qrph).toBe('QR Ph');
    expect(PAYMENT_METHOD_LABELS.gcash).toContain('legacy');
    expect(PAYMENT_METHOD_LABELS.maya).toContain('legacy');
    expect(PAYMENT_STATUS_LABELS.unset).toBe('Not set');
    expect(BOOKING_LABELS.no_show).toBe('No-show');
  });

  it('derives display totals from server buckets without treating completed as paid', () => {
    const parsed = summary();
    expect(sumBucket(parsed.jobsByStatus)).toBe(15);
    expect(sumBucket(parsed.bookingsByStatus)).toBe(10);
    expect(parsed.completedBookings).toBe(8);
    expect(parsed.paymentsByMethodStatus.cod.paid + parsed.paymentsByMethodStatus.qrph.paid).toBe(5);
    expect(parsed.reportsNeedingAttention).toBe(1);
    expect(REPORT_LABELS.under_review).toBe('Under review');
    expect(() => sumBucket({ a: Number.MAX_SAFE_INTEGER, b: 1 })).toThrow(AdminAnalyticsError);
  });

  it('surfaces RPC rejection and 42501 without fabricated data', async () => {
    rpc.mockRejectedValueOnce(new Error('offline'));
    await expect(loadAdminAnalyticsSummary()).rejects.toThrow('offline');
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501' } } as never);
    await expect(loadAdminAnalyticsSummary()).rejects.toMatchObject({ code: '42501' });
  });
});

describe('Admin analytics refresh lifetime', () => {
  it('coordinates focus, manual refresh, and Retry through one read lane and one follow-up', async () => {
    const first = deferred<AdminAnalyticsSummary>();
    const second = deferred<AdminAnalyticsSummary>();
    const load = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const controller = new AdminAnalyticsCoordinator(load, vi.fn());
    controller.activate('admin-a');
    controller.refresh();
    controller.refresh();
    await settle();
    expect(load).toHaveBeenCalledTimes(1);
    first.resolve(summary());
    await settle();
    expect(load).toHaveBeenCalledTimes(2);
    expect(controller.getState().refreshing).toBe(true);
    second.resolve(summary());
    await settle();
    expect(controller.getState()).toMatchObject({ loading: false, refreshing: false, error: null });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('ignores an old account result and clears the protected snapshot on account loss', async () => {
    const old = deferred<AdminAnalyticsSummary>();
    const fresh = deferred<AdminAnalyticsSummary>();
    const load = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const controller = new AdminAnalyticsCoordinator(load, vi.fn());
    controller.activate('admin-a');
    await settle();
    controller.activate('admin-b');
    expect(controller.getState().snapshot).toBeNull();
    old.resolve(summary());
    await settle();
    expect(controller.getState().snapshot).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
    fresh.resolve(summary());
    await settle();
    expect(controller.getState().ownerId).toBe('admin-b');
    expect(controller.getState().snapshot?.totalWorkers).toBe(7);
    controller.clear();
    expect(controller.getState()).toMatchObject({ ownerId: null, snapshot: null, loading: false });
  });

  it('ignores a blurred result and gives a refocus one queued read', async () => {
    const old = deferred<AdminAnalyticsSummary>();
    const fresh = deferred<AdminAnalyticsSummary>();
    const load = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const controller = new AdminAnalyticsCoordinator(load, vi.fn());
    controller.activate('admin-a');
    await settle();
    controller.deactivate();
    controller.activate('admin-a');
    old.resolve(summary());
    await settle();
    expect(controller.getState().snapshot).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
    fresh.resolve(summary());
    await settle();
    expect(controller.getState().loading).toBe(false);
  });

  it('survives development effect cleanup and replay without accepting the obsolete result', async () => {
    const old = deferred<AdminAnalyticsSummary>();
    const fresh = deferred<AdminAnalyticsSummary>();
    const load = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const controller = new AdminAnalyticsCoordinator(load, vi.fn());
    controller.activate('admin-a');
    await settle();
    controller.deactivate();
    controller.dispose();
    controller.activate('admin-a');
    old.resolve(summary());
    await settle();
    expect(controller.getState().snapshot).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
    fresh.resolve(summary());
    await settle();
    expect(controller.getState().snapshot?.totalWorkers).toBe(7);
  });

  it('never leaves first-load or refresh loading stuck; 42501 clears prior data', async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(summary())
      .mockRejectedValueOnce(new Error('temporary'))
      .mockRejectedValueOnce(new AdminAnalyticsError('denied', '42501'));
    const controller = new AdminAnalyticsCoordinator(load, vi.fn());
    controller.activate('admin-a');
    await settle();
    expect(controller.getState()).toMatchObject({ loading: false, snapshot: null });
    expect(controller.getState().error).toBeTruthy();
    controller.refresh(); await settle();
    expect(controller.getState().snapshot).not.toBeNull();
    controller.refresh(); await settle();
    expect(controller.getState()).toMatchObject({ refreshing: false, loading: false });
    expect(controller.getState().error).toContain('refresh');
    expect(controller.getState().snapshot).not.toBeNull();
    controller.refresh(); await settle();
    expect(controller.getState()).toMatchObject({ snapshot: null, refreshing: false, loading: false });
    expect(controller.getState().error).toContain('no longer');
  });
});

describe('Admin route wiring', () => {
  it('registers the queue route and preserves its verification details destination', () => {
    const root = process.cwd();
    const layout = readFileSync(join(root, 'src/app/(admin)/_layout.tsx'), 'utf8');
    const home = readFileSync(join(root, 'src/app/(admin)/admin/index.tsx'), 'utf8');
    const queue = readFileSync(join(root, 'src/app/(admin)/admin/identity-reviews.tsx'), 'utf8');
    expect(layout).toContain('name="admin/identity-reviews"');
    expect(layout).toContain('name="admin/verification-details"');
    expect(layout).toContain('name="admin/reports"');
    expect(home).toContain("router.push('/admin/identity-reviews'");
    expect(home).toContain("router.push('/admin/reports'");
    expect(home).toContain('Sign Out');
    expect(queue).toContain('<IdentityReviewQueue');
    expect(queue).toContain("pathname: '/admin/verification-details'");
  });
});
