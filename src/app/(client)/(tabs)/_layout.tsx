import { Tabs } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Text, type ColorValue } from 'react-native';

import { NotificationBell } from '@/components/notification-bell';
import { SkillMatchTheme } from '@/constants/theme';
import { ClientJobsProvider } from '@/providers/client-jobs-provider';

const { colors } = SkillMatchTheme.ui;
const ACTIVE_COLOR = colors.primary;
const INACTIVE_COLOR = colors.textDisabled;

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
  return (
    <Text style={{ color, fontSize: 11, fontWeight: focused ? '700' : '400' }}>{children}</Text>
  );
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
          tabBarStyle: {
            backgroundColor: colors.background,
            borderTopWidth: 0,
          },
          sceneStyle: { backgroundColor: SkillMatchTheme.brand.background },
        }}
      >
        <Tabs.Screen
          name="client/index"
          options={{
            title: 'Home',
            headerShown: false,
            tabBarIcon: ({ color }) => (
              <TabIcon name={{ android: 'home', ios: 'house.fill' }} color={color} size={24} />
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
            tabBarIcon: ({ color }) => (
              <TabIcon
                name={{ android: 'list_alt', ios: 'list.bullet.rectangle' }}
                color={color}
                size={24}
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
            tabBarIcon: ({ color }) => (
              <TabIcon
                name={{ android: 'event_list', ios: 'calendar' }}
                color={color}
                size={24}
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
            tabBarIcon: ({ color }) => (
              <TabIcon name={{ android: 'person', ios: 'person.fill' }} color={color} size={24} />
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
