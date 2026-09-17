import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { type Href, useRouter } from 'expo-router';

import { AppButton } from '@/components/app-button';
import { AppCard } from '@/components/app-card';
import { AppNotice } from '@/components/app-notice';
import { SectionHeader } from '@/components/section-header';
import { SkillMatchTheme } from '@/constants/theme';
import { CLIENT_HELP_PATH, presentClientProfile } from '@/lib/client-profile';
import { signOutCurrentUser } from '@/lib/sign-out';
import { useAccount } from '@/providers/account-provider';

const { colors, type, spacing, size } = SkillMatchTheme.ui;

export default function ClientProfile() {
  const router = useRouter();
  const { account } = useAccount();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const profile = presentClientProfile(account);

  async function handleSignOut() {
    if (isSigningOut) return;
    setSignOutError(null);
    setIsSigningOut(true);
    try {
      const { error } = await signOutCurrentUser();
      if (error) setSignOutError(error.message || 'Sign out failed. Please try again.');
    } catch {
      setSignOutError('Sign out failed. Please try again.');
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <AppCard>
        <View style={styles.identityHead}>
          <Text style={styles.identityName}>{profile.fullName}</Text>
          <Text style={styles.location}>{profile.location}</Text>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Phone</Text>
          <Text style={styles.value}>{profile.phone}</Text>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{profile.email}</Text>
        </View>
      </AppCard>

      <View style={styles.section}>
        <SectionHeader title="Tools / Support" />
        <AppCard>
          <View>
            <NavRow
              label="Help & FAQ"
              hint="Common questions"
              disabled={isSigningOut}
              onPress={() => router.push(CLIENT_HELP_PATH as Href)}
            />
            <NavRow
              label="My Reports"
              hint="Reports you submitted"
              disabled={isSigningOut}
              onPress={() => router.push('/client/my-reports' as unknown as Href)}
            />
            <NavRow
              label="Report an app issue"
              hint="Send an app issue report"
              disabled={isSigningOut}
              last
              onPress={() => router.push('/client/report-app' as unknown as Href)}
            />
          </View>
        </AppCard>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Account" />
        <AppButton
          label="Sign Out"
          variant="secondary"
          onPress={handleSignOut}
          loading={isSigningOut}
          disabled={isSigningOut}
        />
        {signOutError ? <AppNotice variant="danger" message={signOutError} /> : null}
      </View>
    </ScrollView>
  );
}

function NavRow({
  label,
  hint,
  disabled,
  last,
  onPress,
}: {
  label: string;
  hint: string;
  disabled: boolean;
  last?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.navRow,
        !last && styles.navRowBorder,
        disabled && styles.navDisabled,
        pressed && !disabled && styles.navPressed,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.navCopy}>
        <Text style={styles.navLabel}>{label}</Text>
        <Text style={styles.navHint}>{hint}</Text>
      </View>
      <Text style={styles.navChevron} accessibilityElementsHidden>
        ›
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    backgroundColor: colors.background,
    padding: spacing.gutter,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl + spacing.sm,
  },
  identityHead: {
    gap: spacing.xxs,
  },
  identityName: {
    ...type.screenTitle,
    color: colors.textPrimary,
  },
  location: {
    ...type.helper,
    color: colors.textSecondary,
  },
  field: {
    gap: spacing.xxs,
  },
  label: {
    ...type.helper,
    color: colors.textSecondary,
  },
  value: {
    ...type.body,
    color: colors.textPrimary,
  },
  section: {
    gap: spacing.md,
  },
  navRow: {
    minHeight: size.listRowMinHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  navRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  navPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  navDisabled: {
    opacity: 0.4,
  },
  navCopy: {
    flex: 1,
    gap: 2,
  },
  navLabel: {
    ...type.cardTitle,
    color: colors.textPrimary,
  },
  navHint: {
    ...type.helper,
    color: colors.textSecondary,
  },
  navChevron: {
    ...type.sectionTitle,
    color: colors.textSecondary,
  },
});
