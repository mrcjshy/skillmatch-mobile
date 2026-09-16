import { Link } from 'expo-router';
import { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppField } from '@/components/app-field';
import { SkillMatchTheme } from '@/constants/theme';
import {
  RECOVERY_REDIRECT_TO,
  RECOVERY_SUCCESS_COPY,
  RECOVERY_TECHNICAL_FAILURE_COPY,
  hasMinimalEmailSyntax,
  isExistenceSensitiveResetError,
} from '@/lib/auth-recovery';
import { supabase } from '@/lib/supabase';

const { colors, type, spacing } = SkillMatchTheme.ui;

/**
 * Signed-out recovery request only. Does not reveal whether the email exists.
 */
export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSendRecoveryInstructions() {
    if (isSubmitting) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage('Please enter your email.');
      return;
    }
    if (!hasMinimalEmailSyntax(trimmedEmail)) {
      setErrorMessage('Please enter a valid email.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: RECOVERY_REDIRECT_TO,
      });
      if (error === null || isExistenceSensitiveResetError(error)) {
        setSuccessMessage(RECOVERY_SUCCESS_COPY);
      } else {
        setErrorMessage(RECOVERY_TECHNICAL_FAILURE_COPY);
      }
    } catch {
      setErrorMessage(RECOVERY_TECHNICAL_FAILURE_COPY);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior="padding"
    >
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
        <Text style={styles.heading}>Forgot Password</Text>
        <Text style={styles.status}>Enter your email to request password recovery instructions.</Text>

        <View style={styles.form}>
          <AppField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            disabled={isSubmitting}
            accessibilityLabel="Email"
          />

          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
          {successMessage ? <Text style={styles.success}>{successMessage}</Text> : null}

          <AppButton
            label="Send Recovery Instructions"
            onPress={handleSendRecoveryInstructions}
            loading={isSubmitting}
          />

          <Link href="/login" style={styles.link}>
            Back to Sign In
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
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
    width: 56,
    height: 56,
  },
  brandName: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  heading: {
    ...type.display,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  status: {
    ...type.helper,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  form: {
    marginTop: spacing.lg,
    gap: spacing.lg,
  },
  error: {
    ...type.helper,
    color: colors.danger,
  },
  success: {
    ...type.helper,
    color: colors.success,
  },
  link: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 20,
    color: colors.primary,
    textAlign: 'center',
    paddingVertical: 12,
  },
});
