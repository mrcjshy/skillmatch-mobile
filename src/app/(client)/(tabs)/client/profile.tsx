import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { type Href, useRouter } from 'expo-router';

import { AppButton } from '@/components/app-button';
import { AppNotice } from '@/components/app-notice';
import { FactRow } from '@/components/fact-row';
import { NavRow } from '@/components/nav-row';
import { SectionHeader } from '@/components/section-header';
import { SurfaceGroup } from '@/components/surface-group';
import { SkillMatchTheme } from '@/constants/theme';
import { CLIENT_HELP_PATH, presentClientProfile } from '@/lib/client-profile';
import { signOutCurrentUser } from '@/lib/sign-out';
import { useAccount } from '@/providers/account-provider';

const { colors, type, spacing } = SkillMatchTheme.ui;

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
      <View style={styles.identityHead}>
        <Text style={styles.label}>Client account</Text>
        <Text selectable accessibilityRole="header" style={styles.identityName}>{profile.fullName}</Text>
        <Text selectable style={styles.location}>{profile.location}</Text>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Account information" />
        <SurfaceGroup>
          <FactRow icon={{ android: 'phone', ios: 'phone' }} label="Phone" value={profile.phone} selectable />
          <FactRow icon={{ android: 'mail_outline', ios: 'envelope' }} label="Email" value={profile.email} selectable />
        </SurfaceGroup>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Support and reports" />
        <SurfaceGroup inset={spacing.lg}>
          <NavRow
            label="Help and FAQ"
            hint="Common questions"
            icon={{ android: 'help_outline', ios: 'questionmark.circle' }}
            disabled={isSigningOut}
            onPress={() => router.push(CLIENT_HELP_PATH as Href)}
          />
          <NavRow
            label="My reports"
            hint="Reports you submitted"
            icon={{ android: 'flag', ios: 'flag' }}
            disabled={isSigningOut}
            onPress={() => router.push('/client/my-reports' as unknown as Href)}
          />
          <NavRow
            label="Report an app issue"
            hint="Send an app issue report"
            icon={{ android: 'warning', ios: 'exclamationmark.triangle' }}
            disabled={isSigningOut}
            onPress={() => router.push('/client/report-app' as unknown as Href)}
          />
        </SurfaceGroup>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Legal" />
        <SurfaceGroup inset={spacing.lg}>
          <NavRow
            label="Terms and conditions"
            hint="Draft — not final legal text"
            icon={{ android: 'description', ios: 'doc.text' }}
            disabled={isSigningOut}
            onPress={() => router.push('/client/terms' as Href)}
          />
          <NavRow
            label="Privacy policy"
            hint="Draft — not final legal text"
            icon={{ android: 'lock', ios: 'lock' }}
            disabled={isSigningOut}
            onPress={() => router.push('/client/privacy' as Href)}
          />
        </SurfaceGroup>
      </View>

      <View style={styles.section}>
        <AppButton
          label="Sign out"
          variant="secondary"
          icon={{ android: 'logout', ios: 'rectangle.portrait.and.arrow.right' }}
          onPress={handleSignOut}
          loading={isSigningOut}
          disabled={isSigningOut}
        />
        {signOutError ? <AppNotice variant="danger" message={signOutError} /> : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  content: {
    flexGrow: 1,
    backgroundColor: colors.canvas,
    padding: spacing.gutter,
    gap: spacing.xl,
    paddingBottom: spacing.xxxxl,
  },
  identityHead: {
    gap: spacing.xxs,
  },
  identityName: {
    ...type.screenTitle,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  location: {
    ...type.helper,
    color: colors.textSecondary,
  },
  label: {
    ...type.helper,
    color: colors.textSecondary,
  },
  section: {
    gap: spacing.md,
  },
});
