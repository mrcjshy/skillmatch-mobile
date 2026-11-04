import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AuthScreen } from '@/components/auth-screen';
import { FormMessage } from '@/components/form-message';
import { ProfileDetailsForm } from '@/components/profile-details-form';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import { markClientOnboardingPending } from '@/lib/client-onboarding';
import { signOutCurrentUser } from '@/lib/sign-out';
import { useAccount } from '@/providers/account-provider';
import { useProfileGate } from '@/providers/profile-gate-provider';
import { useSession } from '@/providers/session-provider';

/**
 * REG-01 required step after sign-up (and once for existing accounts): Workers build their lean
 * resume before ID verification; Clients add their name parts and home address.
 */
export default function CompleteProfileScreen() {
  const styles = createStyles(useUiTheme());
  const router = useRouter();
  const { account } = useAccount();
  const metadata = (useSession().session?.user.user_metadata ?? {}) as Record<string, unknown>;
  const { refreshProfileGate } = useProfileGate();
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const role = account?.role === 'worker' || account?.role === 'client' ? account.role : null;

  return (
    <AuthScreen
      title={role === 'worker' ? 'Build your resume' : 'Complete your profile'}
      description={role === 'worker'
        ? 'Clients and SkillMatch Administrators use this to know your work. It takes about three minutes, and you can edit it later from your Profile.'
        : 'Tell us who you are and where you live. You can edit this later from your Profile.'}
      brand={false}
    >
      {account && role ? (
        <ProfileDetailsForm
          userId={account.id}
          role={role}
          nameHint={{ firstName: metadata.registration_first_name, lastName: metadata.registration_last_name }}
          submitLabel={role === 'worker' ? 'Save and continue to ID check' : 'Save and continue'}
          onSaved={async () => {
            // A Client sees the how-to-post walkthrough once, on arrival at Home.
            if (role === 'client') markClientOnboardingPending(account.id);
            await refreshProfileGate();
            router.replace('/');
          }}
        />
      ) : null}
      <View style={styles.signOut}>
        {signOutError ? <FormMessage tone="error" message={signOutError} /> : null}
        <AppButton
          variant="ghost"
          label="Sign out"
          onPress={() => {
            setSignOutError(null);
            void signOutCurrentUser().catch(() => ({ error: { message: 'Sign out failed. Please try again.' } })).then(({ error }) => {
              if (error) setSignOutError(error.message || 'Sign out failed. Please try again.');
            });
          }}
        />
      </View>
    </AuthScreen>
  );
}

function createStyles(ui: UiTheme) {
  return StyleSheet.create({ signOut: { gap: ui.spacing.sm, paddingTop: ui.spacing.lg } });
}
