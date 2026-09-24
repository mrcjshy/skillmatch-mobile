import { useCallback, useState } from 'react';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppField } from '@/components/app-field';
import { AppListRow } from '@/components/app-list-row';
import { InlineStatus } from '@/components/inline-status';
import { SkillMatchTheme } from '@/constants/theme';
import { directoryEmptyMessage, loadAdminDirectory, prepareDirectorySearch, type DirectoryItem, type DirectoryKind, type DirectoryPage } from '@/lib/admin-directories';
import { formatCardDateTime } from '@/lib/date-time';
import { useAccount } from '@/providers/account-provider';
import { useSession } from '@/providers/session-provider';

const { colors, type, spacing } = SkillMatchTheme.ui;

function summary(item: DirectoryItem, kind: DirectoryKind): string {
  const parts = [item.is_active ? 'Active' : 'Inactive'];
  if (kind === 'worker') {
    if (!item.has_profile) parts.push('No profile');
    else {
      parts.push(item.is_verified === true ? 'Verified' : item.is_verified === false ? 'Unverified' : 'Verification not set');
      parts.push(item.availability_status ?? 'Availability not set');
    }
  }
  const joined = formatCardDateTime(item.created_at);
  if (joined) parts.push(`Joined ${joined}`);
  return parts.join(' · ');
}

export function AdminDirectory({ kind }: { kind: DirectoryKind }) {
  const router = useRouter();
  const { account, status } = useAccount();
  const { session } = useSession();
  const adminId = status === 'resolved' && account?.role === 'administrator' && account.is_active &&
    account.id === session?.user.id ? account.id : null;
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<{
    ownerId: string; search: string; page: number; reload: number; value: DirectoryPage;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    if (!adminId) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadAdminDirectory(kind, search, page)
      .then((value) => {
        if (!cancelled) setResult({ ownerId: adminId, search, page, reload, value });
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load the directory. Please try again.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [adminId, kind, search, page, reload]));

  if (!adminId) return <InlineStatus variant="error" message="Admin access is required." />;

  const current = result?.ownerId === adminId && result.search === search && result.page === page && result.reload === reload
    ? result.value : null;
  const totalPages = current ? Math.max(1, Math.ceil(current.total_count / current.page_size)) : 1;
  const title = kind === 'worker' ? 'Workers' : 'Clients';
  const preparedSearch = prepareDirectorySearch(draft);

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      data={loading && !current ? [] : current?.items ?? []}
      keyExtractor={(item) => item.user_id}
      renderItem={({ item }) => <AppListRow title={item.full_name} subtitle={summary(item, kind)} showDivider
        onPress={() => router.push({ pathname: '/admin/user-detail', params: { userId: item.user_id, kind } } as unknown as Href)}
        accessibilityLabel={`View ${kind} details for ${item.full_name}`} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <AppField
            variant="search"
            label={`Search ${title} by name`}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => {
              if (preparedSearch.tooLong) return;
              setPage(1); setSearch(preparedSearch.search); setReload((n) => n + 1);
            }}
            returnKeyType="search"
            errorText={preparedSearch.tooLong ? 'Search must be 100 characters or fewer.' : undefined}
          />
          <View style={styles.buttons}>
            <AppButton label="Search" onPress={() => {
              if (preparedSearch.tooLong) return;
              setPage(1); setSearch(preparedSearch.search); setReload((n) => n + 1);
            }} disabled={preparedSearch.tooLong} />
            <AppButton label="Clear" variant="secondary" onPress={() => {
              setDraft(''); setSearch(''); setPage(1); setReload((n) => n + 1);
            }} disabled={!draft && !search} />
          </View>
          {error ? <InlineStatus variant="error" message={error}
            action={<AppButton label="Retry" variant="secondary" onPress={() => setReload((n) => n + 1)} />} /> : null}
          {loading && !current ? <InlineStatus variant="loading" message={`Loading ${title.toLowerCase()}…`} /> : null}
          {current ? <Text style={styles.count}>{current.total_count} result{current.total_count === 1 ? '' : 's'} · Page {page} of {totalPages}</Text> : null}
        </View>
      }
      ListEmptyComponent={!loading && !error && current?.items.length === 0
        ? <InlineStatus variant="empty" message={directoryEmptyMessage(current, kind, search)} />
        : null}
      ListFooterComponent={current && current.total_count > 0 ?
        <View style={styles.buttons}>
          <AppButton label="Previous" variant="secondary" disabled={loading || page <= 1} onPress={() => setPage((n) => n - 1)} />
          <AppButton label="Next" variant="secondary" disabled={loading || page >= totalPages} onPress={() => setPage((n) => n + 1)} />
        </View> : null}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, padding: spacing.gutter, paddingBottom: spacing.xxxl, gap: spacing.md },
  header: { gap: spacing.md },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  count: { ...type.helper, color: colors.textSecondary },
});
