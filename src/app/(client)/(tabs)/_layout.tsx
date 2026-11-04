import { Tabs, useRouter, type Href } from 'expo-router';
import { TabIcon, TabLabel, useAppTabScreenOptions } from '@/components/app-tab-bar';
import { ClientTabBar } from '@/components/client-tab-bar';
import { useFloatingTabBar } from '@/components/floating-tab-bar';
import { SkillMatchTheme } from '@/constants/theme';
import { useClientPostJobDraft } from '@/providers/client-post-job-draft-provider';

const { size } = SkillMatchTheme.ui;

// Home owns its own sticky header (name, bell), so it has no navigator header. Post a job is the
// bar's central circular action (Wave 7), not a tab: it pushes the existing Post Job flow, guarded
// by the current draft owner. Catalog readiness is handled inside Job details.
export default function ClientTabsLayout() {
  const baseOptions = useAppTabScreenOptions();
  const floating = useFloatingTabBar();
  const screenOptions = { ...baseOptions, sceneStyle: [baseOptions.sceneStyle, floating.sceneStyle] };
  const router = useRouter();
  const { isPosting, isOwnerCurrent } = useClientPostJobDraft();
  const postDisabled = isPosting || !isOwnerCurrent();
  return (
      <Tabs
        backBehavior="initialRoute"
        screenOptions={screenOptions}
        tabBar={(props) => (
          <ClientTabBar
            {...props}
            onHeight={floating.onHeight}
            postDisabled={postDisabled}
            posting={isPosting}
            onPostJob={() => { if (!postDisabled && isOwnerCurrent()) router.push('/client/post-job' as Href); }}
          />
        )}
      >
        <Tabs.Screen
          name="client/index"
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
          name="client/jobs"
          options={{
            title: 'My jobs',
            tabBarAccessibilityLabel: 'My jobs',
            tabBarIcon: ({ color }) => (
              <TabIcon
                name={{ android: 'list_alt', ios: 'list.bullet.rectangle' }}
                color={color}
                size={size.tabIcon}
                plain
              />
            ),
            tabBarLabel: ({ focused, color }) => (
              <TabLabel focused={focused} color={color}>My jobs</TabLabel>
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
          name="client/profile"
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
  );
}
