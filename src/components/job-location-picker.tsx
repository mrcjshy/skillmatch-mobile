import { Component, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { SkillMatchTheme } from '@/constants/theme';
import {
  COPY,
  SANTA_ANA_PATEROS_DISPLAY_REGION,
  classifyMapAvailability,
  formatReverseGeocodeAddress,
  isValidJobCoordinate,
  postingPinState,
  resolveCurrentLocationPin,
  reviewJobPinPlacement,
  type ForegroundLocationLike,
  type JobPin,
  type ReverseGeocodeLike,
} from '@/lib/job-location';

const { colors, type, spacing, radius, size } = SkillMatchTheme.ui;

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
  onAutofillAddress?: (address: string) => void;
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
  onAutofillAddress,
}: JobLocationPickerProps) {
  const mapRef = useRef<MapHandle>(null);
  const [mapReady, setMapReady] = useState(mapsRuntime !== null);
  const [locating, setLocating] = useState(false);
  const mapAvailable = classifyMapAvailability(mapReady && mapsRuntime !== null);
  const busy = disabled || locating;
  const MapView = mapsRuntime?.MapView;
  const Marker = mapsRuntime?.Marker;

  async function applyCoordinate(latitude: number, longitude: number): Promise<void> {
    if (!isValidJobCoordinate(latitude, longitude)) return;
    const nextPin = { latitude, longitude };
    const result = await reviewJobPinPlacement(nextPin);
    if (!result.ok) {
      onNote(result.reason === 'invalid' ? COPY.invalidPin : COPY.outsideServiceArea);
      onMapGesture?.(false);
      return;
    }
    onChangePin(nextPin);
    onNote(null);
    onMapGesture?.(false);
  }

  function handleMapPress(event: MapCoordinateEvent): void {
    if (busy) return;
    const { latitude, longitude } = event.nativeEvent.coordinate;
    void applyCoordinate(latitude, longitude);
  }

  function handleMarkerDragEnd(event: MapCoordinateEvent): void {
    if (disabled) return;
    const { latitude, longitude } = event.nativeEvent.coordinate;
    void applyCoordinate(latitude, longitude);
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
      const placement = await reviewJobPinPlacement(result.pin);
      if (!placement.ok) {
        onNote(placement.reason === 'invalid' ? COPY.invalidPin : COPY.outsideServiceArea);
        return;
      }
      onChangePin(result.pin);
      mapRef.current?.animateToRegion({
        latitude: result.pin.latitude,
        longitude: result.pin.longitude,
        latitudeDelta: SANTA_ANA_PATEROS_DISPLAY_REGION.latitudeDelta,
        longitudeDelta: SANTA_ANA_PATEROS_DISPLAY_REGION.longitudeDelta,
      });
      const geocoder = location as ForegroundLocationLike & ReverseGeocodeLike;
      try {
        if (typeof geocoder.reverseGeocodeAsync !== 'function') {
          onNote(COPY.geocodeUnavailable);
          return;
        }
        const rows = await geocoder.reverseGeocodeAsync({
          latitude: result.pin.latitude,
          longitude: result.pin.longitude,
        });
        const address = formatReverseGeocodeAddress(rows);
        if (address) {
          onAutofillAddress?.(address);
          onNote(null);
        } else {
          onNote(COPY.geocodeUnavailable);
        }
      } catch {
        onNote(COPY.geocodeUnavailable);
      }
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
        {postingPinState(pin) === 'selected'
          ? 'Job location selected. Tap another area or drag the pin to adjust it.'
          : 'No job location selected yet. Tap the map to place the job pin.'}
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
          <ActivityIndicator color={colors.primary} />
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
    gap: spacing.sm,
  },
  mapFrame: {
    height: 220,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  unavailable: {
    height: 220,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceSubtle,
  },
  help: {
    ...type.helper,
    color: colors.textSecondary,
  },
  note: {
    ...type.helper,
    color: colors.warning,
  },
  button: {
    minHeight: size.ghostButton,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    ...type.bodyEmphasis,
    color: colors.primary,
  },
});
