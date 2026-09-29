import { formatReverseGeocodeAddress, reviewJobPinPlacement, type JobPin, type ReverseGeocodeLike } from './job-location';

export type CanonicalJobLocation = { pin: JobPin; address: string };
export const JOB_LOCATION_DISPLAY_FALLBACK = 'Selected Job location — Santa Ana, Pateros';
export type LocationSelectionState = {
  pin: JobPin | null;
  address: string | null;
  status: 'empty' | 'selected' | 'resolving' | 'ready' | 'error';
  error: 'outside' | 'invalid' | 'geocode' | null;
};

/** Pin and address share one lifetime. Older asynchronous replies cannot bind to a new pin. */
export function createCanonicalLocationSelection(onChange?: (state: LocationSelectionState) => void) {
  let generation = 0;
  let state: LocationSelectionState = { pin: null, address: null, status: 'empty', error: null };
  const publish = (next: LocationSelectionState) => { state = next; onChange?.(next); };
  return {
    snapshot: () => state,
    select(pin: JobPin | null) {
      generation += 1;
      publish({ pin, address: null, status: pin ? 'selected' : 'empty', error: null });
    },
    async resolve(geocoder: ReverseGeocodeLike) {
      const token = ++generation;
      const pin = state.pin;
      publish({ pin, address: null, status: 'resolving', error: null });
      const placement = pin ? await reviewJobPinPlacement(pin) : { ok: false as const, reason: 'invalid' as const };
      if (token !== generation) return;
      if (!placement.ok) {
        publish({ pin, address: null, status: 'error', error: placement.reason });
        return;
      }
      try {
        const address = formatReverseGeocodeAddress(await geocoder.reverseGeocodeAsync(pin!));
        if (token !== generation) return;
        publish({ pin, address: address ?? JOB_LOCATION_DISPLAY_FALLBACK, status: 'ready', error: address ? null : 'geocode' });
      } catch {
        if (token === generation) publish({ pin, address: JOB_LOCATION_DISPLAY_FALLBACK, status: 'ready', error: 'geocode' });
      }
    },
    confirm(): CanonicalJobLocation | null {
      return state.status === 'ready' && state.pin && state.address
        ? { pin: { ...state.pin }, address: state.address } : null;
    },
    cancel() { generation += 1; state = { pin: null, address: null, status: 'empty', error: null }; },
  };
}
