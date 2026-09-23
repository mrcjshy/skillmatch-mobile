import { supabase } from './supabase';

export const JOB_KEYS = ['open', 'matched', 'completed', 'cancelled', 'unset'] as const;
export const BOOKING_KEYS = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'] as const;
export const PAYMENT_METHOD_KEYS = ['gcash', 'maya', 'qrph', 'cod', 'unset'] as const;
export const PAYMENT_STATUS_KEYS = ['pending', 'paid', 'refunded', 'unset'] as const;
export const REPORT_KEYS = ['submitted', 'under_review', 'resolved', 'dismissed'] as const;

type Bucket<K extends string> = Record<K, number>;
export type AdminAnalyticsSummary = {
  asOf: string;
  totalWorkers: number;
  verifiedWorkers: number;
  pendingWorkerVerifications: number;
  totalClients: number;
  jobsByStatus: Bucket<(typeof JOB_KEYS)[number]>;
  bookingsByStatus: Bucket<(typeof BOOKING_KEYS)[number]>;
  completedBookings: number;
  paymentsByMethodStatus: Record<
    (typeof PAYMENT_METHOD_KEYS)[number],
    Bucket<(typeof PAYMENT_STATUS_KEYS)[number]>
  >;
  reportsByStatus: Bucket<(typeof REPORT_KEYS)[number]>;
  reportsNeedingAttention: number;
};

export class AdminAnalyticsError extends Error {
  constructor(message: string, readonly code: string | null = null) {
    super(message);
    this.name = 'AdminAnalyticsError';
  }
}

const INVALID = 'The Admin analytics response is incomplete or invalid. Please try again.';

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AdminAnalyticsError(INVALID);
  }
  return value as Record<string, unknown>;
}

function count(value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)
        ? Number(value)
        : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new AdminAnalyticsError(INVALID);
  return parsed;
}

function bucket<K extends string>(value: unknown, keys: readonly K[]): Bucket<K> {
  const source = record(value);
  if (Object.keys(source).length !== keys.length) throw new AdminAnalyticsError(INVALID);
  const result = {} as Bucket<K>;
  for (const key of keys) result[key] = count(source[key]);
  return result;
}

function timestamp(value: unknown): string {
  if (typeof value !== 'string') throw new AdminAnalyticsError(INVALID);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) throw new AdminAnalyticsError(INVALID);
  const [, year, month, day, hour, minute, second] = match;
  const calendar = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    calendar.getUTCFullYear() !== Number(year) ||
    calendar.getUTCMonth() + 1 !== Number(month) ||
    calendar.getUTCDate() !== Number(day) ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59 ||
    !Number.isFinite(Date.parse(value))
  ) throw new AdminAnalyticsError(INVALID);
  return value;
}

export function parseAdminAnalytics(value: unknown): AdminAnalyticsSummary {
  const source = record(value);
  const methods = record(source.payments_by_method_status);
  if (Object.keys(methods).length !== PAYMENT_METHOD_KEYS.length) {
    throw new AdminAnalyticsError(INVALID);
  }
  const payments = {} as AdminAnalyticsSummary['paymentsByMethodStatus'];
  for (const method of PAYMENT_METHOD_KEYS) {
    payments[method] = bucket(methods[method], PAYMENT_STATUS_KEYS);
  }
  const result: AdminAnalyticsSummary = {
    asOf: timestamp(source.as_of),
    totalWorkers: count(source.total_workers),
    verifiedWorkers: count(source.verified_workers),
    pendingWorkerVerifications: count(source.pending_worker_verifications),
    totalClients: count(source.total_clients),
    jobsByStatus: bucket(source.jobs_by_status, JOB_KEYS),
    bookingsByStatus: bucket(source.bookings_by_status, BOOKING_KEYS),
    completedBookings: count(source.completed_bookings),
    paymentsByMethodStatus: payments,
    reportsByStatus: bucket(source.reports_by_status, REPORT_KEYS),
    reportsNeedingAttention: count(source.reports_needing_attention),
  };
  // These are the only derived display totals. Reject overflow before any UI render.
  sumBucket(result.jobsByStatus);
  sumBucket(result.bookingsByStatus);
  sumBucket(result.reportsByStatus);
  let paymentTotal = 0;
  for (const method of PAYMENT_METHOD_KEYS) paymentTotal += sumBucket(result.paymentsByMethodStatus[method]);
  if (!Number.isSafeInteger(paymentTotal)) throw new AdminAnalyticsError(INVALID);
  return result;
}

export async function loadAdminAnalyticsSummary(): Promise<AdminAnalyticsSummary> {
  const { data, error } = await supabase.rpc('get_admin_analytics_summary');
  if (error) {
    throw new AdminAnalyticsError(
      error.code === '42501'
        ? 'You no longer have access to Admin analytics.'
        : 'Unable to load Admin analytics. Please try again.',
      error.code ?? null
    );
  }
  if (!Array.isArray(data) || data.length !== 1) throw new AdminAnalyticsError(INVALID);
  return parseAdminAnalytics(data[0]);
}

export function sumBucket(values: Record<string, number>): number {
  const total = Object.values(values).reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total)) throw new AdminAnalyticsError(INVALID);
  return total;
}

export const JOB_LABELS: Record<(typeof JOB_KEYS)[number], string> = {
  open: 'Open', matched: 'Matched', completed: 'Completed', cancelled: 'Cancelled', unset: 'Not set',
};
export const BOOKING_LABELS: Record<(typeof BOOKING_KEYS)[number], string> = {
  pending: 'Pending', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled', no_show: 'No-show',
};
export const PAYMENT_METHOD_LABELS: Record<(typeof PAYMENT_METHOD_KEYS)[number], string> = {
  gcash: 'GCash (legacy)', maya: 'Maya (legacy)', qrph: 'QR Ph', cod: 'Cash', unset: 'Not set',
};
export const PAYMENT_STATUS_LABELS: Record<(typeof PAYMENT_STATUS_KEYS)[number], string> = {
  pending: 'Pending', paid: 'Paid', refunded: 'Refunded', unset: 'Not set',
};
export const REPORT_LABELS: Record<(typeof REPORT_KEYS)[number], string> = {
  submitted: 'Submitted', under_review: 'Under review', resolved: 'Resolved', dismissed: 'Dismissed',
};

export type AdminAnalyticsView = {
  ownerId: string | null;
  snapshot: AdminAnalyticsSummary | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
};

/** One request lane, one queued follow-up, and a generation for account/focus lifetime. */
export class AdminAnalyticsCoordinator {
  private view: AdminAnalyticsView = {
    ownerId: null, snapshot: null, loading: false, refreshing: false, error: null,
  };
  private active = false;
  private disposed = false;
  private generation = 0;
  private inFlight = false;
  private queued = false;

  constructor(
    private readonly load: () => Promise<AdminAnalyticsSummary>,
    private readonly publish: (view: AdminAnalyticsView) => void
  ) {}

  getState(): AdminAnalyticsView { return this.view; }

  private update(patch: Partial<AdminAnalyticsView>) {
    this.view = { ...this.view, ...patch };
    if (!this.disposed) this.publish(this.view);
  }

  activate(ownerId: string) {
    // React development effect replay may dispose and then reactivate the
    // same component instance. Old results remain invalidated by generation.
    this.disposed = false;
    if (this.view.ownerId !== ownerId) {
      this.generation++;
      this.queued = false;
      this.update({ ownerId, snapshot: null, loading: false, refreshing: false, error: null });
    } else if (!this.active) {
      this.generation++;
    }
    this.active = true;
    this.refresh();
  }

  deactivate() {
    if (!this.active) return;
    this.active = false;
    this.generation++;
    this.queued = false;
    // Blur/unmount needs no state write; the next activation publishes state.
    this.view = { ...this.view, loading: false, refreshing: false };
  }

  clear() {
    this.active = false;
    this.generation++;
    this.queued = false;
    this.update({ ownerId: null, snapshot: null, loading: false, refreshing: false, error: null });
  }

  dispose() {
    this.disposed = true;
    this.active = false;
    this.generation++;
    this.queued = false;
    this.view = { ownerId: null, snapshot: null, loading: false, refreshing: false, error: null };
  }

  refresh() {
    if (!this.active || !this.view.ownerId || this.disposed) return;
    if (this.inFlight) {
      this.queued = true;
      this.update({ loading: this.view.snapshot === null, refreshing: this.view.snapshot !== null });
      return;
    }
    this.start();
  }

  private start() {
    const generation = this.generation;
    const ownerId = this.view.ownerId;
    this.inFlight = true;
    this.update({ loading: this.view.snapshot === null, refreshing: this.view.snapshot !== null, error: null });
    void Promise.resolve()
      .then(this.load)
      .then((snapshot) => {
        if (this.active && generation === this.generation && ownerId === this.view.ownerId) {
          this.update({ snapshot, error: null });
        }
      })
      .catch((error: unknown) => {
        if (this.active && generation === this.generation && ownerId === this.view.ownerId) {
          const forbidden = error instanceof AdminAnalyticsError && error.code === '42501';
          this.update({
            snapshot: forbidden ? null : this.view.snapshot,
            error: forbidden
              ? 'You no longer have access to Admin analytics.'
              : 'Unable to refresh Admin analytics. Please try again.',
          });
        }
      })
      .finally(() => {
        this.inFlight = false;
        if (this.active && ownerId === this.view.ownerId && generation === this.generation) {
          this.update({ loading: false, refreshing: false });
        }
        if (this.queued && this.active && !this.disposed) {
          this.queued = false;
          this.start();
        }
      });
  }
}
