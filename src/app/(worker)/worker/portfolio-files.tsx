import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';

import { ContactFileStack } from '@/components/ContactFileStack';
import { InlineStatus } from '@/components/inline-status';
import { RefinementThemeProvider } from '@/components/refinement-theme';
import { firstNameFromFullName } from '@/lib/initials';
import { loadOwnPortfolio } from '@/lib/portfolio';
import { portfolioFilesCopy, type PortfolioFilesCopy } from '@/lib/portfolio-files';
import { useAccount } from '@/providers/account-provider';
import { useProfileGate } from '@/providers/profile-gate-provider';

/** The Worker's portfolio as the Contact File Stack: tap or drag to open their projects. */
export default function WorkerPortfolioFiles() {
  return <RefinementThemeProvider><WorkerPortfolioFilesContent /></RefinementThemeProvider>;
}

function WorkerPortfolioFilesContent() {
  const { account } = useAccount();
  const savedFirstName = useProfileGate().firstName;
  const accountId = account?.role === 'worker' ? account.id : null;
  const fullName = account?.full_name ?? '';
  const [state, setState] = useState<{ key: string; copy: PortfolioFilesCopy | null; error: string | null } | null>(null);

  useEffect(() => {
    if (!accountId) return undefined;
    let cancelled = false;
    loadOwnPortfolio(accountId)
      .then((load) => {
        if (cancelled) return;
        const items = load.kind === 'ready' ? load.items : [];
        setState({ key: accountId, copy: items.length ? portfolioFilesCopy(items, savedFirstName ?? firstNameFromFullName(fullName)) : null, error: null });
      })
      .catch(() => { if (!cancelled) setState({ key: accountId, copy: null, error: 'Your portfolio could not be loaded. Please try again.' }); });
    return () => { cancelled = true; };
  }, [accountId, fullName, savedFirstName]);

  const current = state && state.key === accountId ? state : null;
  return (
    <>
      <Stack.Screen options={{ title: 'Portfolio files' }} />
      {!current ? <InlineStatus variant="loading" skeleton="detail" message="Opening your files…" />
        : current.error ? <InlineStatus variant="error" message={current.error} />
          : !current.copy ? <InlineStatus variant="empty" message="Add a portfolio project to see it here as a file." />
            : <ContactFileStack {...current.copy} />}
    </>
  );
}
