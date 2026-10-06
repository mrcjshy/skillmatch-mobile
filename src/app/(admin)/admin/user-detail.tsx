import { useCallback, useState } from 'react';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { AdminUserDetailView } from '@/components/admin-user-detail-view';
import { AppButton } from '@/components/app-button';
import { InlineStatus } from '@/components/inline-status';
import { RefinementThemeProvider } from '@/components/refinement-theme';
import { AdminUserDetailAccessError, isCanonicalUserId, loadAdminUserDetail, type AdminUserDetail } from '@/lib/admin-user-detail';
import type { DirectoryKind } from '@/lib/admin-directories';
import { useAccount } from '@/providers/account-provider';
import { useSession } from '@/providers/session-provider';

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

  const title = kind === 'worker' ? 'Worker details' : kind === 'client' ? 'Client details' : 'Account details';
  const current = requestKey && outcome?.key === requestKey ? outcome : null;
  const body = !adminId ? <InlineStatus variant="error" message="Admin access is required." />
    : !requestKey ? <InlineStatus variant="empty" message="Account unavailable." />
      : !current ? <InlineStatus variant="loading" message="Loading user details…" />
        : current.error ? <InlineStatus variant="error" message={current.error}
          action={current.denied ? undefined : <AppButton label="Retry" variant="secondary" onPress={() => setReload((n) => n + 1)} />} />
          : !current.detail ? <InlineStatus variant="empty" message="Account unavailable." />
            : <AdminUserDetailView detail={current.detail} />;

  return (
    <RefinementThemeProvider>
      <Stack.Screen options={{ title }} />
      {body}
    </RefinementThemeProvider>
  );
}
