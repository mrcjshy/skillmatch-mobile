import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppField } from '@/components/app-field';
import { AppNotice } from '@/components/app-notice';
import { SkillMatchTheme } from '@/constants/theme';
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

const { colors, type, spacing } = SkillMatchTheme.ui;

export default function VerifyPhoneScreen() {
  const insets = useSafeAreaInsets();
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
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xxxl }]}
      >
        <Text style={styles.heading}>Verify Your Phone</Text>
        <Text style={styles.status}>
          SMS OTP proves control of this phone number. It does not prove legal identity.
        </Text>
        <View style={styles.form}>
          {phone === null ? (
            <AppNotice variant="danger" message={PHONE_VERIFICATION_COPY.missingPhone} />
          ) : !phoneOtpEnabled ? (
            <>
              <AppNotice variant="warning" message={PHONE_VERIFICATION_COPY.unavailable} />
              {error ? <AppNotice variant="danger" message={error} /> : null}
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
                label="Phone Number"
                value={phone}
                editable={false}
                accessibilityLabel="Phone number to verify"
              />
              <AppButton
                label={sendLabel}
                onPress={sendCode}
                variant="secondary"
                loading={isSending}
                disabled={busy || cooldown > 0 || phoneVerified}
              />
              {hasSent ? (
                <AppField
                  label="SMS Verification Code"
                  value={code}
                  onChangeText={setCode}
                  placeholder="000000"
                  keyboardType="number-pad"
                  maxLength={6}
                  disabled={busy || phoneVerified}
                  accessibilityLabel="Six-digit SMS verification code"
                />
              ) : null}
              {error ? <AppNotice variant="danger" message={error} /> : null}
              {notice ? <AppNotice variant="success" message={notice} /> : null}
              {hasSent && !phoneVerified ? (
                <AppButton
                  label="Verify Phone"
                  onPress={verifyCode}
                  loading={isVerifying}
                  disabled={busy}
                />
              ) : null}
              {phoneVerified && error ? (
                <AppButton label="Finish Account Setup" onPress={finishSetup} loading={isFinishing} />
              ) : null}
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.gutter,
    paddingBottom: spacing.xxl,
    backgroundColor: colors.background,
  },
  heading: { ...type.display, color: colors.textPrimary, textAlign: 'center' },
  status: {
    ...type.helper,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  form: { marginTop: spacing.xl, gap: spacing.lg },
});
