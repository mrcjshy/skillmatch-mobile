import { Link, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
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

const { colors, type, spacing } = SkillMatchTheme.ui;

export default function VerifyEmailScreen() {
  const insets = useSafeAreaInsets();
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
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

    setErrorMessage(null);
    setSuccessMessage(null);

    if (!hasVerifiedSession && !isValidEmailVerificationCode(code)) {
      setErrorMessage(EMAIL_VERIFICATION_COPY.invalidCode);
      return;
    }

    verifyInFlight.current = true;
    setIsVerifying(true);
    try {
      if (!hasVerifiedSession) {
        const session = await verifySignupEmailOtp(supabase.auth, email, code);
        if (session === null) {
          setErrorMessage(EMAIL_VERIFICATION_COPY.verificationFailed);
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
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
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

        <Text style={styles.heading}>Verify Your Email</Text>
        <Text style={styles.status}>
          Enter the six-digit code sent to your email to finish creating your account.
        </Text>

        <View style={styles.form}>
          {missingEmail ? (
            <Text style={styles.error}>{EMAIL_VERIFICATION_COPY.missingEmail}</Text>
          ) : (
            <>
              <AppField
                label="Verification Code"
                value={code}
                onChangeText={setCode}
                placeholder="000000"
                keyboardType="number-pad"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={6}
                disabled={busy || hasVerifiedSession}
                accessibilityLabel="Six-digit email verification code"
              />

              {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
              {successMessage ? (
                <Text style={styles.success}>{successMessage}</Text>
              ) : null}

              <AppButton
                label={hasVerifiedSession ? 'Finish Account Setup' : 'Verify Email'}
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
            </>
          )}

          <Link dismissTo href="/register" style={styles.link}>
            Back to Registration
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
    width: 48,
    height: 48,
  },
  brandName: {
    color: colors.primary,
    fontSize: 18,
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
