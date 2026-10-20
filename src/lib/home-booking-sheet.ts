import type { RoleBooking } from './booking-records';
import type { AuthorizedJobLocation } from './job-location';

export type HomeBookingSheetState = {
  expanded: boolean;
  status: 'loading' | 'ready';
  booking: RoleBooking | null;
  location: AuthorizedJobLocation | null;
};
export type HomeBookingSheetOptions = {
  bookingId: string;
  jobId: string;
  isCurrent: () => boolean;
  readBookings: () => Promise<RoleBooking[]>;
  readLocation: (jobId: string) => Promise<AuthorizedJobLocation>;
  onBookings: (rows: RoleBooking[]) => void;
  onNavigate: (action: 'details' | 'all', booking: RoleBooking) => void;
};

/** One expansion lifetime. Closing invalidates results, including across a rapid reopen. */
export function createHomeBookingSheet(options: HomeBookingSheetOptions) {
  let state: HomeBookingSheetState = { expanded: false, status: 'loading', booking: null, location: null };
  let generation = 0;
  let running = false;
  const listeners = new Set<() => void>();
  const publish = (next: HomeBookingSheetState) => {
    state = next;
    listeners.forEach(listener => listener());
  };
  const authorized = () => {
    try { return options.isCurrent(); } catch { return false; }
  };
  const current = (ticket: number) => ticket === generation && state.expanded && authorized();
  const collapse = () => {
    generation++;
    publish({ expanded: false, status: 'loading', booking: null, location: null });
  };
  const read = async () => {
    if (running || !state.expanded || !authorized()) return;
    running = true;
    const ticket = generation;
    try {
      let rows: RoleBooking[];
      try {
        rows = await options.readBookings();
      } catch {
        if (current(ticket)) { options.onBookings([]); collapse(); }
        return;
      }
      if (!current(ticket)) return;
      options.onBookings(rows);
      const booking = rows.find(row => row.booking_id === options.bookingId && row.job_id === options.jobId && row.booking_status === 'confirmed');
      if (!booking) { collapse(); return; }
      if (!current(ticket)) return;
      let location: AuthorizedJobLocation | null = null;
      try {
        const result = await options.readLocation(booking.job_id);
        if (result.jobId === booking.job_id) location = result;
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
        if (current(ticket) && (code === '42501' || code === 'SM409')) {
          options.onBookings([]);
          collapse();
        }
        // A map/location outage leaves the authorized Details route available.
      }
      if (current(ticket)) publish({ expanded: true, status: 'ready', booking, location });
    } finally {
      running = false;
      // Serialize a new expansion after an invalidated request settles; never publish the old result.
      if (ticket !== generation && state.expanded && authorized()) void read();
    }
  };
  return {
    snapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    expand() {
      if (state.expanded || !authorized()) return;
      generation++;
      publish({ expanded: true, status: 'loading', booking: null, location: null });
      void read();
    },
    revalidate() {
      if (!state.expanded || !authorized()) return;
      generation++;
      // An invalidation is not a new record. Conceal first, then ask the participant RPC again.
      publish({ expanded: true, status: 'loading', booking: null, location: null });
      void read();
    },
    collapse,
    navigate(action: 'details' | 'all') {
      if (!state.expanded || !state.booking || !authorized()) return;
      const booking = state.booking;
      collapse();
      options.onNavigate(action, booking);
    },
  };
}
