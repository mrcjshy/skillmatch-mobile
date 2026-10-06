import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppField } from '@/components/app-field';
import { AuthLink, AuthScreen, useAuthScroll } from '@/components/auth-screen';
import { FormMessage } from '@/components/form-message';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import {
  EMAIL_VERIFICATION_COPY,
  getResendCooldownEndsAt,
  getResendCooldownSecondsRemaining,
  isValidEmailVerificationCode,
  normalizeVerificationEmail,
  resendSignupEmailOtp,
  verifySignupEmailOtp,
} from '@/lib/email-verification';
import { isPhoneOtpEnabled } from '@/lib/phone-verification';
import { supabase } from '@/lib/supabase';
import { persistCurrentLegalConsentAfterSignup } from '@/lib/user-consent';
import { useAccount } from '@/providers/account-provider';

export default function VerifyEmailScreen() {
  const styles = createStyles(useUiTheme());
  const { scrollRef, focusField } = useAuthScroll();
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const { retryAccountBootstrap } = useAccount();
  const phoneOtpEnabled = isPhoneOtpEnabled();
  const email = useMemo(
    () =>
      typeof params.email === 'string'
        ? normalizeVerificationEmail(params.email)
        : '',
    [params.email]
  );

  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [hasVerifiedSession, setHasVerifiedSession] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const codeRef = useRef<TextInput>(null);
  const [cooldownEndsAtMs, setCooldownEndsAtMs] = useState(() =>
    getResendCooldownEndsAt(Date.now())
  );
  const [nowMs, setNowMs] = useState(() => Date.now());
  const verifyInFlight = useRef(false);
  const resendInFlight = useRef(false);

  const cooldownSeconds = getResendCooldownSecondsRemaining(
    cooldownEndsAtMs,
    nowMs
  );

  useEffect(() => {
    if (cooldownSeconds === 0) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  async function finishAccountSetup() {
    try {
      await persistCurrentLegalConsentAfterSignup();
      setErrorMessage(null);
      setSuccessMessage('Email verified. Finishing account setup...');
      retryAccountBootstrap();
      return true;
    } catch {
      setSuccessMessage(null);
      setErrorMessage(EMAIL_VERIFICATION_COPY.setupFailed);
      retryAccountBootstrap();
      return false;
    }
  }

  async function handleVerify() {
    if (verifyInFlight.current || resendInFlight.current || !email) return;

    setCodeError(null);
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!hasVerifiedSession && !isValidEmailVerificationCode(code)) {
      setCodeError(EMAIL_VERIFICATION_COPY.invalidCode);
      focusField(codeRef);
      return;
    }

    verifyInFlight.current = true;
    setIsVerifying(true);
    try {
      if (!hasVerifiedSession) {
        const session = await verifySignupEmailOtp(supabase.auth, email, code);
        if (session === null) {
          setCodeError(EMAIL_VERIFICATION_COPY.verificationFailed);
          focusField(codeRef);
          return;
        }
        setHasVerifiedSession(true);
      }
      if (phoneOtpEnabled) {
        setSuccessMessage('Email verified. Continue with phone verification.');
        retryAccountBootstrap();
      } else {
        await finishAccountSetup();
      }
    } finally {
      verifyInFlight.current = false;
      setIsVerifying(false);
    }
  }

  async function handleResend() {
    const requestNowMs = Date.now();
    if (
      resendInFlight.current ||
      verifyInFlight.current ||
      !email ||
      hasVerifiedSession ||
      getResendCooldownSecondsRemaining(cooldownEndsAtMs, requestNowMs) > 0
    ) {
      return;
    }

    resendInFlight.current = true;
    setIsResending(true);
    setCodeError(null);
    setErrorMessage(null);
    setSuccessMessage(null);
    setCooldownEndsAtMs(getResendCooldownEndsAt(requestNowMs));
    setNowMs(requestNowMs);
    try {
      const sent = await resendSignupEmailOtp(supabase.auth, email);
      if (sent) {
        setSuccessMessage(EMAIL_VERIFICATION_COPY.resendSucceeded);
      } else {
        setErrorMessage(EMAIL_VERIFICATION_COPY.resendFailed);
      }
    } finally {
      resendInFlight.current = false;
      setIsResending(false);
    }
  }

  const missingEmail = email.length === 0;
  const busy = isVerifying || isResending;
  const resendLabel =
    cooldownSeconds > 0
      ? `Resend code in ${cooldownSeconds}s`
      : 'Resend verification code';

  return (
    <AuthScreen
      scrollRef={scrollRef}
      title="Verify your email"
      description={
        missingEmail
          ? 'Enter the six-digit code sent to your email to finish creating your account.'
          : `We sent a six-digit code to ${email}. Enter it to finish creating your account.`
      }
      brand={false}
      footer={<AuthLink dismissTo href="/register">Back to registration</AuthLink>}
    >
      {missingEmail ? (
        <FormMessage tone="error" message={EMAIL_VERIFICATION_COPY.missingEmail} />
      ) : (
        <View style={styles.form}>
          <AppField
            inputRef={codeRef}
            label="Verification code"
            value={code}
            onChangeText={setCode}
            placeholder="000000"
            keyboardType="number-pad"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            disabled={busy || hasVerifiedSession}
            inputStyle={styles.code}
            errorText={codeError ?? undefined}
            accessibilityLabel="Six-digit email verification code"
          />

          {errorMessage ? <FormMessage tone="error" message={errorMessage} /> : null}
          {successMessage ? <FormMessage tone="success" message={successMessage} /> : null}

          <View style={styles.actions}>
            <AppButton
              label={hasVerifiedSession ? 'Finish account setup' : 'Verify email'}
              onPress={handleVerify}
              loading={isVerifying}
              disabled={isResending || (hasVerifiedSession && phoneOtpEnabled)}
            />
            {!hasVerifiedSession ? (
              <AppButton
                label={resendLabel}
                onPress={handleResend}
                variant="ghost"
                loading={isResending}
                disabled={isVerifying || cooldownSeconds > 0}
              />
            ) : null}
          </View>
        </View>
      )}
    </AuthScreen>
  );
}

function createStyles(ui: UiTheme) {
  const { type, spacing } = ui;
  return StyleSheet.create({
    form: { gap: spacing.lg },
    actions: { gap: spacing.sm },
    // One-time code: large, centred, evenly tracked digits that stay legible at 130%.
    code: { ...type.numeric, fontSize: 22, lineHeight: 28, letterSpacing: 8, textAlign: 'center' },
  });
}
