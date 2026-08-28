import { Link } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

export default function RootIndex() {
  const { session, isSessionLoading, sessionError } = useSession();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  // Auth session status only. Not SkillMatch account authorization.
  const sessionStatus = isSessionLoading
    ? 'Session: checking'
    : sessionError
      ? 'Session: restoration error'
      : session
        ? 'Session: authenticated'
        : 'Session: signed out';

  async function handleSignOut() {
    if (isSigningOut) return;
    setSignOutError(null);
    setIsSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        setSignOutError(error.message || 'Sign out failed. Please try again.');
      }
      // The session provider's auth-state subscription clears the session.
      // No navigation here.
    } catch {
      setSignOutError('Sign out failed. Please try again.');
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>SkillMatch Native Foundation</Text>
      <Text style={styles.disclosure}>
        Authentication UI is active. Account authorization and protected routing
        are not active yet.
      </Text>
      <Text style={styles.sessionStatus}>{sessionStatus}</Text>

      {session ? (
        <View style={styles.signOut}>
          <Pressable
            style={[styles.button, isSigningOut && styles.buttonDisabled]}
            onPress={handleSignOut}
            disabled={isSigningOut}
            accessibilityRole="button"
          >
            {isSigningOut ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Sign Out</Text>
            )}
          </Pressable>
          {signOutError ? <Text style={styles.error}>{signOutError}</Text> : null}
        </View>
      ) : null}

      <View style={styles.links}>
        <Link href="/login" style={styles.link}>
          Login
        </Link>
        <Link href="/register" style={styles.link}>
          Register
        </Link>
        <Link href="/worker" style={styles.link}>
          Worker
        </Link>
        <Link href="/client" style={styles.link}>
          Client
        </Link>
        <Link href="/admin" style={styles.link}>
          Admin
        </Link>
        <Link href="/loading" style={styles.link}>
          Loading
        </Link>
        <Link href="/blocked" style={styles.link}>
          Blocked
        </Link>
      </View>
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
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  disclosure: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.7,
  },
  sessionStatus: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  signOut: {
    alignItems: 'center',
    gap: 8,
  },
  button: {
    backgroundColor: '#1d4ed8',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 24,
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
  error: {
    color: '#b91c1c',
    fontSize: 14,
    textAlign: 'center',
  },
  links: {
    marginTop: 16,
    gap: 12,
    alignItems: 'center',
  },
  link: {
    fontSize: 18,
    color: '#1d4ed8',
    padding: 4,
  },
});
