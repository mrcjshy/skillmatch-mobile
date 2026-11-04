import { Stack, useRouter, type Href } from 'expo-router';
import { Pressable, Text } from 'react-native';

import WorkerPortfolio from '@/components/worker-portfolio';
import { SkillMatchTheme } from '@/constants/theme';
import { PORTFOLIO_COPY } from '@/lib/portfolio';

const { colors, type, spacing } = SkillMatchTheme.ui;

/**
 * Worker text portfolio (R5D-1).
 *
 * Worker-only by construction: the route lives inside the already-protected
 * (worker) group. Items are the Worker's own `portfolio_items` rows keyed by
 * `worker_profiles.id`. Resume already reads those text fields. The header's
 * Files button opens the same projects as the Contact File Stack.
 */
export default function WorkerPortfolioScreen() {
  const router = useRouter();
  return (
    <>
      <Stack.Screen
        options={{
          title: PORTFOLIO_COPY.title,
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open portfolio files"
              hitSlop={12}
              onPress={() => router.push('/worker/portfolio-files' as Href)}
              style={{ paddingHorizontal: spacing.sm, minHeight: 48, justifyContent: 'center' }}
            >
              <Text style={{ ...type.label, color: colors.accent }}>Files</Text>
            </Pressable>
          ),
        }}
      />
      <WorkerPortfolio />
    </>
  );
}
