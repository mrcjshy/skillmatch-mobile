import { findBookingForJob } from './bookings';
import type { AcceptJobResult } from './job-opportunities';

export type WorkerAcceptState = {
  pending: boolean;
  result: AcceptJobResult | null;
  handoffFailed: boolean;
};

export type WorkerAcceptFocus = {
  accept: () => Promise<AcceptJobResult | null>;
  cancel: () => void;
  isCurrent: () => boolean;
};

type FocusOptions = {
  workerId: string;
  sessionUserId: string;
  jobId: string;
  isIdentityCurrent: () => boolean;
  acceptJob: (jobId: string, workerId: string) => Promise<AcceptJobResult>;
  readBookings: () => Promise<{ job_id: string; booking_id: string }[]>;
  onState: (state: WorkerAcceptState) => void;
  onNavigate: (bookingId: string) => void;
};

export function createWorkerAcceptHandoff() {
  // Mutation ownership outlives a focus. Only UI/navigation authority is revoked.
  const attempts = new Map<string, {
    pending: boolean;
    result: AcceptJobResult | null;
    promise?: Promise<AcceptJobResult>;
  }>();
  let cancelCurrent: (() => void) | undefined;
  return {
    focus(options: FocusOptions): WorkerAcceptFocus {
      cancelCurrent?.();
      let active = true;
      const isCurrent = () => active && options.workerId === options.sessionUserId && options.isIdentityCurrent();
      const cancel = () => { active = false; };
      cancelCurrent = cancel;
      const key = JSON.stringify([options.workerId, options.jobId]);
      const reconcile = () => {
        if (!isCurrent()) return;
        const attempt = attempts.get(key);
        options.onState({
          pending: attempt?.pending ?? false,
          result: attempt?.result ?? null,
          handoffFailed: attempt?.result?.status === 'accepted',
        });
      };
      reconcile();
      // A returning focus observes the existing mutation, but never resumes its navigation.
      const previous = attempts.get(key);
      if (previous?.pending) void previous.promise?.then(reconcile);
      return {
        cancel,
        isCurrent,
        async accept() {
          if (!isCurrent()) return null;
          const existing = attempts.get(key);
          if (existing?.pending || existing?.result?.status === 'accepted') return null;
          const attempt = { pending: true, result: null as AcceptJobResult | null, promise: undefined as Promise<AcceptJobResult> | undefined };
          attempts.set(key, attempt);
          options.onState({ pending: true, result: null, handoffFailed: false });
          attempt.promise = options.acceptJob(options.jobId, options.workerId)
            .catch((): AcceptJobResult => ({ status: 'generic' })).then((result) => {
            attempt.pending = false;
            attempt.result = result;
            return result;
          });
          const result = await attempt.promise;
          if (!isCurrent()) return null;
          options.onState({ pending: result.status === 'accepted', result, handoffFailed: false });
          if (result.status !== 'accepted') return result;
          let rows: { job_id: string; booking_id: string }[];
          try {
            rows = await options.readBookings();
          } catch {
            if (isCurrent()) options.onState({ pending: false, result, handoffFailed: true });
            return isCurrent() ? result : null;
          }
          if (!isCurrent()) return null;
          const booking = findBookingForJob(rows, options.jobId);
          options.onState({ pending: false, result, handoffFailed: booking === null });
          if (booking) {
            active = false;
            options.onNavigate(booking.booking_id);
          }
          return result;
        },
      };
    },
  };
}
