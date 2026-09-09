import { Tabs } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Text, type ColorValue } from 'react-native';

import { NotificationBell } from '@/components/notification-bell';
import { WorkerProfileProvider } from '@/providers/worker-profile-provider';

const ACTIVE_COLOR = '#1d4ed8';
const INACTIVE_COLOR = '#64748b';

function TabIcon({
  name,
  color,
  size,
}: {
  name: SymbolViewProps['name'];
  color: ColorValue;
  size: number;
}) {
  return <SymbolView name={name} size={size} tintColor={color} />;
}

function TabLabel({
  focused,
  color,
  children,
}: {
  focused: boolean;
  color: ColorValue;
  children: string;
}) {
  return <Text style={{ color, fontSize: 12, fontWeight: focused ? '700' : '400' }}>{children}</Text>;
}

export default function WorkerTabsLayout() {
  return (
    <WorkerProfileProvider>
      <Tabs
        backBehavior="initialRoute"
        screenOptions={{
          headerRight: () => <NotificationBell role="worker" />,
          tabBarActiveTintColor: ACTIVE_COLOR,
          tabBarInactiveTintColor: INACTIVE_COLOR,
        }}
      >
        <Tabs.Screen
          name="worker/index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size }) => (
              <TabIcon name={{ android: 'home', ios: 'house.fill' }} color={color} size={size} />
            ),
            tabBarLabel: ({ focused, color }) => (
              <TabLabel focused={focused} color={color}>Home</TabLabel>
            ),
          }}
        />
        <Tabs.Screen
          name="worker/opportunities"
          options={{
            title: 'Jobs',
            tabBarIcon: ({ color, size }) => (
              <TabIcon name={{ android: 'work', ios: 'briefcase.fill' }} color={color} size={size} />
            ),
            tabBarLabel: ({ focused, color }) => (
              <TabLabel focused={focused} color={color}>Jobs</TabLabel>
            ),
          }}
        />
        <Tabs.Screen
          name="worker/bookings"
          options={{
            title: 'Bookings',
            tabBarIcon: ({ color, size }) => (
              <TabIcon
                name={{ android: 'event_list', ios: 'calendar' }}
                color={color}
                size={size}
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
            tabBarIcon: ({ color, size }) => (
              <TabIcon name={{ android: 'person', ios: 'person.fill' }} color={color} size={size} />
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
