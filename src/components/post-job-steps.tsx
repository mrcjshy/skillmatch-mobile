import { useIsFocused } from 'expo-router/react-navigation';
import { useEffect, useState } from 'react';
import { AppState, StyleSheet, useWindowDimensions, View } from 'react-native';

import { RECRUITER_STEPS_HEIGHT, RECRUITER_STEPS_WIDTH, RecruiterSteps } from '@/components/RecruiterSteps';
import { SkillMatchTheme } from '@/constants/theme';
import { POST_JOB_STEPS_DONE, POST_JOB_STEPS_TITLE, postJobStepsProgress, postJobStepsStatuses } from '@/lib/post-job-steps';

const { spacing } = SkillMatchTheme.ui;

/**
 * The Post a job checklist: the Recruiter Steps panel with Location, Details, Schedule, Review and
 * Post. The panel is drawn at a fixed size, so where it is wider than the screen less `gutter` on
 * each side it is scaled down to fit (a 360 dp phone with the form's gutters shows it at about 94%).
 */
export function PostJobSteps({ step, done = false, live, gutter = spacing.gutter }: {
  /** 1–4: the wizard step on screen; 5: the Job is being posted. */
  step: number;
  /** Every step finished: the Job is posted. */
  done?: boolean;
  /** Words for the step being worked on instead of its usual status (the live posting stage). */
  live?: string;
  /** Space kept free on each side of the panel. */
  gutter?: number;
}) {
  const { width } = useWindowDimensions();
  // The working step keeps spinning until the next step (owner request 2026-11-04); it only pauses
  // while the screen is not focused or the app is in the background, so it never runs unseen.
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);
  const scale = Math.min(1, Math.max(0.5, (width - gutter * 2) / RECRUITER_STEPS_WIDTH));
  // Scaling keeps the centre, so lift the panel back to the top of its (shorter) frame.
  const lift = (RECRUITER_STEPS_HEIGHT * (1 - scale)) / 2;
  return (
    <View style={[styles.frame, { height: RECRUITER_STEPS_HEIGHT * scale }]}>
      <View style={{ transform: [{ translateY: -lift }, { scale }] }}>
        <RecruiterSteps
          progress={postJobStepsProgress(step, done)}
          title={POST_JOB_STEPS_TITLE}
          statuses={postJobStepsStatuses(step, live)}
          doneStatus={POST_JOB_STEPS_DONE}
          palette="cobalt"
          paused={!focused || !foreground}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
  },
});
