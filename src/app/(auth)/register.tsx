import { type Href, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppDivider } from '@/components/app-divider';
import { AppField } from '@/components/app-field';
import { AuthLink, AuthScreen, AuthSection, useAuthScroll } from '@/components/auth-screen';
import { ConsentCheck } from '@/components/consent-check';
import { FormMessage } from '@/components/form-message';
import { PasswordField } from '@/components/password-field';
import { RadioRow } from '@/components/radio-row';
import { useUiTheme, type UiTheme, RefinementThemeProvider } from '@/components/refinement-theme';
import { StepList, type Step } from '@/components/step-list';
import { supabase } from '@/lib/supabase';
import { formatPhilippineMobileInput, normalizePhilippineMobile } from '@/lib/philippine-phone';
import {
  CONSENT_COPY,
  hasRequiredLegalAcceptance,
} from '@/lib/user-consent';

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

const ROLE_OPTIONS: { value: RegistrationRoleIntent; label: string; meaning: string }[] = [
  { value: 'worker', label: 'Worker', meaning: 'I offer my skills for local work.' },
  { value: 'client', label: 'Client', meaning: 'I need help with a job.' },
];

type RegisterField =
  | 'fullName'
  | 'phone'
  | 'email'
  | 'password'
  | 'confirmPassword'
  | 'role'
  | 'consent'
  | 'form';
type RegisterError = { field: RegisterField; message: string };

/** The real Worker journey: this form, email code, ID review, then the profile inside the app. */
const WORKER_PATH: readonly Step[] = [
  { label: 'Create your account', detail: 'Name, phone, email and password.', state: 'current' },
  { label: 'Confirm your email', detail: 'Enter the six-digit code we send you.', state: 'upcoming' },
  { label: 'Submit a valid ID', detail: 'An administrator reviews it before you can use the Worker app.', state: 'upcoming' },
  { label: 'Set up your work profile', detail: 'Add your skills in the Worker app.', state: 'upcoming' },
];

export default function RegisterScreen() {
  return <RefinementThemeProvider><RegisterContent /></RefinementThemeProvider>;
}

function RegisterContent() {
  const ui = useUiTheme();
  const styles = createStyles(ui);

  const router = useRouter();
  const { scrollRef, focusField } = useAuthScroll();
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
  const [error, setError] = useState<RegisterError | null>(null);
  const fullNameRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  function fail(field: RegisterField, message: string, focus?: { current: TextInput | null }) {
    setError({ field, message });
    if (focus) focusField(focus);
  }
  const errorFor = (field: RegisterField) => (error?.field === field ? error.message : undefined);
  // Editing a field retires that field's own message; it is re-checked on the next submit.
  const edit = (field: RegisterField, set: (value: string) => void) => (value: string) => {
    set(value);
    setError((current) => (current?.field === field ? null : current));
  };

  async function handleRegister() {
    if (isSubmitting) return;

    setError(null);

    const trimmedFullName = fullName.trim();
    const normalizedPhone = normalizePhilippineMobile(phone);
    const trimmedEmail = email.trim();
    if (!trimmedFullName) {
      fail('fullName', 'Please enter your full name.', fullNameRef);
      return;
    }
    if (!normalizedPhone) {
      fail('phone', 'Enter a valid Philippine mobile number, such as +63 917 123 4567.', phoneRef);
      return;
    }
    if (!trimmedEmail) {
      fail('email', 'Please enter your email.', emailRef);
      return;
    }
    if (!password) {
      fail('password', 'Please enter a password.', passwordRef);
      return;
    }
    if (!confirmPassword) {
      fail('confirmPassword', 'Please confirm your password.', confirmPasswordRef);
      return;
    }
    if (password !== confirmPassword) {
      fail('confirmPassword', 'Passwords do not match.', confirmPasswordRef);
      return;
    }
    if (selectedRole !== 'worker' && selectedRole !== 'client') {
      fail('role', 'Please choose whether you are registering as a Worker or a Client.');
      return;
    }
    if (!hasRequiredLegalAcceptance(acceptedTerms, acknowledgedPrivacy)) {
      fail('consent', CONSENT_COPY.required);
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          data: {
            registration_full_name: trimmedFullName,
            registration_phone: normalizedPhone,
            registration_role_intent: selectedRole,
          },
        },
      });

      if (signUpError) {
        fail('form', signUpError.message || 'Registration failed. Please try again.');
        return;
      }

      router.replace(
        { pathname: '/verify-email', params: { email: trimmedEmail } } as unknown as Href
      );
    } catch {
      fail('form', 'Registration failed. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const nameField = (
    <AppField
      inputRef={fullNameRef}
      label="Full name"
      value={fullName}
      onChangeText={edit('fullName', setFullName)}
      autoCapitalize="words"
      autoCorrect={false}
      autoComplete="name"
      textContentType="name"
      disabled={isSubmitting}
      errorText={errorFor('fullName')}
      accessibilityLabel="Full name"
    />
  );
  const phoneField = (
    <AppField
      inputRef={phoneRef}
      label="Phone number"
      value={phone}
      onChangeText={edit('phone', setPhone)}
      onBlur={() => setPhone(formatPhilippineMobileInput(phone))}
      placeholder="+63 | 917 123 4567"
      keyboardType="phone-pad"
      autoCorrect={false}
      autoComplete="tel"
      textContentType="telephoneNumber"
      disabled={isSubmitting}
      helperText="A Philippine mobile number, such as 0917 123 4567."
      errorText={errorFor('phone')}
      accessibilityLabel="Phone number"
    />
  );
  const emailField = (
    <AppField
      inputRef={emailRef}
      label="Email"
      value={email}
      onChangeText={edit('email', setEmail)}
      placeholder="you@example.com"
      keyboardType="email-address"
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete="email"
      textContentType="emailAddress"
      disabled={isSubmitting}
      errorText={errorFor('email')}
      accessibilityLabel="Email"
    />
  );
  const passwordFields = (
    <>
      <PasswordField
        inputRef={passwordRef}
        label="Password"
        value={password}
        onChangeText={edit('password', setPassword)}
        autoComplete="new-password"
        textContentType="newPassword"
        disabled={isSubmitting}
        errorText={errorFor('password')}
        accessibilityLabel="Password"
      />
      <PasswordField
        inputRef={confirmPasswordRef}
        label="Confirm password"
        value={confirmPassword}
        onChangeText={edit('confirmPassword', setConfirmPassword)}
        autoComplete="new-password"
        textContentType="newPassword"
        disabled={isSubmitting}
        errorText={errorFor('confirmPassword')}
        accessibilityLabel="Confirm password"
      />
    </>
  );

  const title =
    selectedRole === 'worker'
      ? 'Join as a Worker'
      : selectedRole === 'client'
        ? 'Join as a Client'
        : 'Create your account';
  const description =
    selectedRole === 'worker'
      ? 'Create your account to get started as a local service worker.'
      : selectedRole === 'client'
        ? 'Create an account to post a service request and manage your bookings.'
        : 'Choose how you will use SkillMatch.';

  return (
    <AuthScreen
      scrollRef={scrollRef}
      title={title}
      description={description}
      footer={
        <>
          <AppDivider />
          {/* dismissTo (POP_TO): pops back to the existing Login when it is in
              history; otherwise replaces this screen. Never duplicates Login. */}
          <AuthLink dismissTo href="/login">
            Already have an account? Sign in
          </AuthLink>
        </>
      }
    >
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="I am registering as"
        style={styles.roles}
      >
        {ROLE_OPTIONS.map((option) => (
          <RadioRow
            key={option.value}
            label={option.label}
            meaning={option.meaning}
            selected={selectedRole === option.value}
            disabled={isSubmitting}
            onPress={() => setSelectedRole(option.value)}
          />
        ))}
      </View>
      {errorFor('role') ? <FormMessage tone="error" message={errorFor('role')!} /> : null}

      {selectedRole === 'worker' ? (
        <>
          <AuthSection title="Your path as a Worker">
            <StepList steps={WORKER_PATH} />
          </AuthSection>
          <AuthSection title="About you">
            {nameField}
            {phoneField}
          </AuthSection>
          <AuthSection title="Sign-in details">
            {emailField}
            {passwordFields}
          </AuthSection>
        </>
      ) : selectedRole === 'client' ? (
        <AuthSection title="Your details">
          {nameField}
          {phoneField}
          {emailField}
          {passwordFields}
        </AuthSection>
      ) : null}

      {selectedRole !== null ? (
        <>
          <AuthSection title="Terms and privacy">
            <View style={styles.consents}>
              <ConsentCheck
                checked={acceptedTerms}
                onToggle={() => setAcceptedTerms((current) => !current)}
                disabled={isSubmitting}
                accessibilityLabel="I agree to the Terms and Conditions"
                lead="I agree to the"
                linkLabel="Terms and Conditions"
                href="/terms"
              />
              <ConsentCheck
                checked={acknowledgedPrivacy}
                onToggle={() => setAcknowledgedPrivacy((current) => !current)}
                disabled={isSubmitting}
                accessibilityLabel="I acknowledge the Privacy Policy"
                lead="I acknowledge the"
                linkLabel="Privacy Policy"
                href="/privacy"
              />
            </View>
            {errorFor('consent') ? <FormMessage tone="error" message={errorFor('consent')!} /> : null}
          </AuthSection>

          {errorFor('form') ? <FormMessage tone="error" message={errorFor('form')!} /> : null}

          <AppButton label="Create account" onPress={handleRegister} loading={isSubmitting} />
        </>
      ) : null}
    </AuthScreen>
  );
}

function createStyles(ui: UiTheme) {
  const { spacing } = ui;
  return StyleSheet.create({
    roles: { gap: spacing.md },
    consents: { gap: spacing.xs },
  });
}
