import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { SkillMatchTheme } from '@/constants/theme';
import {
  RECOVERY_INVALID_LINK_COPY,
  RECOVERY_PASSWORD_MIN_LENGTH,
  isRecoveryPasswordUpdateAllowed,
} from '@/lib/auth-recovery';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

/**
 * Recovery-only password update. The form submits only when SessionProvider
 * has bound recovery authorization to the current session user id.
 */
export default function UpdatePasswordScreen() {
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
    <View style={styles.container}>
      <Text style={styles.heading}>Update Password</Text>

      {showProcessing ? (
        <>
          <Text style={styles.note}>Checking recovery link…</Text>
          <ActivityIndicator />
        </>
      ) : null}

      {showComplete ? (
        <>
          <Text style={styles.success}>Your password has been updated.</Text>
          <Pressable
            style={styles.button}
            onPress={clearRecoveryAuthorization}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>Continue</Text>
          </Pressable>
        </>
      ) : null}

      {showInvalid ? (
        <>
          <Text style={styles.error}>{recoveryError ?? RECOVERY_INVALID_LINK_COPY}</Text>
          <Pressable
            style={styles.button}
            onPress={clearRecoveryAuthorization}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>Continue</Text>
          </Pressable>
        </>
      ) : null}

      {showForm ? (
        <View style={styles.form}>
          <Text style={styles.label}>New Password</Text>
          <TextInput
            style={styles.input}
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="New password"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isSubmitting}
            accessibilityLabel="New Password"
          />

          <Text style={styles.label}>Confirm New Password</Text>
          <TextInput
            style={styles.input}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Confirm new password"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isSubmitting}
            accessibilityLabel="Confirm New Password"
          />

          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

          <Pressable
            style={[styles.button, isSubmitting && styles.buttonDisabled]}
            onPress={handleUpdatePassword}
            disabled={isSubmitting}
            accessibilityRole="button"
          >
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Update Password</Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  heading: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  note: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.7,
  },
  form: {
    marginTop: 8,
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#9ca3af',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  error: {
    color: '#b91c1c',
    fontSize: 14,
    textAlign: 'center',
  },
  success: {
    color: '#15803d',
    fontSize: 14,
    textAlign: 'center',
  },
  button: {
    marginTop: 8,
    backgroundColor: SkillMatchTheme.brand.primary,
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
