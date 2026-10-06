import { Component, useCallback, useEffect, useLayoutEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CameraRef, MapRef, ViewStateChangeEvent } from '@maplibre/maplibre-react-native';
import type { NativeSyntheticEvent } from 'react-native';

import { SkillMatchTheme } from '@/constants/theme';
import {
  COPY,
  SANTA_ANA_PATEROS_DISPLAY_REGION,
  classifyMapAvailability,
  resolveCurrentLocationPin,
  type JobPin,
} from '@/lib/job-location';

import { createCanonicalLocationSelection, type CanonicalJobLocation, type LocationSelectionState } from '@/lib/canonical-job-location';
import { JOB_MAP_STYLE, jobMapRuntime as mapsRuntime } from '@/lib/native-job-map';
import { pinFromMapCenter, pinToLngLat } from '@/lib/map-coordinates';
import { findNearbyMappedFeatures, findNearbySnap, SNAP_MIN_ZOOM, type NearbyMappedFeature, type SnapKind } from '@/lib/job-location-snap';
import { AppButton } from '@/components/app-button';
import { AppSymbol } from '@/components/app-symbol';
import { AppNotice } from '@/components/app-notice';
import { inspectLocationPermission, type LocationPermissionState } from '@/lib/location-permission';
import { LOCATION_SEARCH_DEBOUNCE_MS, LOCATION_SEARCH_MIN_LENGTH, searchPhoton, type LocationSuggestion } from '@/lib/location-search';
import { clearRecentLocations, loadRecentLocations, type RecentLocation, type RecentLocationScope } from '@/lib/recent-locations';
import { useSession, type SessionLifetime } from '@/providers/session-provider';
import { useAccount } from '@/providers/account-provider';

const { colors, type, spacing, radius } = SkillMatchTheme.ui;
type PickerOwner = { scope: RecentLocationScope; lifetime: SessionLifetime | null | undefined; revision: number | undefined };

type JobLocationPickerProps = {
  pin: JobPin | null;
  initialAddress?: string;
  onInvalidate?: () => void;
  note: string | null;
  onNote: (note: string | null) => void;
  disabled?: boolean;
  onCancel?: () => void;
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
  onConfirm,
}: JobLocationPickerProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const cameraRef = useRef<CameraRef>(null);
  const mapRef = useRef<MapRef>(null);
  const movingRef = useRef(false);
  const currentMoveRef = useRef(false);
  const programmaticMoveRef = useRef(false);
  const rawCenterRef = useRef<JobPin | null>(null);
  const lookupEpoch = useRef(0);
  const [moving, setMoving] = useState(false);
  const [checkingSnap, setCheckingSnap] = useState(false);
  const [snapKind, setSnapKind] = useState<SnapKind | null>(null);
  const [nearby, setNearby] = useState<NearbyMappedFeature[]>([]);
  const [showInitialAddress, setShowInitialAddress] = useState(Boolean(pin && initialAddress));
  const [mapReady, setMapReady] = useState(mapsRuntime !== null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [locating, setLocating] = useState(false);
  const [permission, setPermission] = useState<LocationPermissionState | null>(null);
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
  const selectionGeneration = useRef(0);
  const recentEpoch = useRef(0);
  const sessionLifetime = session.sessionLifetime;
  const sessionRevision = session.sessionRevision;
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

  useEffect(() => {
    if (!mapReady || mapLoaded) return;
    const timer = setTimeout(() => setMapReady(false), 20_000);
    return () => clearTimeout(timer);
  }, [mapReady, mapLoaded]);

  const [selectionState, setSelectionState] = useState<LocationSelectionState>({
    pin: null, address: null, status: 'empty', error: null,
  });
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
      setSearchQuery('');
      setQueryOwner(null);
      selection.select(null);
      selectedScope.current = null;
      setShowInitialAddress(false);
      setSuggestions([]);
      setSearching(false);
      setLocating(false);
      setCheckingSnap(false);
      setSnapKind(null);
      setNearby([]);
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
      setCheckingSnap(false);
      setSnapKind(null);
      setNearby([]);
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
    if (!scope.isCurrent()) return;
    const currentSession = latestAuthority.current.session;
    selectedScope.current = scope;
    setSelectedOwner({ scope, lifetime: currentSession.sessionLifetime, revision: currentSession.sessionRevision, generation: ++selectionGeneration.current });
    selection.select(selection.snapshot().pin);
    setShowInitialAddress(false);
    try {
      const location = await import('expo-location');
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
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void resolveAddress();
      else {
        lookupEpoch.current += 1;
        searchEpoch.current += 1;
        setSuggestions([]);
        setSearching(false);
        selection.select(selection.snapshot().pin);
        setShowInitialAddress(false);
      }
    });
    return () => listener.remove();
  }, [resolveAddress, selection]);

  function beginMove(): void {
    if (movingRef.current) return;
    movingRef.current = true;
    lookupEpoch.current += 1;
    selection.select(null);
    selectedScope.current = null;
    setCheckingSnap(false);
    setSnapKind(null);
    setNearby([]);
    setShowInitialAddress(false);
    rawCenterRef.current = null;
    onInvalidate?.();
    onNote(null);
    setMoving(true);
  }

  function handleRegionWillChange(event: NativeSyntheticEvent<ViewStateChangeEvent>): void {
    if (event.nativeEvent.userInteraction) {
      programmaticMoveRef.current = false;
      beginMove();
    } else if (!programmaticMoveRef.current && currentMoveRef.current) beginMove();
  }

  function handleRegionDidChange(event: NativeSyntheticEvent<ViewStateChangeEvent>): void {
    if (programmaticMoveRef.current && !event.nativeEvent.userInteraction) {
      programmaticMoveRef.current = false;
      return;
    }
    if (!movingRef.current && !event.nativeEvent.userInteraction && !currentMoveRef.current) return;
    if (!movingRef.current) beginMove();
    currentMoveRef.current = false;
    movingRef.current = false;
    setMoving(false);
    const nextPin = pinFromMapCenter(event.nativeEvent.center);
    rawCenterRef.current = nextPin;
    selection.select(nextPin);
    const epoch = ++lookupEpoch.current;
    if (nextPin) void settleSelection(nextPin, event.nativeEvent.zoom, epoch);
  }

  async function settleSelection(rawCenter: JobPin, zoom: number, epoch: number): Promise<void> {
    const scope = captureScope();
    selectedScope.current = scope;
    const maySnap = zoom >= SNAP_MIN_ZOOM && mapRef.current !== null;
    setCheckingSnap(maySnap);
    let candidate = null;
    try {
      if (maySnap && mapRef.current) candidate = await findNearbySnap(mapRef.current, rawCenter, zoom);
    } catch { /* A failed feature query keeps the manually placed center. */ }
    if (!scope.isCurrent() || epoch !== lookupEpoch.current || movingRef.current) return;
    setCheckingSnap(false);
    if (candidate && cameraRef.current) {
      setSnapKind(candidate.kind);
      selection.select(candidate.pin);
      programmaticMoveRef.current = true;
      cameraRef.current.easeTo({ center: pinToLngLat(candidate.pin), duration: 200 });
    } else {
      setSnapKind(null);
      selection.select(rawCenter);
    }
    void resolveAddress();
    if (maySnap && mapRef.current) {
      void findNearbyMappedFeatures(mapRef.current, rawCenter, zoom).then((items) => {
        if (scope.isCurrent() && epoch === lookupEpoch.current && !movingRef.current) setNearby(items);
      }).catch(() => { /* Nearby context is optional. */ });
    }
  }

  function useExactPin(): void {
    const rawCenter = rawCenterRef.current;
    if (!rawCenter || !snapKind || !cameraRef.current) return;
    lookupEpoch.current += 1;
    setSnapKind(null);
    setCheckingSnap(false);
    setNearby([]);
    selection.select(rawCenter);
    programmaticMoveRef.current = true;
    cameraRef.current.easeTo({ center: pinToLngLat(rawCenter), duration: 200 });
    void resolveAddress();
  }

  async function handleUseCurrentLocation(): Promise<void> {
    if (busy || mapAvailable !== 'ready') return;
    setLocating(true);
    const requestEpoch = lookupEpoch.current;
    const scope = captureScope();
    const current = () => scope.isCurrent() && requestEpoch === lookupEpoch.current;
    try {
      const location = await import('expo-location');
      if (!current()) return;
      const nextPermission = await inspectLocationPermission(location, true);
      if (!current()) return;
      setPermission(nextPermission);
      if (nextPermission !== 'granted') {
        onNote(COPY.permissionDenied);
        return;
      }
      const result = await resolveCurrentLocationPin(location);
      if (!current()) return;
      if (result.kind !== 'pin') {
        onNote(result.kind === 'denied' ? COPY.permissionDenied : COPY.locationUnavailable);
        return;
      }
      if (!cameraRef.current) { onNote(COPY.mapUnavailable); return; }
      beginMove();
      currentMoveRef.current = true;
      cameraRef.current.easeTo({ center: pinToLngLat(result.pin), zoom: SNAP_MIN_ZOOM, duration: 300 });
    } catch {
      if (current()) onNote(COPY.locationUnavailable);
    } finally {
      if (scope.isCurrent()) setLocating(false);
    }
  }

  function selectNearby(item: NearbyMappedFeature): void {
    if (busy || !cameraRef.current) return;
    beginMove();
    currentMoveRef.current = true;
    cameraRef.current.easeTo({ center: pinToLngLat(item.pin), zoom: SNAP_MIN_ZOOM, duration: 300 });
  }

  function moveToCandidate(pin: JobPin): void {
    if (busy || !cameraRef.current) return;
    beginMove();
    currentMoveRef.current = true;
    cameraRef.current.easeTo({ center: pinToLngLat(pin), zoom: SNAP_MIN_ZOOM, duration: 300 });
  }

  const addressCopy = !authorityIsCurrent || (selectedOwner && !ownerMatches(selectedOwner)) ? 'Move the map to choose a service location.' : showInitialAddress && initialAddress ? initialAddress : selectionState.address ?? (
    moving ? 'Move the map to position the center pin.' :
    checkingSnap ? 'Checking nearby mapped features...' :
    selectionState.status === 'resolving' ? 'Finding address…' :
    selectionState.error === 'outside' ? 'This location is outside Barangay Santa Ana.' :
    'Move the map to choose a service location.'
  );

  return (
    <View style={styles.screen}>
      {mapAvailable === 'ready' && Map && Camera ? (
        <MapErrorBoundary onError={() => setMapReady(false)}>
          <View
            style={styles.mapFrame}
          >
            <Map
              ref={mapRef}
              style={styles.map}
              mapStyle={JOB_MAP_STYLE}
              androidView="texture"
              dragPan={!disabled && !locating}
              touchZoom={!disabled && !locating}
              onRegionWillChange={handleRegionWillChange}
              onRegionDidChange={handleRegionDidChange}
              touchPitch={false}
              touchRotate={false}
              compass={false}
              onDidFailLoadingMap={() => setMapReady(false)}
              onDidFinishRenderingMapFully={() => setMapLoaded(true)}
              accessibilityLabel="Job location map"
            >
              <Camera
                ref={cameraRef}
                initialViewState={{ center: pinToLngLat(pin ?? SANTA_ANA_PATEROS_DISPLAY_REGION), zoom: pin ? SNAP_MIN_ZOOM : 14, bearing: 0, pitch: 0 }}
              />
            </Map>
            <View pointerEvents="none" style={styles.centerPinOverlay} accessibilityLabel="Center service location pin">
              <View style={styles.destination} />
            </View>
            {!mapLoaded ? (
              <View style={styles.loading} pointerEvents="none">
                <ActivityIndicator accessibilityLabel="Loading job location map" />
              </View>
            ) : null}
            <Pressable
              style={[styles.floatingControl, styles.backControl, { top: insets.top + spacing.sm }]}
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="Back to Post Job"
            ><AppSymbol name={{ android: 'arrow_back', ios: 'chevron.left' }} size={24} tintColor={colors.textPrimary} /></Pressable>
            <Pressable
              style={[styles.floatingControl, styles.currentControl]}
              onPress={() => { void handleUseCurrentLocation(); }}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={COPY.useCurrentLocation}
            >{locating ? <ActivityIndicator color={colors.accent} /> : <AppSymbol name={{ android: 'my_location', ios: 'location' }} size={24} tintColor={colors.accent} />}</Pressable>
          </View>
        </MapErrorBoundary>
      ) : (
        <View style={styles.unavailable} accessibilityLabel="Job location map unavailable">
          <Pressable style={[styles.floatingControl, styles.backControl, { top: insets.top + spacing.sm }]}
            onPress={onCancel} accessibilityRole="button" accessibilityLabel="Back to Post Job">
            <AppSymbol name={{ android: 'arrow_back', ios: 'chevron.left' }} size={24} tintColor={colors.textPrimary} />
          </Pressable>
          <Text style={styles.addressText}>{COPY.mapUnavailable}</Text>
        </View>
      )}
      <View style={[styles.sheet, { maxHeight: Math.min(height * 0.48, 430), paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <View style={styles.handle} />
        <ScrollView style={styles.sheetBody} contentContainerStyle={styles.sheetContent} nestedScrollEnabled>
          <Text style={styles.sheetTitle}>Service location</Text>
          <TextInput
            value={visibleSearchQuery}
            onChangeText={handleSearchQueryChange}
            placeholder="Search for location"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            editable={!busy}
            accessibilityLabel="Search for location"
          />
          {searching && ownerMatches(queryOwner) ? <ActivityIndicator accessibilityLabel="Searching locations" /> : null}
          {searchUnavailable && ownerMatches(queryOwner) ? (
            <View>
              <AppNotice message="Search unavailable. Retry search or choose on the map." />
              <AppButton label="Retry search" variant="ghost" onPress={retrySearch}
                disabled={busy || visibleSearchQuery.trim().length < LOCATION_SEARCH_MIN_LENGTH} />
            </View>
          ) : null}
          {visibleSuggestions.map((item) => (
            <Pressable key={`${item.label}:${item.pin.latitude}:${item.pin.longitude}`}
              style={styles.searchRow} onPress={() => { if (displayedSearchScope?.isCurrent()) moveToCandidate(item.pin); }}
              accessibilityRole="button" accessibilityLabel={`Search result ${item.label}`}>
              <Text style={styles.nearbyLabel}>{item.label}</Text>
            </Pressable>
          ))}
          {visibleRecents.length > 0 ? (
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
                  style={styles.searchRow} onPress={() => { if (displayedRecentScope?.isCurrent()) moveToCandidate(item.pin); }}
                  accessibilityRole="button" accessibilityLabel={`Recent location ${item.address}`}>
                  <Text style={styles.nearbyLabel}>{item.address}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {clearRecentsError && ownerMatches(recentOwner) ? (
            <View>
              <AppNotice message="Couldn't clear saved recents. Try again." />
              <AppButton label="Retry clear" variant="ghost" onPress={() => clearRecents(displayedRecentScope)} disabled={busy} />
            </View>
          ) : null}
          <View style={styles.addressCard} accessibilityLabel="Selected location address">
            <Text style={styles.addressText}>{addressCopy}</Text>
          </View>
          {snapKind ? (
            <View>
              <AppNotice variant="success" message={snapKind === 'building' ? 'Snapped to nearby building' : 'Nearby mapped place detected'} />
              <AppButton label="Use exact pin instead" variant="ghost" onPress={useExactPin} disabled={busy || moving} />
            </View>
          ) : null}
          {nearby.length > 0 ? (
            <View style={styles.nearbyBlock} accessibilityLabel="Nearby mapped features">
              <Text style={styles.nearbyTitle}>Nearby</Text>
              {nearby.map((item) => (
                <Pressable key={`${item.label}:${item.pin.latitude}:${item.pin.longitude}`}
                  style={styles.nearbyRow} onPress={() => selectNearby(item)}
                  accessibilityRole="button" accessibilityLabel={`Move map to ${item.label}`}>
                  <Text style={styles.nearbyLabel}>{item.label}</Text>
                  <Text style={styles.nearbyDistance}>Nearby mapped place</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {selectionState.error === 'geocode' ? (
            <View>
              <AppNotice message={COPY.geocodeUnavailable} />
              <AppButton label="Retry address" variant="ghost" onPress={() => { void resolveAddress(); }}
                disabled={busy || moving || checkingSnap || mapAvailable !== 'ready' || selectionState.status !== 'ready'} />
            </View>
          ) : null}
          {permission && permission !== 'granted' ? (
            <View>
              <AppNotice message="Device location is optional. You can choose and confirm a location by moving the map." />
              <AppButton label={permission === 'settings' ? 'Open settings' : 'Enable current location'}
                onPress={() => { if (permission === 'settings') void Linking.openSettings().catch(() => onNote('Unable to open Settings. Open Android app settings manually.')); else void handleUseCurrentLocation(); }} disabled={busy || moving} />
            </View>
          ) : null}
          {note ? <AppNotice variant="warning" message={note} /> : null}
        </ScrollView>
        <AppButton
          label="Choose this location"
          variant="primary"
          disabled={busy || moving || checkingSnap || mapAvailable !== 'ready' || selectionState.status !== 'ready' || !ownerMatches(selectedOwner)}
          onPress={() => {
            if (movingRef.current || !selectedOwner?.scope.isCurrent() ||
              selectedScope.current !== selectedOwner.scope || selectionGeneration.current !== selectedOwner.generation) return;
            const confirmed = selection.confirm();
            if (confirmed) onConfirm(confirmed);
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  destination: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.accent, borderWidth: 4, borderColor: colors.onAccent, elevation: 4 },
  centerPinOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  loading: { ...StyleSheet.absoluteFill, justifyContent: 'center', alignItems: 'center' },
  mapFrame: {
    flex: 1,
    minHeight: 200,
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
  sheetBody: { flexShrink: 1 },
  sheetContent: { gap: spacing.sm, paddingBottom: spacing.sm },
  sheetTitle: { ...type.screenTitle, color: colors.textPrimary },
  addressCard: {
    borderRadius: radius.control,
    backgroundColor: colors.surfaceSunken,
    padding: spacing.md,
  },
  addressText: { ...type.bodyEmphasis, color: colors.textPrimary },
  searchInput: {
    minHeight: 48,
    borderRadius: radius.control,
    backgroundColor: colors.surfaceSunken,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    ...type.body,
  },
  searchRow: {
    minHeight: SkillMatchTheme.ui.size.minTarget,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderBottomColor: colors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  recentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clearText: { ...type.helper, color: colors.accent },
  nearbyBlock: { gap: spacing.xs },
  nearbyTitle: { ...type.bodyEmphasis, color: colors.accent },
  nearbyRow: {
    paddingVertical: spacing.sm,
    borderBottomColor: colors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  nearbyLabel: { ...type.bodyEmphasis, color: colors.textPrimary },
  nearbyDistance: { ...type.helper, color: colors.textSecondary },
});
