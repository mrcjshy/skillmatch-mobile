import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppNotice } from '@/components/app-notice';
import { AppSheet } from '@/components/app-sheet';
import { useUiTheme } from '@/components/refinement-theme';
import { SkillMatchMascot } from '@/components/skillmatch-mascot';

type CancellationSheetProps = {
  visible: boolean;
  title: string;
  description: string;
  keepLabel: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  busy?: boolean;
  error?: string | null;
  confirmDisabled?: boolean;
  /** Reason selection advances to review; only the final step is destructive. */
  reviewing?: boolean;
  onBack?: () => void;
  children?: ReactNode;
};

/** Shared Client/Worker cancellation presentation; it owns no business authority. */
export function CancellationSheet({ visible, title, description, keepLabel, confirmLabel,
  onClose, onConfirm, busy = false, error, confirmDisabled = false, reviewing = false,
  onBack, children }: CancellationSheetProps) {
  const { colors, spacing, type } = useUiTheme();
  const close = () => { if (!busy) onClose(); };

  return (
    <AppSheet visible={visible} onClose={close} title={title} dismissible={!busy}
      titleStyle={type.screenTitle}
      footer={
        <View style={{ gap: spacing.sm }}>
          <AppButton label={busy ? 'Cancelling…' : confirmLabel}
            variant={reviewing ? 'primary' : 'destructive'}
            onPress={() => { if (!busy && !confirmDisabled) void onConfirm(); }}
            loading={busy} disabled={busy || confirmDisabled} />
          <AppButton label={keepLabel} variant={reviewing ? 'ghost' : 'primary'} onPress={close} disabled={busy} />
          {onBack ? <AppButton label="Change reason" variant="ghost" disabled={busy} onPress={onBack} /> : null}
        </View>
      }>
      <View style={[styles.intro, { gap: spacing.md, paddingVertical: spacing.md }]}>
        <SkillMatchMascot expression={busy ? 'think' : 'concern'} active={visible} size={88} />
        <Text style={[type.body, styles.description, { color: colors.textSecondary }]}>{description}</Text>
      </View>
      {children}
      {error ? <AppNotice variant="danger" message={error} /> : null}
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  intro: { alignItems: 'center' },
  description: { textAlign: 'center', alignSelf: 'stretch' },
});
