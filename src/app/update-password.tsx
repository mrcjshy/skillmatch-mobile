import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type TextInput } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AuthScreen, useAuthScroll } from '@/components/auth-screen';
import { FormMessage } from '@/components/form-message';
import { PasswordField } from '@/components/password-field';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import {
  RECOVERY_INVALID_LINK_COPY,
  RECOVERY_PASSWORD_MIN_LENGTH,
  isRecoveryPasswordUpdateAllowed,
} from '@/lib/auth-recovery';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

type FieldError = { field: 'newPassword' | 'confirmPassword'; message: string };

/**
 * Recovery-only password update. The form submits only when SessionProvider
 * has bound recovery authorization to the current session user id.
 */
export default function UpdatePasswordScreen() {
  const ui = useUiTheme();
  const { colors } = ui;
  const styles = createStyles(ui);
  const { scrollRef, focusField } = useAuthScroll();
  const {
    session,
    recoveryStatus,
    recoveryUserId,
    recoveryError,
    canUpdateRecoveryPassword,
    clearRecoveryAuthorization,
    markRecoveryPasswordUpdated,
  } = useSession();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<FieldError | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const newPasswordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  const showForm = canUpdateRecoveryPassword;
  const showProcessing = recoveryStatus === 'processing';
  const showComplete = recoveryStatus === 'complete';
  const showInvalid = recoveryStatus === 'error' || (!showForm && !showProcessing && !showComplete);

  const title = showComplete
    ? 'Password updated'
    : showForm
      ? 'Choose a new password'
      : showProcessing
        ? 'Checking your link'
        : 'Link not valid';

  async function handleUpdatePassword() {
    if (isSubmitting) return;

    setFieldError(null);
    setErrorMessage(null);

    if (!newPassword) {
      setFieldError({ field: 'newPassword', message: 'Please enter a new password.' });
      focusField(newPasswordRef);
      return;
    }
    if (newPassword.length < RECOVERY_PASSWORD_MIN_LENGTH) {
      setFieldError({
        field: 'newPassword',
        message: `Password must be at least ${RECOVERY_PASSWORD_MIN_LENGTH} characters.`,
      });
      focusField(newPasswordRef);
      return;
    }
    if (!confirmPassword) {
      setFieldError({ field: 'confirmPassword', message: 'Please confirm your new password.' });
      focusField(confirmPasswordRef);
      return;
    }
    if (newPassword !== confirmPassword) {
      setFieldError({ field: 'confirmPassword', message: 'Passwords do not match.' });
      focusField(confirmPasswordRef);
      return;
    }

    if (!isRecoveryPasswordUpdateAllowed(recoveryStatus, recoveryUserId, session)) {
      setErrorMessage(RECOVERY_INVALID_LINK_COPY);
      return;
    }

    setIsSubmitting(true);
    try {
      if (!isRecoveryPasswordUpdateAllowed(recoveryStatus, recoveryUserId, session)) {
        setErrorMessage(RECOVERY_INVALID_LINK_COPY);
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        setErrorMessage('Unable to update your password right now. Please try again later.');
        return;
      }

      setNewPassword('');
      setConfirmPassword('');
      markRecoveryPasswordUpdated();
    } catch {
      setErrorMessage('Unable to update your password right now. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthScreen scrollRef={scrollRef} title={title}>
      {showProcessing ? (
        <View style={styles.checking} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.checkingText}>Checking recovery link…</Text>
        </View>
      ) : null}

      {showComplete ? (
        <View style={styles.block}>
          <FormMessage tone="success" message="Your password has been updated." />
          <AppButton label="Continue" onPress={clearRecoveryAuthorization} />
        </View>
      ) : null}

      {showInvalid ? (
        <View style={styles.block}>
          <FormMessage tone="error" message={recoveryError ?? RECOVERY_INVALID_LINK_COPY} />
          <AppButton label="Continue" onPress={clearRecoveryAuthorization} />
        </View>
      ) : null}

      {showForm ? (
        <View style={styles.block}>
          <PasswordField
            inputRef={newPasswordRef}
            label="New password"
            value={newPassword}
            onChangeText={(value) => {
              setNewPassword(value);
              setFieldError((current) => (current?.field === 'newPassword' ? null : current));
            }}
            autoComplete="new-password"
            textContentType="newPassword"
            disabled={isSubmitting}
            helperText={`At least ${RECOVERY_PASSWORD_MIN_LENGTH} characters.`}
            errorText={fieldError?.field === 'newPassword' ? fieldError.message : undefined}
            accessibilityLabel="New password"
          />

          <PasswordField
            inputRef={confirmPasswordRef}
            label="Confirm new password"
            value={confirmPassword}
            onChangeText={(value) => {
              setConfirmPassword(value);
              setFieldError((current) => (current?.field === 'confirmPassword' ? null : current));
            }}
            autoComplete="new-password"
            textContentType="newPassword"
            disabled={isSubmitting}
            errorText={fieldError?.field === 'confirmPassword' ? fieldError.message : undefined}
            accessibilityLabel="Confirm new password"
          />

          {errorMessage ? <FormMessage tone="error" message={errorMessage} /> : null}

          <AppButton label="Update password" onPress={handleUpdatePassword} loading={isSubmitting} />
        </View>
      ) : null}
    </AuthScreen>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing } = ui;
  return StyleSheet.create({
    block: { gap: spacing.lg },
    checking: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    checkingText: { ...type.body, color: colors.textSecondary, flex: 1 },
  });
}
