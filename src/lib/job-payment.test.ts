import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from './supabase';
import {
  JobPaymentError,
  fetchJobPaymentMethod,
  formatClientPostedPaymentLine,
  formatJobPaymentLabel,
  formatOpportunityPaymentLine,
  isPayableQrphBudget,
  parseJobPaymentMethod,
  postingPaymentError,
} from './job-payment';

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));

describe('parseJobPaymentMethod', () => {
  it('accepts cod as Job intent', () => {
    expect(parseJobPaymentMethod('cod')).toEqual({ ok: true, method: 'cod' });
  });

  it('accepts qrph as Job intent', () => {
    expect(parseJobPaymentMethod('qrph')).toEqual({ ok: true, method: 'qrph' });
  });

  it('accepts null as legacy Job intent', () => {
    expect(parseJobPaymentMethod(null)).toEqual({ ok: true, method: null });
  });

  it('rejects a garbage non-null token instead of treating it as legacy', () => {
    expect(parseJobPaymentMethod('gcash')).toEqual({ ok: false });
    expect(parseJobPaymentMethod('maya')).toEqual({ ok: false });
    expect(parseJobPaymentMethod('cash')).toEqual({ ok: false });
    expect(parseJobPaymentMethod('')).toEqual({ ok: false });
  });
});

describe('Job payment display labels', () => {
  it('maps stored Job tokens to Cash and QR Ph', () => {
    expect(formatJobPaymentLabel('cod')).toBe('Cash');
    expect(formatJobPaymentLabel('qrph')).toBe('QR Ph');
  });

  it('uses Client list legacy copy for a null Job method', () => {
    expect(formatClientPostedPaymentLine('cod')).toBe('Payment method: Cash');
    expect(formatClientPostedPaymentLine('qrph')).toBe('Payment method: QR Ph');
    expect(formatClientPostedPaymentLine(null)).toBe('Payment method: Not specified (legacy job)');
  });

  it('uses Worker opportunity legacy copy for a null Job method', () => {
    expect(formatOpportunityPaymentLine('cod')).toBe('Payment method: Cash');
    expect(formatOpportunityPaymentLine('qrph')).toBe('Payment method: QR Ph');
    expect(formatOpportunityPaymentLine(null)).toBe(
      'Payment method: Client selects after completion (legacy job)'
    );
  });
});

describe('QR Ph payable budget', () => {
  it('rejects a missing, zero, or sub-peso QR Ph budget', () => {
    expect(isPayableQrphBudget(null)).toBe(false);
    expect(isPayableQrphBudget(0)).toBe(false);
    expect(isPayableQrphBudget(0.99)).toBe(false);
  });

  it('accepts a QR Ph budget of 1.00 or more', () => {
    expect(isPayableQrphBudget(1)).toBe(true);
    expect(isPayableQrphBudget(1.01)).toBe(true);
  });

  it('allows Cash with a missing or zero budget', () => {
    expect(postingPaymentError('cod', null)).toBeNull();
    expect(postingPaymentError('cod', 0)).toBeNull();
  });

  it('requires an active payment-method choice before posting', () => {
    expect(postingPaymentError(null, 50)).toBe('Please select a payment method.');
  });

  it('requires a payable QR Ph budget with user-facing copy', () => {
    expect(postingPaymentError('qrph', null)).toBe('QR Ph requires a budget of at least ₱1.00.');
    expect(postingPaymentError('qrph', 0)).toBe('QR Ph requires a budget of at least ₱1.00.');
    expect(postingPaymentError('qrph', 0.99)).toBe('QR Ph requires a budget of at least ₱1.00.');
    expect(postingPaymentError('qrph', 1)).toBeNull();
    expect(postingPaymentError('qrph', 1.01)).toBeNull();
  });
});

describe('fetchJobPaymentMethod', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.from).mockReturnValue({
      select,
    } as never);
    select.mockReturnValue({ eq });
    eq.mockReturnValue({ maybeSingle });
  });

  it('reads only payment_method for the Job id', async () => {
    maybeSingle.mockResolvedValue({ data: { payment_method: 'cod' }, error: null });
    await expect(fetchJobPaymentMethod('job-1')).resolves.toBe('cod');
    expect(supabase.from).toHaveBeenCalledWith('job_postings');
    expect(select).toHaveBeenCalledWith('payment_method');
    expect(eq).toHaveBeenCalledWith('id', 'job-1');
  });

  it('returns null for a legacy Job row', async () => {
    maybeSingle.mockResolvedValue({ data: { payment_method: null }, error: null });
    await expect(fetchJobPaymentMethod('job-2')).resolves.toBeNull();
  });

  it('rejects a malformed hosted Job method', async () => {
    maybeSingle.mockResolvedValue({ data: { payment_method: 'gcash' }, error: null });
    await expect(fetchJobPaymentMethod('job-3')).rejects.toBeInstanceOf(JobPaymentError);
  });
});
