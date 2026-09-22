export type BookingRefreshReason = 'focus' | 'invalidation' | 'manual' | 'retry';

export type BookingRefreshActivity = { isLoading: boolean; isRefreshing: boolean };

type BookingRefreshOptions<T> = {
  loadBookings: () => Promise<T[]>;
  onBookings: (rows: T[]) => void;
  onError: (error: unknown) => void;
  onActivity: (activity: BookingRefreshActivity) => void;
};

export type BookingRefreshScope = {
  refresh: (reason: BookingRefreshReason) => void;
  cancel: () => void;
};

/**
 * A single request slot for one mounted Booking list, across account/role changes.
 * Replacing the authority invalidates its callbacks but drains its existing request
 * before the next authority may fetch. Cancellation does not abort the RPC itself.
 */
export function createBookingRefreshCoordinator<T>() {
  type Scope = {
    options: BookingRefreshOptions<T>;
    hasLoaded: boolean;
    pending: boolean;
    activity: BookingRefreshActivity;
  };
  let current: Scope | null = null;
  let inFlight = false;

  const run = async (): Promise<void> => {
    const scope = current;
    if (inFlight || !scope?.pending) return;
    scope.pending = false;
    inFlight = true;
    try {
      const rows = await scope.options.loadBookings();
      if (current === scope) scope.options.onBookings(rows);
    } catch (error: unknown) {
      if (current === scope) scope.options.onError(error);
    } finally {
      inFlight = false;
      if (current === scope) {
        scope.hasLoaded = true;
        if (!scope.pending) {
          scope.activity = { isLoading: false, isRefreshing: false };
          scope.options.onActivity(scope.activity);
        }
      }
      // May belong to a newer identity. Only that authority can start this read.
      void run();
    }
  };

  return {
    activate(options: BookingRefreshOptions<T>): BookingRefreshScope {
      const scope: Scope = {
        options, hasLoaded: false, pending: false,
        activity: { isLoading: false, isRefreshing: false },
      };
      current = scope;

      return {
        refresh(reason: BookingRefreshReason) {
          if (current !== scope) return;
          scope.pending = true;
          scope.activity = {
            isLoading: scope.activity.isLoading || !scope.hasLoaded || reason === 'retry',
            isRefreshing: scope.activity.isRefreshing || reason === 'manual',
          };
          options.onActivity(scope.activity);
          void run();
        },
        cancel() {
          if (current === scope) current = null;
        },
      };
    },
  };
}
