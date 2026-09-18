import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { AppButton } from '@/components/app-button';
import { AppCard } from '@/components/app-card';
import { InlineStatus } from '@/components/inline-status';
import { SectionHeader } from '@/components/section-header';
import {
  buildResumeHtml,
  loadResume,
  RESUME_COPY,
  ResumeModel,
} from '@/lib/resume';
import { SkillMatchTheme } from '@/constants/theme';
import { useAccount } from '@/providers/account-provider';

const { colors, type, spacing, radius } = SkillMatchTheme.ui;

/**
 * The Auto Resume Builder screen body (AI-02, deterministic core).
 *
 * WHAT THIS SCREEN DOES
 * ---------------------
 * Reads the signed-in Worker's own profile, skills and portfolio, shows a
 * plain preview of exactly which sections the PDF will contain, and on one
 * tap renders the fixed HTML template to a PDF with expo-print and hands the
 * file to the OS share sheet with expo-sharing. That is the whole flow.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * Nothing is uploaded, stored, or sent anywhere. The PDF is a local, transient
 * file owned by the share sheet. No model is consulted: the deterministic
 * piece ships with no AI dependency at all, and the preview says so in plain
 * words so a reader is never led to think otherwise.
 *
 * Identity is the authenticated account from the provider -- the same source
 * every other Worker screen uses -- never a Worker id supplied by a caller.
 *
 * Rendered only inside the protected (worker) group.
 */

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'no-profile' }
  | { kind: 'ready'; model: ResumeModel };

export default function ResumeBuilder() {
  const { account } = useAccount();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [isGenerating, setIsGenerating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const load = useCallback(
    async (run: { cancelled: boolean }) => {
      if (!account) return;
      try {
        const model = await loadResume(account);
        if (run.cancelled) return;
        setState(model === null ? { kind: 'no-profile' } : { kind: 'ready', model });
      } catch {
        if (run.cancelled) return;
        // Codes only, never row contents; nothing here is worth logging.
        setState({ kind: 'error' });
      }
    },
    [account]
  );

  /**
   * Every load originates here, and only here, so the effect cleanup owns
   * the cancel flag for all of them. A change of account recreates `load`,
   * which cleans up the previous run and starts a fresh one; unmount cleans
   * up the last run; Retry only advances `retryToken` so the effect re-runs.
   * No load can therefore outlive the lifecycle that started it.
   *
   * react-hooks/set-state-in-effect rejects any setState reachable from an
   * effect, including one reached after an await inside a useCallback.
   * Fetch-on-mount is the established convention in this codebase, and
   * worker/bookings.tsx (N11-UI) records why the rule is narrowed rather than
   * satisfied: doing so properly would mean a data-fetching library or a
   * restructuring of every screen, which is not AI-02's scope. The suppression
   * is confined to this single effect.
   */
  /* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount; see the note above */
  useEffect(() => {
    const run = { cancelled: false };
    void load(run);
    return () => {
      run.cancelled = true;
    };
  }, [load, retryToken]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function retry() {
    setState({ kind: 'loading' });
    setActionError(null);
    setRetryToken((token) => token + 1);
  }

  /**
   * One tap, one PDF, one share sheet. `isGenerating` is the in-flight guard.
   * A failure anywhere shows one fixed line; nothing about the Worker is
   * logged or echoed.
   */
  async function generateAndShare(model: ResumeModel) {
    if (isGenerating) return;
    setIsGenerating(true);
    setActionError(null);
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        setActionError(RESUME_COPY.shareUnavailable);
        return;
      }
      const { uri } = await Print.printToFileAsync({ html: buildResumeHtml(model) });
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
        dialogTitle: RESUME_COPY.title,
      });
    } catch {
      setActionError(RESUME_COPY.generateFailed);
    } finally {
      setIsGenerating(false);
    }
  }

  if (state.kind === 'loading') {
    return (
      <View style={styles.center}>
        <InlineStatus variant="loading" message={RESUME_COPY.loading} />
      </View>
    );
  }

  if (state.kind === 'error') {
    return (
      <View style={styles.center}>
        <InlineStatus
          variant="error"
          message={RESUME_COPY.loadFailed}
          action={<AppButton label={RESUME_COPY.retry} variant="secondary" onPress={retry} />}
        />
      </View>
    );
  }

  if (state.kind === 'no-profile') {
    return (
      <View style={styles.center}>
        <InlineStatus variant="empty" message={RESUME_COPY.noProfile} />
      </View>
    );
  }

  const { model } = state;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.intro}>
        <Text style={styles.heading}>{RESUME_COPY.heading}</Text>
        <Text style={styles.disclosure}>{RESUME_COPY.disclosure}</Text>
      </View>

      <SectionHeader title={RESUME_COPY.included} />

      <AppCard style={styles.previewCard}>
        <Text style={styles.cardTitle}>{RESUME_COPY.personal}</Text>
        <View style={styles.stack}>
          <Text style={styles.name}>{model.fullName}</Text>
          <Text style={styles.line}>{model.email}</Text>
          <Text style={styles.line}>{model.phone}</Text>
          <Text style={styles.line}>
            {model.barangay}, {model.city}
          </Text>
        </View>
      </AppCard>

      <AppCard style={styles.previewCard}>
        <Text style={styles.cardTitle}>{RESUME_COPY.summary}</Text>
        {model.summary === null ? (
          <Text style={styles.muted}>{RESUME_COPY.noSummary}</Text>
        ) : (
          <Text style={styles.line}>{model.summary}</Text>
        )}
      </AppCard>

      <AppCard style={styles.previewCard}>
        <Text style={styles.cardTitle}>{RESUME_COPY.skills}</Text>
        {model.skills.length === 0 ? (
          <Text style={styles.muted}>{RESUME_COPY.noSkills}</Text>
        ) : (
          <View style={styles.stack}>
            {model.skills.map((s) => (
              <Text key={s.name} style={styles.line}>
                {s.name}
                {s.proficiency === null ? '' : ` — ${capitalize(s.proficiency)}`}
              </Text>
            ))}
          </View>
        )}
      </AppCard>

      <AppCard style={styles.previewCard}>
        <Text style={styles.cardTitle}>{RESUME_COPY.projects}</Text>
        {model.projects.length === 0 ? (
          <Text style={styles.muted}>{RESUME_COPY.noProjects}</Text>
        ) : (
          <View style={styles.stack}>
            {model.projects.map((p, i) => (
              <View key={`${p.title}-${i}`} style={styles.project}>
                <Text style={styles.projectTitle}>{p.title}</Text>
                {p.scale === null ? null : <Text style={styles.muted}>{capitalize(p.scale)} project</Text>}
                {p.description === null ? null : <Text style={styles.line}>{p.description}</Text>}
              </View>
            ))}
          </View>
        )}
      </AppCard>

      <AppCard style={styles.previewCard}>
        <Text style={styles.cardTitle}>{RESUME_COPY.profile}</Text>
        <View style={styles.stack}>
          <Text style={styles.line}>
            {model.isVerified ? RESUME_COPY.pdfVerified : RESUME_COPY.pdfUnverified}
          </Text>
          <Text style={styles.line}>
            {RESUME_COPY.pdfRating}:{' '}
            {model.ratingAvg === null ? RESUME_COPY.pdfNoRating : `${model.ratingAvg.toFixed(1)} / 5`}
          </Text>
        </View>
      </AppCard>

      <AppButton
        variant="primary"
        label={isGenerating ? RESUME_COPY.generating : RESUME_COPY.generate}
        onPress={() => void generateAndShare(model)}
        disabled={isGenerating}
        loading={isGenerating}
      />

      {actionError ? <InlineStatus variant="error" message={actionError} /> : null}
    </ScrollView>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flexGrow: 1,
    backgroundColor: colors.background,
    padding: spacing.gutter,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl + spacing.sm,
  },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.gutter,
  },
  intro: {
    gap: spacing.md,
  },
  heading: {
    ...type.sectionTitle,
    color: colors.textPrimary,
  },
  disclosure: {
    ...type.helper,
    color: colors.textSecondary,
  },
  previewCard: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
  },
  cardTitle: {
    ...type.cardTitle,
    color: colors.textPrimary,
  },
  name: {
    ...type.bodyEmphasis,
    color: colors.textPrimary,
  },
  stack: {
    gap: spacing.sm,
  },
  line: {
    ...type.body,
    color: colors.textPrimary,
  },
  muted: {
    ...type.helper,
    color: colors.textSecondary,
  },
  project: {
    gap: spacing.xs,
  },
  projectTitle: {
    ...type.bodyEmphasis,
    color: colors.textPrimary,
  },
});
