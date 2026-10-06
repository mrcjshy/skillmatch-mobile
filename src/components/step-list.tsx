import { StyleSheet, Text, View } from 'react-native';

import { AppSymbol } from '@/components/app-symbol';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';

export type StepState = 'done' | 'current' | 'upcoming';

export type Step = {
  label: string;
  /** One short supporting line; leave out when the label is enough. */
  detail?: string;
  state: StepState;
};

const STATE_WORDS: Record<StepState, string> = {
  done: 'done',
  current: 'current step',
  upcoming: 'upcoming',
};

/**
 * Vertical sequence for a real, ordered process (Worker onboarding). Numbers are kept because the
 * order carries meaning; state is conveyed by a check, a filled number or an outlined number plus
 * the spoken state, never colour alone. Flat: no card, a thin rail joins the markers.
 */
export function StepList({ steps }: { steps: readonly Step[] }) {
  const ui = useUiTheme();
  const { colors } = ui;
  const styles = createStyles(ui);

  return (
    <View accessibilityRole="list" style={styles.list}>
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        return (
          <View
            key={step.label}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`Step ${index + 1} of ${steps.length}: ${step.label}, ${STATE_WORDS[step.state]}${step.detail ? `. ${step.detail}` : ''}`}
            style={styles.row}
          >
            <View style={styles.markerColumn}>
              <View
                style={[
                  styles.marker,
                  step.state === 'done' ? styles.markerDone : null,
                  step.state === 'current' ? styles.markerCurrent : null,
                  step.state === 'upcoming' ? styles.markerUpcoming : null,
                ]}
              >
                {step.state === 'done' ? (
                  <AppSymbol synchronousGlyph name={{ android: 'check', ios: 'checkmark' }} size={16} tintColor={colors.onAccent} />
                ) : (
                  <Text style={[styles.markerText, step.state === 'current' ? styles.markerTextCurrent : null]}>
                    {index + 1}
                  </Text>
                )}
              </View>
              {last ? null : <View style={[styles.rail, step.state === 'done' ? styles.railDone : null]} />}
            </View>
            <View style={[styles.copy, last ? null : styles.copyGap]}>
              <Text style={[styles.label, step.state === 'upcoming' ? styles.labelUpcoming : null]}>{step.label}</Text>
              {step.detail ? <Text style={styles.detail}>{step.detail}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing } = ui;
  return StyleSheet.create({
    list: {},
    row: { flexDirection: 'row', gap: spacing.md },
    markerColumn: { width: 28, alignItems: 'center' },
    marker: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.controlBorder,
      backgroundColor: colors.surface,
    },
    markerDone: { backgroundColor: colors.accent, borderColor: colors.accent },
    markerCurrent: { borderColor: colors.accent, backgroundColor: colors.accentSubtle },
    markerUpcoming: {},
    markerText: { ...type.label, color: colors.textSecondary },
    markerTextCurrent: { color: colors.accent },
    rail: { flex: 1, width: 2, minHeight: spacing.md, backgroundColor: colors.hairline, marginVertical: spacing.xs },
    railDone: { backgroundColor: colors.accent },
    copy: { flex: 1, minWidth: 0, gap: spacing.xxs, paddingTop: spacing.xxs },
    copyGap: { paddingBottom: spacing.md },
    label: { ...type.bodyEmphasis, color: colors.textPrimary },
    labelUpcoming: { color: colors.textSecondary },
    detail: { ...type.helper, color: colors.textSecondary },
  });
}
