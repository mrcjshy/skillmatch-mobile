import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View, type TextInput } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppDivider } from '@/components/app-divider';
import { AppField } from '@/components/app-field';
import { AuthLink, AuthScreen, useAuthScroll } from '@/components/auth-screen';
import { FormMessage } from '@/components/form-message';
import { PasswordField } from '@/components/password-field';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

type FieldError = { field: 'email' | 'password'; message: string };

/**
 * Supabase Auth sign-in UI only.
 *
 * Establishes an Auth identity/session. AccountProvider then resolves the
 * authoritative users row, and root access-state routing sends the signed-in
 * user to the Worker, Client, or Administrator shell, or to blocked /
 * bootstrap-error as appropriate.
 */
export default function LoginScreen() {
  const ui = useUiTheme();
  const styles = createStyles(ui);
  const router = useRouter();
  const { scrollRef, focusField } = useAuthScroll();
  const { session, isSessionLoading, sessionError } = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<FieldError | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  // Only a state the person needs to know about is shown; the idle "no session" state is the
  // normal condition of this screen and says nothing useful.
  const sessionNotice = isSessionLoading
    ? { tone: 'info' as const, text: 'Checking session…' }
    : sessionError
      ? { tone: 'error' as const, text: 'Session restoration error.' }
      : session
        ? { tone: 'info' as const, text: 'Authenticated session present.' }
        : null;

  async function handleSignIn() {
    if (isSubmitting) return;

    setFieldError(null);
    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setFieldError({ field: 'email', message: 'Please enter your email.' });
      focusField(emailRef);
      return;
    }
    if (!password) {
      setFieldError({ field: 'password', message: 'Please enter your password.' });
      focusField(passwordRef);
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
    <AuthScreen
      scrollRef={scrollRef}
      title="Sign in"
      description="Enter your email and password to continue."
      footer={
        <>
          <AppDivider />
          <Text style={styles.footerLead}>New to SkillMatch?</Text>
          {/* Ordinary push: Back from Register returns here. */}
          <AppButton
            label="Create an account"
            variant="secondary"
            onPress={() => router.push('/register')}
          />
        </>
      }
    >
      {sessionNotice ? <FormMessage tone={sessionNotice.tone} message={sessionNotice.text} /> : null}

      <View style={styles.form}>
        <AppField
          inputRef={emailRef}
          label="Email"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setFieldError((current) => (current?.field === 'email' ? null : current));
          }}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          disabled={isSubmitting}
          errorText={fieldError?.field === 'email' ? fieldError.message : undefined}
          accessibilityLabel="Email"
        />

        <PasswordField
          inputRef={passwordRef}
          label="Password"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setFieldError((current) => (current?.field === 'password' ? null : current));
          }}
          autoComplete="current-password"
          textContentType="password"
          disabled={isSubmitting}
          errorText={fieldError?.field === 'password' ? fieldError.message : undefined}
          accessibilityLabel="Password"
        />

        {errorMessage ? <FormMessage tone="error" message={errorMessage} /> : null}
        {successMessage ? <FormMessage tone="success" message={successMessage} /> : null}

        <View style={styles.actions}>
          <AppButton label="Sign in" onPress={handleSignIn} loading={isSubmitting} />
          <AuthLink href="/forgot-password">Forgot password?</AuthLink>
        </View>
      </View>
    </AuthScreen>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing } = ui;
  return StyleSheet.create({
    form: { gap: spacing.lg },
    actions: { gap: spacing.xs },
    footerLead: { ...type.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm },
  });
}
