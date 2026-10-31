import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Linking, PixelRatio, StyleSheet, Text, View } from 'react-native';
import type { CameraRef, MapRef } from '@maplibre/maplibre-react-native';
import { AppButton } from '@/components/app-button';
import { MapPinLabel } from '@/components/map-pin-label';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import { ShareLocationFab, type ShareFabMode } from '@/components/share-location-fab';
import { useLocationSharing } from '@/hooks/use-location-sharing';
import { useBookingPins } from '@/hooks/use-booking-pins';
import { JOB_MAP_STYLE, jobMapRuntime } from '@/lib/native-job-map';
import { mergeOverlap, pinFreshness, type PinRole } from '@/lib/location-pins';
import {
  bookingMapMarkers, frameMarkers, framedMarkers, mapAccessibilityLabel, markerPadding, needsReframe, sharingStatusCopy,
  workerLocationStatusCopy, type FramedMarkers, type MapMarker,
} from '@/lib/location-map-view';
import type { JobPin } from '@/lib/job-location';

const FALLBACK_CENTER: [number, number] = [121.0716, 14.5471];

/** Location controls for the booking panel: `primary` stays visible when collapsed. */
export type LocationPanel = { primary: ReactNode; secondary: ReactNode };
type MapInsets = { top: number; bottom: number };
type MapProps = {
  bookingId: string; accountId: string; destination: JobPin | null;
  /** Map area hidden by the floating header (top) and the collapsed panel (bottom). */
  insets: MapInsets;
  /** Renders the booking panel over the map with this booking's location controls. */
  renderPanel: (location: LocationPanel) => ReactNode;
  /** The panel covers the map: the pins rest, so reading the details never competes with them. */
  pinsPaused?: boolean;
};

/**
 * Full-screen booking map on a confirmed booking: the fixed job destination plus
 * the Worker's live position. The Worker shares only by an explicit Share tap
 * (and Stop ends it); the Client only sees the authorized Worker pin and never
 * collects GPS for this feature. No routes, lines or trails. One map and one
 * sharing owner per booking: the panel is rendered by this component, so its
 * controls act on the same session.
 */
export function BookingLocationMap({ role, ...props }: MapProps & { role: PinRole }) {
  return role === 'worker' ? <WorkerBookingMap {...props} /> : <ClientBookingMap {...props} />;
}

function WorkerBookingMap({ bookingId, accountId, destination, insets, renderPanel, pinsPaused }: MapProps) {
  const ui = useUiTheme();
  const styles = createStyles(ui);
  const surface = useMapSurface();
  const sharing = useLocationSharing(bookingId, accountId, surface.ready);
  const pins = useBookingPins(bookingId, accountId, 'worker', sharing.shareId, surface.ready);
  useEffect(() => { if (pins.view.status === 'denied') sharing.stop(); }, [pins.view.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const own = sharing.state.position && pins.now - sharing.state.position.timestampMs <= 45_000 ? sharing.state.position : null;
  const markers = useMemo(() => bookingMapMarkers({ viewerRole: 'worker', destination, ownPosition: own, workerPin: null, freshness: 'expired' }),
    [destination, own]);
  const primary = <>
    <Text accessibilityLiveRegion="polite" style={styles.status}>{sharingStatusCopy(sharing.state)}</Text>
    {sharing.state.cleanupPending ? <><Text style={styles.text}>Server Stop for a previous session is unconfirmed. {sharing.state.cleanupExpired ? 'The retry window expired; this is not confirmation of server Stop.' : 'Pending Stop survives leaving this screen while this app stays running.'} Your last position may remain visible until its server expiry.</Text>{sharing.state.cleanupCanRetry ? <AppButton label="Retry Stop" onPress={sharing.retryStop} /> : null}</> : null}
    {pins.view.status === 'denied' ? <Text style={styles.text}>This booking no longer authorizes location sharing.</Text> : null}
  </>;
  // The floating circle starts sharing when off and stops this device's session when live/requesting.
  const stopping = Boolean(sharing.shareId) || sharing.state.status === 'requesting';
  const canShare = surface.ready && !sharing.shareId && pins.view.status !== 'denied';
  const fabMode: ShareFabMode | null = stopping ? (sharing.shareId ? 'live' : 'busy')
    : canShare ? (sharing.state.cleanupBlocksStart ? 'blocked' : 'ready') : null;
  const secondary = <>
    {pins.view.myShare === 'active_on_other_device' ? <Text style={styles.text}>You are sharing on another device.</Text> : null}
    {sharing.state.cleanupExpired && sharing.state.cleanupBlocksStart ? <Text style={styles.text}>A previous Stop-all remains unconfirmed. Use Stop sharing on all devices again to confirm it before starting a new session here.</Text> : null}
    {/* RF04 Stop-all: shown only when another device shares or a previous Stop-all is unconfirmed (owner, UI-V3). */}
    {pins.view.myShare === 'active_on_other_device' || sharing.state.cleanupBlocksStart ? <AppButton label="Stop sharing on all devices" variant="secondary" onPress={() => Alert.alert('Stop on all devices?', 'This stops your location sharing for this booking on every device.', [{ text: 'Keep sharing', style: 'cancel' }, { text: 'Stop all', style: 'destructive', onPress: sharing.stopAll }])} /> : null}
    {sharing.state.status === 'denied_settings' ? <AppButton label="Open permission settings" onPress={() => void Linking.openSettings()} /> : null}
  </>;
  return <>
    <InlineMap surface={surface} markers={markers} destination={destination} insets={insets} pinsPaused={pinsPaused} />
    {/* Under the panel in paint order: an expanded panel covers it, a collapsed one leaves it on the map. */}
    {fabMode ? <ShareLocationFab mode={fabMode} bottom={insets.bottom + ui.spacing.lg}
      onPress={stopping ? sharing.stop : sharing.start} /> : null}
    {renderPanel({ primary, secondary })}
  </>;
}

function ClientBookingMap({ bookingId, accountId, destination, insets, renderPanel, pinsPaused }: MapProps) {
  const ui = useUiTheme();
  const styles = createStyles(ui);
  const surface = useMapSurface();
  const pins = useBookingPins(bookingId, accountId, 'client', null, surface.ready);
  const workerPin = pins.view.counterpart;
  const freshness = workerPin && pins.view.serverNow ? pinFreshness(workerPin.receivedAt, pins.view.serverNow, pins.view.readAtMs, pins.now) : 'expired';
  const markers = useMemo(() => bookingMapMarkers({ viewerRole: 'client', destination, ownPosition: null, workerPin, freshness }),
    [destination, workerPin, freshness]);
  const primary = <Text accessibilityLiveRegion="polite" style={styles.status}>{workerLocationStatusCopy({ pinsStatus: pins.view.status, freshness, hasWorkerPin: workerPin !== null })}</Text>;
  const secondary = <>
    {/* Pins are live through location_pins_changed; the manual read is only an error fallback. */}
    {surface.ready && pins.view.status === 'error' ? <AppButton label="Refresh Worker location" variant="secondary" onPress={pins.refresh} /> : null}
  </>;
  return <>
    <InlineMap surface={surface} markers={markers} destination={destination} insets={insets} pinsPaused={pinsPaused} />
    {renderPanel({ primary, secondary })}
  </>;
}

type MapSurface = ReturnType<typeof useMapSurface>;
function useMapSurface() {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  // A tile/style request can remain unresolved without a native failure event.
  // Bound only the initial render; panning and ordinary rerenders do not restart it.
  useEffect(() => {
    if (!jobMapRuntime || status !== 'loading') return;
    const timer = setTimeout(() => {
      if (mounted.current) setStatus(previous => previous === 'loading' ? 'failed' : previous);
    }, 20_000);
    return () => clearTimeout(timer);
  }, [status]);
  const setLoaded = () => {
    if (mounted.current) setStatus(previous => previous === 'loading' ? 'loaded' : previous);
  };
  const setFailed = () => { if (mounted.current) setStatus('failed'); };
  const loaded = status === 'loaded';
  const available = Boolean(jobMapRuntime) && status !== 'failed';
  return { available, loaded, ready: available && loaded, setLoaded, setFailed };
}

function InlineMap({ surface, markers, destination, insets, pinsPaused = false }: { surface: MapSurface; markers: MapMarker[]; destination: JobPin | null; insets: MapInsets; pinsPaused?: boolean }) {
  const ui = useUiTheme();
  const styles = createStyles(ui);
  const map = useRef<MapRef | null>(null);
  const camera = useRef<CameraRef | null>(null);
  const framed = useRef<FramedMarkers | null>(null);
  const [cameraRevision, setCameraRevision] = useState(0);
  const [clusters, setClusters] = useState<{ key: string; groups: string[][] }>({ key: '', groups: [] });
  const { loaded } = surface;
  const markerKey = JSON.stringify(markers);
  const viewKey = `${insets.top}:${insets.bottom}`;
  useEffect(() => {
    if (!loaded || !map.current) return;
    let cancelled = false;
    const currentMap = map.current;
    void Promise.all(markers.map(async (marker, index) => {
      const [x, y] = await currentMap.project([marker.longitude, marker.latitude]);
      return { id: String(index), x, y };
    })).then(points => { if (!cancelled) setClusters({ key: markerKey, groups: mergeOverlap(points, 64).map(group => group.ids) }); }).catch(() => {});
    return () => { cancelled = true; };
  }, [loaded, markers, markerKey, cameraRevision]);
  // Frame the markers in the map area left visible by the header and the collapsed panel. Re-frame only
  // when a marker appears or disappears, the visible area changes, or a marker moves far; small GPS
  // movements leave the camera where the user put it.
  useEffect(() => {
    if (!loaded || !camera.current || !needsReframe(framed.current, markers, viewKey)) return;
    framed.current = framedMarkers(markers, viewKey);
    const labels = markerPadding(PixelRatio.getFontScale());
    const padding = { ...labels, top: labels.top + insets.top, bottom: labels.bottom + insets.bottom };
    const frame = frameMarkers(markers, FALLBACK_CENTER);
    if ('bounds' in frame) camera.current.fitBounds(frame.bounds, { padding, duration: 400 });
    else camera.current.easeTo({ center: frame.center, zoom: frame.zoom, padding, duration: 400 });
  }, [loaded, markerKey, viewKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = clusters.key === markerKey ? clusters.groups : markers.map((_, index) => [String(index)]);
  const Map = jobMapRuntime?.Map;
  const Camera = jobMapRuntime?.Camera;
  const Marker = jobMapRuntime?.Marker;
  const initial = frameMarkers(destination ? [destination] : [], FALLBACK_CENTER);
  if (!surface.available || !Map || !Camera || !Marker) {
    return <View style={[StyleSheet.absoluteFill, styles.unavailable, { paddingTop: insets.top }]}><Text style={styles.text}>Map unavailable in this installation.</Text></View>;
  }
  return <MapBoundary onFailure={() => surface.setFailed()}><View style={[StyleSheet.absoluteFill, styles.canvas]}><Map ref={map} style={styles.map} mapStyle={JOB_MAP_STYLE} androidView="texture"
    accessibilityLabel={mapAccessibilityLabel(markers)}
    onRegionDidChange={() => setCameraRevision(value => value + 1)}
    onDidFinishRenderingMapFully={() => surface.setLoaded()} onDidFailLoadingMap={() => surface.setFailed()}>
    <Camera ref={camera} initialViewState={'center' in initial ? { center: initial.center, zoom: initial.zoom } : { center: FALLBACK_CENTER, zoom: 15 }} />
    {groups.map(ids => {
      const members = ids.map(id => markers[Number(id)]).filter(Boolean);
      if (!members.length) return null;
      const first = members[0];
      return <Marker key={ids.join(',')} lngLat={[first.longitude, first.latitude]} anchor="bottom">
        <MapPinLabel kind={members.length > 1 ? 'group' : first.kind} label={members.map(member => member.label).join(' / ')} stale={members.length === 1 && first.stale} paused={pinsPaused} />
      </Marker>;
    })}
  </Map></View></MapBoundary>;
}

function createStyles(ui: UiTheme) {
  return StyleSheet.create({
    canvas: { backgroundColor: ui.colors.surfaceSunken },
    unavailable: { backgroundColor: ui.colors.surfaceSunken, alignItems: 'center', justifyContent: 'center', padding: ui.spacing.gutter },
    map: { width: '100%', height: '100%' },
    status: { ...ui.type.label, color: ui.colors.textPrimary },
    text: { ...ui.type.helper, color: ui.colors.textPrimary },
    help: { ...ui.type.caption, color: ui.colors.textSecondary },
  });
}

class MapBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}
