import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppChip } from '@/components/app-chip';
import { FactRow } from '@/components/fact-row';
import { InitialsAvatar } from '@/components/initials-avatar';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import { SectionHeader } from '@/components/section-header';
import { SurfaceGroup } from '@/components/surface-group';
import type { AdminUserDetail } from '@/lib/admin-user-detail';
import {
  accountStatus, accountStatusExplanation, availabilityLabel, workerVerificationStatus,
} from '@/lib/admin-presentation';
import { formatDetailDateTime } from '@/lib/date-time';

/**
 * Read-only Worker or Client account for Admin: who, then account state with what it means, then
 * verification (Worker), then activity counts. AA-05 returns no contact data, so none is shown, and
 * the Admin app has no account-state control, so the state is explained rather than actionable.
 */
export function AdminUserDetailView({ detail }: { detail: AdminUserDetail }) {
  const ui = useUiTheme();
  const styles = createStyles(ui);
  const worker = 'has_profile' in detail ? detail : null;
  const status = accountStatus(detail.is_active);
  const verification = worker ? workerVerificationStatus(worker) : null;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <View style={styles.identity}>
        <InitialsAvatar name={detail.full_name} accent={ui.colors.accentSubtle} size={64} />
        <View style={styles.identityCopy}>
          <Text style={styles.name} accessibilityRole="header">{detail.full_name}</Text>
          <Text style={styles.role}>{worker ? 'Worker account' : 'Client account'}</Text>
          <View style={styles.chips}>
            <AppChip label={status.label} variant={status.variant} />
            {verification && detail.is_active ? <AppChip label={verification.label} variant={verification.variant} /> : null}
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Account" />
        <SurfaceGroup>
          <FactRow label="Account status" value={status.label} strong />
          <FactRow label="Joined" value={formatDetailDateTime(detail.created_at) ?? 'Not recorded'} />
        </SurfaceGroup>
        <Text style={styles.note}>{accountStatusExplanation(detail.is_active)} Account status is shown here for review; it is not changed from this screen.</Text>
      </View>

      {worker ? (
        <View style={styles.section}>
          <SectionHeader title="Verification" />
          <SurfaceGroup>
            <FactRow label="Worker profile" value={worker.has_profile ? 'Profile present' : 'No profile'} />
            <FactRow label="Verification" value={workerVerificationStatus(worker).label} />
            <FactRow label="Availability" value={worker.has_profile ? availabilityLabel(worker.availability_status) : 'No profile'} />
          </SurfaceGroup>
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionHeader title="Activity" />
        <SurfaceGroup>
          {worker
            ? <FactRow label="Completed bookings" value={String(worker.completed_bookings_count)} inline strong />
            : 'posted_jobs_count' in detail
              ? <FactRow label="Jobs posted" value={String(detail.posted_jobs_count)} inline strong />
              : null}
        </SurfaceGroup>
        <Text style={styles.note}>Counts are based on retained records, with no date filter.</Text>
      </View>
    </ScrollView>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing } = ui;
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.canvas },
    content: { flexGrow: 1, paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, paddingBottom: spacing.xxxxl, gap: spacing.xl },
    identity: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
    identityCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
    name: { ...type.screenTitle, color: colors.textPrimary },
    role: { ...type.helper, color: colors.textSecondary },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingTop: spacing.xs },
    section: { gap: spacing.md },
    note: { ...type.helper, color: colors.textSecondary },
  });
}
