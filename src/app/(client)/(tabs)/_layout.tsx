import { Tabs } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Text, type ColorValue } from 'react-native';

import { NotificationBell } from '@/components/notification-bell';
import { ClientJobsProvider } from '@/providers/client-jobs-provider';

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

export default function ClientTabsLayout() {
  return (
    <ClientJobsProvider>
      <Tabs
        backBehavior="initialRoute"
        screenOptions={{
          headerRight: () => <NotificationBell role="client" />,
          tabBarActiveTintColor: ACTIVE_COLOR,
          tabBarInactiveTintColor: INACTIVE_COLOR,
        }}
      >
        <Tabs.Screen
          name="client/index"
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
          name="client/jobs"
          options={{
            title: 'My Jobs',
            tabBarIcon: ({ color, size }) => (
              <TabIcon
                name={{ android: 'list_alt', ios: 'list.bullet.rectangle' }}
                color={color}
                size={size}
              />
            ),
            tabBarLabel: ({ focused, color }) => (
              <TabLabel focused={focused} color={color}>My Jobs</TabLabel>
            ),
          }}
        />
        <Tabs.Screen
          name="client/bookings"
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
          name="client/profile"
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
    </ClientJobsProvider>
  );
}
