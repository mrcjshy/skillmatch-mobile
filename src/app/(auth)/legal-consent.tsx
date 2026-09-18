import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { SkillMatchTheme } from '@/constants/theme';
import {
  CONSENT_COPY,
  consentErrorCopy,
  hasRequiredLegalAcceptance,
  recordMyConsent,
} from '@/lib/user-consent';
import { useAccount } from '@/providers/account-provider';

const { colors, type, spacing } = SkillMatchTheme.ui;

export default function LegalConsentScreen() {
  const insets = useSafeAreaInsets();
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
      <Text style={styles.heading}>Terms and Privacy</Text>
      <Text style={styles.note}>
        Please review and accept both documents before using SkillMatch. Your
        consent is saved to your account, not to sign-in metadata.
      </Text>

      <View style={styles.form}>
        <View style={styles.consentRow}>
          <Pressable
            style={styles.checkboxHit}
            onPress={() => setAcceptedTerms((current) => !current)}
            disabled={isSubmitting}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acceptedTerms, disabled: isSubmitting }}
            accessibilityLabel="I agree to the Terms and Conditions"
          >
            <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>
              {acceptedTerms ? <Text style={styles.checkboxMark}>✓</Text> : null}
            </View>
          </Pressable>
          <Text style={styles.consentText}>
            I agree to the{' '}
            <Link href="/terms" style={styles.inlineLink}>
              Terms and Conditions
            </Link>
          </Text>
        </View>

        <View style={styles.consentRow}>
          <Pressable
            style={styles.checkboxHit}
            onPress={() => setAcknowledgedPrivacy((current) => !current)}
            disabled={isSubmitting}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acknowledgedPrivacy, disabled: isSubmitting }}
            accessibilityLabel="I acknowledge the Privacy Policy"
          >
            <View
              style={[styles.checkbox, acknowledgedPrivacy && styles.checkboxChecked]}
            >
              {acknowledgedPrivacy ? <Text style={styles.checkboxMark}>✓</Text> : null}
            </View>
          </Pressable>
          <Text style={styles.consentText}>
            I acknowledge the{' '}
            <Link href="/privacy" style={styles.inlineLink}>
              Privacy Policy
            </Link>
          </Text>
        </View>

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

        <AppButton
          label="Save and continue"
          onPress={() => {
            void handleSaveConsent();
          }}
          loading={isSubmitting}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.gutter,
    paddingBottom: spacing.xxl,
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
    marginTop: spacing.sm,
  },
  form: {
    marginTop: spacing.lg,
    gap: spacing.lg,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  checkboxHit: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
  },
  checkboxMark: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  consentText: {
    flex: 1,
    ...type.helper,
    color: colors.textPrimary,
  },
  inlineLink: {
    color: colors.primary,
    fontWeight: '700',
  },
  error: {
    ...type.helper,
    color: colors.danger,
  },
});
