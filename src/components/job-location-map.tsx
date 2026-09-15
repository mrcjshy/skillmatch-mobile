import { Component, useCallback, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';

import { SkillMatchTheme } from '@/constants/theme';
import {
  COPY,
  classifyMapAvailability,
  createWorkerLocationErrorCopy,
  getJobApproximateArea,
  projectPreAcceptWorkerLocation,
  type ApproximateJobArea,
  type JobPin,
  type WorkerLocationSurface,
} from '@/lib/job-location';
import { formatLocation } from '@/lib/bookings';

type MapsRuntime = {
  MapView: typeof import('react-native-maps').default;
  Marker: typeof import('react-native-maps').Marker;
  PROVIDER_GOOGLE: typeof import('react-native-maps').PROVIDER_GOOGLE;
};

function loadMapsRuntime(): MapsRuntime | null {
  try {
    // Native TurboModule is evaluated on require. Catch so a reused APK without
    // RNMapsAirModule still shows Worker screens instead of crashing.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const maps = require('react-native-maps') as typeof import('react-native-maps');
    return {
      MapView: maps.default,
      Marker: maps.Marker,
      PROVIDER_GOOGLE: maps.PROVIDER_GOOGLE,
    };
  } catch {
    return null;
  }
}

const mapsRuntime = loadMapsRuntime();

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

function exactPinRegion(pin: JobPin) {
  return {
    latitude: pin.latitude,
    longitude: pin.longitude,
    latitudeDelta: 0.004,
    longitudeDelta: 0.004,
  };
}

function StaticJobMap({
  region,
  pin,
  accessibilityLabel,
}: {
  region: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
  pin: JobPin | null;
  accessibilityLabel: string;
}) {
  const [mapReady, setMapReady] = useState(mapsRuntime !== null);
  const MapView = mapsRuntime?.MapView;
  const Marker = mapsRuntime?.Marker;
  const available = classifyMapAvailability(mapReady && mapsRuntime !== null);

  if (available !== 'ready' || !MapView || !Marker) {
    return (
      <View style={styles.unavailable} accessibilityLabel="Job location map unavailable">
        <Text style={styles.help}>{COPY.workerMapUnavailable}</Text>
      </View>
    );
  }

  return (
    <MapErrorBoundary onError={() => setMapReady(false)}>
      <View style={styles.mapFrame} pointerEvents="none">
        <MapView
          style={styles.map}
          provider={Platform.OS === 'android' ? mapsRuntime?.PROVIDER_GOOGLE : undefined}
          initialRegion={region}
          region={region}
          scrollEnabled={false}
          zoomEnabled={false}
          zoomTapEnabled={false}
          zoomControlEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          toolbarEnabled={false}
          liteMode={Platform.OS === 'android'}
          showsUserLocation={false}
          showsMyLocationButton={false}
          followsUserLocation={false}
          moveOnMarkerPress={false}
          pointerEvents="none"
          accessibilityLabel={accessibilityLabel}
        >
          {pin ? (
            <Marker coordinate={pin} draggable={false} accessibilityLabel="Authorized job pin" />
          ) : null}
        </MapView>
      </View>
    </MapErrorBoundary>
  );
}

export function WorkerApproximateJobArea({ jobId }: { jobId: string }) {
  const [area, setArea] = useState<ApproximateJobArea | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorCopy, setErrorCopy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const next = await getJobApproximateArea(jobId);
    setArea(next);
    setErrorCopy(null);
  }, [jobId]);

  /* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount; same convention as other screens */
  useEffect(() => {
    const run = { cancelled: false };
    setIsLoading(true);
    load()
      .catch((error: unknown) => {
        if (run.cancelled) return;
        setArea(null);
        setErrorCopy(createWorkerLocationErrorCopy(error));
      })
      .finally(() => {
        if (!run.cancelled) setIsLoading(false);
      });
    return () => {
      run.cancelled = true;
    };
  }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (isLoading) {
    return (
      <View style={styles.block}>
        <ActivityIndicator />
        <Text style={styles.help}>Loading job area…</Text>
      </View>
    );
  }

  const surface = projectPreAcceptWorkerLocation(
    errorCopy ? null : area,
    classifyMapAvailability(nativeJobMapsLoaded())
  );

  if (surface.kind !== 'approximate') {
    return (
      <View style={styles.block}>
        <Text style={styles.note}>{errorCopy ?? COPY.workerLocationGeneric}</Text>
      </View>
    );
  }

  const areaLine = formatLocation(surface.barangay, surface.city);

  return (
    <View style={styles.block}>
      <Text style={styles.heading}>{surface.heading}</Text>
      {areaLine ? <Text style={styles.body}>{areaLine}</Text> : null}
      <Text style={styles.help}>{surface.copy}</Text>
      {surface.showMap ? (
        <StaticJobMap
          region={surface.mapRegion}
          pin={null}
          accessibilityLabel="Approximate job area map"
        />
      ) : (
        <View style={styles.unavailable} accessibilityLabel="Job location map unavailable">
          <Text style={styles.help}>{COPY.workerMapUnavailable}</Text>
        </View>
      )}
    </View>
  );
}

export function WorkerAssignedJobLocation({
  surface,
  mapsNote,
  onOpenMaps,
}: {
  surface: WorkerLocationSurface;
  mapsNote: string | null;
  onOpenMaps: () => void;
}) {
  if (surface.kind === 'suppressed' || surface.kind === 'unavailable') {
    if (surface.kind === 'unavailable') {
      return (
        <View style={styles.block}>
          <Text style={styles.note}>{COPY.workerLocationUnavailable}</Text>
        </View>
      );
    }
    return null;
  }

  if (surface.kind === 'text-fallback') {
    const areaLine = formatLocation(surface.barangay, surface.city);
    return (
      <View style={styles.block}>
        <Text style={styles.heading}>Job location</Text>
        {surface.address ? <Text style={styles.body}>{surface.address}</Text> : null}
        {areaLine ? <Text style={styles.body}>{areaLine}</Text> : null}
      </View>
    );
  }

  if (surface.kind === 'exact') {
    const areaLine = formatLocation(surface.barangay, surface.city);
    return (
      <View style={styles.block}>
        <Text style={styles.heading}>Job location</Text>
        {surface.address ? <Text style={styles.body}>{surface.address}</Text> : null}
        {areaLine ? <Text style={styles.body}>{areaLine}</Text> : null}
        {surface.showMap ? (
          <StaticJobMap
            region={exactPinRegion(surface.pin)}
            pin={surface.pin}
            accessibilityLabel="Exact job location map"
          />
        ) : (
          <View style={styles.unavailable} accessibilityLabel="Job location map unavailable">
            <Text style={styles.help}>{COPY.workerMapUnavailable}</Text>
          </View>
        )}
        {surface.openInMapsUrl ? (
          <Pressable
            style={styles.button}
            onPress={onOpenMaps}
            accessibilityRole="button"
            accessibilityLabel={COPY.openInMaps}
          >
            <Text style={styles.buttonText}>{COPY.openInMaps}</Text>
          </Pressable>
        ) : null}
        {mapsNote ? <Text style={styles.note}>{mapsNote}</Text> : null}
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

const styles = StyleSheet.create({
  block: {
    gap: 8,
    marginTop: 8,
  },
  mapFrame: {
    height: 180,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: SkillMatchTheme.border.default,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  unavailable: {
    height: 120,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: SkillMatchTheme.border.default,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: SkillMatchTheme.surface.subtle,
  },
  heading: {
    fontSize: 14,
    fontWeight: '700',
    color: SkillMatchTheme.text.primary,
  },
  body: {
    fontSize: 14,
    color: SkillMatchTheme.text.primary,
  },
  help: {
    fontSize: 12,
    color: SkillMatchTheme.text.secondary,
  },
  note: {
    fontSize: 14,
    color: SkillMatchTheme.feedback.warning,
  },
  button: {
    borderWidth: 1,
    borderColor: SkillMatchTheme.brand.primary,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: SkillMatchTheme.brand.primary,
    fontSize: 16,
    fontWeight: '600',
  },
});
