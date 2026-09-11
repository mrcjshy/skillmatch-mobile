import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { type Href, useRouter } from 'expo-router';

import { SkillMatchTheme } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAccount } from '@/providers/account-provider';

export default function ClientProfile() {
  const router = useRouter();
  const { account } = useAccount();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

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
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.label}>Full name</Text>
        <Text style={styles.value}>{account?.full_name ?? '—'}</Text>
        <Text style={styles.label}>Phone</Text>
        <Text style={styles.value}>{account?.phone ?? '—'}</Text>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{account?.email ?? '—'}</Text>
        <Text style={styles.label}>Service area</Text>
        <Text style={styles.value}>
          {account ? `${account.barangay}, ${account.city}` : '—'}
        </Text>
      </View>

      <Pressable
        style={[styles.secondaryButton, isSigningOut && styles.buttonDisabled]}
        onPress={() => router.push('/client/my-reports' as unknown as Href)}
        disabled={isSigningOut}
        accessibilityRole="button"
      >
        <Text style={styles.secondaryButtonText}>My Reports</Text>
      </Pressable>
      <Pressable
        style={[styles.secondaryButton, isSigningOut && styles.buttonDisabled]}
        onPress={() => router.push('/client/report-app' as unknown as Href)}
        disabled={isSigningOut}
        accessibilityRole="button"
      >
        <Text style={styles.secondaryButtonText}>Report an app issue</Text>
      </Pressable>
      <Pressable
        style={[styles.secondaryButton, isSigningOut && styles.buttonDisabled]}
        onPress={handleSignOut}
        disabled={isSigningOut}
        accessibilityRole="button"
      >
        {isSigningOut ? (
          <ActivityIndicator />
        ) : (
          <Text style={styles.secondaryButtonText}>Sign Out</Text>
        )}
      </Pressable>
      {signOutError ? <Text style={styles.error}>{signOutError}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 12, paddingBottom: 48 },
  card: { borderWidth: 1, borderColor: SkillMatchTheme.border.default, borderRadius: SkillMatchTheme.radius.card, padding: SkillMatchTheme.spacing.cardPadding, gap: SkillMatchTheme.spacing.cardGap, backgroundColor: SkillMatchTheme.surface.default },
  label: { fontSize: 12, fontWeight: '600', opacity: 0.6, marginTop: 6 },
  value: { fontSize: 16 },
  secondaryButton: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: SkillMatchTheme.brand.primary,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  secondaryButtonText: { color: SkillMatchTheme.brand.primary, fontSize: 16, fontWeight: '600' },
  error: { color: '#b91c1c', fontSize: 14 },
});
