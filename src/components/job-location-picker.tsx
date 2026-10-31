import { Component, useCallback, useEffect, useLayoutEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { AppState, Keyboard, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CameraRef, MapRef, ViewStateChangeEvent } from '@maplibre/maplibre-react-native';
import type { NativeSyntheticEvent } from 'react-native';

import { SkillMatchTheme } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import {
  COPY,
  SANTA_ANA_PATEROS_DISPLAY_REGION,
  classifyMapAvailability,
  resolveCurrentLocationPin,
  type JobPin,
} from '@/lib/job-location';

import { createCanonicalLocationSelection, emptyLocationSelection, type CanonicalJobLocation, type LocationSelectionState, type SelectionContext } from '@/lib/canonical-job-location';
import { jobMapRuntime as mapsRuntime } from '@/lib/native-job-map';
import { PICKER_MAP_STYLE } from '@/lib/picker-map-style';
import { pinFromMapCenter, pinToLngLat } from '@/lib/map-coordinates';
import { findPickerMapContext, NEAR_LANDMARK_METERS, SNAP_MIN_ZOOM, type NearbyMappedFeature } from '@/lib/job-location-snap';
import { evaluateSantaAnaJobPin, santaAnaRingBBox, SANTA_ANA_PATEROS_BOUNDARY_RING } from '@/lib/santa-ana-service-area';
import { AppButton } from '@/components/app-button';
import { PulseDots, Skeleton } from '@/components/skeleton';
import { AppSymbol } from '@/components/app-symbol';
import { AppNotice } from '@/components/app-notice';
import { inspectLocationPermission, type LocationPermissionState } from '@/lib/location-permission';
import { LOCATION_SEARCH_DEBOUNCE_MS, LOCATION_SEARCH_MIN_LENGTH, searchPhoton, type LocationSuggestion } from '@/lib/location-search';
import { clearRecentLocations, loadRecentLocations, type RecentLocation, type RecentLocationScope } from '@/lib/recent-locations';
import { useSession, type SessionLifetime } from '@/providers/session-provider';
import { useAccount } from '@/providers/account-provider';

const { colors, type, spacing, radius } = SkillMatchTheme.ui;
// Keeps the school area and surrounding streets in view on a phone-sized map.
const PICKER_STREET_ZOOM = 16.6;
type PickerOwner = { scope: RecentLocationScope; lifetime: SessionLifetime | null | undefined; revision: number | undefined };
type Suggestion = { generation: number; place: NearbyMappedFeature };
// Informational outline of the authoritative service polygon, drawn from its exact
// vertices. Confirmation still depends only on the coordinate validation path.
const SERVICE_AREA_BOUNDARY = {
  type: 'Feature' as const,
  properties: {},
  geometry: { type: 'Polygon' as const, coordinates: [SANTA_ANA_PATEROS_BOUNDARY_RING.map(([longitude, latitude]) => [longitude, latitude])] },
};

/** Native pin-tip projection shares the optional context deadline. */
async function captureMapPin(map: MapRef, target: [number, number], fallback: JobPin): Promise<{ raw: JobPin; budgetMs: number }> {
  if (!map.unproject) return { raw: fallback, budgetMs: 750 };
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const coordinate = await Promise.race([
      map.unproject(target),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 750); }),
    ]);
    const raw = coordinate && pinFromMapCenter(coordinate);
    return raw ? { raw, budgetMs: Math.max(0, 750 - (Date.now() - started)) } : { raw: fallback, budgetMs: 0 };
  } catch { return { raw: fallback, budgetMs: 0 }; }
  finally { clearTimeout(timer); }
}

type JobLocationPickerProps = {
  pin: JobPin | null;
  initialAddress?: string;
  onInvalidate?: () => void;
  note: string | null;
  onNote: (note: string | null) => void;
  disabled?: boolean;
  onCancel?: () => void;
  backHandlerRef?: { current: (() => void) | null };
  onConfirm: (location: CanonicalJobLocation) => void;
};

class MapErrorBoundary extends Component<
  { onError: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    this.props.onError();
  }

  render(): ReactNode {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

export function JobLocationPicker({
  pin,
  initialAddress,
  onInvalidate,
  note,
  onNote,
  disabled = false,
  onCancel,
  backHandlerRef,
  onConfirm,
}: JobLocationPickerProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const [mapSize, setMapSize] = useState({ width, height });
  const [sheetHeight, setSheetHeight] = useState(Math.min(height * 0.38, 380));
  const topOverlayHeight = insets.top + 64;
  const cameraPadding = { top: topOverlayHeight, right: 0, bottom: sheetHeight, left: 0 };
  const pinTarget: [number, number] = [mapSize.width / 2, (mapSize.height + topOverlayHeight - sheetHeight) / 2];
  const [recoveryMinZoom, setRecoveryMinZoom] = useState(15);
  const [serviceAreaRecovery, setServiceAreaRecovery] = useState<{
    epoch: number; scope: RecentLocationScope; bounds: [number, number, number, number] | null;
  } | null>(null);
  const cameraRef = useRef<CameraRef>(null);
  const mapRef = useRef<MapRef>(null);
  const initialRenderResolved = useRef(false);
  const initialRenderPending = useRef(false);
  const movingRef = useRef(false);
  const currentMoveRef = useRef(false);
  const programmaticMoveRef = useRef(false);
  const handledIdleRef = useRef(Boolean(pin));
  const candidateMoveRef = useRef<(SelectionContext & { pin: JobPin }) | null>(null);
  const rawCenterRef = useRef<JobPin | null>(null);
  const lookupEpoch = useRef(0);
  const locationRequestEpoch = useRef(0);
  const [moving, setMoving] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [showInitialAddress, setShowInitialAddress] = useState(Boolean(pin && initialAddress));
  const [mapReady, setMapReady] = useState(mapsRuntime !== null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapRendered, setMapRendered] = useState(false);
  const [locating, setLocating] = useState(false);
  const [permission, setPermission] = useState<LocationPermissionState | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [queryOwner, setQueryOwner] = useState<PickerOwner | null>(null);
  const queryScope = useRef<RecentLocationScope | null>(null);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchUnavailable, setSearchUnavailable] = useState(false);
  const [searchAttempt, setSearchAttempt] = useState(0);
  const searchEpoch = useRef(0);
  const [recentLocations, setRecentLocations] = useState<RecentLocation[]>([]);
  const [recentOwner, setRecentOwner] = useState<PickerOwner | null>(null);
  const [searchOwner, setSearchOwner] = useState<PickerOwner | null>(null);
  const [selectedOwner, setSelectedOwner] = useState<(PickerOwner & { generation: number }) | null>(null);
  const [clearRecentsError, setClearRecentsError] = useState(false);
  const session = useSession();
  const account = useAccount();
  const latestAuthority = useRef({ session, account });
  useLayoutEffect(() => { latestAuthority.current = { session, account }; }, [session, account]);
  const recentScope = useRef<RecentLocationScope | null>(null);
  const selectedScope = useRef<RecentLocationScope | null>(null);
  const recentEpoch = useRef(0);
  const sessionLifetime = session.sessionLifetime;
  const sessionRevision = session.sessionRevision;
  const openingPin = useRef<{ pin: JobPin | null; lifetime: typeof sessionLifetime; revision: typeof sessionRevision } | null>({ pin, lifetime: sessionLifetime, revision: sessionRevision });
  const subscribeSessionLifecycle = session.subscribeSessionLifecycle;
  const termination = account.clientDraftTermination;
  const terminationEpoch = termination?.snapshot();
  const recentOwnerId = account.status === 'resolved' && account.account?.role === 'client' && account.account.is_active && account.hasCurrentConsent &&
    !session.isSessionLoading && !session.sessionError && session.recoveryStatus === 'idle' &&
    session.session?.user.id === account.account.id && sessionLifetime?.ownerId === account.account.id ? account.account.id : null;
  const authorityIsCurrent = (() => {
    try { return recentOwnerId !== null && sessionLifetime?.isCurrent() === true && (session.isSessionRevisionCurrent?.(sessionRevision ?? 0) ?? false); }
    catch { return false; }
  })();
  const ownerMatches = (owner: PickerOwner | null) => authorityIsCurrent && owner?.scope.userId === recentOwnerId && owner.lifetime === sessionLifetime && owner.revision === sessionRevision;
  const mapAvailable = classifyMapAvailability(mapReady && mapsRuntime !== null);
  const Map = mapsRuntime?.Map;
  const Camera = mapsRuntime?.Camera;
  const Marker = mapsRuntime?.Marker;
  const GeoJSONSource = mapsRuntime?.GeoJSONSource;
  const Layer = mapsRuntime?.Layer;

  useEffect(() => {
    if (!mapReady || mapLoaded || mapRendered) return;
    const timer = setTimeout(() => setMapReady(false), 20_000);
    return () => clearTimeout(timer);
  }, [mapReady, mapLoaded, mapRendered]);

  const [selectionState, setSelectionState] = useState<LocationSelectionState>(emptyLocationSelection);
  const [selection] = useState(() => createCanonicalLocationSelection(setSelectionState));
  const lifetime = useRef(true);
  const captureScope = useCallback((): RecentLocationScope => {
    const { session: capturedSession, account: capturedAccount } = latestAuthority.current;
    const capturedLifetime = capturedSession.sessionLifetime;
    const capturedRevision = capturedSession.sessionRevision;
    const capturedTermination = capturedAccount.clientDraftTermination;
    const capturedTerminationEpoch = capturedTermination?.snapshot();
    const userId = capturedSession.session?.user.id ?? '';
    return { userId, isCurrent: () => {
      try {
        const { session: s, account: a } = latestAuthority.current;
        return lifetime.current && s.sessionLifetime === capturedLifetime && s.sessionRevision === capturedRevision &&
          capturedLifetime?.ownerId === userId && capturedLifetime.isCurrent() &&
          (s.isSessionRevisionCurrent?.(capturedRevision ?? 0) ?? false) &&
          !s.isSessionLoading && !s.sessionError && s.recoveryStatus === 'idle' && s.session?.user.id === userId &&
          a.status === 'resolved' && a.account?.id === userId && a.account.role === 'client' && a.account.is_active === true &&
          a.hasCurrentConsent === true && a.clientDraftTermination === capturedTermination && capturedTermination?.snapshot() === capturedTerminationEpoch;
      } catch { return false; }
    } };
  }, []);
  const busy = disabled || locating || !authorityIsCurrent;
  useEffect(() => {
    lifetime.current = true;
    return () => { lifetime.current = false; selection.cancel(); };
  }, [selection]);

  useEffect(() => {
    const epoch = ++recentEpoch.current;
    const previous = recentScope.current;
    recentScope.current = null;
    // This effect clears private selection/cache state when authenticated ownership changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecentLocations([]);
    setClearRecentsError(false);
    if (previous) {
      lookupEpoch.current += 1;
      searchEpoch.current += 1;
      queryScope.current = null;
      setSearchOpen(false);
      setSearchQuery('');
      setQueryOwner(null);
      selection.select(null);
      selectedScope.current = null;
      setShowInitialAddress(false);
      setSuggestions([]);
      setSearching(false);
      setLocating(false);
      setSuggestion(null);
      candidateMoveRef.current = null;
      movingRef.current = false;
      currentMoveRef.current = false;
      programmaticMoveRef.current = false;
      rawCenterRef.current = null;
      setMoving(false);
    }
    if (!recentOwnerId || !sessionLifetime) return;
    const scope = captureScope();
    recentScope.current = scope;
    if (!scope.isCurrent()) return;
    void loadRecentLocations(scope).then(rows => {
      if (scope.isCurrent() && epoch === recentEpoch.current) {
        setRecentOwner({ scope, lifetime: sessionLifetime, revision: sessionRevision });
        setRecentLocations(rows);
      }
    }).catch(() => undefined);
  }, [recentOwnerId, sessionLifetime, sessionRevision, termination, terminationEpoch, selection, captureScope]);

  useEffect(() => {
    const invalidate = () => {
      recentEpoch.current += 1;
      lookupEpoch.current += 1;
      searchEpoch.current += 1;
      queryScope.current = null;
      setSearchOpen(false);
      setSearchQuery('');
      setQueryOwner(null);
      setRecentLocations([]);
      setClearRecentsError(false);
      selection.select(null);
      selectedScope.current = null;
      setShowInitialAddress(false);
      setSuggestions([]);
      setSearching(false);
      setLocating(false);
      setSuggestion(null);
      candidateMoveRef.current = null;
      movingRef.current = false;
      currentMoveRef.current = false;
      programmaticMoveRef.current = false;
      rawCenterRef.current = null;
      setMoving(false);
    };
    const unsubscribe = subscribeSessionLifecycle?.(invalidate);
    const unsubscribeTermination = termination?.subscribe(invalidate);
    return () => { unsubscribe?.(); unsubscribeTermination?.(); };
  }, [subscribeSessionLifecycle, termination, selection]);

  const displayedRecentScope = recentOwner?.scope ?? null;
  const displayedSearchScope = searchOwner?.scope ?? null;
  const visibleSearchQuery = ownerMatches(queryOwner) ? searchQuery : '';
  const visibleSuggestions = ownerMatches(searchOwner) ? suggestions : [];
  const visibleRecents = ownerMatches(recentOwner) ? recentLocations : [];
  function clearRecents(scope: RecentLocationScope | null): void {
    if (!scope?.isCurrent()) return;
    const epoch = ++recentEpoch.current;
    setRecentLocations([]);
    setClearRecentsError(false);
    void clearRecentLocations(scope).catch(() => {
      if (scope.isCurrent() && epoch === recentEpoch.current) setClearRecentsError(true);
    });
  }

  useEffect(() => {
    const query = searchQuery.trim();
    const scope = queryOwner?.scope;
    if (query.length < LOCATION_SEARCH_MIN_LENGTH || !scope?.isCurrent() || scope !== queryScope.current) return;
    const controller = new AbortController();
    const epoch = searchEpoch.current;
    const current = () => scope.isCurrent() && scope === queryScope.current && AppState.currentState === 'active' && !controller.signal.aborted && epoch === searchEpoch.current;
    const timer = setTimeout(() => {
      if (!current()) return;
      setSearching(true);
      setSearchUnavailable(false);
      void searchPhoton(query, controller.signal)
        .then((rows) => { if (current()) { setSearchOwner(queryOwner); setSuggestions(rows); } })
        .catch(() => { if (current()) { setSearchOwner(queryOwner); setSuggestions([]); setSearchUnavailable(true); } })
        .finally(() => { if (current()) setSearching(false); });
    }, LOCATION_SEARCH_DEBOUNCE_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [searchQuery, searchAttempt, queryOwner, sessionLifetime, sessionRevision]);

  function handleSearchQueryChange(value: string): void {
    const scope = captureScope();
    if (!scope.isCurrent() || latestAuthority.current.session.sessionLifetime !== sessionLifetime ||
      latestAuthority.current.session.sessionRevision !== sessionRevision) return;
    searchEpoch.current += 1;
    queryScope.current = scope;
    setQueryOwner({ scope, lifetime: sessionLifetime, revision: sessionRevision });
    setSearchQuery(value);
    setSuggestions([]);
    setSearching(false);
    setSearchUnavailable(false);
  }
  function closeSearch(): void {
    Keyboard.dismiss();
    handleSearchQueryChange('');
    setSearchOpen(false);
  }
  const handleBack = () => { if (searchOpen) closeSearch(); else onCancel?.(); };
  useLayoutEffect(() => {
    if (!backHandlerRef) return;
    backHandlerRef.current = handleBack;
    return () => { backHandlerRef.current = null; };
  });
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', event => setKeyboardHeight(event.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  function retrySearch(): void {
    if (!queryOwner?.scope.isCurrent() || queryScope.current !== queryOwner.scope) return;
    searchEpoch.current += 1;
    setSuggestions([]);
    setSearching(false);
    setSearchUnavailable(false);
    setSearchAttempt(value => value + 1);
  }
  const resolveAddress = useCallback(async (): Promise<void> => {
    const epoch = lookupEpoch.current;
    const scope = captureScope();
    if (!scope.isCurrent() || !selection.snapshot().pin || movingRef.current) return;
    const currentSession = latestAuthority.current.session;
    selectedScope.current = scope;
    setSelectedOwner({ scope, lifetime: currentSession.sessionLifetime, revision: currentSession.sessionRevision, generation: selection.snapshot().generation });
    selection.invalidateResolution();
    setShowInitialAddress(false);
    try {
      // Permission requests must not depend on fetching a development chunk.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const location = require('expo-location') as typeof import('expo-location');
      if (!scope.isCurrent() || epoch !== lookupEpoch.current || movingRef.current) return;
      if (!selection.snapshot().pin) return;
      await selection.resolve({ reverseGeocodeAsync: async coords => {
        try {
          const rows = await location.reverseGeocodeAsync(coords);
          if (!scope.isCurrent() && epoch === lookupEpoch.current) selection.select(null);
          return rows;
        } catch (error) {
          if (!scope.isCurrent() && epoch === lookupEpoch.current) selection.select(null);
          throw error;
        }
      } });
    } catch {
      if (scope.isCurrent() && epoch === lookupEpoch.current && !movingRef.current) {
        await selection.resolve({ reverseGeocodeAsync: async () => { throw new Error('Unavailable'); } });
      }
    }
  }, [selection, captureScope]);

  useEffect(() => {
    const opening = openingPin.current;
    openingPin.current = null;
    if (!opening?.pin || opening.lifetime !== sessionLifetime || opening.revision !== sessionRevision || !captureScope().isCurrent()) return;
    selection.select(opening.pin, { origin: 'restored' });
    rawCenterRef.current = opening.pin;
    void resolveAddress();
  }, [sessionLifetime, sessionRevision, captureScope, selection, resolveAddress]);

  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void resolveAddress();
      else {
        lookupEpoch.current += 1;
        searchEpoch.current += 1;
        setSuggestions([]);
        setSearching(false);
        selection.invalidateResolution();
        setShowInitialAddress(false);
      }
    });
    return () => listener.remove();
  }, [resolveAddress, selection]);

  function beginMove(): void {
    if (movingRef.current) return;
    setServiceAreaRecovery(null);
    locationRequestEpoch.current += 1;
    movingRef.current = true;
    lookupEpoch.current += 1;
    selection.select(null);
    candidateMoveRef.current = null;
    selectedScope.current = null;
    setSuggestion(null);
    setShowInitialAddress(false);
    rawCenterRef.current = null;
    onInvalidate?.();
    onNote(null);
    setMoving(true);
  }

  function handleRegionWillChange(event: NativeSyntheticEvent<ViewStateChangeEvent>): void {
    if (event.nativeEvent.userInteraction) {
      programmaticMoveRef.current = false;
      candidateMoveRef.current = null;
      currentMoveRef.current = false;
      beginMove();
    } else if (!programmaticMoveRef.current && currentMoveRef.current) beginMove();
  }

  function handleRegionDidChange(event: NativeSyntheticEvent<ViewStateChangeEvent>): void {
    if (programmaticMoveRef.current && !event.nativeEvent.userInteraction) {
      programmaticMoveRef.current = false;
      return;
    }
    // Consume one settle per gesture. Native duplicate idle events may retain
    // userInteraction=true, including after an assisted/exact camera movement.
    if (!movingRef.current && !currentMoveRef.current && (!event.nativeEvent.userInteraction || handledIdleRef.current)) return;
    handledIdleRef.current = true;
    // Do not force a zoom jump when the user interrupts the wider recovery view.
    if (event.nativeEvent.zoom >= 15) setRecoveryMinZoom(15);
    if (!movingRef.current) beginMove();
    currentMoveRef.current = false;
    movingRef.current = false;
    setMoving(false);
    const nextPin = pinFromMapCenter(event.nativeEvent.center);
    const candidate = candidateMoveRef.current;
    candidateMoveRef.current = null;
    const atCandidate = nextPin && candidate && !event.nativeEvent.userInteraction &&
      Math.abs(nextPin.latitude - candidate.pin.latitude) < 0.000001 && Math.abs(nextPin.longitude - candidate.pin.longitude) < 0.000001;
    const epoch = ++lookupEpoch.current;
    if (nextPin) void captureSelection(nextPin, event.nativeEvent.zoom, epoch, atCandidate ? candidate : undefined);
  }

  async function captureSelection(eventCenter: JobPin, zoom: number, epoch: number, candidate?: SelectionContext & { pin: JobPin }): Promise<void> {
    const scope = captureScope();
    const { raw, budgetMs } = !candidate && mapRef.current ? await captureMapPin(mapRef.current, pinTarget, eventCenter) : { raw: eventCenter, budgetMs: 750 };
    if (!scope.isCurrent() || epoch !== lookupEpoch.current || movingRef.current) return;
    // Explicit choices retain their exact numeric coordinates, not native camera rounding.
    const effective = candidate?.pin ?? raw;
    rawCenterRef.current = candidate?.rawPin ?? effective;
    selection.select(effective, candidate);
    void settleSelection(effective, zoom, epoch, budgetMs);
  }

  async function settleSelection(rawCenter: JobPin, zoom: number, epoch: number, budgetMs = 750): Promise<void> {
    const scope = captureScope();
    selectedScope.current = scope;
    const generation = selection.snapshot().generation;
    const maySuggest = budgetMs > 0 && selection.snapshot().origin === 'manual' && zoom >= SNAP_MIN_ZOOM && mapRef.current !== null;
    // The address alone gates confirmation. Optional native context may only
    // offer a mapped place; it never moves the camera or the chosen coordinate.
    void resolveAddress();
    let candidate: NearbyMappedFeature | null = null;
    let landmarks: NearbyMappedFeature[] = [];
    try {
      if (zoom >= 15 && mapRef.current) {
        const context = await findPickerMapContext(mapRef.current, rawCenter, zoom, maySuggest, budgetMs);
        candidate = maySuggest ? context.snap : null;
        landmarks = context.nearby;
      }
    } catch { /* A failed feature query keeps the manually placed center. */ }
    if (!scope.isCurrent() || epoch !== lookupEpoch.current || movingRef.current || generation !== selection.snapshot().generation) return;
    setSuggestion(candidate ? { generation, place: candidate } : null);
    selection.setNearby(generation, landmarks);
  }

  async function resolveRenderedEntry(): Promise<void> {
    if (initialRenderResolved.current || initialRenderPending.current || movingRef.current || !mapRef.current) return;
    const epoch = lookupEpoch.current;
    const generation = selection.snapshot().generation;
    const scope = captureScope();
    if (!scope.isCurrent()) return;
    initialRenderPending.current = true;
    try {
      const view = await mapRef.current.getViewState();
      if (!scope.isCurrent() || epoch !== lookupEpoch.current || movingRef.current) return;
      const center = pinFromMapCenter(view.center);
      if (!center || !Number.isFinite(view.zoom) || view.zoom < 15) return;
      initialRenderResolved.current = true;
      rawCenterRef.current = center;
      // The display anchor is context, not a chosen service location.
      // Restored drafts resolve independently; only deliberate input selects a new pin.
      const context = await findPickerMapContext(mapRef.current, center, view.zoom, false);
      if (scope.isCurrent() && epoch === lookupEpoch.current && !movingRef.current) selection.setNearby(generation, context.nearby);
    } catch { /* Map/native label availability cannot block choosing a pin. */ }
    finally { initialRenderPending.current = false; }
  }

  useEffect(() => {
    const recovery = serviceAreaRecovery;
    if (!recovery || !recovery.scope.isCurrent() || recovery.epoch !== lookupEpoch.current || movingRef.current || !cameraRef.current) return;
    // The lower recovery-only zoom floor has committed, but the camera module call reaches the UI
    // thread ahead of queued prop mounts; one frame lets the floor mount so the fit is not clamped at 15.
    // Symmetric insets keep the existing pin-tip target fixed while clearing the
    // 52-point location control, its sheet gap, and an extra margin on all edges.
    const inset = 52 + spacing.md * 2;
    const padding = { top: topOverlayHeight + inset, right: spacing.gutter, bottom: sheetHeight + inset, left: spacing.gutter };
    programmaticMoveRef.current = true;
    const failed = () => { if (recovery.epoch === lookupEpoch.current) programmaticMoveRef.current = false; };
    const frame = requestAnimationFrame(() => {
      if (!cameraRef.current || recovery.epoch !== lookupEpoch.current || movingRef.current) { failed(); return; }
      try {
        const result = recovery.bounds
          ? cameraRef.current.fitBounds(recovery.bounds, { padding, bearing: 0, pitch: 0, duration: reducedMotion ? 0 : 300, easing: 'ease' })
          : cameraRef.current.easeTo({ center: pinToLngLat(SANTA_ANA_PATEROS_DISPLAY_REGION), zoom: 14, padding, bearing: 0, pitch: 0, duration: reducedMotion ? 0 : 300 });
        void Promise.resolve(result).catch(failed);
      } catch { failed(); }
    });
    // A measured viewport or sheet change refits only this still-current action.
    return () => cancelAnimationFrame(frame);
  }, [serviceAreaRecovery, topOverlayHeight, sheetHeight, mapSize.width, mapSize.height, reducedMotion]);

  function useExactPin(): void {
    const current = selection.snapshot();
    const rawCenter = current.rawPin;
    if (!rawCenter || current.origin !== 'mapped' || !cameraRef.current) return;
    lookupEpoch.current += 1;
    setSuggestion(null);
    selection.select(rawCenter);
    programmaticMoveRef.current = true;
    cameraRef.current.easeTo({ center: pinToLngLat(rawCenter), padding: cameraPadding, duration: reducedMotion ? 0 : 200 });
    void resolveAddress();
  }

  function acceptSuggestion(offer: Suggestion): void {
    // Only this explicit tap selects the mapped coordinate, and only for the pin it was found for.
    if (offer.generation !== selection.snapshot().generation) return;
    selectNearby(offer.place);
  }

  function returnToServiceArea(): void {
    if (busy || mapAvailable !== 'ready' || movingRef.current || !cameraRef.current) return;
    const current = selection.snapshot();
    const scope = captureScope();
    if (current.error !== 'outside' || current.generation !== selectionState.generation || !scope.isCurrent()) return;
    const box = santaAnaRingBBox();
    const bounds: [number, number, number, number] = [Number(box.west), Number(box.south), Number(box.east), Number(box.north)];
    const center = { longitude: (bounds[0] + bounds[2]) / 2, latitude: (bounds[1] + bounds[3]) / 2 };
    // The bbox is for framing only. Validate its center against the real polygon;
    // an unsuitable center falls back to the existing anchor with a wider view.
    const usableCenter = evaluateSantaAnaJobPin(center).ok;
    locationRequestEpoch.current += 1;
    lookupEpoch.current += 1;
    selection.select(null);
    candidateMoveRef.current = null;
    currentMoveRef.current = false;
    selectedScope.current = null;
    rawCenterRef.current = null;
    setSuggestion(null);
    setShowInitialAddress(false);
    onInvalidate?.();
    programmaticMoveRef.current = true;
    setRecoveryMinZoom(12);
    setServiceAreaRecovery({ epoch: lookupEpoch.current, scope, bounds: usableCenter ? bounds : null });
  }

  async function handleUseCurrentLocation(): Promise<void> {
    if (busy || mapAvailable !== 'ready') return;
    setLocating(true);
    // Android's permission dialog backgrounds the app and cancels geocoding.
    // Its explicit permission result still belongs to this authenticated request.
    const requestEpoch = ++locationRequestEpoch.current;
    const scope = captureScope();
    const current = () => scope.isCurrent() && requestEpoch === locationRequestEpoch.current;
    try {
      // Keep optional native loading recoverable without a separate Metro chunk.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const location = require('expo-location') as typeof import('expo-location');
      if (!current()) return;
      const nextPermission = await inspectLocationPermission(location, true);
      if (!current()) return;
      setPermission(nextPermission);
      if (nextPermission !== 'granted') {
        onNote(COPY.permissionDenied);
        return;
      }
      const result = await resolveCurrentLocationPin({
        getForegroundPermissionsAsync: location.getForegroundPermissionsAsync,
        requestForegroundPermissionsAsync: location.requestForegroundPermissionsAsync,
        // A precise service pin needs a fresh foreground GPS-capable fix.
        getCurrentPositionAsync: () => location.getCurrentPositionAsync({ accuracy: location.Accuracy.High }),
      });
      if (!current()) return;
      if (result.kind !== 'pin') {
        onNote(result.kind === 'denied' ? COPY.permissionDenied : COPY.locationUnavailable);
        return;
      }
      if (!cameraRef.current) { onNote(COPY.mapUnavailable); return; }
      moveToCandidate(result.pin, { origin: 'gps' });
    } catch {
      if (current()) onNote(COPY.locationUnavailable);
    } finally {
      if (scope.isCurrent()) setLocating(false);
    }
  }

  function updateSheetHeight(nextHeight: number): void {
    if (!Number.isFinite(nextHeight) || nextHeight <= 0 || Math.abs(nextHeight - sheetHeight) < 0.5) return;
    setSheetHeight(nextHeight);
    if (movingRef.current || !cameraRef.current || (serviceAreaRecovery && serviceAreaRecovery.epoch === lookupEpoch.current)) return;
    const center = selection.snapshot().pin ?? rawCenterRef.current ?? pin ?? SANTA_ANA_PATEROS_DISPLAY_REGION;
    programmaticMoveRef.current = true;
    try {
      void Promise.resolve(cameraRef.current.easeTo({ center: pinToLngLat(center), padding: { top: topOverlayHeight, right: 0, bottom: nextHeight, left: 0 }, duration: 0 })).catch(() => { programmaticMoveRef.current = false; });
    } catch { /* Initial native layout may precede the camera ref becoming ready. */ }
  }

  const candidateScope = ownerMatches(selectedOwner) ? selectedOwner?.scope : ownerMatches(recentOwner) ? recentOwner?.scope : null;
  function selectNearby(item: NearbyMappedFeature): void {
    if (!candidateScope?.isCurrent() || movingRef.current || selectionState.generation !== selection.snapshot().generation) return;
    const rawPin = selection.snapshot().rawPin ?? item.pin;
    moveToCandidate(item.pin, { origin: 'mapped', rawPin, feature: { label: item.label, pin: item.pin, source: 'mapped', mapped: item } });
  }

  function moveToCandidate(pin: JobPin, context: SelectionContext = {}): void {
    if (busy || !cameraRef.current) return;
    setServiceAreaRecovery(null);
    setRecoveryMinZoom(15);
    const selected = selection.snapshot();
    if (!movingRef.current && selected.status === 'ready' && selected.pin && selectedScope.current?.isCurrent() &&
      Math.abs(selected.pin.latitude - pin.latitude) < 0.0000001 && Math.abs(selected.pin.longitude - pin.longitude) < 0.0000001) {
      // MapLibre need not emit an idle event for a camera already at this pin.
      lookupEpoch.current += 1;
      setSuggestion(null);
      selection.identify(context);
      const scope = captureScope();
      selectedScope.current = scope;
      setSelectedOwner({ scope, lifetime: sessionLifetime, revision: sessionRevision, generation: selection.snapshot().generation });
      programmaticMoveRef.current = true;
      cameraRef.current.easeTo({ center: pinToLngLat(pin), zoom: PICKER_STREET_ZOOM, padding: cameraPadding, duration: 300 });
      return;
    }
    programmaticMoveRef.current = false;
    beginMove();
    candidateMoveRef.current = { ...context, pin };
    currentMoveRef.current = true;
    cameraRef.current.easeTo({ center: pinToLngLat(pin), zoom: PICKER_STREET_ZOOM, padding: cameraPadding, duration: 300 });
  }

  const addressCopy = !authorityIsCurrent || (selectedOwner && !ownerMatches(selectedOwner)) ? 'Move the map to choose a service location.' : showInitialAddress && initialAddress ? initialAddress : selectionState.address ?? (
    moving ? 'Move the map to position the center pin.' :
    selectionState.error === 'outside' ? 'This location is outside Barangay Santa Ana.' :
    selectionState.pin ? 'Selected map point' :
    'Move the map to choose a service location.'
  );

  const addressParts = addressCopy.split(',').map(part => part.trim()).filter(Boolean);
  const fallback = selectionState.error === 'geocode' && selectionState.status === 'ready';
  const selectedFeature = authorityIsCurrent && ownerMatches(selectedOwner) && !moving && selectionState.error !== 'outside' ? selectionState.feature : null;
  const nearby = authorityIsCurrent && candidateScope && !moving ? selectionState.nearby : [];
  const nearPlace = !selectedFeature && selectionState.deliberate && selectionState.origin === 'manual' &&
    selectionState.error !== 'outside' ? nearby.find(item => item.distanceMeters <= NEAR_LANDMARK_METERS) : null;
  const primaryAddress = selectedFeature?.label ?? (nearPlace ? `Near ${nearPlace.label}` : fallback ? 'Santa Ana, Pateros' : addressParts[0] ?? addressCopy);
  const secondaryAddress = fallback ? 'Exact street unavailable.' : selectedFeature || nearPlace ? selectionState.address : addressParts.slice(1).join(', ');
  const alternatives = nearby.filter(item => item.id !== selectedFeature?.mapped?.id);
  const offered = authorityIsCurrent && candidateScope && ownerMatches(selectedOwner) && !moving && suggestion?.generation === selectionState.generation ? suggestion : null;
  // The offered place keeps its map marker but is not repeated as a Nearby row.
  const listedAlternatives = alternatives.filter(item => item.id !== offered?.place.id);
  const candidateMarkers = alternatives.filter((item, index, items) => item.distancePx > 32 &&
    !items.slice(0, index).some(other => Math.hypot(item.offsetPx[0] - other.offsetPx[0], item.offsetPx[1] - other.offsetPx[1]) < 48));
  const canReturnToPoint = selectedFeature?.source === 'mapped' && selectionState.rawPin && selectionState.pin &&
    (selectionState.rawPin.latitude !== selectionState.pin.latitude || selectionState.rawPin.longitude !== selectionState.pin.longitude);
  const placeIcon = (category?: string) => {
    if (category && /school|college|university/.test(category)) return { android: 'school', ios: 'graduationcap' } as const;
    if (category && /hospital|clinic|pharmacy/.test(category)) return { android: 'local_hospital', ios: 'cross.case' } as const;
    if (category && /shop|store|grocery/.test(category)) return { android: 'storefront', ios: 'storefront' } as const;
    return { android: 'place', ios: 'mappin' } as const;
  };

  return (
    <View style={styles.screen}>
      {mapAvailable === 'ready' && Map && Camera ? (
        <MapErrorBoundary onError={() => setMapReady(false)}>
          <View
            style={styles.mapFrame}
            onLayout={event => { const { width, height } = event.nativeEvent.layout; if (width > 0 && height > 0) setMapSize({ width, height }); }}
          >
            <Map
              ref={mapRef}
              style={styles.map}
              mapStyle={PICKER_MAP_STYLE}
              androidView="texture"
              dragPan={!disabled && !locating}
              touchZoom={!disabled && !locating}
              onRegionWillChange={handleRegionWillChange}
              onRegionDidChange={handleRegionDidChange}
              touchPitch={false}
              touchRotate={false}
              compass={false}
              attributionPosition={{ bottom: sheetHeight + spacing.sm, left: spacing.gutter }}
              onDidFailLoadingMap={() => setMapReady(false)}
              onDidFinishRenderingFrame={mapRendered ? undefined : () => { setMapRendered(true); void resolveRenderedEntry(); }}
              onDidFinishRenderingMap={() => { setMapRendered(true); void resolveRenderedEntry(); }}
              onDidFinishRenderingMapFully={() => { setMapLoaded(true); void resolveRenderedEntry(); }}
              accessibilityLabel="Job location map"
            >
              <Camera
                ref={cameraRef}
                minZoom={recoveryMinZoom}
                maxZoom={19}
                padding={cameraPadding}
                initialViewState={{ center: pinToLngLat(pin ?? SANTA_ANA_PATEROS_DISPLAY_REGION), zoom: PICKER_STREET_ZOOM, padding: cameraPadding, bearing: 0, pitch: 0 }}
              />
              {GeoJSONSource && Layer ? (
                <GeoJSONSource id="service-area-boundary" data={SERVICE_AREA_BOUNDARY} tolerance={0}>
                  <Layer id="service-area-boundary-line" type="line" paint={{ 'line-color': colors.accent, 'line-width': 2, 'line-opacity': 0.8 }} />
                </GeoJSONSource>
              ) : null}
              {!searchOpen && Marker ? candidateMarkers.map(item => (
                <Marker key={item.id} id={`candidate:${item.id}`} lngLat={pinToLngLat(item.pin)}
                  onPress={() => selectNearby(item)}>
                  <Pressable style={styles.candidateMarkerTarget} accessibilityRole="button"
                    accessibilityLabel={`Mapped place ${item.label}`} onPress={() => selectNearby(item)}>
                    <View style={styles.candidateMarker}>
                      <AppSymbol name={placeIcon(item.category)} size={20} tintColor={colors.accent} />
                    </View>
                  </Pressable>
                </Marker>
              )) : null}
            </Map>
            <View pointerEvents="none" testID="service-location-center-pin" style={{ ...styles.centerPinOverlay, top: pinTarget[1] }} accessible={false} importantForAccessibility="no-hide-descendants">
              <View style={styles.pinShadow} />
              <View style={styles.pinTip} />
              <View style={styles.pinHead}><View style={styles.pinCenter} /></View>
            </View>
            {!mapLoaded && !mapRendered ? (
              <View style={styles.loading} pointerEvents="none">
                <Skeleton shape="fill" label="Loading job location map" />
              </View>
            ) : null}
            <Pressable
              style={[styles.floatingControl, styles.backControl, { top: insets.top + spacing.sm }]}
              onPress={handleBack}
              accessibilityRole="button"
              accessibilityLabel={searchOpen ? "Back to map" : "Back to Post Job"}
            ><AppSymbol name={{ android: 'arrow_back', ios: 'chevron.left' }} size={24} tintColor={colors.textPrimary} /></Pressable>
            <Pressable
              style={[styles.floatingControl, styles.currentControl, { bottom: sheetHeight + spacing.md }]}
              onPress={() => { void handleUseCurrentLocation(); }}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={COPY.useCurrentLocation}
              accessibilityState={{ disabled: busy, busy: locating }}
            >{locating ? <PulseDots color={colors.accent} /> : <AppSymbol name={{ android: 'my_location', ios: 'location' }} size={24} tintColor={colors.accent} />}</Pressable>
          </View>
        </MapErrorBoundary>
      ) : (
        <View style={styles.unavailable} accessibilityLabel="Job location map unavailable">
          <Pressable style={[styles.floatingControl, styles.backControl, { top: insets.top + spacing.sm }]}
            onPress={handleBack} accessibilityRole="button" accessibilityLabel={searchOpen ? "Back to map" : "Back to Post Job"}>
            <AppSymbol name={{ android: 'arrow_back', ios: 'chevron.left' }} size={24} tintColor={colors.textPrimary} />
          </Pressable>
          <Text style={styles.addressText}>{COPY.mapUnavailable}</Text>
        </View>
      )}
      <View style={[styles.topSearch, { top: insets.top + spacing.sm }]}>
        {searchOpen ? (
          <TextInput value={visibleSearchQuery} onChangeText={handleSearchQueryChange}
            placeholder="Search street or landmark" placeholderTextColor={colors.textMuted}
            style={styles.searchInput} editable={!busy} autoFocus
            accessibilityLabel="Search for location" returnKeyType="search" />
        ) : (
          <Pressable style={styles.searchAffordance} onPress={() => setSearchOpen(true)}
            accessibilityRole="button" accessibilityLabel="Search locations" disabled={busy}>
            <AppSymbol name={{ android: 'search', ios: 'magnifyingglass' }} size={22} tintColor={colors.textPrimary} />
            <Text style={styles.nearbyLabel}>Search</Text>
          </Pressable>
        )}
      </View>
      {!searchOpen && !moving && authorityIsCurrent && ownerMatches(selectedOwner) && selectionState.status === 'ready' ? (
        <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
          style={[styles.pinLabel, { top: pinTarget[1] - 128 }]}>
          <Text style={styles.pinLabelText} numberOfLines={2}>{primaryAddress}</Text>
        </View>
      ) : null}
      <View testID="location-picker-sheet" style={[styles.sheet, { height: Math.min(height * 0.40, 400), maxHeight: Math.min(height * 0.40, 400), paddingBottom: Math.max(insets.bottom, spacing.md) }, searchOpen && { height: undefined, top: topOverlayHeight + spacing.sm, bottom: keyboardHeight, maxHeight: height }]}
        onLayout={event => { if (!searchOpen) updateSheetHeight(event.nativeEvent.layout.height); }}>
        <View style={styles.handle} accessible={false} />
        <ScrollView keyboardShouldPersistTaps="handled" style={styles.sheetBody} contentContainerStyle={styles.sheetContent} nestedScrollEnabled>
        {!searchOpen ? <View style={styles.selectedRow}>
          <View style={styles.selectedIcon} accessible={false} importantForAccessibility="no-hide-descendants">
            <AppSymbol name={{ android: 'location_on', ios: 'mappin' }} size={24} tintColor={colors.accent} />
          </View>
          <View style={styles.selectedCopy} collapsable={false} accessibilityLabel="Selected location address" accessibilityLiveRegion="polite">
            <Text style={styles.addressText} numberOfLines={3}>{primaryAddress}</Text>
            {fallback ? <Text style={styles.selectedCaption}>General area</Text> : null}
            {secondaryAddress ? <Text style={styles.help} numberOfLines={2}>{secondaryAddress}</Text> : null}
          </View>
        </View> : <Text style={styles.selectedTitle}>Find a service location</Text>}
          {note ? <AppNotice variant="warning" message={note} /> : null}
          {!searchOpen && !moving && selectionState.error === 'outside' && authorityIsCurrent && ownerMatches(selectedOwner) ? (
            <AppButton label="Back to service area" variant="ghost" onPress={returnToServiceArea} disabled={busy || mapAvailable !== 'ready'} />
          ) : null}
          {searchOpen && searching && ownerMatches(queryOwner) ? <Skeleton shape="line" label="Searching locations" /> : null}
          {searchOpen && searchUnavailable && ownerMatches(queryOwner) ? (
            <View>
              <AppNotice message="Search unavailable. Retry search or choose on the map." />
              <AppButton label="Retry search" variant="ghost" onPress={retrySearch}
                disabled={busy || visibleSearchQuery.trim().length < LOCATION_SEARCH_MIN_LENGTH} />
            </View>
          ) : null}
          {searchOpen && visibleSuggestions.map((item) => (
            <Pressable key={`${item.label}:${item.pin.latitude}:${item.pin.longitude}`}
              style={styles.searchRow} onPress={() => { if (displayedSearchScope?.isCurrent()) { closeSearch(); moveToCandidate(item.pin, { origin: 'search', feature: { label: item.label.split(',')[0], pin: item.pin, source: 'search' } }); } }}
              accessibilityRole="button" accessibilityLabel={`Search result ${item.label}`}>
              <AppSymbol name={{ android: 'search', ios: 'magnifyingglass' }} size={20} tintColor={colors.textSecondary} />
              <View style={styles.rowCopy}><Text style={styles.nearbyLabel}>{item.label}</Text></View>
            </Pressable>
          ))}
          {!searchOpen && offered ? (
            <View accessibilityLabel="Suggested mapped place" accessibilityLiveRegion="polite">
              <Text style={styles.nearbyLabel}>{`Nearby mapped place: ${offered.place.label}`}</Text>
              <AppButton label="Use suggested place" accessibilityLabel={`Use suggested place ${offered.place.label}`} variant="ghost" onPress={() => acceptSuggestion(offered)} disabled={busy || moving} />
            </View>
          ) : null}
          {!searchOpen && canReturnToPoint ? (
            <AppButton label="Use exact pin instead" variant="ghost" onPress={useExactPin} disabled={busy || moving} />
          ) : null}
          {listedAlternatives.length > 0 ? (
            <View style={styles.nearbyBlock} accessibilityLabel="Nearby landmarks">
              <Text style={styles.nearbyTitle}>Nearby landmarks</Text>
              {listedAlternatives.map((item) => (
                <Pressable key={item.id}
                  style={styles.nearbyRow} onPress={() => { closeSearch(); selectNearby(item); }}
                  accessibilityRole="button" accessibilityLabel={`Move map to ${item.label}`}>
                  <View style={styles.candidateIcon}><AppSymbol name={placeIcon(item.category)} size={22} tintColor={colors.accent} /></View>
                  <View style={styles.rowCopy}><Text style={styles.nearbyLabel}>{item.label}</Text>
                    <Text style={styles.nearbyDistance}>Choose this mapped place</Text></View>
                </Pressable>
              ))}
            </View>
          ) : null}
          {selectionState.error === 'geocode' ? (
            <View>
              <AppNotice message={COPY.geocodeUnavailable} />
              <AppButton label="Retry address" variant="ghost" onPress={() => { void resolveAddress(); }}
                disabled={busy || moving || mapAvailable !== 'ready' || selectionState.status !== 'ready'} />
            </View>
          ) : null}
          {permission && permission !== 'granted' ? (
            <View>
              <AppButton label={permission === 'settings' ? 'Open settings' : 'Enable current location'}
                variant="ghost"
                onPress={() => { if (permission === 'settings') void Linking.openSettings().catch(() => onNote('Unable to open Settings. Open Android app settings manually.')); else void handleUseCurrentLocation(); }} disabled={busy || moving} />
            </View>
          ) : null}
          {searchOpen && visibleRecents.length > 0 ? (
            <View style={styles.nearbyBlock} accessibilityLabel="Recent locations">
              <View style={styles.recentHeader}>
                <Text style={styles.nearbyTitle}>Recent</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Clear recent locations"
                  onPress={() => clearRecents(displayedRecentScope)}>
                  <Text style={styles.clearText}>Clear</Text>
                </Pressable>
              </View>
              {visibleRecents.map((item) => (
                <Pressable key={`${item.timestamp}:${item.pin.latitude}:${item.pin.longitude}`}
                  style={styles.searchRow} onPress={() => { if (displayedRecentScope?.isCurrent()) { closeSearch(); moveToCandidate(item.pin, { origin: 'recent' }); } }}
                  accessibilityRole="button" accessibilityLabel={`Recent location ${item.address}`}>
                  <AppSymbol name={{ android: 'history', ios: 'clock' }} size={20} tintColor={colors.textSecondary} />
                  <View style={styles.rowCopy}><Text style={styles.nearbyLabel}>{item.address}</Text></View>
                </Pressable>
              ))}
            </View>
          ) : null}
          {searchOpen && clearRecentsError && ownerMatches(recentOwner) ? (
            <View>
              <AppNotice message="Couldn't clear saved recents. Try again." />
              <AppButton label="Retry clear" variant="ghost" onPress={() => clearRecents(displayedRecentScope)} disabled={busy} />
            </View>
          ) : null}

        </ScrollView>
        {!searchOpen ? <AppButton
          label="Confirm location"
          variant="primary"
          disabled={busy || moving || mapAvailable !== 'ready' || selectionState.status !== 'ready' || !ownerMatches(selectedOwner)}
          onPress={() => {
            if (movingRef.current || !selectedOwner?.scope.isCurrent() ||
              selectedScope.current !== selectedOwner.scope || selection.snapshot().generation !== selectedOwner.generation) return;
            const confirmed = selection.confirm();
            if (confirmed) { lookupEpoch.current += 1; onConfirm(confirmed); }
          }}
        /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  centerPinOverlay: { position: 'absolute', left: '50%', top: '50%', width: 56, height: 76, transform: [{ translateX: -28 }, { translateY: -(34 + 15 + 15 * Math.SQRT2) }] },
  pinHead: { position: 'absolute', top: 0, left: 4, width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accent, borderWidth: 3, borderColor: colors.surface, alignItems: 'center', justifyContent: 'center', elevation: 6 },
  pinCenter: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.onAccent },
  pinTip: { position: 'absolute', top: 34, left: 13, width: 30, height: 30, backgroundColor: colors.accent, transform: [{ rotate: '45deg' }] },
  pinShadow: { position: 'absolute', bottom: 2, left: 17, width: 22, height: 8, borderRadius: 11, backgroundColor: colors.accent, opacity: 0.18 },
  loading: { ...StyleSheet.absoluteFill, justifyContent: 'center', alignItems: 'center' },
  mapFrame: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSunken,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  unavailable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceSunken,
  },
  floatingControl: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
  },
  backControl: { left: spacing.gutter },
  currentControl: { right: spacing.gutter, bottom: spacing.lg },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: SkillMatchTheme.ui.size.sheetHandleWidth,
    height: SkillMatchTheme.ui.size.sheetHandleHeight,
    borderRadius: radius.pill,
    backgroundColor: colors.hairline,
  },
  sheetBody: { flexShrink: 1, minHeight: 0 },
  sheetContent: { gap: spacing.sm, paddingBottom: spacing.sm },
  selectedRow: { minHeight: 112, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.control, backgroundColor: colors.accentSubtle },
  selectedIcon: { width: 48, height: 48, borderRadius: radius.control, backgroundColor: colors.surfaceSunken, alignItems: 'center', justifyContent: 'center' },
  selectedCopy: { flex: 1, gap: spacing.xs },
  selectedCaption: { ...type.helper, color: colors.textSecondary },
  selectedTitle: { ...type.sectionTitle, color: colors.textPrimary },
  addressText: { ...type.sectionTitle, color: colors.textPrimary },
  help: { ...type.helper, color: colors.textSecondary },
  rowCopy: { flex: 1, gap: spacing.xs },
  topSearch: { position: 'absolute', left: spacing.gutter + 60, right: spacing.gutter, alignItems: 'flex-end', elevation: 5 },
  searchAffordance: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surface },
  pinLabel: { position: 'absolute', alignSelf: 'center', maxWidth: 230, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.control, backgroundColor: colors.surface, elevation: 3 },
  pinLabelText: { ...type.bodyEmphasis, color: colors.textPrimary, textAlign: 'center' },
  searchInput: {
    width: '100%',
    minHeight: 48,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    ...type.body,
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    minHeight: SkillMatchTheme.ui.size.minTarget,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderBottomColor: colors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  recentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clearText: { ...type.helper, color: colors.accent, minHeight: 48, textAlignVertical: 'center', paddingHorizontal: spacing.sm },
  nearbyBlock: { gap: spacing.xs },
  nearbyTitle: { ...type.bodyEmphasis, color: colors.accent },
  nearbyRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    minHeight: 48,
    paddingVertical: spacing.sm,
    borderBottomColor: colors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  nearbyLabel: { ...type.bodyEmphasis, color: colors.textPrimary },
  nearbyDistance: { ...type.helper, color: colors.textSecondary },
  candidateMarkerTarget: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  candidateMarker: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.accent, elevation: 2 },
  candidateIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSubtle },
});
