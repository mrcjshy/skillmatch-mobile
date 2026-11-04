import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppDialog } from '@/components/app-dialog';
import { AppField } from '@/components/app-field';
import { AppNotice } from '@/components/app-notice';
import { FactRow } from '@/components/fact-row';
import { InlineStatus } from '@/components/inline-status';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import { SectionHeader } from '@/components/section-header';
import { StrikePips } from '@/components/strike-pips';
import { SurfaceGroup } from '@/components/surface-group';
import {
  AccountModerationError, MAX_STRIKES, MODERATION_REASON_MAX, loadAccountModeration, normaliseModerationReason,
  setAccountBanned, strikeSummary, type AccountModeration,
} from '@/lib/admin-account-moderation';
import { formatDetailDateTime } from '@/lib/date-time';

type Props = {
  userId: string;
  isWorker: boolean;
  /** Called after a ban or reinstatement actually changed the account, so the screen reloads. */
  onChanged: (message: string) => void;
};

/**
 * MOD-01 Admin moderation for one Worker or Client: no-show strikes (Worker), the latest ban or
 * reinstatement with its reason, and one action. Active accounts can be banned until reinstated;
 * suspended accounts (banned, or suspended at three strikes) can be reinstated, which resets a
 * Worker's strikes to 0. Both actions need a reason, confirmed in a dialog.
 */
export function AdminAccountModerationPanel({ userId, isWorker, onChanged }: Props) {
  const ui = useUiTheme();
  const styles = createStyles(ui);
  const [attempt, setAttempt] = useState(0);
  const loadKey = `${userId}|${attempt}`;
  const [loaded, setLoaded] = useState<{ key: string; data: AccountModeration | null; error: string | null } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadAccountModeration(userId)
      .then((data) => { if (!cancelled) setLoaded({ key: loadKey, data, error: null }); })
      .catch((reason: unknown) => {
        if (!cancelled) setLoaded({
          key: loadKey,
          data: null,
          error: reason instanceof AccountModerationError ? reason.message : 'Unable to load moderation. Please try again.',
        });
      });
    return () => { cancelled = true; };
  }, [userId, loadKey]);

  // A result for an older key reads as loading, so a retry never shows stale data.
  const state = loaded?.key === loadKey ? loaded : { data: null, error: null };
  const data = state.data;
  const banning = data?.is_active === true;

  async function submit() {
    if (inFlight.current || !data) return;
    const trimmed = normaliseModerationReason(reason);
    if (trimmed === null) {
      setSaveError(`Enter a reason of 1 to ${MODERATION_REASON_MAX} characters.`);
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await setAccountBanned(userId, banning, trimmed);
      setDialogOpen(false);
      setReason('');
      onChanged(!result.changed
        ? 'No change: the account was already in that state.'
        : banning ? 'Account banned. It stays suspended until an Administrator reinstates it.'
          : isWorker ? 'Account reinstated. No-show strikes were reset to 0.' : 'Account reinstated.');
    } catch (error: unknown) {
      setSaveError(error instanceof AccountModerationError ? error.message : 'Unable to update the account. Please try again.');
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  function close() {
    if (saving) return;
    setDialogOpen(false);
    setSaveError(null);
  }

  const lastAt = data?.last_action_at ? formatDetailDateTime(data.last_action_at) : null;
  const remaining = MODERATION_REASON_MAX - reason.trim().length;

  return (
    <View style={styles.section}>
      <SectionHeader title="Moderation" />
      {state.error ? (
        <InlineStatus variant="error" message={state.error}
          action={<AppButton label="Retry" variant="secondary" onPress={() => setAttempt((n) => n + 1)} />} />
      ) : !data ? (
        <InlineStatus variant="loading" skeleton="lines" message="Loading moderation…" />
      ) : (
        <>
          <SurfaceGroup>
            {isWorker ? (
              <View style={styles.strikeRow} accessible accessibilityLabel={`No-show strikes, ${strikeSummary(data.strike_count)}`}>
                <View style={styles.strikeCopy}>
                  <Text style={styles.label}>No-show strikes</Text>
                  <Text style={styles.value}>{strikeSummary(data.strike_count)}</Text>
                </View>
                {data.strike_count !== null ? <StrikePips count={data.strike_count} /> : null}
              </View>
            ) : null}
            <FactRow label="Last action"
              value={data.last_action === null ? 'None' : `${data.last_action === 'ban' ? 'Banned' : 'Reinstated'}${lastAt ? ` · ${lastAt}` : ''}`} />
            {data.last_reason ? <FactRow label="Reason" value={data.last_reason} /> : null}
          </SurfaceGroup>
          <Text style={styles.note}>
            {banning
              ? isWorker
                ? `A Worker is suspended automatically at ${MAX_STRIKES} no-show strikes. A ban suspends the account now, until it is reinstated.`
                : 'A ban suspends the account now, until it is reinstated.'
              : isWorker
                ? 'This account is suspended. Reinstating it restores access and resets no-show strikes to 0.'
                : 'This account is suspended. Reinstating it restores access.'}
          </Text>
          <AppButton
            variant={banning ? 'destructive' : 'primary'}
            label={banning ? 'Ban account' : 'Reinstate account'}
            onPress={() => { setSaveError(null); setDialogOpen(true); }}
          />
        </>
      )}

      <AppDialog
        visible={dialogOpen}
        onRequestClose={close}
        dismissible={!saving}
        title={banning ? 'Ban this account?' : 'Reinstate this account?'}
        message={banning
          ? 'The account is suspended until an Administrator reinstates it. The user is notified with your reason.'
          : isWorker ? 'The account is restored and no-show strikes reset to 0. The user is notified.'
            : 'The account is restored. The user is notified.'}
        actions={
          <>
            <AppButton
              variant={banning ? 'destructive' : 'primary'}
              label={saving ? (banning ? 'Banning…' : 'Reinstating…') : banning ? 'Ban account' : 'Reinstate account'}
              loading={saving}
              disabled={saving}
              onPress={() => { void submit(); }}
            />
            <AppButton variant="ghost" label="Cancel" disabled={saving} onPress={close} />
          </>
        }
      >
        <AppField
          label="Reason"
          value={reason}
          onChangeText={setReason}
          placeholder={banning ? 'Why is this account banned?' : 'Why is this account reinstated?'}
          multiline
          maxLength={MODERATION_REASON_MAX + 20}
          editable={!saving}
          errorText={saveError ?? undefined}
          helperText={`${remaining} characters left`}
          accessibilityLabel="Reason"
        />
        {saveError === null && remaining < 0 ? <AppNotice variant="warning" message="The reason is too long." /> : null}
      </AppDialog>
    </View>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing } = ui;
  return StyleSheet.create({
    section: { gap: spacing.md },
    strikeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
    strikeCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
    label: { ...type.helper, color: colors.textSecondary },
    value: { ...type.body, color: colors.textPrimary, fontWeight: '700' },
    note: { ...type.helper, color: colors.textSecondary },
  });
}
