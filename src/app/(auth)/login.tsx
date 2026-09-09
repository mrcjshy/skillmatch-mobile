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

import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

/**
 * Supabase Auth sign-in UI only.
 *
 * Establishes an Auth identity/session. It does not resolve the SkillMatch
 * account record (authoritative role / active status) and does not navigate. Account
 * authorization and protected routing belong to later pieces.
 */
export default function LoginScreen() {
  const { session, isSessionLoading, sessionError } = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const sessionStatus = isSessionLoading
    ? 'Checking session…'
    : sessionError
      ? 'Session restoration error.'
      : session
        ? 'Authenticated session present.'
        : 'No authenticated session.';

  async function handleSignIn() {
    if (isSubmitting) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage('Please enter your email.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (error) {
        // Do not reveal whether the email exists.
        setErrorMessage(
          error.status === 400 || error.status === 401 || error.status === 422
            ? 'Invalid email or password.'
            : error.message || 'Sign in failed. Please try again.'
        );
        return;
      }

      // The session provider's auth-state subscription updates session state.
      // No navigation here: role routing is not active yet.
      setSuccessMessage(
        'Signed in successfully. Account authorization and role routing are not active yet.'
      );
    } catch {
      setErrorMessage('Sign in failed. Please check your connection and try again.');
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
      <Text style={styles.heading}>Sign In</Text>
      <Text style={styles.status}>{sessionStatus}</Text>

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

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isSubmitting}
          accessibilityLabel="Password"
        />

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
        {successMessage ? (
          <Text style={styles.success}>{successMessage}</Text>
        ) : null}

        <Pressable
          style={[styles.button, isSubmitting && styles.buttonDisabled]}
          onPress={handleSignIn}
          disabled={isSubmitting}
          accessibilityRole="button"
        >
          {isSubmitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </Pressable>

        {/* Ordinary push: Back from Register returns here. */}
        <Link href="/register" style={styles.link}>
          Don't have an account? Create one
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
    backgroundColor: '#1d4ed8',
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
    color: '#1d4ed8',
    textAlign: 'center',
    padding: 4,
  },
});
