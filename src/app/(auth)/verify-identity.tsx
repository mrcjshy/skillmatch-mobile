import { useCallback, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppNotice } from '@/components/app-notice';
import { WorkerIdentitySection } from '@/components/worker-identity-section';
import { SkillMatchTheme } from '@/constants/theme';
import { IDENTITY_COPY } from '@/lib/worker-identity';
import { useAccount } from '@/providers/account-provider';

const { colors, type, spacing } = SkillMatchTheme.ui;

export default function VerifyIdentityScreen() {
  const insets = useSafeAreaInsets();
  const { refreshIdentity } = useAccount();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const handleSubmitted = useCallback(() => {
    void refreshIdentity();
  }, [refreshIdentity]);

  async function handleRetry() {
    if (isRetrying) return;
    setIsRetrying(true);
    try {
      await refreshIdentity();
      setLoadError(null);
    } catch {
      setLoadError(IDENTITY_COPY.loadFailed);
    } finally {
      setIsRetrying(false);
    }
  }

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.xxxl },
      ]}
    >
      <View style={styles.brand}>
        <Image
          source={require('@/assets/images/skillmatch-logo.png')}
          style={styles.brandLogo}
          accessibilityIgnoresInvertColors
        />
        <Text style={styles.brandName}>SkillMatch</Text>
      </View>
      <Text style={styles.heading}>Verify your identity</Text>
      <Text style={styles.note}>
        A valid ID is required before you can use the Worker app. After you
        submit, you may continue while an Administrator reviews it. There is no
        skip.
      </Text>

      {loadError ? (
        <View style={styles.retryBlock}>
          <AppNotice variant="danger" message={loadError} />
          <AppButton
            label="Try again"
            variant="secondary"
            onPress={() => {
              void handleRetry();
            }}
            loading={isRetrying}
          />
        </View>
      ) : null}

      <WorkerIdentitySection
        disabled={false}
        surface="onboarding"
        onSubmitted={handleSubmitted}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.gutter,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  brand: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  brandLogo: {
    width: 48,
    height: 48,
  },
  brandName: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  heading: {
    ...type.display,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  note: {
    ...type.helper,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  retryBlock: {
    gap: spacing.md,
  },
});
