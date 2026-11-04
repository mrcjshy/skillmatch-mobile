import { useCallback, useState, type ReactNode } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState, Image, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MotionView, useGreetingWave } from '@/components/motion';
import { NotificationBell } from '@/components/notification-bell';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import { greetingName, homeGreeting, homeShortDate, type HomeGreeting, type HomeRole } from '@/lib/home-greeting';

type HomeStickyHeaderProps = {
  name: string;
  role: HomeRole;
  /** The role's primary control (Work status or Post a job), then its compact Active booking. */
  children?: ReactNode;
};

/** 3D clay sky art in Itik's style for the time of day; decorative, so screen readers skip it. */
const SKY: Record<HomeGreeting, number> = {
  'Good morning': require('@/assets/images/greeting/sun.png'),
  'Good afternoon': require('@/assets/images/greeting/sun-cloud.png'),
  'Good evening': require('@/assets/images/greeting/moon.png'),
};
const SKY_SIZE = 48;

/**
 * The compact Home header shared by all three roles: the time of day as a small 3D sky icon, a
 * greeting line with today's date, then the name with a hand that waves on arrival. It sits above
 * the scrolling list rather than inside it, so it stays in view without covering content, and it
 * owns the top safe-area inset because the Home tab has no navigator header. This is the only
 * place the notification bell appears for each role.
 */
export function HomeStickyHeader({ name, role, children }: HomeStickyHeaderProps) {
  const insets = useSafeAreaInsets();
  const ui = useUiTheme();
  const styles = createStyles(ui);
  const [now, setNow] = useState(() => new Date());
  const [arrivals, setArrivals] = useState(0);
  const greeting = homeGreeting(now);
  const shownName = greetingName(name);
  const wave = useGreetingWave(arrivals);
  useFocusEffect(useCallback(() => {
    const refresh = () => { if (AppState.currentState === 'active') setNow(new Date()); };
    refresh();
    setArrivals((count) => count + 1);
    // Covers a time bucket or midnight while Home stays open, and refreshes on resume.
    const timer = setInterval(refresh, 60_000);
    const listener = AppState.addEventListener('change', refresh);
    return () => { clearInterval(timer); listener.remove(); };
  }, []));

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + ui.spacing.headerTop }]}>
      {/* No "Home" heading: the selected Home tab already names the screen (Wave 7). */}
      <View style={styles.row}>
        <View style={styles.sky} accessible={false} importantForAccessibility="no-hide-descendants">
          <Image source={SKY[greeting]} style={styles.skyArt} fadeDuration={0} />
        </View>
        <View style={styles.greeting}>
          <Text style={styles.salutation}>
            <Text style={styles.salutationText}>{greeting}{shownName ? ',' : ''}</Text>
            <Text style={styles.date}>{`  ·  ${homeShortDate(now)}`}</Text>
          </Text>
          {shownName ? (
            <View style={styles.nameRow}>
              <Text style={styles.name} accessibilityRole="header">{shownName}</Text>
              <MotionView style={[styles.hand, wave]} accessible={false} importantForAccessibility="no-hide-descendants">
                <Text style={styles.handGlyph}>👋</Text>
              </MotionView>
            </View>
          ) : null}
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
      paddingBottom: spacing.sm,
      backgroundColor: colors.canvas,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.hairline,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
    sky: { width: SKY_SIZE, height: SKY_SIZE },
    skyArt: { width: SKY_SIZE, height: SKY_SIZE },
    actionSlot: { width: ui.size.minTarget, minHeight: ui.size.minTarget, alignItems: 'center', justifyContent: 'center' },
    greeting: { flex: 1, minWidth: 0 },
    salutation: { ...type.helper },
    salutationText: { ...type.label, color: colors.accent },
    date: { ...type.helper, color: colors.textSecondary },
    nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
    name: { ...type.screenTitle, fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -0.3, color: colors.textPrimary, flexShrink: 1 },
    hand: { transformOrigin: '70% 85%' },
    handGlyph: { fontSize: 22, lineHeight: 28 },
  });
}
