import { Tabs } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Text, type ColorValue } from 'react-native';

import { NotificationBell } from '@/components/notification-bell';
import { SkillMatchTheme } from '@/constants/theme';
import { WorkerProfileProvider } from '@/providers/worker-profile-provider';

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

export default function WorkerTabsLayout() {
  return (
    <WorkerProfileProvider>
      <Tabs
        backBehavior="initialRoute"
        screenOptions={{
          headerRight: () => <NotificationBell role="worker" />,
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
          name="worker/index"
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
          name="worker/opportunities"
          options={{
            title: 'Jobs',
            tabBarIcon: ({ color }) => (
              <TabIcon name={{ android: 'work', ios: 'briefcase.fill' }} color={color} size={24} />
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
          name="worker/profile"
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
    </WorkerProfileProvider>
  );
}
