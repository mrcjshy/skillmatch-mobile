import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AuthScreen } from '@/components/auth-screen';
import { ConsentCheck } from '@/components/consent-check';
import { FormMessage } from '@/components/form-message';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import {
  CONSENT_COPY,
  consentErrorCopy,
  hasRequiredLegalAcceptance,
  recordMyConsent,
} from '@/lib/user-consent';
import { useAccount } from '@/providers/account-provider';

export default function LegalConsentScreen() {
  const styles = createStyles(useUiTheme());
  const router = useRouter();
  const { refreshConsent } = useAccount();
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acknowledgedPrivacy, setAcknowledgedPrivacy] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSaveConsent() {
    if (isSubmitting) return;
    setErrorMessage(null);
    if (!hasRequiredLegalAcceptance(acceptedTerms, acknowledgedPrivacy)) {
      setErrorMessage(CONSENT_COPY.required);
      return;
    }

    setIsSubmitting(true);
    try {
      await recordMyConsent();
      await refreshConsent();
      router.replace('/');
    } catch (error: unknown) {
      setErrorMessage(consentErrorCopy(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthScreen
      title="Terms and privacy"
      description="Please review and accept both documents before using SkillMatch. Your consent is saved to your account, not to sign-in metadata."
      brand={false}
      stickyFooter={
        <>
          {errorMessage ? <FormMessage tone="error" message={errorMessage} /> : null}
          <AppButton
            label="Save and continue"
            onPress={() => {
              void handleSaveConsent();
            }}
            loading={isSubmitting}
          />
        </>
      }
    >
      <View style={styles.consents}>
        <ConsentCheck
          checked={acceptedTerms}
          onToggle={() => setAcceptedTerms((current) => !current)}
          disabled={isSubmitting}
          accessibilityLabel="I agree to the Terms and Conditions"
          lead="I agree to the"
          linkLabel="Terms and Conditions"
          href="/terms"
        />
        <ConsentCheck
          checked={acknowledgedPrivacy}
          onToggle={() => setAcknowledgedPrivacy((current) => !current)}
          disabled={isSubmitting}
          accessibilityLabel="I acknowledge the Privacy Policy"
          lead="I acknowledge the"
          linkLabel="Privacy Policy"
          href="/privacy"
        />
      </View>
    </AuthScreen>
  );
}

function createStyles(ui: UiTheme) {
  const { spacing } = ui;
  return StyleSheet.create({
    consents: { gap: spacing.xs },
  });
}
