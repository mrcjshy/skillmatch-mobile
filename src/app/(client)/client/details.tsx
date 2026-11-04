import { Stack, useRouter } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';

import { ProfileDetailsForm } from '@/components/profile-details-form';
import { RefinementThemeProvider, useUiTheme, type UiTheme } from '@/components/refinement-theme';
import { useAccount } from '@/providers/account-provider';
import { useProfileGate } from '@/providers/profile-gate-provider';

/** REG-01: the Client edits the name and home address saved at sign-up. */
export default function ClientDetails() {
  return <RefinementThemeProvider><ClientDetailsContent /></RefinementThemeProvider>;
}

function ClientDetailsContent() {
  const styles = createStyles(useUiTheme());
  const router = useRouter();
  const { account } = useAccount();
  const { refreshProfileGate } = useProfileGate();
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Your details' }} />
      {account?.role === 'client' ? (
        <ProfileDetailsForm userId={account.id} role="client" submitLabel="Save changes"
          onSaved={async () => { await refreshProfileGate(); router.back(); }} />
      ) : null}
    </ScrollView>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, spacing } = ui;
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.canvas },
    content: { paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, paddingBottom: spacing.xxxxl },
  });
}
