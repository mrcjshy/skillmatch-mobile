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
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

const { colors, type, spacing } = SkillMatchTheme.ui;

/**
 * Supabase Auth sign-in UI only.
 *
 * Establishes an Auth identity/session. AccountProvider then resolves the
 * authoritative users row, and root access-state routing sends the signed-in
 * user to the Worker, Client, or Administrator shell, or to blocked /
 * bootstrap-error as appropriate.
 */
export default function LoginScreen() {
  const insets = useSafeAreaInsets();
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

      // SessionProvider updates the session; AccountProvider bootstrap and
      // root access-state routing determine the destination.
      setSuccessMessage('Signed in successfully.');
    } catch {
      setErrorMessage('Sign in failed. Please check your connection and try again.');
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
        <Text style={styles.heading}>Sign In</Text>
        <Text style={styles.status}>{sessionStatus}</Text>

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

          <AppField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            disabled={isSubmitting}
            accessibilityLabel="Password"
          />

          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
          {successMessage ? <Text style={styles.success}>{successMessage}</Text> : null}

          <AppButton label="Sign In" onPress={handleSignIn} loading={isSubmitting} />

          <Link href="/forgot-password" style={styles.link}>
            Forgot Password
          </Link>

          {/* Ordinary push: Back from Register returns here. */}
          <Link href="/register" style={styles.link}>
            {"Don't have an account? Create one"}
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
