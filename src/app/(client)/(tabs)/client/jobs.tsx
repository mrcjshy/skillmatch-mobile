import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';

import { AppButton } from '@/components/app-button';
import { AppChip } from '@/components/app-chip';
import { InlineStatus } from '@/components/inline-status';
import { SkillMatchTheme } from '@/constants/theme';
import { formatCardDateTime } from '@/lib/date-time';
import { formatClientPostedPaymentLine } from '@/lib/job-payment';
import { useAccount } from '@/providers/account-provider';
import { useClientJobs } from '@/providers/client-jobs-provider';
import { useClientPostJobDraft } from '@/providers/client-post-job-draft-provider';
import { useSession } from '@/providers/session-provider';

const { colors, type, spacing } = SkillMatchTheme.ui;

export default function ClientJobs() {
  const router = useRouter();
  const { account, clientDraftTermination } = useAccount();
  const { sessionRevision, isSessionRevisionCurrent, subscribeSessionLifecycle } = useSession();
  const { isOwnerCurrent } = useClientPostJobDraft();
  const { isLoading, loadError, jobs, refresh } = useClientJobs();
  const clientId = account?.role === 'client' && account.is_active ? account.id : null;
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const operation = useRef<{ cancel: () => void; current: () => boolean } | null>(null);
  const sequence = useRef(0);
  const latestJobs = useRef(jobs);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const hasContinuitySignals = typeof sessionRevision === 'number' && !!isSessionRevisionCurrent && !!subscribeSessionLifecycle && !!clientDraftTermination;
  const authorized = hasContinuitySignals && !!clientId && appActive && AppState.currentState === 'active' && isOwnerCurrent();

  useLayoutEffect(() => { latestJobs.current = jobs; }, [jobs]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => {
      if (next !== 'active') operation.current?.cancel();
      setAppActive(next === 'active');
    });
    return () => subscription.remove();
  }, []);

  useLayoutEffect(() => {
    if (!authorized) operation.current?.cancel();
    return () => { operation.current?.cancel(); };
  }, [authorized, clientId, sessionRevision]);

  const refreshJobs = useCallback(async () => {
    const lifetime = operation.current;
    if (!clientId || !lifetime?.current()) return;
    const request = ++sequence.current;
    const current = () => lifetime.current() && operation.current === lifetime && request === sequence.current;
    setRefreshing(true); setRefreshError(null);
    try {
      // The existing provider owns loader ordering and disposal.
      await refresh(clientId);
      if (current()) setRefreshError(null);
    } catch {
      if (current()) setRefreshError("Couldn't refresh your jobs. Showing the last loaded jobs.");
    } finally {
      if (current()) setRefreshing(false);
    }
  }, [clientId, refresh]);

  useFocusEffect(useCallback(() => {
    operation.current?.cancel();
    if (!clientId || !appActive || !isOwnerCurrent() || AppState.currentState !== 'active' || typeof sessionRevision !== 'number' || !isSessionRevisionCurrent || !subscribeSessionLifecycle || !clientDraftTermination) return;
    let canceled = false;
    let unsubscribeSession = () => {}, unsubscribeAccount = () => {};
    const cancel = () => {
      if (!canceled) { canceled = true; sequence.current++; setRefreshing(false); setRefreshError(null); }
      unsubscribeSession(); unsubscribeAccount();
    };
    const lifetime = {
      cancel,
      current: () => {
        if (canceled) return false;
        try {
          if (AppState.currentState === 'active' && isSessionRevisionCurrent(sessionRevision) && isOwnerCurrent()) return true;
        } catch { /* Fail closed and irreversibly invalidate this focus. */ }
        cancel(); return false;
      },
    };
    operation.current = lifetime;
    unsubscribeSession = subscribeSessionLifecycle(cancel);
    unsubscribeAccount = clientDraftTermination.subscribe(cancel);
    if (lifetime.current()) void refreshJobs();
    else cancel();
    return cancel;
  }, [clientId, appActive, isOwnerCurrent, sessionRevision, isSessionRevisionCurrent, subscribeSessionLifecycle, clientDraftTermination, refreshJobs]));

  const canShowJobs = authorized && !isLoading && !loadError;
  const retry = <AppButton label="Retry" variant="secondary" disabled={!authorized} loading={refreshing} onPress={() => { void refreshJobs(); }} />;
  const empty = !authorized ? <InlineStatus variant="empty" message="Your jobs are unavailable." /> : isLoading ? (
    <InlineStatus variant="loading" message="Loading your jobs…" />
  ) : loadError ? <View style={styles.notice}><InlineStatus variant="error" message={loadError} />{retry}</View> : (
    <InlineStatus variant="empty" message="You have not posted a job yet." />
  );

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      data={canShowJobs ? jobs : []}
      keyExtractor={job => job.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refreshJobs(); }} tintColor={colors.primary} colors={[colors.primary]} />}
      ListHeaderComponent={authorized && refreshError && !loadError ? <View style={styles.notice}><InlineStatus variant="error" message={refreshError} />{retry}</View> : null}
      ListEmptyComponent={empty}
      renderItem={({ item: job }) => (
        <View style={styles.row}>
          <Text selectable style={styles.title}>{job.title}</Text>
          <AppChip label={`Status: ${job.status}`} variant="neutral" />
          {job.description !== null && job.description.trim() ? <Text selectable style={styles.description}>{job.description}</Text> : null}
          <View style={styles.meta}>
            <Text selectable style={styles.line}>Schedule: {formatCardDateTime(job.scheduled_at) ?? 'No schedule'}</Text>
            <Text selectable style={styles.line}>Budget: {job.budget === null ? 'Not set' : '\u20b1' + job.budget.toLocaleString()}</Text>
            {job.payment_method_readable ? <Text selectable style={styles.line}>{formatClientPostedPaymentLine(job.payment_method)}</Text> : null}
            <Text selectable style={styles.line}>Skills: {job.skills.length ? job.skills.join(', ') : 'None'}</Text>
          </View>
          <AppButton label="Details" accessibilityLabel={`Details for ${job.title}`} variant="secondary" disabled={!authorized}
            onPress={() => { if (clientId && operation.current?.current() && latestJobs.current.some(current => current.id === job.id) && isOwnerCurrent() && typeof sessionRevision === 'number' && isSessionRevisionCurrent?.(sessionRevision)) router.push({ pathname: '/client/job-details', params: { jobId: job.id } } as unknown as Href); }} />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, paddingBottom: spacing.xxxl + spacing.sm },
  notice: { gap: spacing.md, paddingBottom: spacing.lg },
  row: { gap: spacing.md, paddingVertical: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title: { ...type.cardTitle, color: colors.textPrimary },
  description: { ...type.body, color: colors.textPrimary },
  meta: { gap: spacing.xs },
  line: { ...type.helper, color: colors.textSecondary },
});
