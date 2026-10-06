import type { BottomTabBarProps } from 'expo-router/tabs';
import { CommonActions } from 'expo-router/react-navigation';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppSymbol } from '@/components/app-symbol';
import { TAB_ACTIVE_COLOR, TAB_INACTIVE_COLOR } from '@/components/app-tab-bar';
import { MotionView, usePressScale } from '@/components/motion';
import { SkillMatchTheme } from '@/constants/theme';

/**
 * Wave 7 — the Client bottom navigation with Post a job as its central circular action.
 *
 * The four tab routes stay ordinary tabs (same `tablist` / `tab` roles, selected state, labels,
 * tabPress/tabLongPress events and navigate action as the stock bar). The action is not a route:
 * it is a fixed-width slot in the same flex row, so it sits at the bar's geometric centre with the
 * first half of the tabs (Home, My jobs) on its left and the rest (Bookings, Profile) on its right,
 * however tall the bar grows with text size. It stays inside the bar, so its whole target is
 * touchable, and the bar keeps the bottom inset clear for gesture navigation.
 */
const { colors, size, spacing, elevation } = SkillMatchTheme.ui;

export const CLIENT_POST_ACTION_LABEL = 'Post a job';

type ClientTabBarProps = BottomTabBarProps & {
  onPostJob: () => void;
  postDisabled: boolean;
  posting: boolean;
};

export function ClientTabBar({ state, descriptors, navigation, insets, onPostJob, postDisabled, posting }: ClientTabBarProps) {
  const focusedOptions = descriptors[state.routes[state.index].key].options;
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
    const label = options.tabBarLabel;
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
        {options.tabBarIcon?.({ focused, color, size: size.tabIcon })}
        {typeof label === 'function'
          ? label({ focused, color, position: 'below-icon', children: title })
          : <Text style={{ color }}>{label ?? title}</Text>}
      </Pressable>
    );
  };

  // tabBarStyle may hold animated values (the shared options are plain), hence Animated.View.
  return (
    <Animated.View
      style={[
        focusedOptions.tabBarStyle,
        { paddingBottom: insets.bottom, paddingHorizontal: Math.max(insets.left, insets.right) },
      ]}
    >
      <View role="tablist" style={styles.row}>
        {state.routes.slice(0, split).map((route, index) => tab(route, index))}
        <View style={styles.actionSlot}>
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
        {state.routes.slice(split).map((route, index) => tab(route, index + split))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', padding: 5 },
  actionSlot: {
    width: size.actionCircle + spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  action: {
    width: size.actionCircle,
    height: size.actionCircle,
    borderRadius: size.actionCircle / 2,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.floating,
  },
  actionPressed: { backgroundColor: colors.accentPressed },
  actionDisabled: { opacity: 0.45 },
});
