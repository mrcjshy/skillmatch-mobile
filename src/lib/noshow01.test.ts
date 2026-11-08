import { describe, expect, it, vi } from 'vitest';

import { COPY, LifecycleError, canReportNoShow, msUntilNoShow, noShowErrorCopy, reportWorkerNoShow } from './booking-lifecycle';
import { formatNotificationLabel, notificationKind } from './notifications';
import { PAST_DATE_COPY, isOpenJobPastDate } from './status-presentation';
import { supabase } from './supabase';

// vi.mock is hoisted above the imports by Vitest.
vi.mock('./supabase', () => ({ supabase: { rpc: vi.fn() } }));

const SCHEDULED = '2026-11-06T02:00:00.000Z';
const at = (iso: string) => Date.parse(iso);

describe('NOSHOW-01: when the Client is offered "Worker didn\'t show up"', () => {
  it('NOSHOW-02 (owner 2026-11-08): only for a confirmed, still-cancellable booking, from the exact scheduled time', () => {
    const due = at(SCHEDULED);
    expect(canReportNoShow('confirmed', SCHEDULED, true, due)).toBe(true);
    expect(canReportNoShow('confirmed', SCHEDULED, true, due - 1)).toBe(false);
    expect(canReportNoShow('confirmed', SCHEDULED, true, due + 30 * 60 * 1000)).toBe(true);
    expect(canReportNoShow('confirmed', SCHEDULED, false, due)).toBe(false);
    for (const status of ['completed', 'cancelled', 'no_show', 'pending']) {
      expect(canReportNoShow(status, SCHEDULED, true, due)).toBe(false);
    }
    expect(canReportNoShow('confirmed', null, true, due)).toBe(false);
    expect(canReportNoShow('confirmed', 'not a date', true, due)).toBe(false);
  });

  it('NOSHOW-02: an open screen is told when the scheduled time arrives, so the button appears without a reload', () => {
    const due = at(SCHEDULED);
    expect(msUntilNoShow(SCHEDULED, due - 5000)).toBe(5000);
    // Already due, unknown, or too far away (a later visit or pull to refresh shows it): no timer.
    expect(msUntilNoShow(SCHEDULED, due)).toBeNull();
    expect(msUntilNoShow(SCHEDULED, due + 1)).toBeNull();
    expect(msUntilNoShow(null, due)).toBeNull();
    expect(msUntilNoShow('not a date', due)).toBeNull();
    expect(msUntilNoShow(SCHEDULED, due - 25 * 60 * 60 * 1000)).toBeNull();
  });

  it('NOSHOW-02: the refusal wording no longer mentions 1 hour', () => {
    expect(COPY.noShowConflict).not.toMatch(/hour/);
    expect(COPY.noShowConflict).toContain('scheduled time');
  });

  it('calls report_worker_no_show with the booking id only', async () => {
    const rpc = vi.mocked(supabase.rpc);
    rpc.mockResolvedValue({ data: [{}], error: null } as never);
    await reportWorkerNoShow('b-1');
    expect(rpc).toHaveBeenCalledWith('report_worker_no_show', { p_booking_id: 'b-1' });
    rpc.mockResolvedValue({ data: null, error: { message: 'raw', code: 'SM409' } } as never);
    await expect(reportWorkerNoShow('b-1')).rejects.toMatchObject({ code: 'SM409' });
  });

  it('words every refusal plainly, never with the raw server text', () => {
    expect(noShowErrorCopy(new LifecycleError('raw', '42501'))).toBe(COPY.noShowForbidden);
    expect(noShowErrorCopy(new LifecycleError('raw', 'SM403'))).toBe(COPY.noShowBlocked);
    expect(noShowErrorCopy(new LifecycleError('raw', 'SM409'))).toBe(COPY.noShowConflict);
    expect(noShowErrorCopy(new Error('raw'))).toBe(COPY.noShowGeneric);
    expect(COPY.noShowConfirmBody).toContain('Administrator');
    expect(COPY.noShow).toBe("Worker didn't show up");
  });

  it('names the Worker notification', () => {
    expect(formatNotificationLabel('booking_no_show')).toBe('No-show reported');
    expect(notificationKind('booking_no_show')).toBe('warning');
  });
});

describe('NOSHOW-01: an open Job whose date has passed', () => {
  it('is "Date passed" only while open and only once its time has come', () => {
    expect(isOpenJobPastDate('open', SCHEDULED, at(SCHEDULED))).toBe(true);
    expect(isOpenJobPastDate('open', SCHEDULED, at(SCHEDULED) - 1)).toBe(false);
    expect(isOpenJobPastDate('matched', SCHEDULED, at(SCHEDULED) + 1)).toBe(false);
    expect(isOpenJobPastDate('open', null, at(SCHEDULED))).toBe(false);
    expect(isOpenJobPastDate('open', 'not a date', at(SCHEDULED))).toBe(false);
    expect(PAST_DATE_COPY.chip).toBe('Date passed');
    expect(PAST_DATE_COPY.note).toContain('post the job again');
  });
});
