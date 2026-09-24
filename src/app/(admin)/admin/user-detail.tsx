import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppListRow } from '@/components/app-list-row';
import { InlineStatus } from '@/components/inline-status';
import { SkillMatchTheme } from '@/constants/theme';
import { AdminUserDetailAccessError, isCanonicalUserId, loadAdminUserDetail, type AdminUserDetail } from '@/lib/admin-user-detail';
import type { DirectoryKind } from '@/lib/admin-directories';
import { formatDetailDateTime } from '@/lib/date-time';
import { useAccount } from '@/providers/account-provider';
import { useSession } from '@/providers/session-provider';

const { colors, spacing, type } = SkillMatchTheme.ui;

export default function AdminUserDetailScreen() {
  const params = useLocalSearchParams<{ userId?: string | string[]; kind?: string | string[] }>();
  const userId = typeof params.userId === 'string' && isCanonicalUserId(params.userId) ? params.userId : null;
  const kind: DirectoryKind | null = params.kind === 'worker' || params.kind === 'client' ? params.kind : null;
  const { account, status } = useAccount();
  const { session } = useSession();
  const adminId = status === 'resolved' && account?.role === 'administrator' && account.is_active &&
    account.id === session?.user.id ? account.id : null;
  const [reload, setReload] = useState(0);
  const [outcome, setOutcome] = useState<{
    key: string; detail: AdminUserDetail | null; error: string | null; denied: boolean;
  } | null>(null);
  const requestKey = adminId && userId && kind ? `${adminId}|${userId}|${kind}|${reload}` : null;

  useFocusEffect(useCallback(() => {
    if (!requestKey || !userId || !kind) return undefined;
    let cancelled = false;
    setOutcome(null);
    loadAdminUserDetail(kind, userId)
      .then((detail) => {
        if (!cancelled) setOutcome({ key: requestKey, detail, error: null, denied: false });
      })
      .catch((reason: unknown) => {
        if (!cancelled) setOutcome({
          key: requestKey, detail: null,
          error: reason instanceof AdminUserDetailAccessError
            ? reason.message : 'Unable to load user details. Please try again.',
          denied: reason instanceof AdminUserDetailAccessError,
        });
      });
    return () => { cancelled = true; };
  }, [requestKey, userId, kind]));

  if (!adminId) return <InlineStatus variant="error" message="Admin access is required." />;
  if (!requestKey) return <InlineStatus variant="empty" message="Account unavailable." />;

  const current = outcome?.key === requestKey ? outcome : null;
  if (!current) return <InlineStatus variant="loading" message="Loading user details…" />;
  if (current.error) return <InlineStatus variant="error" message={current.error}
    action={current.denied ? undefined : <AppButton label="Retry" variant="secondary" onPress={() => setReload((n) => n + 1)} />} />;
  if (!current.detail) return <InlineStatus variant="empty" message="Account unavailable." />;

  const detail = current.detail;
  const worker = 'has_profile' in detail ? detail : null;
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <AppListRow title="Name" subtitle={detail.full_name} showDivider />
      <AppListRow title="Account status" subtitle={detail.is_active ? 'Active' : 'Inactive'} showDivider />
      <AppListRow title="Joined" subtitle={formatDetailDateTime(detail.created_at) ?? 'Not recorded'} showDivider />
      {worker ? <>
        <AppListRow title="Worker profile" subtitle={worker.has_profile ? 'Profile present' : 'No profile'} showDivider />
        <AppListRow title="Verification" subtitle={!worker.has_profile ? 'No profile'
          : worker.is_verified === true ? 'Verified' : worker.is_verified === false ? 'Unverified' : 'Not set'} showDivider />
        <AppListRow title="Availability" subtitle={!worker.has_profile ? 'No profile'
          : worker.availability_status ?? 'Not set'} showDivider />
        <AppListRow title="Completed bookings" subtitle={String(worker.completed_bookings_count)} showDivider />
      </> : 'posted_jobs_count' in detail ?
        <AppListRow title="Jobs posted" subtitle={String(detail.posted_jobs_count)} showDivider /> : null}
      <View style={styles.note}><Text style={styles.noteText}>Counts are based on retained records, with no date filter.</Text></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.gutter, paddingBottom: spacing.xxxl },
  note: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  noteText: { ...type.helper, color: colors.textSecondary },
});
