import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { FactRow } from '@/components/fact-row';
import { InlineStatus } from '@/components/inline-status';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import { SectionHeader } from '@/components/section-header';
import { SurfaceGroup } from '@/components/surface-group';
import {
  AdminProfileAccessError, EDUCATION_LABELS, formatBirthDate, formatHomeAddress, formatJobYears, formatYears,
  loadAdminAccountProfile, type AdminAccountProfile,
} from '@/lib/profile-details';

/**
 * REG-01 Administrator view of a Worker's resume or a Client's details, contact included, for ID
 * verification and the directories (verified or not). Read-only: get_admin_account_profile.
 */
export function AdminAccountProfileSection({ userId }: { userId: string }) {
  const styles = createStyles(useUiTheme());
  const [attempt, setAttempt] = useState(0);
  const loadKey = `${userId}|${attempt}`;
  const [loaded, setLoaded] = useState<{ key: string; profile: AdminAccountProfile | null; error: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadAdminAccountProfile(userId)
      .then((profile) => { if (!cancelled) setLoaded({ key: loadKey, profile, error: null }); })
      .catch((error: unknown) => {
        if (!cancelled) setLoaded({
          key: loadKey, profile: null,
          error: error instanceof AdminProfileAccessError ? error.message : 'Unable to load this profile. Please try again.',
        });
      });
    return () => { cancelled = true; };
  }, [userId, loadKey]);

  const current = loaded?.key === loadKey ? loaded : null;
  const p = current?.profile ?? null;
  const worker = p?.role === 'worker';

  return (
    <View style={styles.section}>
      <SectionHeader title={p && !worker ? 'Client details' : 'Resume'} />
      {!current ? <InlineStatus variant="loading" skeleton="lines" message="Loading profile…" />
        : current.error || !p ? (
          <InlineStatus variant="error" message={current.error ?? 'Profile unavailable.'}
            action={<AppButton label="Retry" variant="secondary" onPress={() => setAttempt((n) => n + 1)} />} />
        ) : (
          <>
            {p.profile_completed_at === null || (worker && p.resume_completed_at === null) ? (
              <Text style={styles.note}>
                {worker ? 'This Worker has not finished their resume yet. Missing parts show as not provided.'
                  : 'This Client has not finished their details yet.'}
              </Text>
            ) : null}
            <SurfaceGroup>
              <FactRow label="Full name" value={p.full_name} strong />
              {worker ? <FactRow label="Birth date" value={formatBirthDate(p.birth_date) ?? 'Not provided'} /> : null}
              <FactRow label="Home address" value={formatHomeAddress(p) ?? 'Not provided'} />
              <FactRow label="Phone" value={p.phone} selectable />
              <FactRow label="Email" value={p.email} selectable />
            </SurfaceGroup>

            {worker ? (
              <>
                <Text style={styles.subhead}>Education</Text>
                <SurfaceGroup>
                  <FactRow label="Highest education" value={p.education_level ? EDUCATION_LABELS[p.education_level] : 'Not provided'} />
                  {p.school_name ? <FactRow label="School" value={p.school_name} /> : null}
                </SurfaceGroup>

                <Text style={styles.subhead}>Skills and experience</Text>
                {p.skills && p.skills.length > 0 ? (
                  <SurfaceGroup>
                    {p.skills.map((skill) => (
                      <FactRow key={skill.name} label={skill.name} inline
                        value={formatYears(skill.years) || 'Not provided'} />
                    ))}
                  </SurfaceGroup>
                ) : <Text style={styles.note}>No skills added.</Text>}

                <Text style={styles.subhead}>Work history</Text>
                {p.work_history && p.work_history.length > 0 ? (
                  <SurfaceGroup>
                    {p.work_history.map((job, index) => (
                      <FactRow key={`${index}-${job.employer}`} label={formatJobYears(job)} value={`${job.role} · ${job.employer}`} />
                    ))}
                  </SurfaceGroup>
                ) : <Text style={styles.note}>No past jobs listed.</Text>}
              </>
            ) : null}
          </>
        )}
    </View>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing } = ui;
  return StyleSheet.create({
    section: { gap: spacing.md },
    subhead: { ...type.label, color: colors.textPrimary, paddingTop: spacing.sm },
    note: { ...type.helper, color: colors.textSecondary },
  });
}
