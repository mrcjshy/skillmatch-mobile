import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from './supabase';
import {
  BOOKING_REPORT_CATEGORIES,
  ReportError,
  allowedReviewStatuses,
  formatReportCategory,
  formatReportStatus,
  isBookingReportableStatus,
  parseMyReportedBookingIds,
  remainingReportCharacters,
  reviewErrorCopy,
  submitBookingErrorCopy,
  validateAdminResponse,
  validateReportDescription,
  loadReportDisciplineState,
  resolveNoShowReportWithStrike,
  sendReportOutcomeEmail,
  shouldShowStrikeAction,
} from './reports';

vi.mock('./supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
    functions: { invoke: vi.fn() },
  },
}));

const invoke = vi.mocked(supabase.functions.invoke);

describe('sendReportOutcomeEmail', () => {
  it('sends only the report id and repeats the identical request on retry', async () => {
    invoke.mockResolvedValueOnce({ data: { delivered: true }, error: null });
    invoke.mockResolvedValueOnce({ data: { delivered: true }, error: null });
    const reportId = '11111111-1111-4111-8111-111111111111';
    await expect(sendReportOutcomeEmail(reportId)).resolves.toBe(true);
    await expect(sendReportOutcomeEmail(reportId)).resolves.toBe(true);
    expect(invoke.mock.calls[0][1]).toStrictEqual({ body: { report_id: reportId } });
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('does not make the review mutation fail when delivery is unavailable', async () => {
    invoke.mockResolvedValueOnce({ data: { delivered: false }, error: null });
    await expect(
      sendReportOutcomeEmail('11111111-1111-4111-8111-111111111111')
    ).resolves.toBe(false);
  });
});

describe('isBookingReportableStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows confirmed bookings', () => {
    expect(isBookingReportableStatus('confirmed')).toBe(true);
  });

  it('allows completed bookings', () => {
    expect(isBookingReportableStatus('completed')).toBe(true);
  });

  it('allows cancelled bookings', () => {
    expect(isBookingReportableStatus('cancelled')).toBe(true);
  });

  it('denies pending bookings', () => {
    expect(isBookingReportableStatus('pending')).toBe(false);
  });

  it('denies no_show bookings', () => {
    expect(isBookingReportableStatus('no_show')).toBe(false);
  });

  it('denies unknown statuses', () => {
    expect(isBookingReportableStatus('unknown')).toBe(false);
  });
});

describe('BOOKING_REPORT_CATEGORIES', () => {
  it('contains the exact booking-report values and excludes app_issue', () => {
    expect([...BOOKING_REPORT_CATEGORIES]).toEqual([
      'behavior',
      'no-show',
      'harassment',
      'safety',
      'payment',
      'incorrect_details',
      'fraud',
      'other',
    ]);
    expect(BOOKING_REPORT_CATEGORIES).not.toContain('app_issue');
  });
});

describe('validateReportDescription', () => {
  it('trims surrounding whitespace of a valid description', () => {
    expect(validateReportDescription('  late arrival  ')).toEqual({
      ok: true,
      description: 'late arrival',
    });
  });

  it('rejects an empty description', () => {
    expect(validateReportDescription('')).toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects a whitespace-only description', () => {
    expect(validateReportDescription('   \n\t  ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('accepts a 1-character description', () => {
    expect(validateReportDescription('x')).toEqual({ ok: true, description: 'x' });
  });

  it('accepts a 2000-character description', () => {
    const description = 'a'.repeat(2000);
    expect(validateReportDescription(description)).toEqual({ ok: true, description });
  });

  it('rejects a 2001-character description', () => {
    expect(validateReportDescription('a'.repeat(2001))).toEqual({ ok: false, reason: 'too_long' });
  });
});

describe('remainingReportCharacters', () => {
  it('counts remaining characters against the trimmed length', () => {
    expect(remainingReportCharacters('abc')).toBe(1997);
    expect(remainingReportCharacters('  abc  ')).toBe(1997);
    expect(remainingReportCharacters('a'.repeat(2000))).toBe(0);
    expect(remainingReportCharacters('a'.repeat(2001))).toBe(-1);
  });
});

describe('formatReportCategory', () => {
  it('returns human labels for known report categories', () => {
    expect(formatReportCategory('behavior')).toBe('Behavior');
    expect(formatReportCategory('no-show')).toBe('No-show');
    expect(formatReportCategory('harassment')).toBe('Harassment');
    expect(formatReportCategory('safety')).toBe('Safety');
    expect(formatReportCategory('payment')).toBe('Payment');
    expect(formatReportCategory('incorrect_details')).toBe('Incorrect details');
    expect(formatReportCategory('fraud')).toBe('Fraud');
    expect(formatReportCategory('app_issue')).toBe('App issue');
    expect(formatReportCategory('other')).toBe('Other');
  });
});

describe('formatReportStatus', () => {
  it('returns human labels for known report statuses', () => {
    expect(formatReportStatus('submitted')).toBe('Submitted');
    expect(formatReportStatus('under_review')).toBe('Under review');
    expect(formatReportStatus('resolved')).toBe('Resolved');
    expect(formatReportStatus('dismissed')).toBe('Dismissed');
  });
});

describe('parseMyReportedBookingIds', () => {
  it('marks only requested Booking-bound reports, independent of status', () => {
    const bookingId = '11111111-1111-4111-8111-111111111111';
    const otherId = '22222222-2222-4222-8222-222222222222';
    expect([...parseMyReportedBookingIds([
      { booking_id: bookingId, status: 'resolved' },
      { booking_id: otherId, status: 'submitted' },
      { booking_id: null, status: 'submitted' },
    ], [bookingId])]).toEqual([bookingId]);
  });
});

describe('allowedReviewStatuses', () => {
  it('allows under_review, resolved, and dismissed from submitted', () => {
    expect(allowedReviewStatuses('submitted')).toEqual(['under_review', 'resolved', 'dismissed']);
  });

  it('allows resolved and dismissed from under_review', () => {
    expect(allowedReviewStatuses('under_review')).toEqual(['resolved', 'dismissed']);
  });

  it('allows no further review of resolved reports', () => {
    expect(allowedReviewStatuses('resolved')).toEqual([]);
  });

  it('allows no further review of dismissed reports', () => {
    expect(allowedReviewStatuses('dismissed')).toEqual([]);
  });
});

describe('validateAdminResponse', () => {
  it('allows a blank response when marking under review', () => {
    expect(validateAdminResponse('under_review', '')).toEqual({ ok: true, response: null });
    expect(validateAdminResponse('under_review', '   ')).toEqual({ ok: true, response: null });
  });

  it('allows a 1-to-2000 character response when marking under review', () => {
    expect(validateAdminResponse('under_review', ' looking  ')).toEqual({
      ok: true,
      response: 'looking',
    });
    expect(validateAdminResponse('under_review', 'a'.repeat(2000))).toEqual({
      ok: true,
      response: 'a'.repeat(2000),
    });
  });

  it('rejects an over-length response when marking under review', () => {
    expect(validateAdminResponse('under_review', 'a'.repeat(2001))).toEqual({
      ok: false,
      reason: 'too_long',
    });
  });

  it('requires a nonblank 1-to-2000 character response to resolve or dismiss', () => {
    expect(validateAdminResponse('resolved', '')).toEqual({ ok: false, reason: 'empty' });
    expect(validateAdminResponse('dismissed', '   ')).toEqual({ ok: false, reason: 'empty' });
    expect(validateAdminResponse('resolved', ' done ')).toEqual({ ok: true, response: 'done' });
    expect(validateAdminResponse('dismissed', 'a'.repeat(2000))).toEqual({
      ok: true,
      response: 'a'.repeat(2000),
    });
    expect(validateAdminResponse('resolved', 'a'.repeat(2001))).toEqual({
      ok: false,
      reason: 'too_long',
    });
    expect(validateAdminResponse('dismissed', 'a'.repeat(2001))).toEqual({
      ok: false,
      reason: 'too_long',
    });
  });
});

describe('R3 error mapping', () => {
  it('maps 42501 to a permission message', () => {
    expect(submitBookingErrorCopy(new ReportError('ignored', '42501'))).toBe(
      "You don't have permission to submit this report."
    );
  });

  it('maps 22023 to an invalid-input message', () => {
    expect(submitBookingErrorCopy(new ReportError('ignored', '22023'))).toBe(
      'Description must be between 1 and 2000 characters.'
    );
  });

  it('maps booking SM409 to collapsed unavailable copy', () => {
    const copy = submitBookingErrorCopy(new ReportError('this booking is not available for reporting', 'SM409'));
    expect(copy).toBe('This report cannot be submitted right now.');
    expect(copy.toLowerCase()).not.toContain('already reported');
  });

  it('maps unknown failures to generic retry copy', () => {
    expect(submitBookingErrorCopy(new ReportError('syntax error', '42601'))).toBe(
      "We couldn't submit this report. Please try again."
    );
    expect(submitBookingErrorCopy(new Error('network'))).toBe(
      "We couldn't submit this report. Please try again."
    );
  });

  it('maps admin review SM409 to collapsed unavailable copy', () => {
    const copy = reviewErrorCopy(new ReportError('this report is not available for review', 'SM409'));
    expect(copy).toBe('This report is not available for review.');
    expect(copy.toLowerCase()).not.toContain('already');
  });
});

describe('FT-05 Admin-reviewed no-show discipline', () => {
  const rpc = vi.mocked(supabase.rpc);

  beforeEach(() => {
    rpc.mockReset();
  });

  it('accepts only the narrow server-derived discipline read shape', async () => {
    rpc.mockResolvedValueOnce({
      data: [{ eligible: true, current_strike_count: 2, would_suspend: true }],
      error: null,
    } as never);

    await expect(loadReportDisciplineState('11111111-1111-4111-8111-111111111111'))
      .resolves.toEqual({ eligible: true, currentStrikeCount: 2, wouldSuspend: true });
    expect(rpc).toHaveBeenCalledExactlyOnceWith('get_report_discipline_state', {
      p_report_id: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('fails closed for malformed or ineligible discipline state', async () => {
    rpc.mockResolvedValueOnce({
      data: [{ eligible: 'yes', current_strike_count: 2, would_suspend: false }],
      error: null,
    } as never);
    await expect(loadReportDisciplineState('11111111-1111-4111-8111-111111111111'))
      .rejects.toBeInstanceOf(ReportError);
    expect(shouldShowStrikeAction(null)).toBe(false);
    expect(shouldShowStrikeAction({
      eligible: false,
      currentStrikeCount: null,
      wouldSuspend: false,
    })).toBe(false);
  });

  it('shows the strike action only from an eligible server result', () => {
    expect(shouldShowStrikeAction({
      eligible: true,
      currentStrikeCount: 1,
      wouldSuspend: false,
    })).toBe(true);
  });

  it('sends only report id and Admin response to the dedicated RPC', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null } as never);
    await resolveNoShowReportWithStrike(
      '11111111-1111-4111-8111-111111111111',
      'Reviewed evidence confirms the no-show.'
    );
    expect(rpc).toHaveBeenCalledExactlyOnceWith('resolve_no_show_report_with_strike', {
      p_report_id: '11111111-1111-4111-8111-111111111111',
      p_admin_response: 'Reviewed evidence confirms the no-show.',
    });
  });
});
