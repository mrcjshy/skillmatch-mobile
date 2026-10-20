import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type TextInput } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppDivider } from '@/components/app-divider';
import { AppField } from '@/components/app-field';
import { AuthLink, AuthScreen, useAuthScroll } from '@/components/auth-screen';
import { FormMessage } from '@/components/form-message';
import { PasswordField } from '@/components/password-field';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import { AUTH_UNAVAILABLE_COPY, isAuthUnavailable } from '@/lib/auth-errors';
import {
  PHONE_SIGN_IN_COPY,
  isPhoneSignInEnabled,
  requestPhoneSignInOtp,
  verifyPhoneSignInOtp,
} from '@/lib/phone-otp';
import {
  getPhoneResendCooldownEndsAt,
  getPhoneResendCooldownSecondsRemaining,
  isValidPhoneVerificationCode,
} from '@/lib/phone-verification';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

type FieldError = { field: 'email' | 'password' | 'phone' | 'code'; message: string };
type SignInMode = 'email' | 'phone';

/**
 * Supabase Auth sign-in UI only.
 *
 * Establishes an Auth identity/session. AccountProvider then resolves the
 * authoritative users row, and root access-state routing sends the signed-in
 * user to the Worker, Client, or Administrator shell, or to blocked /
 * bootstrap-error as appropriate.
 *
 * Email and password is always available. SMS code sign-in is an additional path shown only
 * when EXPO_PUBLIC_PHONE_SIGN_IN_ENABLED is exactly `true`; it signs in an EXISTING account
 * whose Auth phone is confirmed and can never create one (see lib/phone-otp).
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

  const phoneSignInEnabled = isPhoneSignInEnabled();
  const [mode, setMode] = useState<SignInMode>('email');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  /** The normalized number the current code was sent to; codes are only verified against it. */
  const [sentPhone, setSentPhone] = useState<string | null>(null);
  const [cooldownEndsAtMs, setCooldownEndsAtMs] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const phoneRef = useRef<TextInput>(null);
  const codeRef = useRef<TextInput>(null);
  const phoneInFlight = useRef(false);

  const cooldown = getPhoneResendCooldownSecondsRemaining(cooldownEndsAtMs, nowMs);
  useEffect(() => {
    if (cooldown === 0) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [cooldown]);

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
        const unavailable = isAuthUnavailable(error);
        if (unavailable && process.env.NODE_ENV !== 'production') {
          console.warn('[sign-in] Auth unreachable', error.name, error.status);
        }
        // Do not reveal whether the email exists.
        setErrorMessage(
          error.status === 400 || error.status === 401 || error.status === 422
            ? 'Invalid email or password.'
            : unavailable
              ? AUTH_UNAVAILABLE_COPY
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

  function clearMessages() {
    setFieldError(null);
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function switchMode(next: SignInMode) {
    if (isSubmitting) return;
    clearMessages();
    setMode(next);
  }

  async function handleSendCode() {
    const requestTime = Date.now();
    if (phoneInFlight.current || cooldown > 0) return;
    clearMessages();
    phoneInFlight.current = true;
    setIsSubmitting(true);
    try {
      const result = await requestPhoneSignInOtp(supabase.auth, phone);
      if (result.outcome === 'invalid_phone') {
        setFieldError({ field: 'phone', message: PHONE_SIGN_IN_COPY.invalidPhone });
        focusField(phoneRef);
        return;
      }
      // Every request that reached Auth starts the visible resend cooldown.
      setCooldownEndsAtMs(getPhoneResendCooldownEndsAt(requestTime));
      setNowMs(requestTime);
      if (result.outcome === 'sent') {
        setSentPhone(result.phone);
        setCode('');
        setSuccessMessage(PHONE_SIGN_IN_COPY.sent);
        return;
      }
      setErrorMessage(
        result.outcome === 'rate_limited'
          ? PHONE_SIGN_IN_COPY.rateLimited
          : result.outcome === 'provider_failed'
            ? PHONE_SIGN_IN_COPY.providerFailed
            : result.outcome === 'unavailable'
              ? PHONE_SIGN_IN_COPY.unavailable
              : PHONE_SIGN_IN_COPY.failed
      );
    } finally {
      setIsSubmitting(false);
      phoneInFlight.current = false;
    }
  }

  async function handleVerifyCode() {
    if (phoneInFlight.current || sentPhone === null) return;
    clearMessages();
    if (!isValidPhoneVerificationCode(code)) {
      setFieldError({ field: 'code', message: PHONE_SIGN_IN_COPY.invalidCode });
      focusField(codeRef);
      return;
    }
    phoneInFlight.current = true;
    setIsSubmitting(true);
    try {
      const outcome = await verifyPhoneSignInOtp(supabase.auth, sentPhone, code);
      if (outcome === 'verified') {
        // Same as email sign-in: SessionProvider picks up the session and the root navigator
        // routes by the authoritative account row.
        setSuccessMessage('Signed in successfully.');
        return;
      }
      setErrorMessage(
        outcome === 'wrong_or_expired'
          ? PHONE_SIGN_IN_COPY.wrongOrExpired
          : outcome === 'rate_limited'
            ? PHONE_SIGN_IN_COPY.verifyRateLimited
            : PHONE_SIGN_IN_COPY.verifyFailed
      );
    } finally {
      setIsSubmitting(false);
      phoneInFlight.current = false;
    }
  }

  function changeNumber() {
    if (isSubmitting) return;
    clearMessages();
    setSentPhone(null);
    setCode('');
  }

  const footer = (
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
  );
  const notices = (
    <>
      {errorMessage ? <FormMessage tone="error" message={errorMessage} /> : null}
      {successMessage ? <FormMessage tone="success" message={successMessage} /> : null}
    </>
  );

  if (phoneSignInEnabled && mode === 'phone') {
    return (
      <AuthScreen
        scrollRef={scrollRef}
        title="Sign in"
        description="Enter the mobile number linked to your account. We will text you a six-digit code."
        footer={footer}
      >
        {sessionNotice ? <FormMessage tone={sessionNotice.tone} message={sessionNotice.text} /> : null}

        <View style={styles.form}>
          <AppField
            inputRef={phoneRef}
            label="Mobile number"
            value={phone}
            onChangeText={(value) => {
              setPhone(value);
              setFieldError((current) => (current?.field === 'phone' ? null : current));
            }}
            placeholder="0917 123 4567"
            keyboardType="phone-pad"
            autoCorrect={false}
            autoComplete="tel"
            textContentType="telephoneNumber"
            disabled={isSubmitting || sentPhone !== null}
            helperText="A Philippine mobile number, such as 0917 123 4567."
            errorText={fieldError?.field === 'phone' ? fieldError.message : undefined}
            accessibilityLabel="Mobile number"
          />

          {sentPhone !== null ? (
            <AppField
              inputRef={codeRef}
              label="SMS code"
              value={code}
              onChangeText={(value) => {
                setCode(value);
                setFieldError((current) => (current?.field === 'code' ? null : current));
              }}
              placeholder="000000"
              keyboardType="number-pad"
              autoComplete="sms-otp"
              textContentType="oneTimeCode"
              maxLength={6}
              disabled={isSubmitting}
              errorText={fieldError?.field === 'code' ? fieldError.message : undefined}
              accessibilityLabel="Six-digit SMS code"
            />
          ) : null}

          {notices}

          <View style={styles.actions}>
            {sentPhone === null ? (
              <AppButton
                label={cooldown > 0 ? `Send code in ${cooldown}s` : 'Send code'}
                onPress={handleSendCode}
                loading={isSubmitting}
                disabled={isSubmitting || cooldown > 0}
              />
            ) : (
              <>
                <AppButton
                  label="Verify and sign in"
                  onPress={handleVerifyCode}
                  loading={isSubmitting}
                  disabled={isSubmitting}
                />
                <AppButton
                  label={cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
                  variant="ghost"
                  onPress={handleSendCode}
                  disabled={isSubmitting || cooldown > 0}
                />
                <AppButton
                  label="Change number"
                  variant="ghost"
                  onPress={changeNumber}
                  disabled={isSubmitting}
                />
              </>
            )}
            <AppButton
              label="Use email and password instead"
              variant="ghost"
              onPress={() => switchMode('email')}
              disabled={isSubmitting}
            />
          </View>
        </View>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      scrollRef={scrollRef}
      title="Sign in"
      description="Enter your email and password to continue."
      footer={footer}
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

        {notices}

        <View style={styles.actions}>
          <AppButton label="Sign in" onPress={handleSignIn} loading={isSubmitting} />
          <AuthLink href="/forgot-password">Forgot password?</AuthLink>
          {phoneSignInEnabled ? (
            <AppButton
              label="Sign in with a text message code"
              variant="ghost"
              onPress={() => switchMode('phone')}
              disabled={isSubmitting}
            />
          ) : null}
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
