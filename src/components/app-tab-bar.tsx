import type { ReactNode } from 'react';
import { type SymbolViewProps } from 'expo-symbols';
import { Text, View, useWindowDimensions, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppSymbol as SymbolView } from '@/components/app-symbol';
import { APP_HEADER_OPTIONS } from '@/components/app-header-options';
import { SkillMatchTheme } from '@/constants/theme';

/**
 * Shared bottom-navigation visual grammar for Worker, Client and (Wave 4) Admin: a pill indicator
 * behind the selected icon, labels that are always visible, 48dp item targets, a hairline top
 * boundary and a bar that grows with system text size and the bottom inset.
 */
const { colors, type, size, spacing } = SkillMatchTheme.ui;

export const TAB_ACTIVE_COLOR = colors.accent;
export const TAB_INACTIVE_COLOR = colors.textMuted;

export function TabIcon({
  name,
  color,
  size: iconSize,
}: {
  name: SymbolViewProps['name'];
  color: ColorValue;
  size: number;
}) {
  const active = color === TAB_ACTIVE_COLOR;
  return (
    <View
      pointerEvents="none"
      style={{
        width: size.tabIndicatorWidth,
        height: size.tabIndicatorHeight,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: size.tabIndicatorHeight,
        backgroundColor: active ? colors.accent : 'transparent',
      }}
    >
      <SymbolView name={name} size={iconSize} tintColor={active ? colors.onAccent : color} />
    </View>
  );
}

export function TabLabel({ focused, color, children }: { focused: boolean; color: ColorValue; children: string }) {
  return <Text style={{ ...type.label, color, fontWeight: focused ? '700' : type.label.fontWeight, textAlign: 'center' }}>{children}</Text>;
}

/**
 * Screen options shared by every role's tab navigator. Worker and Client pass no `headerRight`:
 * their notification bell lives only in the Home screen's own sticky header.
 */
export function useAppTabScreenOptions(headerRight?: () => ReactNode) {
  const { fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return {
    ...APP_HEADER_OPTIONS,
    headerTitleStyle: { ...type.sectionTitle },
    // Keep navigator-owned safe areas and centering; give titles compact vertical breathing room.
    headerStyle: {
      ...APP_HEADER_OPTIONS.headerStyle,
      height: insets.top + Math.max(size.minTarget + spacing.lg, type.sectionTitle.lineHeight * fontScale + spacing.headerTop * 2),
    },
    headerTitleContainerStyle: { paddingHorizontal: spacing.headerGutter },
    headerRight,
    tabBarActiveTintColor: TAB_ACTIVE_COLOR,
    tabBarInactiveTintColor: TAB_INACTIVE_COLOR,
    tabBarItemStyle: { minHeight: size.ghostButton, paddingTop: spacing.xs, gap: spacing.xs },
    tabBarStyle: {
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.hairline,
      height:
        Math.max(80, size.tabIndicatorHeight + type.label.lineHeight * fontScale * (fontScale > 1.15 ? 2 : 1) + spacing.xl) +
        insets.bottom,
    },
    sceneStyle: { backgroundColor: colors.canvas },
  };
}
