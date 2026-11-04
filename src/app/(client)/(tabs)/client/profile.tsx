import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { type Href, useFocusEffect, useRouter } from 'expo-router';

import { AppButton } from '@/components/app-button';
import { AppNotice } from '@/components/app-notice';
import { FactRow } from '@/components/fact-row';
import { NavRow } from '@/components/nav-row';
import { ProfileFooter, ProfileHero } from '@/components/profile-hero';
import { ProfileQuickActions } from '@/components/profile-quick-actions';
import { SectionHeader } from '@/components/section-header';
import { SurfaceGroup } from '@/components/surface-group';
import { SkillMatchTheme } from '@/constants/theme';
import { CLIENT_ONBOARDING_PATH } from '@/lib/client-onboarding';
import { CLIENT_HELP_PATH, presentClientProfile } from '@/lib/client-profile';
import { loadMyHomeLocation } from '@/lib/profile-details';
import { signOutCurrentUser } from '@/lib/sign-out';
import { useAccount } from '@/providers/account-provider';
import { useClientJobs } from '@/providers/client-jobs-provider';
import { useClientPostJobDraft } from '@/providers/client-post-job-draft-provider';

const { colors, spacing } = SkillMatchTheme.ui;

export default function ClientProfile() {
  const router = useRouter();
  const { account } = useAccount();
  const { isLoading: isLoadingJobs, loadError: jobsError, jobs } = useClientJobs();
  const { isPosting, isOwnerCurrent } = useClientPostJobDraft();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [homePin, setHomePin] = useState<{ owner: string; pinned: boolean } | null>(null);
  const profile = presentClientProfile(account);
  const clientId = account?.role === 'client' && account.is_active ? account.id : null;
  const openJobs = jobs.filter((job) => job.status === 'open').length;
  const pinned = homePin && homePin.owner === clientId ? homePin.pinned : null;
  // Same guard as the bar's central Post a job action.
  const postBlocked = isSigningOut || isPosting || !isOwnerCurrent();

  // The home pin can change in Your details, so it is read again each time Profile is shown.
  useFocusEffect(useCallback(() => {
    if (!clientId) return undefined;
    let cancelled = false;
    loadMyHomeLocation(clientId)
      .then((location) => { if (!cancelled) setHomePin({ owner: clientId, pinned: location !== null }); })
      .catch(() => { if (!cancelled) setHomePin(null); });
    return () => { cancelled = true; };
  }, [clientId]));

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
      <ProfileHero
        name={profile.fullName}
        role="Client"
        badges={[{ label: profile.location, accessibilityLabel: `Area: ${profile.location}`, icon: { android: 'location_on', ios: 'mappin' }, selectable: true }]}
        stats={[
          { label: 'Open jobs', value: isLoadingJobs || jobsError ? null : String(openJobs) },
          { label: 'Home pin', value: pinned === null ? null : pinned ? 'Set' : 'Not set' },
        ]}
        action={{
          label: 'Edit details',
          icon: { android: 'edit', ios: 'pencil' },
          disabled: isSigningOut,
          onPress: () => router.push('/client/details' as unknown as Href),
        }}
      />

      <View style={styles.section}>
        <SectionHeader title="Quick actions" />
        <ProfileQuickActions
          actions={[
            {
              label: 'Post a job',
              hint: 'Get help with a task',
              icon: { android: 'add', ios: 'plus' },
              disabled: postBlocked,
              onPress: () => { if (!isPosting && isOwnerCurrent()) router.push('/client/post-job' as Href); },
            },
            { label: 'How to post a job', hint: 'A short walkthrough', icon: { android: 'route', ios: 'map' }, disabled: isSigningOut, onPress: () => router.push(CLIENT_ONBOARDING_PATH as Href) },
            { label: 'Your details', hint: 'Name and home address', icon: { android: 'badge', ios: 'person.text.rectangle' }, disabled: isSigningOut, onPress: () => router.push('/client/details' as unknown as Href) },
            { label: 'Help and FAQ', hint: 'Common questions', icon: { android: 'help_outline', ios: 'questionmark.circle' }, disabled: isSigningOut, onPress: () => router.push(CLIENT_HELP_PATH as Href) },
          ]}
        />
      </View>

      <View style={styles.section}>
        <SectionHeader title="Contact" />
        <SurfaceGroup>
          <FactRow icon={{ android: 'phone', ios: 'phone' }} label="Phone" value={profile.phone} selectable />
          <FactRow icon={{ android: 'mail_outline', ios: 'envelope' }} label="Email" value={profile.email} selectable />
        </SurfaceGroup>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Support" />
        <SurfaceGroup inset={spacing.lg}>
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

      <ProfileFooter />
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
  section: {
    gap: spacing.md,
  },
});
