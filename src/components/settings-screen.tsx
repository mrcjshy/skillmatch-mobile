import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState, Linking, ScrollView, StyleSheet, View } from 'react-native';

import { AppSegment } from '@/components/app-segment';
import { FactRow } from '@/components/fact-row';
import { NavRow } from '@/components/nav-row';
import { SectionHeader } from '@/components/section-header';
import { SurfaceGroup } from '@/components/surface-group';
import { SkillMatchTheme } from '@/constants/theme';
import { RECOVERY_REDIRECT_TO, RECOVERY_TECHNICAL_FAILURE_COPY } from '@/lib/auth-recovery';
import { setMapType, useMapType, type MapType } from '@/lib/map-type';
import { inspectPermission, type PushPermissionStatus } from '@/lib/push-notifications';
import { clearRecentLocations } from '@/lib/recent-locations';
import { supabase } from '@/lib/supabase';
import { useAccount } from '@/providers/account-provider';

const { colors, spacing } = SkillMatchTheme.ui;

const MAP_OPTIONS: readonly { value: MapType; label: string }[] = [
  { value: 'map', label: 'Map' },
  { value: 'satellite', label: 'Satellite' },
];

const APP_VERSION = Constants.expoConfig?.version ? `SkillMatch ${Constants.expoConfig.version}` : 'SkillMatch';

type Sending = 'idle' | 'busy' | 'done' | 'failed';

/**
 * Settings for the Client, Worker and Administrator (owner 2026-11-06). Only things that already
 * work: phone notification and permission settings, the device's Map / Satellite choice, clearing
 * the Client's recent job locations, and the existing password-reset email. Nothing here writes new
 * server data. Admin screens have no map, camera or live location, so the Administrator gets
 * Notifications, Change password and App version only (the same three as the web console).
 */
export function SettingsScreen({ role }: { role: 'client' | 'worker' | 'administrator' }) {
  const { account } = useAccount();
  const mapType = useMapType();
  const [notifications, setNotifications] = useState<PushPermissionStatus | null>(null);
  const [reset, setReset] = useState<Sending>('idle');
  const [recents, setRecents] = useState<Sending>('idle');
  const email = account?.email?.trim() || null;
  const ownerId = account?.role === role && account.is_active ? account.id : null;
  const usesPhoneFeatures = role !== 'administrator';

  // Read again on focus and when the person comes back from the phone's settings.
  useFocusEffect(useCallback(() => {
    const read = () => { inspectPermission(Notifications).then(setNotifications, () => setNotifications(null)); };
    read();
    const subscription = AppState.addEventListener('change', (next) => { if (next === 'active') read(); });
    return () => subscription.remove();
  }, []));

  function openPhoneSettings() {
    void Linking.openSettings().catch(() => undefined);
  }

  async function sendPasswordReset() {
    if (!email || reset === 'busy') return;
    setReset('busy');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: RECOVERY_REDIRECT_TO });
      setReset(error === null ? 'done' : 'failed');
    } catch {
      setReset('failed');
    }
  }

  async function clearRecents() {
    if (!ownerId || recents === 'busy') return;
    setRecents('busy');
    try {
      await clearRecentLocations({ userId: ownerId, isCurrent: () => true });
      setRecents('done');
    } catch {
      setRecents('failed');
    }
  }

  const notificationHint =
    notifications === 'granted' ? 'On · Change in phone settings'
      : notifications === null ? 'Change in phone settings'
        : 'Off · Turn on in phone settings';
  const resetHint =
    reset === 'busy' ? 'Sending the reset link…'
      : reset === 'done' ? `Reset link sent to ${email}`
        : reset === 'failed' ? RECOVERY_TECHNICAL_FAILURE_COPY
          : 'We email you a reset link';
  const recentsHint =
    recents === 'busy' ? 'Clearing…'
      : recents === 'done' ? 'Recent locations cleared'
        : recents === 'failed' ? "Couldn't clear them. Please try again."
          : 'Saved places in Post a job';

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <SectionHeader title="Notifications" />
        <SurfaceGroup inset={spacing.lg}>
          <NavRow
            label="Notifications"
            hint={notificationHint}
            icon={{ android: 'notifications_none', ios: 'bell' }}
            onPress={openPhoneSettings}
          />
          {usesPhoneFeatures ? (
            <NavRow
              label="Phone permissions"
              hint="Location, camera and microphone"
              icon={{ android: 'verified_user', ios: 'checkmark.shield' }}
              onPress={openPhoneSettings}
            />
          ) : null}
        </SurfaceGroup>
      </View>

      {usesPhoneFeatures ? (
        <View style={styles.section}>
          <SectionHeader title="Map" subtitle="Used on every map in SkillMatch" />
          <AppSegment accessibilityLabel="Map style" options={MAP_OPTIONS} value={mapType} onChange={setMapType} />
          {role === 'client' ? (
            <SurfaceGroup inset={spacing.lg}>
              <NavRow
                label="Clear recent locations"
                hint={recentsHint}
                icon={{ android: 'history', ios: 'clock.arrow.circlepath' }}
                disabled={!ownerId || recents === 'busy'}
                onPress={() => { void clearRecents(); }}
              />
            </SurfaceGroup>
          ) : null}
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionHeader title="Account" />
        <SurfaceGroup inset={spacing.lg}>
          <NavRow
            label="Change password"
            hint={resetHint}
            icon={{ android: 'lock', ios: 'lock' }}
            disabled={!email || reset === 'busy'}
            onPress={() => { void sendPasswordReset(); }}
          />
        </SurfaceGroup>
      </View>

      <View style={styles.section}>
        <SectionHeader title="About" />
        <SurfaceGroup inset={spacing.lg}>
          <FactRow icon={{ android: 'info', ios: 'info.circle' }} label="App version" value={APP_VERSION} />
        </SurfaceGroup>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.canvas },
  content: { flexGrow: 1, backgroundColor: colors.canvas, padding: spacing.gutter, gap: spacing.xl, paddingBottom: spacing.xxxxl },
  section: { gap: spacing.md },
});
