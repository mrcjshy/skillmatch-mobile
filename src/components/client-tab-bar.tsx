import type { BottomTabBarProps } from 'expo-router/tabs';
import { CommonActions } from 'expo-router/react-navigation';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { AppSymbol } from '@/components/app-symbol';
import { TAB_ACTIVE_COLOR, TAB_INACTIVE_COLOR } from '@/components/app-tab-bar';
import { MotionView, usePressScale } from '@/components/motion';
import { COBALT_LIT, COBALT_LIT_PRESSED, COBALT_SHADOW } from '@/constants/cobalt-material';
import { SkillMatchTheme } from '@/constants/theme';

/**
 * The floating bottom navigation for Client, Worker and Admin: an overlay over the screen, not a
 * band below it. Content scrolls under a soft canvas fade and the top of a translucent pill; the
 * selected tab sits in a quiet capsule. Each tab scene is padded by the bar height minus
 * TAB_BAR_OVERLAP (see floating-tab-bar.ts), and every tab screen already ends with 48 dp of bottom
 * padding, so the last row still clears the bar.
 *
 * Tabs show icons only (owner request 2026-11-04): each tab's name stays its accessible label, and
 * the screens still pass `tabBarLabel`, so showing names again is a one-line change here.
 * Tab routes stay ordinary tabs (same `tablist` / `tab` roles, selected state, accessible names,
 * tabPress/tabLongPress events and navigate action as the stock bar). Client's Post a job is not a
 * route: it is a fixed-width circular slot in the same flex row, so it sits at the pill's geometric
 * centre with the first half of the tabs on its left and the rest on its right, however tall the
 * pill grows with text size. Its + wears the Post a job page's cobalt material (the page's primary
 * button), so the way in already looks like the page it opens. Worker and Admin use the same pill
 * without a central action.
 */
const { colors, size, spacing } = SkillMatchTheme.ui;

export const CLIENT_POST_ACTION_LABEL = 'Post a job';
/** The pill's corner: fully rounded at the default height, still soft when text size grows. */
const PILL_RADIUS = 34;
/** How far tab content runs under the bar: exactly the tab screens' 48 dp bottom padding, so at
 *  the end of a list the last row rests just above the bar. Fixed bottom content (the Home
 *  booking dock) adds the same theme token, so it clears the bar too. */
export const TAB_BAR_OVERLAP = size.tabBarOverlap;
/** Height of the fade above the pill. */
const FADE = 20;


type ClientTabBarProps = BottomTabBarProps & {
  /** Present on Client only: the central + Post a job action. */
  onPostJob?: () => void;
  postDisabled?: boolean;
  posting?: boolean;
  /** Reports the bar's laid-out height (see floating-tab-bar.ts). */
  onHeight?: (height: number) => void;
};

export function ClientTabBar({ state, descriptors, navigation, insets, onPostJob, postDisabled = false, posting = false, onHeight }: ClientTabBarProps) {
  // The + gives way under the finger and returns on release; at rest it never moves.
  const press = usePressScale();
  const split = Math.ceil(state.routes.length / 2);

  const tab = (route: (typeof state.routes)[number], index: number) => {
    const { options } = descriptors[route.key];
    const focused = index === state.index;
    const color = focused ? TAB_ACTIVE_COLOR : TAB_INACTIVE_COLOR;
    const title = options.title ?? route.name;
    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) {
        navigation.dispatch({ ...CommonActions.navigate(route), target: state.key });
      }
    };
    const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });
    return (
      <Pressable
        key={route.key}
        role="tab"
        aria-selected={focused}
        aria-label={options.tabBarAccessibilityLabel ?? title}
        testID={options.tabBarButtonTestID}
        onPress={onPress}
        onLongPress={onLongPress}
        android_ripple={{ borderless: true }}
        style={[styles.tab, options.tabBarItemStyle]}
      >
        {/* A layer, not the Pressable's background: Android's ripple replaces a view background. */}
        {focused ? <View pointerEvents="none" style={styles.tabSelected} /> : null}
        {options.tabBarIcon?.({ focused, color, size: size.tabIcon })}
      </Pressable>
    );
  };

  const centre = onPostJob ? (
    <View key="post-job" style={styles.actionSlot}>
      <MotionView style={press.style}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={CLIENT_POST_ACTION_LABEL}
          accessibilityState={{ disabled: postDisabled, busy: posting }}
          disabled={postDisabled}
          onPress={onPostJob}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          android_ripple={{ color: colors.accentPressed, borderless: true, radius: size.actionCircle / 2 }}
          style={({ pressed }) => [styles.action, pressed && !postDisabled ? styles.actionPressed : null, postDisabled ? styles.actionDisabled : null]}
        >
          <AppSymbol name={{ android: 'add', ios: 'plus' }} size={30} tintColor={colors.onAccent} />
        </Pressable>
      </MotionView>
    </View>
  ) : null;

  // The bar overlays the scene: a canvas fade (clear at the top) under a translucent pill. It keeps
  // the bottom inset clear for gestures and lets touches above the pill reach the content.
  return (
    <Animated.View
      pointerEvents="box-none"
      onLayout={(event) => onHeight?.(event.nativeEvent.layout.height)}
      style={[
        styles.band,
        {
          paddingBottom: insets.bottom + spacing.sm,
          paddingLeft: insets.left + spacing.md,
          paddingRight: insets.right + spacing.md,
        },
      ]}
    >
      <View pointerEvents="none" style={styles.fade} />
      <View role="tablist" style={styles.pill}>
        {state.routes.slice(0, split).map((route, index) => tab(route, index))}
        {centre}
        {state.routes.slice(split).map((route, index) => tab(route, index + split))}
      </View>
    </Animated.View>
  );
}

/** Worker: the same floating pill, no central action. */
export function WorkerTabBar(props: BottomTabBarProps & { onHeight?: (height: number) => void }) {
  return <ClientTabBar {...props} />;
}

/** Admin: the same floating pill with its four destinations, no central action. */
export function AdminTabBar(props: BottomTabBarProps & { onHeight?: (height: number) => void }) {
  return <ClientTabBar {...props} />;
}

const styles = StyleSheet.create({
  band: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: FADE },
  fade: {
    ...StyleSheet.absoluteFill,
    // Canvas #FBF8FF (M3 surface): clear at the top, never solid, so content still ghosts through the pill.
    experimental_backgroundImage: 'linear-gradient(to bottom, rgba(251, 248, 255, 0) 0%, rgba(251, 248, 255, 0.55) 35%, rgba(251, 248, 255, 0.8) 100%)',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: size.actionCircle + spacing.md,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: PILL_RADIUS,
    borderCurve: 'continuous',
    // Translucent, so what scrolls behind it stays faintly visible; an outset box shadow (never
    // drawn under a see-through surface, unlike Android elevation) lifts it.
    // M3 surfaceContainer (#EFEDF4), slightly see-through, on a soft level-2 lift.
    backgroundColor: 'rgba(239, 237, 244, 0.94)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(197, 197, 211, 0.7)',
    boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.10), 0px 8px 24px rgba(27, 27, 33, 0.10)',
  },
  // Icon only, so the tab itself keeps the 48 dp touch target the label used to give it.
  tab: { flex: 1, minHeight: size.minTarget, alignItems: 'center', justifyContent: 'center', paddingVertical: 5, paddingHorizontal: 0, borderRadius: PILL_RADIUS - spacing.xs, borderCurve: 'continuous' },
  /** The M3 active indicator: a 64 x 32 tonal pill (M3 secondaryContainer) behind the icon; the accent stays on the icon. */
  tabSelected: {
    position: 'absolute',
    width: size.tabIndicatorWidth,
    height: size.tabIndicatorHeight,
    borderRadius: size.tabIndicatorHeight / 2,
    borderCurve: 'continuous',
    backgroundColor: colors.accentTonal,
  },
  actionSlot: {
    width: size.actionCircle + spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  action: {
    width: size.actionCircle,
    height: size.actionCircle,
    // M3 FAB shape (a 56dp rounded square, large shape 16dp) in the Post a job page's cobalt material,
    // exactly as its primary button (CobaltButton): lit from above, floating on a shadow in its own hue.
    // The solid cobalt underneath shows wherever the image is not drawn.
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: colors.accent,
    experimental_backgroundImage: COBALT_LIT,
    boxShadow: COBALT_SHADOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Under the finger the same light a shade deeper, as on the page's button.
  actionPressed: { backgroundColor: colors.accentPressed, experimental_backgroundImage: COBALT_LIT_PRESSED },
  actionDisabled: { opacity: 0.45 },
});
