import { Component, useCallback, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, Text } from 'react-native';
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
import { AppNotice } from '@/components/app-notice';
import { inspectLocationPermission, type LocationPermissionState } from '@/lib/location-permission';

const { colors, type, spacing, radius } = SkillMatchTheme.ui;

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
  const mapAvailable = classifyMapAvailability(mapReady && mapsRuntime !== null);
  const busy = disabled || locating;
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
  useEffect(() => {
    lifetime.current = true;
    return () => { lifetime.current = false; selection.cancel(); };
  }, [selection]);
  const resolveAddress = useCallback(async (explicitRequest = false): Promise<void> => {
    const epoch = lookupEpoch.current;
    selection.select(selection.snapshot().pin);
    setShowInitialAddress(false);
    try {
      const location = await import('expo-location');
      const nextPermission = await inspectLocationPermission(location, explicitRequest);
      if (!lifetime.current || epoch !== lookupEpoch.current || movingRef.current) return;
      setPermission(nextPermission);
      if (nextPermission !== 'granted') return;
      if (!selection.snapshot().pin) return;
      await selection.resolve(location);
    } catch {
      if (lifetime.current && epoch === lookupEpoch.current && !movingRef.current) {
        await selection.resolve({ reverseGeocodeAsync: async () => { throw new Error('Unavailable'); } });
      }
    }
  }, [selection]);

  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void resolveAddress();
      else {
        lookupEpoch.current += 1;
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
    const maySnap = zoom >= SNAP_MIN_ZOOM && mapRef.current !== null;
    setCheckingSnap(maySnap);
    let candidate = null;
    try {
      if (maySnap && mapRef.current) candidate = await findNearbySnap(mapRef.current, rawCenter, zoom);
    } catch { /* A failed feature query keeps the manually placed center. */ }
    if (!lifetime.current || epoch !== lookupEpoch.current || movingRef.current) return;
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
        if (lifetime.current && epoch === lookupEpoch.current && !movingRef.current) setNearby(items);
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
    try {
      const location = await import('expo-location');
      const nextPermission = await inspectLocationPermission(location);
      if (!lifetime.current || requestEpoch !== lookupEpoch.current) return;
      setPermission(nextPermission);
      if (nextPermission !== 'granted') {
        selection.select(selection.snapshot().pin);
        setShowInitialAddress(false);
        return;
      }
      const result = await resolveCurrentLocationPin(location);
      if (!lifetime.current || requestEpoch !== lookupEpoch.current) return;
      if (result.kind !== 'pin') {
        onNote(result.kind === 'denied' ? COPY.permissionDenied : COPY.locationUnavailable);
        return;
      }
      if (!cameraRef.current) { onNote(COPY.mapUnavailable); return; }
      beginMove();
      currentMoveRef.current = true;
      cameraRef.current.easeTo({ center: pinToLngLat(result.pin), zoom: SNAP_MIN_ZOOM, duration: 300 });
    } catch {
      if (lifetime.current) onNote(COPY.locationUnavailable);
    } finally {
      if (lifetime.current) setLocating(false);
    }
  }

  function selectNearby(item: NearbyMappedFeature): void {
    if (busy || !cameraRef.current) return;
    beginMove();
    currentMoveRef.current = true;
    cameraRef.current.easeTo({ center: pinToLngLat(item.pin), zoom: SNAP_MIN_ZOOM, duration: 300 });
  }

  const addressCopy = showInitialAddress && initialAddress ? initialAddress : selectionState.address ?? (
    moving ? 'Move the map to position the center pin.' :
    checkingSnap ? 'Checking nearby mapped features...' :
    selectionState.status === 'resolving' ? 'Finding address…' :
    selectionState.error === 'outside' ? 'This location is outside Barangay Santa Ana.' :
    selectionState.error === 'geocode' ? 'Unable to determine the address. Move the map slightly and try again.' :
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
            ><Text style={styles.controlText}>←</Text></Pressable>
            <Pressable
              style={[styles.floatingControl, styles.currentControl]}
              onPress={() => { void handleUseCurrentLocation(); }}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={COPY.useCurrentLocation}
            >{locating ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.controlText}>◎</Text>}</Pressable>
          </View>
        </MapErrorBoundary>
      ) : (
        <View style={styles.unavailable} accessibilityLabel="Job location map unavailable">
          <Pressable style={[styles.floatingControl, styles.backControl, { top: insets.top + spacing.sm }]}
            onPress={onCancel} accessibilityRole="button" accessibilityLabel="Back to Post Job">
            <Text style={styles.controlText}>←</Text>
          </Pressable>
          <Text style={styles.addressText}>{COPY.mapUnavailable}</Text>
        </View>
      )}
      <View style={[styles.sheet, { maxHeight: Math.min(height * 0.48, 430), paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <View style={styles.handle} />
        <ScrollView style={styles.sheetBody} contentContainerStyle={styles.sheetContent} nestedScrollEnabled>
          <Text style={styles.sheetTitle}>Service location</Text>
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
          {selectionState.error === 'geocode' ? <AppButton label="Retry address lookup" variant="ghost" onPress={() => void resolveAddress()} disabled={busy} /> : null}
          {permission && permission !== 'granted' ? (
            <View>
              <AppNotice variant="warning" message="Location permission is required to translate your selected Job pin into its address. SkillMatch does not track your movement." />
              <AppButton label={permission === 'settings' ? 'Open Settings' : 'Enable Location to Confirm Address'}
                onPress={() => { if (permission === 'settings') void Linking.openSettings().catch(() => onNote('Unable to open Settings. Open Android app settings manually.')); else void resolveAddress(true); }} disabled={busy || moving} />
            </View>
          ) : null}
          {note ? <AppNotice variant="warning" message={note} /> : null}
        </ScrollView>
        <AppButton
          label="Choose This Location"
          variant="primary"
          disabled={busy || moving || checkingSnap || mapAvailable !== 'ready' || selectionState.status !== 'ready'}
          onPress={() => { if (!movingRef.current) { const confirmed = selection.confirm(); if (confirmed) onConfirm(confirmed); } }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  destination: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary, borderWidth: 4, borderColor: '#ffffff', elevation: 4 },
  centerPinOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  loading: { ...StyleSheet.absoluteFill, justifyContent: 'center', alignItems: 'center' },
  mapFrame: {
    flex: 1,
    minHeight: 200,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSubtle,
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
    backgroundColor: colors.surfaceSubtle,
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
  controlText: { fontSize: 28, color: colors.primary, lineHeight: 34 },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  sheetBody: { flexShrink: 1 },
  sheetContent: { gap: spacing.sm, paddingBottom: spacing.sm },
  sheetTitle: { ...type.screenTitle, color: colors.textPrimary },
  addressCard: {
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
    padding: spacing.md,
  },
  addressText: { ...type.bodyEmphasis, color: colors.textPrimary },
  nearbyBlock: { gap: spacing.xs },
  nearbyTitle: { ...type.bodyEmphasis, color: colors.primary },
  nearbyRow: {
    paddingVertical: spacing.sm,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  nearbyLabel: { ...type.bodyEmphasis, color: colors.textPrimary },
  nearbyDistance: { ...type.helper, color: colors.textSecondary },
});
