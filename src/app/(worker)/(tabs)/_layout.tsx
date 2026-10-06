import { Tabs } from 'expo-router';
import { TabIcon, TabLabel, useAppTabScreenOptions } from '@/components/app-tab-bar';
import { StatusBar } from 'expo-status-bar';

import { SkillMatchTheme } from '@/constants/theme';
import { WorkerProfileProvider } from '@/providers/worker-profile-provider';

const { size } = SkillMatchTheme.ui;

// Three top-level destinations. Home owns its own sticky header (name, work status, bell) and lists
// available jobs directly, so there is no navigator header on Home and no Find work tab.
export default function WorkerTabsLayout() {
  const screenOptions = useAppTabScreenOptions();
  return (
    <WorkerProfileProvider>
      <StatusBar style="dark" />
      <Tabs
        backBehavior="initialRoute"
        screenOptions={screenOptions}
      >
        <Tabs.Screen
          name="worker/index"
          options={{
            title: 'Home',
            tabBarAccessibilityLabel: 'Home',
            headerShown: false,
            tabBarIcon: ({ color }) => (
              <TabIcon name={{ android: 'home', ios: 'house.fill' }} color={color} size={size.tabIcon} />
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
              <TabIcon name={{ android: 'person', ios: 'person.fill' }} color={color} size={size.tabIcon} />
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
