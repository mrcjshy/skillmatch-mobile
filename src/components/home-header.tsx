import { useCallback, useState, type ReactNode } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { type SymbolViewProps } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppSymbol } from '@/components/app-symbol';
import { NotificationBell } from '@/components/notification-bell';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import { homeDate, homeGreeting, type HomeGreeting } from '@/lib/home-greeting';

type HomeStickyHeaderProps = {
  name: string;
  role: 'worker' | 'client' | 'admin';
  /** The role's primary control (Work status or Post a job), then its compact Active booking. */
  children?: ReactNode;
};

/** A quiet time-of-day glyph beside the greeting; decorative, so screen readers skip it. */
const GREETING_SYMBOL: Record<HomeGreeting, SymbolViewProps['name']> = {
  'Good morning': { android: 'wb_sunny', ios: 'sun.max' },
  'Good afternoon': { android: 'wb_twilight', ios: 'sun.haze' },
  'Good evening': { android: 'dark_mode', ios: 'moon' },
};

/**
 * The compact Home header shared by all three roles. It sits above the scrolling list rather than
 * inside it, so it stays in view without covering content, and it owns the top safe-area inset
 * because the Home tab has no navigator header. This is the only place the notification bell
 * appears for each role.
 */
export function HomeStickyHeader({ name, role, children }: HomeStickyHeaderProps) {
  const insets = useSafeAreaInsets();
  const ui = useUiTheme();
  const styles = createStyles(ui);
  const [now, setNow] = useState(() => new Date());
  const greeting = homeGreeting(now);
  useFocusEffect(useCallback(() => {
    const refresh = () => { if (AppState.currentState === 'active') setNow(new Date()); };
    refresh();
    // Covers a time bucket or midnight while Home stays open, and refreshes on resume.
    const timer = setInterval(refresh, 60_000);
    const listener = AppState.addEventListener('change', refresh);
    return () => { clearInterval(timer); listener.remove(); };
  }, []));

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + ui.spacing.headerTop }]}>
      {/* No "Home" heading: the selected Home tab already names the screen (Wave 7). The bell sits
          beside the greeting and name; today's date follows the name as a quiet supporting line. */}
      <View style={styles.row}>
        <View style={styles.greeting}>
          <View style={styles.salutation}>
            <View accessible={false} importantForAccessibility="no-hide-descendants">
              <AppSymbol name={GREETING_SYMBOL[greeting]} size={18} tintColor={ui.colors.accent} />
            </View>
            <Text style={styles.salutationText}>{greeting}{name ? ',' : ''}</Text>
          </View>
          {name ? <Text style={styles.name} accessibilityRole="header">{name}</Text> : null}
          <Text style={styles.date}>{homeDate(now)}</Text>
        </View>
        <View style={styles.actionSlot}>
          <NotificationBell role={role} />
        </View>
      </View>
      {children}
    </View>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing } = ui;
  return StyleSheet.create({
    wrap: {
      paddingHorizontal: spacing.headerGutter,
      paddingBottom: spacing.md,
      backgroundColor: colors.canvas,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.hairline,
    },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
    actionSlot: { width: ui.size.minTarget, minHeight: ui.size.minTarget, alignItems: 'center', justifyContent: 'center' },
    greeting: { flex: 1, minWidth: 0, gap: spacing.headerGap },
    salutation: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    salutationText: { ...type.label, color: colors.accent, flexShrink: 1 },
    date: { ...type.helper, color: colors.textSecondary },
    name: { ...type.screenTitle, color: colors.textPrimary },
  });
}
