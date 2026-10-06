import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type SymbolViewProps } from 'expo-symbols';

import { AppSymbol } from '@/components/app-symbol';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import { RowGlyph } from '@/components/row-glyph';

type NavRowProps = {
  label: string;
  hint: string;
  icon?: SymbolViewProps['name'];
  disabled?: boolean;
  onPress: () => void;
};

/**
 * A row that opens another screen (Help, My reports, legal pages), shared by the Worker and Client
 * profiles. Used inside a SurfaceGroup: glyph on the title line, title, one quiet hint, chevron. The
 * whole row is one 56dp+ button named by its title.
 */
export function NavRow({ label, hint, icon, disabled = false, onPress }: NavRowProps) {
  const ui = useUiTheme();
  const styles = createStyles(ui);
  return (
    <Pressable
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && !disabled ? styles.pressed : null]}
    >
      <View style={styles.main}>
        {icon ? <RowGlyph name={icon} titleLineHeight={ui.type.body.lineHeight} /> : null}
        <View style={styles.copy}>
          <Text style={styles.title}>{label}</Text>
          <Text style={styles.hint}>{hint}</Text>
        </View>
      </View>
      <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants">
        <AppSymbol name={{ android: 'chevron_right', ios: 'chevron.right' }} size={ui.size.icon} tintColor={ui.colors.textSecondary} />
      </View>
    </Pressable>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing, size } = ui;
  return StyleSheet.create({
    row: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
      minHeight: size.listRowMinHeight, paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    },
    pressed: { backgroundColor: colors.surfaceSunken },
    main: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
    copy: { flex: 1, minWidth: 0, gap: spacing.xxs },
    title: { ...type.body, color: colors.textPrimary },
    hint: { ...type.helper, color: colors.textSecondary },
  });
}
