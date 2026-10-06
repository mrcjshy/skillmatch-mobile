import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';

import { AppButton } from '@/components/app-button';
import {
  WorkerJobLocationMapLibre,
} from '@/components/worker-job-location-map';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import {
  COPY,
  classifyMapAvailability,
  type JobPin,
  type WorkerLocationSurface,
} from '@/lib/job-location';
import type { OpportunityLocation } from '@/lib/opportunity-location';
import { formatLocation } from '@/lib/bookings';
import { JOB_MAP_STYLE, jobMapRuntime as mapsRuntime } from '@/lib/native-job-map';
import { pinToLngLat } from '@/lib/map-coordinates';



export function nativeJobMapsLoaded(): boolean {
  return mapsRuntime !== null;
}

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

function StaticJobMap({
  pin,
  accessibilityLabel,
}: {
  pin: JobPin;
  accessibilityLabel: string;
}) {
  const ui = useUiTheme();
  const { styles } = createStyles(ui);

  const [mapReady, setMapReady] = useState(mapsRuntime !== null);
  const [loaded, setLoaded] = useState(false);
  const Map = mapsRuntime?.Map;
  const Camera = mapsRuntime?.Camera;
  const Marker = mapsRuntime?.Marker;
  const available = classifyMapAvailability(mapReady && mapsRuntime !== null);

  useEffect(() => {
    if (!mapReady || loaded) return;
    const timer = setTimeout(() => setMapReady(false), 20_000);
    return () => clearTimeout(timer);
  }, [mapReady, loaded]);

  if (available !== 'ready' || !Map || !Camera || !Marker) {
    return (
      <View
        style={styles.exactUnavailable}
        accessibilityLabel="Job location map unavailable"
      >
        <Text style={styles.exactHelp}>{COPY.workerMapUnavailable}</Text>
      </View>
    );
  }

  return (
    <MapErrorBoundary onError={() => setMapReady(false)}>
      <View style={styles.exactMapFrame} pointerEvents="none">
        <Map
          style={styles.map}
          mapStyle={JOB_MAP_STYLE}
          androidView="texture"
          dragPan={false}
          touchZoom={false}
          doubleTapZoom={false}
          doubleTapHoldZoom={false}
          touchRotate={false}
          touchPitch={false}
          compass={false}
          onDidFailLoadingMap={() => setMapReady(false)}
          onDidFinishRenderingMapFully={() => setLoaded(true)}
          accessibilityLabel={accessibilityLabel}
        >
          <Camera initialViewState={{ center: pinToLngLat(pin), zoom: 16, bearing: 0, pitch: 0 }} />
          <Marker lngLat={pinToLngLat(pin)} accessibilityLabel="Authorized job pin">
            <View style={styles.destination} />
          </Marker>
        </Map>
        {!loaded ? <View style={styles.loading}><ActivityIndicator accessibilityLabel="Loading job location map" /></View> : null}
      </View>
    </MapErrorBoundary>
  );
}

export function WorkerOpportunityJobLocation({ location }: { location: OpportunityLocation | null }) {
  const ui = useUiTheme();
  const { styles } = createStyles(ui);

  if (!location) return <Text style={styles.note}>{COPY.workerLocationUnavailable}</Text>;
  return (
    <View style={styles.block}>
      <Text style={styles.heading}>Job location</Text>
      <Text style={styles.body}>{location.address ?? 'Address unavailable for this saved job.'}</Text>
      <Text style={styles.help}>{formatLocation(location.barangay, location.city)}</Text>
      <Text style={styles.help}>You can see this exact location because you currently qualify. Access may end if your eligibility changes.</Text>
      <WorkerJobLocationMapLibre key={`${location.pin.longitude}:${location.pin.latitude}`} pin={location.pin} />
    </View>
  );
}

export function WorkerAssignedJobLocation({
  surface,
  mapsNote,
  onOpenMaps,
  allowNavigation = true,
}: {
  surface: WorkerLocationSurface;
  mapsNote: string | null;
  onOpenMaps: () => void;
  allowNavigation?: boolean;
}) {
  const ui = useUiTheme();
  const { styles } = createStyles(ui);

  if (surface.kind === 'suppressed' || surface.kind === 'unavailable') {
    if (surface.kind === 'unavailable') {
      return (
        <View style={styles.exactBlock}>
          <Text style={styles.exactNote}>{COPY.workerLocationUnavailable}</Text>
        </View>
      );
    }
    return null;
  }

  if (surface.kind === 'text-fallback') {
    const areaLine = formatLocation(surface.barangay, surface.city);
    return (
      <View style={styles.exactBlock}>
        <Text style={styles.exactHeading}>Job location</Text>
        {surface.address ? <Text style={styles.exactAddress}>{surface.address}</Text> : null}
        {areaLine ? <Text style={styles.exactArea}>{areaLine}</Text> : null}
      </View>
    );
  }

  if (surface.kind === 'exact') {
    const areaLine = formatLocation(surface.barangay, surface.city);
    return (
      <View style={styles.exactBlock}>
        <Text style={styles.exactHeading}>Job location</Text>
        {surface.address ? <Text style={styles.exactAddress}>{surface.address}</Text> : null}
        {areaLine ? <Text style={styles.exactArea}>{areaLine}</Text> : null}
        {surface.showMap ? (
          <StaticJobMap
            key={`${surface.pin.longitude}:${surface.pin.latitude}`}
            pin={surface.pin}
            accessibilityLabel="Exact job location map"
          />
        ) : (
          <View style={styles.exactUnavailable} accessibilityLabel="Job location map unavailable">
            <Text style={styles.exactHelp}>{COPY.workerMapUnavailable}</Text>
          </View>
        )}
        {allowNavigation && surface.openInMapsUrl ? (
          <AppButton label={COPY.openInMaps} variant="ghost" onPress={onOpenMaps} />
        ) : null}
        {mapsNote ? <Text style={styles.exactNote}>{mapsNote}</Text> : null}
      </View>
    );
  }

  return null;
}

export async function openWorkerMapsUrl(url: string | null): Promise<boolean> {
  if (url === null || !url.startsWith('geo:')) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    const query = url.match(/^geo:([^?]+)/)?.[1];
    if (!query) return false;
    try {
      await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
      return true;
    } catch {
      return false;
    }
  }
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing, radius } = ui;
const styles = StyleSheet.create({
  destination: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.accent, borderWidth: 3, borderColor: colors.onAccent },
  loading: { ...StyleSheet.absoluteFill, justifyContent: 'center', alignItems: 'center' },
  block: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  heading: {
    ...type.label,
    color: colors.textPrimary,
  },
  body: {
    ...type.helper,
    color: colors.textPrimary,
  },
  help: {
    ...type.caption,
    color: colors.textSecondary,
  },
  note: {
    ...type.helper,
    color: colors.warning,
  },
  exactBlock: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  exactMapFrame: {
    height: 200,
    borderRadius: radius.control,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSunken,
  },
  exactUnavailable: {
    height: 200,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceSunken,
  },
  exactHeading: {
    ...type.sectionTitle,
    color: colors.textPrimary,
  },
  exactAddress: {
    ...type.bodyEmphasis,
    color: colors.textPrimary,
  },
  exactArea: {
    ...type.helper,
    color: colors.textSecondary,
  },
  exactHelp: {
    ...type.helper,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  exactNote: {
    ...type.helper,
    color: colors.warning,
  },
});

  return { styles };
}
