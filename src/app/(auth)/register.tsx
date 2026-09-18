import { Link } from 'expo-router';
import { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Pressable,
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
import {
  CONSENT_COPY,
  consentErrorCopy,
  hasRequiredLegalAcceptance,
  persistCurrentLegalConsentAfterSignup,
} from '@/lib/user-consent';
import { useAccount } from '@/providers/account-provider';

const { colors, type, spacing, radius } = SkillMatchTheme.ui;

/**
 * Registration intent only. This is untrusted user input sent as Auth user
 * metadata (`registration_role_intent`). It is NOT SkillMatch authorization,
 * not a trusted role, and must never be used to route or authorize access.
 * The same applies to `registration_full_name` and `registration_phone`:
 * they are untrusted bootstrap input carried alongside the intent.
 * The authoritative account row is created in a later piece.
 * There is deliberately no Admin option: admin accounts are provisioned only
 * through trusted backend/database paths.
 */
type RegistrationRoleIntent = 'worker' | 'client';

const ROLE_OPTIONS: { value: RegistrationRoleIntent; label: string }[] = [
  { value: 'worker', label: 'Worker' },
  { value: 'client', label: 'Client' },
];

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const { retryAccountBootstrap } = useAccount();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<RegistrationRoleIntent | null>(
    null
  );
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acknowledgedPrivacy, setAcknowledgedPrivacy] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleRegister() {
    if (isSubmitting) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmedFullName = fullName.trim();
    const trimmedPhone = phone.trim();
    const trimmedEmail = email.trim();
    if (!trimmedFullName) {
      setErrorMessage('Please enter your full name.');
      return;
    }
    if (!trimmedPhone) {
      setErrorMessage('Please enter your phone number.');
      return;
    }
    if (!trimmedEmail) {
      setErrorMessage('Please enter your email.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter a password.');
      return;
    }
    if (!confirmPassword) {
      setErrorMessage('Please confirm your password.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }
    if (selectedRole !== 'worker' && selectedRole !== 'client') {
      setErrorMessage('Please choose whether you are registering as a Worker or a Client.');
      return;
    }
    if (!hasRequiredLegalAcceptance(acceptedTerms, acknowledgedPrivacy)) {
      setErrorMessage(CONSENT_COPY.required);
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          data: {
            registration_full_name: trimmedFullName,
            registration_phone: trimmedPhone,
            registration_role_intent: selectedRole,
          },
        },
      });

      if (error) {
        setErrorMessage(error.message || 'Registration failed. Please try again.');
        return;
      }

      if (!data.session) {
        setSuccessMessage(
          'Account created. Check your email if confirmation is required.'
        );
        return;
      }

      try {
        await persistCurrentLegalConsentAfterSignup();
      } catch (consentError: unknown) {
        const code =
          typeof consentError === 'object' &&
          consentError !== null &&
          'code' in consentError &&
          typeof (consentError as { code?: unknown }).code === 'string'
            ? (consentError as { code: string }).code
            : 'unclassified';
        console.warn('[V3-W1] registration consent persist failed:', code);
        setErrorMessage(consentErrorCopy(consentError));
      }
      retryAccountBootstrap();
    } catch {
      setErrorMessage(
        'Registration failed. Please check your connection and try again.'
      );
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
        <Text style={styles.heading}>Create Account</Text>

        <View style={styles.form}>
          <AppField
            label="Full Name"
            value={fullName}
            onChangeText={setFullName}
            placeholder="Full Name"
            autoCapitalize="words"
            autoCorrect={false}
            disabled={isSubmitting}
            accessibilityLabel="Full Name"
          />

          <AppField
            label="Phone"
            value={phone}
            onChangeText={setPhone}
            placeholder="Phone"
            keyboardType="phone-pad"
            autoCorrect={false}
            disabled={isSubmitting}
            accessibilityLabel="Phone"
          />

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

          <AppField
            label="Confirm Password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Confirm Password"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            disabled={isSubmitting}
            accessibilityLabel="Confirm Password"
          />

          <Text style={styles.label}>I am registering as</Text>
          <View style={styles.roleRow}>
            {ROLE_OPTIONS.map((option) => {
              const isSelected = selectedRole === option.value;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.roleOption, isSelected && styles.roleOptionSelected]}
                  onPress={() => setSelectedRole(option.value)}
                  disabled={isSubmitting}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected, disabled: isSubmitting }}
                >
                  <Text
                    style={[
                      styles.roleOptionText,
                      isSelected && styles.roleOptionTextSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.consentRow}>
            <Pressable
              style={styles.checkboxHit}
              onPress={() => setAcceptedTerms((current) => !current)}
              disabled={isSubmitting}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: acceptedTerms, disabled: isSubmitting }}
              accessibilityLabel="I agree to the Terms and Conditions"
            >
              <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>
                {acceptedTerms ? <Text style={styles.checkboxMark}>✓</Text> : null}
              </View>
            </Pressable>
            <Text style={styles.consentText}>
              I agree to the{' '}
              <Link href="/terms" style={styles.inlineLink}>
                Terms and Conditions
              </Link>
            </Text>
          </View>

          <View style={styles.consentRow}>
            <Pressable
              style={styles.checkboxHit}
              onPress={() => setAcknowledgedPrivacy((current) => !current)}
              disabled={isSubmitting}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: acknowledgedPrivacy, disabled: isSubmitting }}
              accessibilityLabel="I acknowledge the Privacy Policy"
            >
              <View
                style={[styles.checkbox, acknowledgedPrivacy && styles.checkboxChecked]}
              >
                {acknowledgedPrivacy ? <Text style={styles.checkboxMark}>✓</Text> : null}
              </View>
            </Pressable>
            <Text style={styles.consentText}>
              I acknowledge the{' '}
              <Link href="/privacy" style={styles.inlineLink}>
                Privacy Policy
              </Link>
            </Text>
          </View>

          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
          {successMessage ? <Text style={styles.success}>{successMessage}</Text> : null}

          <AppButton label="Create Account" onPress={handleRegister} loading={isSubmitting} />

          {/* dismissTo (POP_TO): pops back to the existing Login when it is in
              history; otherwise replaces this screen. Never duplicates Login. */}
          <Link dismissTo href="/login" style={styles.link}>
            Already have an account? Sign in
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
  form: {
    marginTop: spacing.lg,
    gap: spacing.lg,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    color: colors.primary,
  },
  roleRow: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.pill,
    padding: spacing.xs,
  },
  roleOption: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleOptionSelected: {
    backgroundColor: colors.surface,
  },
  roleOptionText: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    color: colors.textSecondary,
  },
  roleOptionTextSelected: {
    fontWeight: '700',
    color: colors.primary,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  checkboxHit: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
  },
  checkboxMark: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  consentText: {
    flex: 1,
    ...type.helper,
    color: colors.textPrimary,
  },
  inlineLink: {
    color: colors.primary,
    fontWeight: '700',
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
