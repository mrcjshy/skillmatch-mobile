import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { AppSymbol } from '@/components/app-symbol';
import { SkillMatchTheme } from '@/constants/theme';
import { toggleMapType, useMapType } from '@/lib/map-type';

const { colors, type, spacing } = SkillMatchTheme.ui;

/**
 * The Map / Satellite switch floating on a map. It names what a tap will show, so on the street
 * map it reads "Satellite" and on the satellite map it reads "Map". It sets no z-index; it is drawn after the map
 * inside the map layer, so it sits over the map but never over a sheet drawn above that layer.
 */
export function MapTypeToggle({ style }: { style?: StyleProp<ViewStyle> }) {
  const mapType = useMapType();
  const next = mapType === 'map' ? 'Satellite' : 'Map';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Show ${next.toLowerCase()} view`}
      onPress={toggleMapType}
      hitSlop={8}
      style={({ pressed }) => [styles.toggle, pressed && styles.pressed, style]}
    >
      <AppSymbol name={mapType === 'map' ? { android: 'satellite_alt', ios: 'globe.asia.australia' } : { android: 'map', ios: 'map' }}
        size={18} tintColor={colors.accent} />
      <Text style={styles.label}>{next}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toggle: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: 24,
    backgroundColor: colors.surface,
    boxShadow: '0px 4px 12px rgba(27, 31, 36, 0.18)',
  },
  pressed: { backgroundColor: colors.surfaceSunken },
  label: { ...type.label, color: colors.textPrimary },
});
