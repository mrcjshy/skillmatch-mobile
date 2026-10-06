import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { type SymbolViewProps } from 'expo-symbols';

import { AppSymbol } from '@/components/app-symbol';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';

type AppIconButtonProps = {
  icon: SymbolViewProps['name'];
  /** Required: an icon-only control has no visible text, so TalkBack needs the name. */
  accessibilityLabel: string;
  onPress?: () => void;
  /** `plain` has no fill; `tonal` sits on a subtle accent fill. */
  variant?: 'plain' | 'tonal';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** 48 x 48 icon action (close, back-like actions, overflow). */
export function AppIconButton({ icon, accessibilityLabel, onPress, variant = 'plain', disabled = false, style }: AppIconButtonProps) {
  const ui = useUiTheme();
  const { colors, size } = ui;
  const { styles } = createStyles(ui);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variant === 'tonal' ? styles.tonal : null,
        pressed && !disabled ? styles.pressed : null,
        style,
      ]}
    >
      <AppSymbol
        pointerEvents="none"
        accessible={false}
        name={icon}
        size={size.icon}
        tintColor={disabled ? colors.textMuted : colors.textPrimary}
      />
    </Pressable>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, radius, size } = ui;
  const styles = StyleSheet.create({
    base: {
      width: size.iconButton,
      height: size.iconButton,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tonal: { backgroundColor: colors.surfaceSunken },
    pressed: { backgroundColor: colors.accentSubtle },
  });
  return { styles };
}
