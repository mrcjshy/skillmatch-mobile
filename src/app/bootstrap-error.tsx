import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { supabase } from '@/lib/supabase';
import { useAccount } from '@/providers/account-provider';

/**
 * Fail-closed surface for authoritative account lookup/bootstrap failure
 * (network, database, malformed row, unusable bootstrap input).
 *
 * This is NOT the blocked screen: /blocked is reserved for a successfully
 * resolved account whose authoritative state denies access.
 *
 * Escape routes: Retry (re-runs bootstrap) or Sign Out (session transition
 * drives the root router). No manual navigation.
 */
export default function BootstrapErrorScreen() {
  const { status, accountError, isAccountLoading, retryAccountBootstrap } =
    useAccount();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const hasActiveError = status === 'error' && accountError !== null;

  async function handleSignOut() {
    if (isSigningOut) return;
    setSignOutError(null);
    setIsSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) setSignOutError(error.message || 'Sign out failed. Please try again.');
    } catch {
      setSignOutError('Sign out failed. Please try again.');
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Account Setup Error</Text>

      {hasActiveError ? (
        <Text style={styles.note}>{accountError.message}</Text>
      ) : isAccountLoading ? (
        <Text style={styles.note}>Checking your account…</Text>
      ) : (
        <Text style={styles.note}>
          Your account could not be resolved into a valid SkillMatch account.
        </Text>
      )}

      <Pressable
        style={[styles.button, (isAccountLoading || isSigningOut) && styles.buttonDisabled]}
        onPress={retryAccountBootstrap}
        disabled={isAccountLoading || isSigningOut}
        accessibilityRole="button"
      >
        {isAccountLoading ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.buttonText}>Retry</Text>
        )}
      </Pressable>

      <Pressable
        style={[styles.secondaryButton, (isSigningOut || isAccountLoading) && styles.buttonDisabled]}
        onPress={handleSignOut}
        disabled={isSigningOut || isAccountLoading}
        accessibilityRole="button"
      >
        {isSigningOut ? (
          <ActivityIndicator />
        ) : (
          <Text style={styles.secondaryButtonText}>Sign Out</Text>
        )}
      </Pressable>
      {signOutError ? <Text style={styles.error}>{signOutError}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  heading: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  note: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.7,
  },
  button: {
    marginTop: 8,
    backgroundColor: '#1d4ed8',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 24,
    alignItems: 'center',
    minWidth: 160,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#1d4ed8',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 24,
    alignItems: 'center',
    minWidth: 160,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#1d4ed8',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: '#b91c1c',
    fontSize: 14,
    textAlign: 'center',
  },
});
