import { Component, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { SkillMatchTheme } from '@/constants/theme';
import { type JobPin } from '@/lib/job-location';

type MapRuntime = Pick<typeof import('@maplibre/maplibre-react-native'), 'Map' | 'Camera' | 'Marker'>;

// Render authorized opportunity locations in development and checking/release builds.
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

function loadRuntime(): MapRuntime | null {
  try {
    // Keep unavailable native modules inside this presentation-only fallback.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@maplibre/maplibre-react-native') as MapRuntime;
  } catch {
    return null;
  }
}

const runtime = loadRuntime();

function Unavailable() {
  return (
    <View style={styles.fallback} accessibilityLabel="Job location map unavailable">
      <Text style={styles.help}>Map is unavailable. The authorized address is shown above.</Text>
    </View>
  );
}

class JobMapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <Unavailable /> : this.props.children;
  }
}

function JobMap({ pin }: { pin: JobPin }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (loaded || failed) return;
    const timer = setTimeout(() => setFailed(true), 20_000);
    return () => clearTimeout(timer);
  }, [loaded, failed]);

  if (!runtime || failed) return <Unavailable />;
  const { Map, Camera, Marker } = runtime;

  return (
    <View style={styles.frame}>
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={MAP_STYLE}
        androidView="texture"
        accessibilityLabel="Exact job opportunity location"
        dragPan={false}
        touchZoom={false}
        doubleTapZoom={false}
        doubleTapHoldZoom={false}
        touchRotate={false}
        touchPitch={false}
        compass={false}
        onDidFailLoadingMap={() => setFailed(true)}
        onDidFinishRenderingMapFully={() => setLoaded(true)}
      >
        <Camera initialViewState={{ center: [pin.longitude, pin.latitude], zoom: 16, bearing: 0, pitch: 0 }} />
        <Marker lngLat={[pin.longitude, pin.latitude]} accessibilityLabel="Exact job destination">
          <View style={styles.destination} />
        </Marker>
      </Map>
      {!loaded ? (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator accessibilityLabel="Loading job location map" />
        </View>
      ) : null}
    </View>
  );
}

export function WorkerJobLocationMapLibre({ pin }: { pin: JobPin }) {
  return (
    <JobMapBoundary>
      <JobMap pin={pin} />
    </JobMapBoundary>
  );
}

const styles = StyleSheet.create({
  destination: { width: 20, height: 20, borderRadius: 10, backgroundColor: SkillMatchTheme.ui.colors.accent, borderWidth: 3, borderColor: SkillMatchTheme.ui.colors.onAccent },
  frame: {
    height: 180,
    borderRadius: SkillMatchTheme.ui.radius.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: SkillMatchTheme.ui.colors.hairline,
  },
  fallback: {
    minHeight: 120,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: SkillMatchTheme.ui.colors.surfaceSunken,
    borderRadius: 8,
  },
  help: { ...SkillMatchTheme.ui.type.caption, color: SkillMatchTheme.ui.colors.textSecondary },
  loading: { ...StyleSheet.absoluteFill, justifyContent: 'center', alignItems: 'center' },
});
