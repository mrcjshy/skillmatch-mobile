import { formatReverseGeocodeAddress, reviewJobPinPlacement, type JobPin, type ReverseGeocodeLike } from './job-location';
import type { NearbyMappedFeature } from './job-location-snap';

export type CanonicalJobLocation = { pin: JobPin; address: string };
export const JOB_LOCATION_DISPLAY_FALLBACK = 'Selected Job location — Santa Ana, Pateros';
export type SelectionOrigin = 'manual' | 'search' | 'recent' | 'gps' | 'mapped' | 'restored';
export type SelectedPlace = { label: string; pin: JobPin; source: 'mapped' | 'search'; mapped?: NearbyMappedFeature };
export type SelectionContext = { origin?: SelectionOrigin; feature?: SelectedPlace | null; rawPin?: JobPin };
export type LocationSelectionState = {
  pin: JobPin | null;
  address: string | null;
  status: 'empty' | 'selected' | 'resolving' | 'ready' | 'error';
  error: 'outside' | 'invalid' | 'geocode' | null;
  generation: number;
  rawPin: JobPin | null;
  origin: SelectionOrigin | null;
  feature: SelectedPlace | null;
  deliberate: boolean;
  nearby: NearbyMappedFeature[];
};

export const emptyLocationSelection = (): LocationSelectionState => ({ pin: null, address: null, status: 'empty', error: null,
  generation: 0, rawPin: null, origin: null, feature: null, deliberate: false, nearby: [] });

/** Pin and address share one lifetime. Older asynchronous replies cannot bind to a new pin. */
export function createCanonicalLocationSelection(onChange?: (state: LocationSelectionState) => void) {
  let request = 0;
  let state = emptyLocationSelection();
  const publish = (next: LocationSelectionState) => { state = next; onChange?.(next); };
  return {
    snapshot: () => state,
    select(pin: JobPin | null, context: SelectionContext = {}) {
      request += 1;
      publish({ pin, address: null, status: pin ? 'selected' : 'empty', error: null,
        generation: state.generation + 1, rawPin: pin ? context.rawPin ?? pin : null,
        origin: pin ? context.origin ?? 'manual' : null, feature: pin ? context.feature ?? null : null, deliberate: pin !== null, nearby: [] });
    },
    setNearby(generation: number, nearby: NearbyMappedFeature[]) {
      if (generation === state.generation) publish({ ...state, nearby });
    },
    identify(context: SelectionContext) {
      if (!state.pin || state.status !== 'ready') return;
      request += 1;
      publish({ ...state, generation: state.generation + 1, origin: context.origin ?? 'manual',
        feature: context.feature ?? null, rawPin: context.rawPin ?? state.pin });
    },
    invalidateResolution() {
      request += 1;
      publish({ ...state, address: null, status: state.pin ? 'selected' : 'empty', error: null });
    },
    adjust(pin: JobPin, feature: SelectedPlace | null = null) {
      request += 1;
      publish({ ...state, pin, feature, address: null, status: 'selected', error: null });
    },
    async resolve(geocoder: ReverseGeocodeLike) {
      const token = ++request;
      const pin = state.pin;
      publish({ ...state, address: null, status: 'resolving', error: null });
      const placement = pin ? await reviewJobPinPlacement(pin) : { ok: false as const, reason: 'invalid' as const };
      if (token !== request) return;
      if (!placement.ok) {
        publish({ ...state, address: null, status: 'error', error: placement.reason });
        return;
      }
      // FT-06C: validity is geographic; optional address metadata cannot hold a
      // valid selection hostage to an unanswered native geocoder promise.
      publish({ ...state, address: JOB_LOCATION_DISPLAY_FALLBACK, status: 'ready', error: 'geocode' });
      try {
        const address = formatReverseGeocodeAddress(await geocoder.reverseGeocodeAsync(pin!));
        if (token !== request) return;
        publish({ ...state, address: address ?? JOB_LOCATION_DISPLAY_FALLBACK, status: 'ready', error: address ? null : 'geocode' });
      } catch {
        if (token === request) publish({ ...state, address: JOB_LOCATION_DISPLAY_FALLBACK, status: 'ready', error: 'geocode' });
      }
    },
    confirm(): CanonicalJobLocation | null {
      if (state.status !== 'ready' || !state.pin || !state.address) return null;
      request += 1;
      return { pin: { ...state.pin }, address: state.address };
    },
    cancel() { request += 1; state = { ...emptyLocationSelection(), generation: state.generation + 1 }; },
  };
}
