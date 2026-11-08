import { Stack, useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { InlineStatus } from '@/components/inline-status';
import { PortfolioCardStack, type PortfolioCard } from '@/components/PortfolioCardStack';
import { RefinementThemeProvider } from '@/components/refinement-theme';
import { SkillMatchTheme } from '@/constants/theme';
import { loadOwnPortfolio } from '@/lib/portfolio';
import { portfolioCards } from '@/lib/portfolio-cards';
import { useAccount } from '@/providers/account-provider';

const { colors, spacing } = SkillMatchTheme.ui;

/**
 * The Worker's portfolio as a stack of project cards (owner 2026-11-06): tap a card behind or swipe
 * up for the next project, tap the front card to open it. Read again on focus, so a project added
 * through "Edit portfolio" shows when the Worker comes back.
 */
export default function WorkerPortfolioFiles() {
  return <RefinementThemeProvider><WorkerPortfolioFilesContent /></RefinementThemeProvider>;
}

function WorkerPortfolioFilesContent() {
  const router = useRouter();
  const { account } = useAccount();
  const accountId = account?.role === 'worker' ? account.id : null;
  const [state, setState] = useState<{ key: string; cards: PortfolioCard[] | null; error: string | null } | null>(null);

  useFocusEffect(useCallback(() => {
    if (!accountId) return undefined;
    let cancelled = false;
    loadOwnPortfolio(accountId)
      .then((load) => {
        if (cancelled) return;
        const items = load.kind === 'ready' ? load.items : [];
        setState({ key: accountId, cards: items.length ? portfolioCards(items) : null, error: null });
      })
      .catch(() => { if (!cancelled) setState({ key: accountId, cards: null, error: 'Your portfolio could not be loaded. Please try again.' }); });
    return () => { cancelled = true; };
  }, [accountId]));

  const current = state && state.key === accountId ? state : null;
  return (
    <>
      <Stack.Screen options={{ title: 'Portfolio files' }} />
      {!current ? <InlineStatus variant="loading" skeleton="detail" message="Opening your projects…" />
        : current.error ? <InlineStatus variant="error" message={current.error} />
          : !current.cards ? <InlineStatus variant="empty" message="Add a portfolio project to see it here as a card." />
            : (
              // A plain View, not a ScrollView, so a swipe up on the stack is never taken by scrolling.
              <View style={styles.stage}>
                <PortfolioCardStack
                  key={current.cards.map((card) => card.title + card.photoCount).join('|')}
                  cards={current.cards}
                  onEdit={() => router.push('/worker/portfolio' as Href)}
                />
              </View>
            )}
    </>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: colors.canvas },
});
