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

import { SkillMatchTheme } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

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
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<RegistrationRoleIntent | null>(
    null
  );
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

      // No navigation in either branch: account authorization and role
      // routing are not active yet.
      if (data.session) {
        setSuccessMessage(
          'Account created and authenticated. Account authorization setup comes next.'
        );
      } else {
        setSuccessMessage(
          'Account created. Check your email if confirmation is required.'
        );
      }
    } catch {
      setErrorMessage(
        'Registration failed. Please check your connection and try again.'
      );
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
      <Text style={styles.heading}>Create Account</Text>

      <View style={styles.form}>
        <Text style={styles.label}>Full Name</Text>
        <TextInput
          style={styles.input}
          value={fullName}
          onChangeText={setFullName}
          placeholder="Full Name"
          autoCapitalize="words"
          autoCorrect={false}
          editable={!isSubmitting}
          accessibilityLabel="Full Name"
        />

        <Text style={styles.label}>Phone</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="Phone"
          keyboardType="phone-pad"
          autoCorrect={false}
          editable={!isSubmitting}
          accessibilityLabel="Phone"
        />

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

        <Text style={styles.label}>Confirm Password</Text>
        <TextInput
          style={styles.input}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Confirm Password"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isSubmitting}
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
                accessibilityState={{ selected: isSelected }}
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

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
        {successMessage ? (
          <Text style={styles.success}>{successMessage}</Text>
        ) : null}

        <Pressable
          style={[styles.button, isSubmitting && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={isSubmitting}
          accessibilityRole="button"
        >
          {isSubmitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Create Account</Text>
          )}
        </Pressable>

        {/* dismissTo (POP_TO): pops back to the existing Login when it is in
            history; otherwise replaces this screen. Never duplicates Login. */}
        <Link dismissTo href="/login" style={styles.link}>
          Already have an account? Sign in
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
    gap: 6,
  },
  brandLogo: {
    width: 48,
    height: 48,
  },
  brandName: {
    color: '#163300',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  heading: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
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
  roleRow: {
    flexDirection: 'row',
    gap: 12,
  },
  roleOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#9ca3af',
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
  },
  roleOptionSelected: {
    borderColor: SkillMatchTheme.brand.primary,
    backgroundColor: '#dbeafe',
  },
  roleOptionText: {
    fontSize: 16,
  },
  roleOptionTextSelected: {
    color: SkillMatchTheme.brand.primary,
    fontWeight: '600',
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
    backgroundColor: SkillMatchTheme.brand.primary,
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
    color: SkillMatchTheme.brand.primary,
    textAlign: 'center',
    padding: 4,
  },
});
