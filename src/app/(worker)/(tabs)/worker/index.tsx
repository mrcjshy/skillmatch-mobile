import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAccount } from '@/providers/account-provider';
import {
  AVAILABILITY_OPTIONS,
  useWorkerProfile,
  type AvailabilityStatus,
} from '@/providers/worker-profile-provider';

const AVAILABILITY_CHIP: Record<AvailabilityStatus, object> = {
  available: { backgroundColor: '#f0fdf4' },
  busy: { backgroundColor: '#fffbeb' },
  offline: { backgroundColor: '#f1f5f9' },
};

const AVAILABILITY_CHIP_TEXT: Record<AvailabilityStatus, object> = {
  available: { color: '#166534' },
  busy: { color: '#b45309' },
  offline: { color: '#475569' },
};

export default function WorkerHome() {
  const { account } = useAccount();
  const { availability, isLoading, loadError } = useWorkerProfile();
  const router = useRouter();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.identity}>
        <Text style={styles.identityLocation}>
          {account ? `${account.barangay}, ${account.city}` : '—'}
        </Text>
        <Text style={styles.identityName}>{account?.full_name ?? '—'}</Text>
        {!isLoading && !loadError ? (
          <View style={[styles.statusChip, AVAILABILITY_CHIP[availability]]}>
            <Text style={[styles.statusChipText, AVAILABILITY_CHIP_TEXT[availability]]}>
              {AVAILABILITY_OPTIONS.find((option) => option.value === availability)?.label ?? '—'}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.contextCard}>
        <Text style={styles.contextTitle}>Your SkillMatch workspace</Text>
        <Text style={styles.contextText}>
          Use Jobs to find matching opportunities, Bookings to manage accepted work, and Profile
          to update your availability and skills.
        </Text>
      </View>

      {isLoading ? <Text style={styles.note}>Loading your profile…</Text> : null}
      {loadError ? <Text style={styles.error}>{loadError}</Text> : null}

      <Text style={styles.sectionTitle}>Tools</Text>
      <View style={styles.tileGrid}>
        <Pressable
          style={styles.tile}
          onPress={() => router.push('/worker/skill-gap')}
          accessibilityRole="button"
        >
          <Text style={styles.tileTitle}>Skill Gap</Text>
          <Text style={styles.tileHint}>What a job still needs</Text>
        </Pressable>
        <Pressable
          style={styles.tile}
          onPress={() => router.push('/worker/resume')}
          accessibilityRole="button"
        >
          <Text style={styles.tileTitle}>Resume Builder</Text>
          <Text style={styles.tileHint}>Make a PDF resume</Text>
        </Pressable>
        <Pressable
          style={styles.tile}
          onPress={() => router.push('/worker/help')}
          accessibilityRole="button"
        >
          <Text style={styles.tileTitle}>Help &amp; FAQ</Text>
          <Text style={styles.tileHint}>Common questions</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    gap: 12,
    paddingBottom: 48,
  },
  identity: {
    gap: 4,
    paddingBottom: 4,
  },
  identityLocation: {
    fontSize: 13,
    opacity: 0.6,
  },
  identityName: {
    fontSize: 26,
    fontWeight: '700',
  },
  statusChip: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 2,
  },
  statusChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  contextCard: {
    backgroundColor: '#dbeafe',
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  contextTitle: {
    color: '#1d4ed8',
    fontSize: 17,
    fontWeight: '700',
  },
  contextText: {
    color: '#334155',
    fontSize: 14,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  tile: {
    flexGrow: 1,
    flexBasis: '46%',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 2,
  },
  tileTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1d4ed8',
  },
  tileHint: {
    fontSize: 12,
    opacity: 0.6,
  },
  note: {
    fontSize: 14,
    opacity: 0.7,
  },
  error: {
    color: '#b91c1c',
    fontSize: 14,
  },
});
