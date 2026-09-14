import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { type Href, useRouter } from 'expo-router';

import { SkillMatchTheme } from '@/constants/theme';
import { CLIENT_HELP_PATH, presentClientProfile } from '@/lib/client-profile';
import { signOutCurrentUser } from '@/lib/sign-out';
import { useAccount } from '@/providers/account-provider';

export default function ClientProfile() {
  const router = useRouter();
  const { account } = useAccount();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const profile = presentClientProfile(account);

  async function handleSignOut() {
    if (isSigningOut) return;
    setSignOutError(null);
    setIsSigningOut(true);
    try {
      const { error } = await signOutCurrentUser();
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
        <Text style={styles.identityName}>{profile.fullName}</Text>
        <Text style={styles.location}>{profile.location}</Text>
        <Text style={styles.label}>Phone</Text>
        <Text style={styles.value}>{profile.phone}</Text>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{profile.email}</Text>
      </View>

      <Text style={styles.sectionTitle}>Tools / Support</Text>
      <View style={styles.card}>
        <NavRow
          label="Help & FAQ"
          hint="Common questions"
          disabled={isSigningOut}
          onPress={() => router.push(CLIENT_HELP_PATH as Href)}
        />
        <NavRow
          label="My Reports"
          hint="Reports you submitted"
          disabled={isSigningOut}
          onPress={() => router.push('/client/my-reports' as unknown as Href)}
        />
        <NavRow
          label="Report an app issue"
          hint="Send an app issue report"
          disabled={isSigningOut}
          last
          onPress={() => router.push('/client/report-app' as unknown as Href)}
        />
      </View>

      <Text style={styles.sectionTitle}>Account</Text>
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

function NavRow({
  label,
  hint,
  disabled,
  last,
  onPress,
}: {
  label: string;
  hint: string;
  disabled: boolean;
  last?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.navRow, !last && styles.navRowBorder, disabled && styles.buttonDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.navCopy}>
        <Text style={styles.navLabel}>{label}</Text>
        <Text style={styles.navHint}>{hint}</Text>
      </View>
      <Text style={styles.navChevron} accessibilityElementsHidden>
        ›
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 12, paddingBottom: 48 },
  card: {
    borderWidth: 1,
    borderColor: SkillMatchTheme.border.default,
    borderRadius: SkillMatchTheme.radius.card,
    padding: SkillMatchTheme.spacing.cardPadding,
    gap: SkillMatchTheme.spacing.cardGap,
    backgroundColor: SkillMatchTheme.surface.default,
  },
  identityName: { fontSize: 22, fontWeight: '700', color: SkillMatchTheme.text.primary },
  location: { fontSize: 14, color: SkillMatchTheme.text.secondary },
  label: { fontSize: 12, fontWeight: '600', opacity: 0.6, marginTop: 6 },
  value: { fontSize: 16, color: SkillMatchTheme.text.primary },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginTop: 8, color: SkillMatchTheme.text.primary },
  secondaryButton: {
    minHeight: SkillMatchTheme.size.iconTarget,
    borderWidth: 1,
    borderColor: SkillMatchTheme.brand.primary,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  secondaryButtonText: { color: SkillMatchTheme.brand.primary, fontSize: 16, fontWeight: '600' },
  error: { color: SkillMatchTheme.feedback.danger, fontSize: 14 },
  navRow: {
    minHeight: SkillMatchTheme.size.iconTarget,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  navRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: SkillMatchTheme.border.default,
  },
  navCopy: { flex: 1, gap: 2 },
  navLabel: { fontSize: 16, fontWeight: '600', color: SkillMatchTheme.brand.primary },
  navHint: { fontSize: 12, color: SkillMatchTheme.text.secondary },
  navChevron: { fontSize: 22, color: SkillMatchTheme.text.secondary, lineHeight: 24 },
});
