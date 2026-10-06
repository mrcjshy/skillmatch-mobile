import { type SymbolViewProps } from 'expo-symbols';
import { AppSymbol as SymbolView } from '@/components/app-symbol';
import { type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useUiTheme, type UiTheme } from '@/components/refinement-theme';



type CollapsibleProps = {
  children: ReactNode;
  title: string;
  subtitle?: string;
  icon?: SymbolViewProps['name'];
  contained?: boolean;
};

/** Presentation only: collapsed children stay mounted, preserving drafts and guards. */
export function Collapsible({ children, title, subtitle, icon, contained = true }: CollapsibleProps) {
  const ui = useUiTheme();
  const { colors, size } = ui;
  const { styles } = createStyles(ui);

  const [isOpen, setIsOpen] = useState(false);
  return (
    <View style={[styles.surface, !contained && styles.openSurface]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: isOpen }}
        onPress={() => setIsOpen(value => !value)}
        style={({ pressed }) => [styles.heading, pressed && styles.pressed]}>
        {icon ? <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants">
          <SymbolView name={icon} size={size.icon} tintColor={colors.accent} />
        </View> : null}
        <View style={styles.copy}>
          <Text style={styles.title}>{title}</Text>
          {subtitle && !isOpen ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants">
          <SymbolView name={{ android: isOpen ? 'expand_less' : 'expand_more', ios: isOpen ? 'chevron.up' : 'chevron.down' }} size={size.icon} tintColor={colors.accent} />
        </View>
      </Pressable>
      <View
        style={[styles.content, !isOpen && styles.hidden]}
        pointerEvents={isOpen ? 'auto' : 'none'}
        accessibilityElementsHidden={!isOpen}
        importantForAccessibility={isOpen ? 'auto' : 'no-hide-descendants'}>
        {children}
      </View>
    </View>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, spacing, type, radius, size } = ui;
const styles = StyleSheet.create({
  surface: { backgroundColor: 'transparent', borderRadius: radius.control },
  openSurface: { backgroundColor: 'transparent', borderRadius: 0 },
  heading: { minHeight: size.listRowMinHeight, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.control },
  pressed: { backgroundColor: colors.surfaceSunken },
  copy: { flex: 1, gap: spacing.xs },
  title: { ...type.bodyEmphasis, color: colors.textPrimary },
  subtitle: { ...type.helper, color: colors.textSecondary },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
  hidden: { maxHeight: 0, overflow: 'hidden', paddingBottom: 0 },
});

  return { styles };
}
