import { Link } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { SkillMatchTheme } from '@/constants/theme';
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
    <View style={styles.container}>
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
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isSubmitting}
          accessibilityLabel="Email"
        />

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
        {successMessage ? <Text style={styles.success}>{successMessage}</Text> : null}

        <Pressable
          style={[styles.button, isSubmitting && styles.buttonDisabled]}
          onPress={handleSendRecoveryInstructions}
          disabled={isSubmitting}
          accessibilityRole="button"
        >
          {isSubmitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Send Recovery Instructions</Text>
          )}
        </Pressable>

        <Link href="/login" style={styles.link}>
          Back to Sign In
        </Link>
      </View>
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
  brand: {
    alignItems: 'center',
    gap: 8,
  },
  brandLogo: {
    width: 56,
    height: 56,
  },
  brandName: {
    color: '#163300',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  heading: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  status: {
    fontSize: 13,
    textAlign: 'center',
    opacity: 0.7,
  },
  form: {
    marginTop: 16,
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
  },
  success: {
    color: '#15803d',
    fontSize: 14,
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
  link: {
    marginTop: 16,
    fontSize: 15,
    color: SkillMatchTheme.brand.primary,
    textAlign: 'center',
    padding: 4,
  },
});
