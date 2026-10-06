import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { TabIcon, TabLabel, useAppTabScreenOptions } from '@/components/app-tab-bar';
import { SkillMatchTheme } from '@/constants/theme';

const { size } = SkillMatchTheme.ui;

// Four top-level destinations through the same bar as Worker and Client. Home owns its own sticky
// header (greeting and the bell), so it has no navigator header; the other tabs use the shared
// centered title and carry no bell. ID reviews, details and Notifications stay pushed Stack
// screens outside this shell, with normal Back and no tab bar underneath.
export default function AdminTabsLayout() {
  const screenOptions = useAppTabScreenOptions();
  return (
    <>
      <StatusBar style="dark" />
      <Tabs backBehavior="initialRoute" screenOptions={screenOptions}>
        <Tabs.Screen
          name="admin/index"
          options={{
            title: 'Home',
            tabBarAccessibilityLabel: 'Home',
            headerShown: false,
            tabBarIcon: ({ color }) => (
              <TabIcon name={{ android: 'home', ios: 'house.fill' }} color={color} size={size.tabIcon} />
            ),
            tabBarLabel: ({ focused, color }) => <TabLabel focused={focused} color={color}>Home</TabLabel>,
          }}
        />
        <Tabs.Screen
          name="admin/workers"
          options={{
            title: 'Workers',
            tabBarAccessibilityLabel: 'Workers',
            tabBarIcon: ({ color }) => (
              <TabIcon name={{ android: 'handyman', ios: 'wrench.and.screwdriver' }} color={color} size={size.tabIcon} />
            ),
            tabBarLabel: ({ focused, color }) => <TabLabel focused={focused} color={color}>Workers</TabLabel>,
          }}
        />
        <Tabs.Screen
          name="admin/clients"
          options={{
            title: 'Clients',
            tabBarAccessibilityLabel: 'Clients',
            tabBarIcon: ({ color }) => (
              <TabIcon name={{ android: 'group', ios: 'person.2' }} color={color} size={size.tabIcon} />
            ),
            tabBarLabel: ({ focused, color }) => <TabLabel focused={focused} color={color}>Clients</TabLabel>,
          }}
        />
        <Tabs.Screen
          name="admin/reports"
          options={{
            title: 'Reports',
            tabBarAccessibilityLabel: 'Reports',
            tabBarIcon: ({ color }) => (
              <TabIcon name={{ android: 'flag', ios: 'flag' }} color={color} size={size.tabIcon} />
            ),
            tabBarLabel: ({ focused, color }) => <TabLabel focused={focused} color={color}>Reports</TabLabel>,
          }}
        />
      </Tabs>
    </>
  );
}
