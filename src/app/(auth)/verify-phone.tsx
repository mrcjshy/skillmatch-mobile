import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppField } from '@/components/app-field';
import { AuthScreen } from '@/components/auth-screen';
import { FormMessage } from '@/components/form-message';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import {
  PHONE_VERIFICATION_COPY,
  getPhoneResendCooldownEndsAt,
  getPhoneResendCooldownSecondsRemaining,
  isValidPhoneVerificationCode,
  isPhoneOtpEnabled,
  registrationPhoneFromUser,
  requestPhoneChangeOtp,
  verifyPhoneChangeOtp,
} from '@/lib/phone-verification';
import { supabase } from '@/lib/supabase';
import { persistCurrentLegalConsentAfterSignup } from '@/lib/user-consent';
import { useAccount } from '@/providers/account-provider';
import { useSession } from '@/providers/session-provider';

export default function VerifyPhoneScreen() {
  const styles = createStyles(useUiTheme());
  const router = useRouter();
  const { session } = useSession();
  const { retryAccountBootstrap } = useAccount();
  const phone = useMemo(() => registrationPhoneFromUser(session?.user ?? null), [session?.user]);
  const phoneOtpEnabled = isPhoneOtpEnabled();
  const [code, setCode] = useState('');
  const [hasSent, setHasSent] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldownEndsAtMs, setCooldownEndsAtMs] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const inFlight = useRef(false);

  const cooldown = getPhoneResendCooldownSecondsRemaining(cooldownEndsAtMs, nowMs);
  useEffect(() => {
    if (cooldown === 0) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function sendCode() {
    const requestTime = Date.now();
    if (!phoneOtpEnabled || inFlight.current || phone === null || cooldown > 0 || phoneVerified) return;
    inFlight.current = true;
    setIsSending(true);
    setError(null);
    setNotice(null);
    setCooldownEndsAtMs(getPhoneResendCooldownEndsAt(requestTime));
    setNowMs(requestTime);
    const sent = await requestPhoneChangeOtp(supabase.auth, phone);
    if (sent) {
      setHasSent(true);
      setNotice('A six-digit verification code was sent by SMS.');
    } else {
      setError(PHONE_VERIFICATION_COPY.sendFailed);
    }
    setIsSending(false);
    inFlight.current = false;
  }

  async function verifyCode() {
    if (inFlight.current || phone === null || !hasSent || phoneVerified) return;
    if (!isValidPhoneVerificationCode(code)) {
      setError(PHONE_VERIFICATION_COPY.invalidCode);
      return;
    }
    inFlight.current = true;
    setIsVerifying(true);
    setError(null);
    setNotice(null);
    const verified = await verifyPhoneChangeOtp(supabase.auth, phone, code);
    if (verified) {
      setPhoneVerified(true);
      setNotice('Phone verified. Finishing account setup…');
      await finishSetup();
    } else {
      setError(PHONE_VERIFICATION_COPY.verifyFailed);
    }
    setIsVerifying(false);
    inFlight.current = false;
  }

  async function finishSetup() {
    setIsFinishing(true);
    retryAccountBootstrap();
    try {
      await persistCurrentLegalConsentAfterSignup();
      retryAccountBootstrap();
      setError(null);
      setNotice('Phone verified. Account setup complete.');
    } catch {
      setError(PHONE_VERIFICATION_COPY.setupFailed);
    } finally {
      setIsFinishing(false);
    }
  }

  async function continueWithoutPhoneOtp() {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsFinishing(true);
    setError(null);
    try {
      await persistCurrentLegalConsentAfterSignup();
      retryAccountBootstrap();
      router.replace('/');
    } catch {
      setError(PHONE_VERIFICATION_COPY.setupFailed);
    } finally {
      setIsFinishing(false);
      inFlight.current = false;
    }
  }

  const busy = isSending || isVerifying || isFinishing;
  const sendLabel = hasSent
    ? cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend SMS code'
    : 'Send SMS code';

  return (
    <AuthScreen
      title="Verify your phone"
      description="A text-message code confirms you control this phone number. It does not verify your identity."
      brand={false}
    >
      <View style={styles.form}>
        {phone === null ? (
          <FormMessage tone="error" message={PHONE_VERIFICATION_COPY.missingPhone} />
        ) : !phoneOtpEnabled ? (
          <>
            <FormMessage tone="info" message={PHONE_VERIFICATION_COPY.unavailable} />
            {error ? <FormMessage tone="error" message={error} /> : null}
            <AppButton
              label="Continue"
              onPress={continueWithoutPhoneOtp}
              loading={isFinishing}
              disabled={isFinishing}
            />
          </>
        ) : (
          <>
            <AppField
              label="Phone number"
              value={phone}
              editable={false}
              accessibilityLabel="Phone number to verify"
            />
            {hasSent ? (
              <AppField
                label="SMS verification code"
                value={code}
                onChangeText={setCode}
                placeholder="000000"
                keyboardType="number-pad"
                autoComplete="sms-otp"
                textContentType="oneTimeCode"
                maxLength={6}
                disabled={busy || phoneVerified}
                inputStyle={styles.code}
                accessibilityLabel="Six-digit SMS verification code"
              />
            ) : null}
            {error ? <FormMessage tone="error" message={error} /> : null}
            {notice ? <FormMessage tone="success" message={notice} /> : null}
            <View style={styles.actions}>
              {hasSent && !phoneVerified ? (
                <AppButton
                  label="Verify phone"
                  onPress={verifyCode}
                  loading={isVerifying}
                  disabled={busy}
                />
              ) : null}
              {phoneVerified && error ? (
                <AppButton label="Finish account setup" onPress={finishSetup} loading={isFinishing} />
              ) : null}
              {/* One primary action at a time: sending is primary until a code exists, then resend is quiet. */}
              <AppButton
                label={sendLabel}
                onPress={sendCode}
                variant={hasSent ? 'ghost' : 'primary'}
                loading={isSending}
                disabled={busy || cooldown > 0 || phoneVerified}
              />
            </View>
          </>
        )}
      </View>
    </AuthScreen>
  );
}

function createStyles(ui: UiTheme) {
  const { type, spacing } = ui;
  return StyleSheet.create({
    form: { gap: spacing.lg },
    actions: { gap: spacing.sm },
    code: { ...type.numeric, fontSize: 22, lineHeight: 28, letterSpacing: 8, textAlign: 'center' },
  });
}
