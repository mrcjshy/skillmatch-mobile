import { Tabs } from 'expo-router';
import { TabIcon, TabLabel, useAppTabScreenOptions } from '@/components/app-tab-bar';
import { WorkerTabBar } from '@/components/client-tab-bar';
import { useFloatingTabBar } from '@/components/floating-tab-bar';
import { StatusBar } from 'expo-status-bar';

import { SkillMatchTheme } from '@/constants/theme';
import { WorkerProfileProvider } from '@/providers/worker-profile-provider';

const { size } = SkillMatchTheme.ui;

// Three top-level destinations in the floating pill bar (same as Client, without the + action). Home owns its own sticky header (name, work status, bell) and lists
// available jobs directly, so there is no navigator header on Home and no Find work tab.
export default function WorkerTabsLayout() {
  const baseOptions = useAppTabScreenOptions();
  const floating = useFloatingTabBar();
  const screenOptions = { ...baseOptions, sceneStyle: [baseOptions.sceneStyle, floating.sceneStyle] };
  return (
    <WorkerProfileProvider>
      <StatusBar style="dark" />
      <Tabs
        backBehavior="initialRoute"
        screenOptions={screenOptions}
        tabBar={(props) => <WorkerTabBar {...props} onHeight={floating.onHeight} />}
      >
        <Tabs.Screen
          name="worker/index"
          options={{
            title: 'Home',
            tabBarAccessibilityLabel: 'Home',
            headerShown: false,
            tabBarIcon: ({ color }) => (
              <TabIcon name={{ android: 'home', ios: 'house.fill' }} color={color} size={size.tabIcon} plain />
            ),
            tabBarLabel: ({ focused, color }) => (
              <TabLabel focused={focused} color={color}>Home</TabLabel>
            ),
          }}
        />
        <Tabs.Screen
          name="worker/bookings"
          options={{
            title: 'Bookings',
            tabBarAccessibilityLabel: 'Bookings',
            tabBarIcon: ({ color }) => (
              <TabIcon
                name={{ android: 'calendar_month', ios: 'calendar' }}
                color={color}
                size={size.tabIcon}
                plain
              />
            ),
            tabBarLabel: ({ focused, color }) => (
              <TabLabel focused={focused} color={color}>Bookings</TabLabel>
            ),
          }}
        />
        <Tabs.Screen
          name="worker/profile"
          options={{
            title: 'Profile',
            tabBarAccessibilityLabel: 'Profile',
            tabBarIcon: ({ color }) => (
              <TabIcon name={{ android: 'person', ios: 'person.fill' }} color={color} size={size.tabIcon} plain />
            ),
            tabBarLabel: ({ focused, color }) => (
              <TabLabel focused={focused} color={color}>Profile</TabLabel>
            ),
          }}
        />
      </Tabs>
    </WorkerProfileProvider>
  );
}
