import { MotionTokens } from '@/constants/motion';

export type DuckExpression = 'idle' | 'hello' | 'think' | 'celebrate' | 'concern';
export type DuckPoseEvent = { at: number; pose: number };

export function restingDuckPose(expression: DuckExpression): number {
  return { idle: 0, hello: 0, think: 4, celebrate: 5, concern: 6 }[expression];
}

/** Finite sprite changes, not a frame-rate JS loop. All nine frames share one decoded image. */
export function duckPosePlan(expression: DuckExpression): readonly DuckPoseEvent[] {
  const { helloDelay, waveLeg, waveEnd, blinkAt, blinkLength } = MotionTokens.duck;
  const blinks = blinkAt.flatMap((at) => [{ at, pose: 1 }, { at: at + blinkLength, pose: 0 }]);
  if (expression === 'hello') return [
    { at: 0, pose: 0 },
    ...Array.from({ length: 6 }, (_, index) => ({ at: helloDelay + waveLeg * index, pose: index % 2 === 0 ? 2 : 3 })),
    { at: waveEnd, pose: 0 }, ...blinks,
  ];
  return expression === 'idle' ? [{ at: 0, pose: 0 }, ...blinks] : [{ at: 0, pose: restingDuckPose(expression) }];
}

export function duckPoseAt(expression: DuckExpression, elapsed: number, reduced = false): number {
  if (reduced) return restingDuckPose(expression);
  let pose = restingDuckPose(expression);
  for (const event of duckPosePlan(expression)) if (event.at <= elapsed) pose = event.pose;
  return pose;
}
