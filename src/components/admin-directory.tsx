import { useCallback, useState } from 'react';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { AdminRow } from '@/components/admin-rows';
import { AppButton } from '@/components/app-button';
import { AppChip } from '@/components/app-chip';
import { AppField } from '@/components/app-field';
import { groupPosition, groupedRowStyle } from '@/components/grouped-row';
import { InitialsAvatar } from '@/components/initials-avatar';
import { InlineStatus } from '@/components/inline-status';
import { RefinementThemeProvider, useUiTheme, type UiTheme } from '@/components/refinement-theme';
import { directoryEmptyMessage, loadAdminDirectory, prepareDirectorySearch, type DirectoryItem, type DirectoryKind, type DirectoryPage } from '@/lib/admin-directories';
import { availabilityLabel, directoryRowStatus, workerVerificationStatus } from '@/lib/admin-presentation';
import { formatCardDateTime } from '@/lib/date-time';
import { useAccount } from '@/providers/account-provider';
import { useSession } from '@/providers/session-provider';

/** The quiet line under a name. The row's one chip carries verification (or Inactive) separately. */
function summary(item: DirectoryItem, kind: DirectoryKind): string {
  const parts: string[] = [];
  if (kind === 'worker') {
    if (!item.is_active) parts.push(workerVerificationStatus(item).label);
    if (item.has_profile) parts.push(availabilityLabel(item.availability_status));
  }
  const joined = formatCardDateTime(item.created_at);
  if (joined) parts.push(`Joined ${joined}`);
  return parts.join(' · ');
}

export function AdminDirectory({ kind }: { kind: DirectoryKind }) {
  return <RefinementThemeProvider><AdminDirectoryContent kind={kind} /></RefinementThemeProvider>;
}

function AdminDirectoryContent({ kind }: { kind: DirectoryKind }) {
  const ui = useUiTheme();
  const styles = createStyles(ui);
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
  const items = loading && !current ? [] : current?.items ?? [];
  const runSearch = () => {
    if (preparedSearch.tooLong) return;
    setPage(1); setSearch(preparedSearch.search); setReload((n) => n + 1);
  };

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      data={items}
      keyExtractor={(item) => item.user_id}
      renderItem={({ item, index }) => {
        const chip = directoryRowStatus(kind, item);
        const line = summary(item, kind);
        return (
          <AdminRow
            style={groupedRowStyle(ui, groupPosition(index, items.length))}
            leading={<InitialsAvatar name={item.full_name} accent={ui.colors.accentSubtle} size={ui.size.iconCircle} />}
            title={item.full_name}
            lines={[line]}
            trailing={<AppChip label={chip.label} variant={chip.variant} />}
            onPress={() => router.push({ pathname: '/admin/user-detail', params: { userId: item.user_id, kind } } as unknown as Href)}
            accessibilityLabel={`View ${kind} details for ${item.full_name}`}
            accessibilityValue={chip.label}
          />
        );
      }}
      ListHeaderComponent={
        <View style={styles.header}>
          <AppField
            variant="search"
            label={`Search ${title} by name`}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={runSearch}
            returnKeyType="search"
            errorText={preparedSearch.tooLong ? 'Search must be 100 characters or fewer.' : undefined}
          />
          <View style={styles.buttons}>
            <AppButton label="Search" variant="secondary" onPress={runSearch} disabled={preparedSearch.tooLong} style={styles.button} />
            <AppButton label="Clear" variant="ghost" onPress={() => {
              setDraft(''); setSearch(''); setPage(1); setReload((n) => n + 1);
            }} disabled={!draft && !search} style={styles.button} />
          </View>
          {error ? <InlineStatus variant="error" message={error}
            action={<AppButton label="Retry" variant="secondary" onPress={() => setReload((n) => n + 1)} />} /> : null}
          {loading && !current ? <InlineStatus variant="loading" message={`Loading ${title.toLowerCase()}…`} /> : null}
          {current ? <Text style={styles.count}>{current.total_count} result{current.total_count === 1 ? '' : 's'} · Page {page} of {totalPages}</Text> : null}
        </View>
      }
      ListEmptyComponent={!loading && !error && current?.items.length === 0
        ? <InlineStatus variant="empty" icon={{ android: 'person', ios: 'person' }} message={directoryEmptyMessage(current, kind, search)} />
        : null}
      ListFooterComponent={current && current.total_count > 0 ?
        <View style={[styles.buttons, styles.footer]}>
          <AppButton label="Previous" variant="secondary" disabled={loading || page <= 1} onPress={() => setPage((n) => n - 1)} style={styles.button} />
          <AppButton label="Next" variant="secondary" disabled={loading || page >= totalPages} onPress={() => setPage((n) => n + 1)} style={styles.button} />
        </View> : null}
    />
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing } = ui;
  return StyleSheet.create({
    list: { flex: 1, backgroundColor: colors.canvas },
    content: { flexGrow: 1, paddingHorizontal: spacing.gutter, paddingTop: spacing.sm, paddingBottom: spacing.xxxxl },
    header: { gap: spacing.md, paddingBottom: spacing.md },
    buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    button: { flexGrow: 1, flexBasis: 120 },
    footer: { paddingTop: spacing.lg },
    count: { ...type.helper, color: colors.textSecondary },
  });
}
