import { Component, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, PixelRatio, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { CameraRef } from '@maplibre/maplibre-react-native';

import { InlineStatus } from '@/components/inline-status';
import { MapPinLabel } from '@/components/map-pin-label';
import { SkillMatchTheme } from '@/constants/theme';
import { readOpenJobLocation } from '@/lib/client-job-location';
import type { JobPin } from '@/lib/job-location';
import { markerPadding } from '@/lib/location-map-view';
import { JOB_MAP_STYLE, jobMapRuntime } from '@/lib/native-job-map';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

const { colors, type, spacing } = SkillMatchTheme.ui;
const FALLBACK_CENTER: [number, number] = [121.0716, 14.5471];

/**
 * Full-screen map behind the open job's "finding a worker" panel (UI-V3, owner reference). It shows only the
 * Client's own job pin, read with the same authorized call and lifetime as the job-location editor: read while
 * focused, foreground and current; cleared on blur, background or loss of authority; never cached. Nothing about
 * any Worker is drawn (no Worker exists before acceptance, D-003).
 */
export function FindingJobMap({ jobId, clientId, isOperationCurrent, insets, revision }: {
  jobId: string;
  clientId: string;
  isOperationCurrent: () => boolean;
  /** Map area hidden by the floating header (top) and the collapsed panel (bottom). */
  insets: { top: number; bottom: number };
  /** Bumped after the location editor closes, so an edited pin is re-read. */
  revision: number;
}) {
  const pin = useOpenJobPin(jobId, clientId, isOperationCurrent, revision);
  const reducedMotion = useReducedMotion();
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const camera = useRef<CameraRef | null>(null);
  const Map = jobMapRuntime?.Map;
  const Camera = jobMapRuntime?.Camera;
  const Marker = jobMapRuntime?.Marker;
  const viewKey = `${insets.top}:${insets.bottom}:${pin?.latitude}:${pin?.longitude}`;
  useEffect(() => {
    if (!loaded || !camera.current || !pin) return;
    const labels = markerPadding(PixelRatio.getFontScale());
    camera.current.easeTo({ center: [pin.longitude, pin.latitude], zoom: 16, duration: reducedMotion ? 0 : 400,
      padding: { ...labels, top: labels.top + insets.top, bottom: labels.bottom + insets.bottom } });
  }, [loaded, viewKey, reducedMotion]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (loaded || failed) return;
    const timeout = setTimeout(() => setFailed(true), 20_000);
    return () => clearTimeout(timeout);
  }, [loaded, failed]);

  if (!Map || !Camera || !Marker || failed) {
    return <View style={[StyleSheet.absoluteFill, styles.unavailable, { paddingTop: insets.top }]}>
      <Text style={styles.text}>Map unavailable in this installation.</Text>
    </View>;
  }
  return <MapBoundary onFailure={() => setFailed(true)}><View style={[StyleSheet.absoluteFill, styles.canvas]}>
    <Map style={styles.map} mapStyle={JOB_MAP_STYLE} androidView="texture"
      accessibilityLabel={pin ? 'Map showing your job location' : 'Map. Job location loading'}
      onDidFinishRenderingMapFully={() => setLoaded(true)} onDidFailLoadingMap={() => setFailed(true)}>
      <Camera ref={camera} initialViewState={{ center: pin ? [pin.longitude, pin.latitude] : FALLBACK_CENTER, zoom: 15 }} />
      {pin ? <Marker lngLat={[pin.longitude, pin.latitude]} anchor="bottom">
        <MapPinLabel kind="destination" label="Job location" stale={false} />
      </Marker> : null}
    </Map>
    {pin ? null : <View pointerEvents="none" style={[styles.loading, { top: insets.top + spacing.md }]}>
      <InlineStatus variant="loading" message="Loading job location" />
    </View>}
  </View></MapBoundary>;
}

/** The open job's pin, under the job-location editor's lifetime rules. */
export function useOpenJobPin(jobId: string, clientId: string, isOperationCurrent: () => boolean, revision: number) {
  const [pin, setPin] = useState<JobPin | null>(null);
  const generation = useRef(0);
  const focused = useRef(false);
  const current = useCallback(() => {
    try { return focused.current && AppState.currentState === 'active' && isOperationCurrent(); } catch { return false; }
  }, [isOperationCurrent]);
  const clear = useCallback(() => { generation.current += 1; setPin(null); }, []);
  const read = useCallback(async () => {
    clear();
    if (!current()) return;
    const token = generation.current;
    try {
      const location = await readOpenJobLocation(jobId, clientId);
      if (token === generation.current && current()) setPin(location.pin);
    } catch {
      if (token === generation.current) setPin(null);
    }
  }, [clear, current, jobId, clientId]);
  useLayoutEffect(() => () => { focused.current = false; clear(); }, [clear, jobId, clientId]);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    void read();
    const listener = AppState.addEventListener('change', state => { clear(); if (state === 'active') void read(); });
    return () => { focused.current = false; listener.remove(); clear(); };
  }, [read, clear, revision])); // eslint-disable-line react-hooks/exhaustive-deps
  return pin;
}

class MapBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}

const styles = StyleSheet.create({
  canvas: { backgroundColor: colors.surfaceSunken },
  map: { width: '100%', height: '100%' },
  unavailable: { backgroundColor: colors.surfaceSunken, alignItems: 'center', justifyContent: 'center', padding: spacing.gutter },
  text: { ...type.helper, color: colors.textPrimary },
  loading: { position: 'absolute', left: spacing.gutter, right: spacing.gutter, alignItems: 'center' },
});
