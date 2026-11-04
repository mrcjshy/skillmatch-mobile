import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { type SymbolViewProps } from 'expo-symbols';

import { AppSymbol } from '@/components/app-symbol';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';

export type ProfileQuickAction = {
  label: string;
  hint: string;
  icon: SymbolViewProps['name'];
  onPress: () => void;
  disabled?: boolean;
};

/** Narrowest a tile gets at 100% text; it grows with the font scale, so large text gets one column instead of two squeezed ones. */
export const PROFILE_ACTION_MIN_WIDTH = 132;

const TILE_RADIUS = 20;
const TILE_MIN_HEIGHT = 104;

/**
 * A Profile tab's shortcuts as a two-column grid of white tiles: a glyph in a soft accent circle, a
 * title and one short hint. Each tile is one button named by its title (the hint is its spoken hint).
 * A disabled tile greys its glyph and title instead of fading, so its words stay readable.
 */
export function ProfileQuickActions({ actions }: { actions: ProfileQuickAction[] }) {
  const ui = useUiTheme();
  const { colors, size } = ui;
  const styles = createStyles(ui);
  const { fontScale } = useWindowDimensions();
  const minWidth = Math.ceil(PROFILE_ACTION_MIN_WIDTH * Math.max(1, fontScale));
  return (
    <View style={styles.grid}>
      {actions.map((action) => {
        const disabled = action.disabled ?? false;
        return (
          <Pressable
            key={action.label}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            accessibilityHint={action.hint}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={action.onPress}
            style={({ pressed }) => [styles.tile, { minWidth }, pressed && !disabled ? styles.pressed : null]}
          >
            <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.glyph, disabled ? styles.glyphDisabled : null]}>
              <AppSymbol name={action.icon} size={size.icon} tintColor={disabled ? colors.textSecondary : colors.accent} />
            </View>
            <View style={styles.copy}>
              <Text style={[styles.label, disabled ? styles.labelDisabled : null]}>{action.label}</Text>
              <Text style={styles.hint}>{action.hint}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing, size } = ui;
  return StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    tile: {
      flexGrow: 1,
      flexBasis: '40%',
      minHeight: TILE_MIN_HEIGHT,
      padding: spacing.lg,
      gap: spacing.md,
      borderRadius: TILE_RADIUS,
      borderCurve: 'continuous',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairline,
    },
    pressed: { backgroundColor: colors.surfaceSunken },
    glyph: {
      width: size.iconCircle,
      height: size.iconCircle,
      borderRadius: size.iconCircle / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accentSubtle,
    },
    glyphDisabled: { backgroundColor: colors.surfaceSunken },
    copy: { gap: spacing.xxs },
    label: { ...type.bodyEmphasis, color: colors.textPrimary },
    labelDisabled: { color: colors.textSecondary },
    hint: { ...type.helper, color: colors.textSecondary },
  });
}
