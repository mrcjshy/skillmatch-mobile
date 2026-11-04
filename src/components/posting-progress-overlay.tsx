import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PostJobSteps } from '@/components/post-job-steps';
import { SkillMatchTheme } from '@/constants/theme';
import { postingStageStatus } from '@/lib/post-job-steps';

const { spacing } = SkillMatchTheme.ui;

/** The cobalt panel floats on the app's own canvas, like the form it came from. */
const STAGE = SkillMatchTheme.ui.colors.canvas;

/**
 * While a Client's Job posts, the wizard's Post a job checklist takes the whole screen. It opens
 * where the form left it (on Review), lands that check, then its fifth step follows the real stages
 * of submitClientPostJob (`finished` = stages done, 0…5) and ends on "Job posted".
 */
export function PostingProgressOverlay({ finished }: { finished: number }) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const live = postingStageStatus(finished);
  return (
    <View style={styles.stage} accessibilityViewIsModal>
      <PostJobSteps step={entered ? 5 : 4} done={live === null} live={entered ? live ?? undefined : undefined} gutter={spacing.sm} />
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    ...StyleSheet.absoluteFill,
    backgroundColor: STAGE,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
});
