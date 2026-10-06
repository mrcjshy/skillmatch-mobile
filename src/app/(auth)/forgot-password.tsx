import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppField } from '@/components/app-field';
import { AuthLink, AuthScreen, useAuthScroll } from '@/components/auth-screen';
import { FormMessage } from '@/components/form-message';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import {
  RECOVERY_REDIRECT_TO,
  RECOVERY_SUCCESS_COPY,
  RECOVERY_TECHNICAL_FAILURE_COPY,
  hasMinimalEmailSyntax,
  isExistenceSensitiveResetError,
} from '@/lib/auth-recovery';
import { supabase } from '@/lib/supabase';

/**
 * Signed-out recovery request only. Does not reveal whether the email exists.
 */
export default function ForgotPasswordScreen() {
  const styles = createStyles(useUiTheme());
  const { scrollRef, focusField } = useAuthScroll();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const emailRef = useRef<TextInput>(null);

  async function handleSendRecoveryInstructions() {
    if (isSubmitting) return;

    setFieldError(null);
    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setFieldError('Please enter your email.');
      focusField(emailRef);
      return;
    }
    if (!hasMinimalEmailSyntax(trimmedEmail)) {
      setFieldError('Please enter a valid email.');
      focusField(emailRef);
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
    <AuthScreen
      scrollRef={scrollRef}
      title="Reset your password"
      description="Enter your email and we will send you instructions to reset your password."
    >
      <View style={styles.form}>
        <AppField
          inputRef={emailRef}
          label="Email"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setFieldError(null);
          }}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          disabled={isSubmitting}
          errorText={fieldError ?? undefined}
          accessibilityLabel="Email"
        />

        {errorMessage ? <FormMessage tone="error" message={errorMessage} /> : null}
        {successMessage ? <FormMessage tone="success" message={successMessage} /> : null}

        <View style={styles.actions}>
          <AppButton
            label="Send recovery instructions"
            onPress={handleSendRecoveryInstructions}
            loading={isSubmitting}
          />
          <AuthLink href="/login">Back to sign in</AuthLink>
        </View>
      </View>
    </AuthScreen>
  );
}

function createStyles(ui: UiTheme) {
  const { spacing } = ui;
  return StyleSheet.create({
    form: { gap: spacing.lg },
    actions: { gap: spacing.xs },
  });
}
