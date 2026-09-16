import { useState } from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppField } from '@/components/app-field';
import { InlineStatus } from '@/components/inline-status';
import { SkillMatchTheme } from '@/constants/theme';
import {
  RECOVERY_INVALID_LINK_COPY,
  RECOVERY_PASSWORD_MIN_LENGTH,
  isRecoveryPasswordUpdateAllowed,
} from '@/lib/auth-recovery';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

const { colors, type, spacing } = SkillMatchTheme.ui;

/**
 * Recovery-only password update. The form submits only when SessionProvider
 * has bound recovery authorization to the current session user id.
 */
export default function UpdatePasswordScreen() {
  const insets = useSafeAreaInsets();
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const showForm = canUpdateRecoveryPassword;
  const showProcessing = recoveryStatus === 'processing';
  const showComplete = recoveryStatus === 'complete';
  const showInvalid = recoveryStatus === 'error' || (!showForm && !showProcessing && !showComplete);

  async function handleUpdatePassword() {
    if (isSubmitting) return;

    setErrorMessage(null);

    if (!newPassword) {
      setErrorMessage('Please enter a new password.');
      return;
    }
    if (newPassword.length < RECOVERY_PASSWORD_MIN_LENGTH) {
      setErrorMessage(`Password must be at least ${RECOVERY_PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (!confirmPassword) {
      setErrorMessage('Please confirm your new password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
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
    <KeyboardAvoidingView
      style={[styles.flex, styles.canvas]}
      behavior="padding"
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xxxl },
        ]}
      >
        <Text style={styles.heading}>Update Password</Text>

        {showProcessing ? (
          <InlineStatus variant="loading" message="Checking recovery link…" />
        ) : null}

        {showComplete ? (
          <>
            <InlineStatus variant="note" message="Your password has been updated." />
            <AppButton label="Continue" onPress={clearRecoveryAuthorization} />
          </>
        ) : null}

        {showInvalid ? (
          <>
            <InlineStatus
              variant="error"
              message={recoveryError ?? RECOVERY_INVALID_LINK_COPY}
            />
            <AppButton label="Continue" onPress={clearRecoveryAuthorization} />
          </>
        ) : null}

        {showForm ? (
          <View style={styles.form}>
            <AppField
              label="New Password"
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="New password"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              disabled={isSubmitting}
              accessibilityLabel="New Password"
            />

            <AppField
              label="Confirm New Password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm new password"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              disabled={isSubmitting}
              accessibilityLabel="Confirm New Password"
            />

            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

            <AppButton
              label="Update Password"
              onPress={handleUpdatePassword}
              loading={isSubmitting}
            />
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  canvas: {
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.gutter,
    paddingBottom: spacing.xxl,
  },
  heading: {
    ...type.display,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  form: {
    marginTop: spacing.lg,
    gap: spacing.lg,
  },
  error: {
    ...type.helper,
    color: colors.danger,
    textAlign: 'center',
  },
});
