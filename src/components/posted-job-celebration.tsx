import { useEffect, useState } from 'react';
import { AccessibilityInfo, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { MotionView, useAnnounceMotion } from '@/components/motion';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import { SkillMatchMascot } from '@/components/skillmatch-mascot';

/** Itik holding a cobalt megaphone (Mascot Designer, 2026-11-04), same character as the pose atlas. */
const MEGAPHONE = require('@/assets/images/mascot/itik-megaphone.png');

const DUCK_SIZE = 148;
/** The celebrate hop (with confetti) plays first, then Itik picks up the megaphone. */
export const CELEBRATE_MS = 2200;
/** The whole moment closes itself after this, unless the Client closes it first. */
export const CELEBRATION_MS = 7000;

export const POSTED_JOB_COPY = {
  title: 'Job posted!',
  body: 'Itik is telling nearby Workers about your job. You will be notified when one accepts.',
  close: 'View my job',
} as const;

/**
 * The moment after a Client posts a Job: Itik hops and throws confetti, then announces the Job
 * through a megaphone for a few calls. Shown once over Job details; a tap anywhere, the button or
 * seven seconds closes it. Decorative motion only; the words carry the meaning, and under reduced
 * motion Itik simply holds the megaphone.
 */
export function PostedJobCelebration({ onClose }: { onClose: () => void }) {
  const ui = useUiTheme();
  const styles = createStyles(ui);
  const [phase, setPhase] = useState<'celebrate' | 'announce'>('celebrate');
  const announce = useAnnounceMotion(phase === 'announce');
  const showAnnounce = phase === 'announce' || announce.reduced;

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`${POSTED_JOB_COPY.title} ${POSTED_JOB_COPY.body}`);
    const toAnnounce = setTimeout(() => setPhase('announce'), CELEBRATE_MS);
    const close = setTimeout(onClose, CELEBRATION_MS);
    return () => { clearTimeout(toAnnounce); clearTimeout(close); };
  }, [onClose]);

  return (
    <Pressable
      style={styles.scrim}
      onPress={onClose}
      accessibilityRole="button"
      accessibilityLabel={`${POSTED_JOB_COPY.title} Close`}
      accessibilityViewIsModal
    >
      <Pressable style={styles.card} onPress={onClose} accessible={false}>
        <View style={styles.stage} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {showAnnounce ? (
            <View style={styles.announce}>
              <MotionView style={announce.duck}>
                <Image source={MEGAPHONE} style={styles.duck} resizeMode="contain" fadeDuration={0} />
              </MotionView>
              {announce.reduced ? null : (
                <View style={styles.arcs} pointerEvents="none">
                  {announce.arcs.map((style, index) => (
                    <MotionView key={index} style={[styles.arc, { width: 26 + index * 18, height: 26 + index * 18 }, style]} />
                  ))}
                </View>
              )}
            </View>
          ) : (
            <SkillMatchMascot expression="celebrate" size={DUCK_SIZE} />
          )}
        </View>
        <Text style={styles.title} accessibilityRole="header">{POSTED_JOB_COPY.title}</Text>
        <Text style={styles.body}>{POSTED_JOB_COPY.body}</Text>
        <AppButton label={POSTED_JOB_COPY.close} onPress={onClose} />
      </Pressable>
    </Pressable>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing, radius } = ui;
  return StyleSheet.create({
    scrim: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.scrim,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.gutter,
      zIndex: 10,
    },
    card: {
      width: '100%',
      maxWidth: 420,
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.xl,
      paddingBottom: spacing.lg,
      borderRadius: radius.sheet,
      borderCurve: 'continuous',
      backgroundColor: colors.surfaceRaised,
      boxShadow: '0px 12px 32px rgba(27, 31, 36, 0.18)',
    },
    stage: { width: DUCK_SIZE, height: DUCK_SIZE, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
    announce: { width: DUCK_SIZE, height: DUCK_SIZE },
    duck: { width: DUCK_SIZE, height: DUCK_SIZE },
    // Sound arcs ripple from the horn, upper right of the duck.
    arcs: { position: 'absolute', right: -18, top: DUCK_SIZE * 0.22, width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
    arc: {
      position: 'absolute',
      borderRadius: 999,
      borderWidth: 3,
      borderColor: colors.accent,
      borderLeftColor: 'transparent',
      borderBottomColor: 'transparent',
    },
    title: { ...type.screenTitle, color: colors.textPrimary, textAlign: 'center' },
    body: { ...type.body, color: colors.textSecondary, textAlign: 'center' },
  });
}
