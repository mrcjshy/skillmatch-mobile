import { Component, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { SkillMatchTheme } from '@/constants/theme';
import {
  COPY,
  SANTA_ANA_PATEROS_DISPLAY_REGION,
  classifyMapAvailability,
  isValidJobCoordinate,
  resolveCurrentLocationPin,
  type ForegroundLocationLike,
  type JobPin,
} from '@/lib/job-location';

type MapsRuntime = {
  MapView: typeof import('react-native-maps').default;
  Marker: typeof import('react-native-maps').Marker;
  PROVIDER_GOOGLE: typeof import('react-native-maps').PROVIDER_GOOGLE;
};

type MapCoordinateEvent = {
  nativeEvent: { coordinate: { latitude: number; longitude: number } };
};

type MapHandle = {
  animateToRegion: (region: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  }) => void;
};

function loadMapsRuntime(): MapsRuntime | null {
  try {
    // Native TurboModule is evaluated on require. Catch so a reused APK without
    // RNMapsAirModule still shows Post Job instead of crashing the Client tab.
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

type JobLocationPickerProps = {
  pin: JobPin | null;
  onChangePin: (pin: JobPin) => void;
  note: string | null;
  onNote: (note: string | null) => void;
  disabled?: boolean;
  onMapGesture?: (active: boolean) => void;
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
  onChangePin,
  note,
  onNote,
  disabled = false,
  onMapGesture,
}: JobLocationPickerProps) {
  const mapRef = useRef<MapHandle>(null);
  const [mapReady, setMapReady] = useState(mapsRuntime !== null);
  const [locating, setLocating] = useState(false);
  const mapAvailable = classifyMapAvailability(mapReady && mapsRuntime !== null);
  const busy = disabled || locating;
  const MapView = mapsRuntime?.MapView;
  const Marker = mapsRuntime?.Marker;

  function applyCoordinate(latitude: number, longitude: number): void {
    if (!isValidJobCoordinate(latitude, longitude)) return;
    onChangePin({ latitude, longitude });
    onNote(null);
    onMapGesture?.(false);
  }

  function handleMapPress(event: MapCoordinateEvent): void {
    if (busy) return;
    const { latitude, longitude } = event.nativeEvent.coordinate;
    applyCoordinate(latitude, longitude);
  }

  function handleMarkerDragEnd(event: MapCoordinateEvent): void {
    if (disabled) return;
    const { latitude, longitude } = event.nativeEvent.coordinate;
    applyCoordinate(latitude, longitude);
  }

  async function handleUseCurrentLocation(): Promise<void> {
    if (busy || mapAvailable !== 'ready') return;
    setLocating(true);
    try {
      let location: ForegroundLocationLike;
      try {
        location = (await import('expo-location')) as ForegroundLocationLike;
      } catch {
        onNote(COPY.locationUnavailable);
        return;
      }
      const result = await resolveCurrentLocationPin(location);
      if (result.kind === 'denied') {
        onNote(COPY.permissionDenied);
        return;
      }
      if (result.kind === 'unavailable' || result.kind === 'invalid') {
        onNote(COPY.locationUnavailable);
        return;
      }
      onChangePin(result.pin);
      onNote(null);
      mapRef.current?.animateToRegion({
        latitude: result.pin.latitude,
        longitude: result.pin.longitude,
        latitudeDelta: SANTA_ANA_PATEROS_DISPLAY_REGION.latitudeDelta,
        longitudeDelta: SANTA_ANA_PATEROS_DISPLAY_REGION.longitudeDelta,
      });
    } finally {
      setLocating(false);
      onMapGesture?.(false);
    }
  }

  return (
    <View style={styles.wrap}>
      {mapAvailable === 'ready' && MapView && Marker ? (
        <MapErrorBoundary onError={() => setMapReady(false)}>
          <View
            style={styles.mapFrame}
            onTouchStart={() => onMapGesture?.(true)}
            onTouchEnd={() => onMapGesture?.(false)}
            onTouchCancel={() => onMapGesture?.(false)}
          >
            <MapView
              ref={mapRef as never}
              style={styles.map}
              provider={Platform.OS === 'android' ? mapsRuntime?.PROVIDER_GOOGLE : undefined}
              initialRegion={SANTA_ANA_PATEROS_DISPLAY_REGION}
              onPress={handleMapPress}
              pitchEnabled={false}
              rotateEnabled={false}
              toolbarEnabled={false}
              showsUserLocation={false}
              showsMyLocationButton={false}
              followsUserLocation={false}
              moveOnMarkerPress={false}
              accessibilityLabel="Job location map"
            >
              {pin ? (
                <Marker
                  coordinate={pin}
                  draggable={!disabled}
                  onDragEnd={handleMarkerDragEnd}
                  accessibilityLabel="Selected job pin"
                />
              ) : null}
            </MapView>
          </View>
        </MapErrorBoundary>
      ) : (
        <View style={styles.unavailable} accessibilityLabel="Job location map unavailable">
          <Text style={styles.help}>{COPY.mapUnavailable}</Text>
        </View>
      )}
      <Text style={styles.help}>
        Tap the map to place the Job pin, or drag the pin to adjust it. The starting
        view is the Santa Ana, Pateros area, not an exact Job location.
      </Text>
      <Pressable
        style={[styles.button, busy && styles.buttonDisabled]}
        onPress={() => {
          void handleUseCurrentLocation();
        }}
        disabled={busy || mapAvailable !== 'ready'}
        accessibilityRole="button"
        accessibilityLabel={COPY.useCurrentLocation}
      >
        {locating ? (
          <ActivityIndicator color={SkillMatchTheme.brand.primary} />
        ) : (
          <Text style={styles.buttonText}>{COPY.useCurrentLocation}</Text>
        )}
      </Pressable>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  mapFrame: {
    height: 220,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#9ca3af',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  unavailable: {
    height: 220,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#9ca3af',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: '#f8fafc',
  },
  help: {
    fontSize: 12,
    opacity: 0.6,
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
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: SkillMatchTheme.brand.primary,
    fontSize: 16,
    fontWeight: '600',
  },
});
