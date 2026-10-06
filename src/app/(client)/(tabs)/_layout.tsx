import { Tabs } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Text, type ColorValue } from 'react-native';

import { NotificationBell } from '@/components/notification-bell';
import { SkillMatchTheme } from '@/constants/theme';

const { colors, type, size } = SkillMatchTheme.ui;
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
    <Text style={{ ...type.caption, color, fontWeight: focused ? '700' : '400' }}>{children}</Text>
  );
}

export default function ClientTabsLayout() {
  return (
      <Tabs
        backBehavior="initialRoute"
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          headerRight: () => <NotificationBell role="client" />,
          tabBarActiveTintColor: ACTIVE_COLOR,
          tabBarInactiveTintColor: INACTIVE_COLOR,
          tabBarStyle: {
            backgroundColor: colors.background,
            borderTopWidth: 0,
          },
          sceneStyle: { backgroundColor: colors.background },
        }}
      >
        <Tabs.Screen
          name="client/index"
          options={{
            title: 'Home',
            tabBarAccessibilityLabel: 'Home',
            headerShown: true,
            tabBarIcon: ({ color }) => (
              <TabIcon name={{ android: 'home', ios: 'house.fill' }} color={color} size={size.tabIcon} />
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
            tabBarAccessibilityLabel: 'My Jobs',
            tabBarIcon: ({ color }) => (
              <TabIcon
                name={{ android: 'list_alt', ios: 'list.bullet.rectangle' }}
                color={color}
                size={size.tabIcon}
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
            tabBarAccessibilityLabel: 'Bookings',
            tabBarIcon: ({ color }) => (
              <TabIcon
                name={{ android: 'event_list', ios: 'calendar' }}
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
          name="client/profile"
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
  );
}
