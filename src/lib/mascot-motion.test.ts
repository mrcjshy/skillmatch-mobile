import { describe, expect, it } from 'vitest';
import { duckPoseAt, duckPosePlan, restingDuckPose } from './mascot-motion';

describe('duck expression playback', () => {
  it('waves its wing through distinct poses, then returns to a calm idle', () => {
    expect([0, 320, 580, 840, 1100, 2150].map((at) => duckPoseAt('hello', at))).toEqual([0, 2, 3, 2, 3, 0]);
    expect(duckPoseAt('hello', 30_000)).toBe(0);
  });
  it('blinks briefly and reopens its eyes, ending with no endless pose timers', () => {
    expect(duckPoseAt('idle', 2500)).toBe(0);
    expect(duckPoseAt('idle', 2600)).toBe(1);
    expect(duckPoseAt('idle', 2740)).toBe(0);
    expect(duckPoseAt('idle', 60_000)).toBe(0);
    expect(Math.max(...duckPosePlan('idle').map((event) => event.at))).toBeLessThan(12_000);
  });
  it('communicates state without animation when motion is reduced', () => {
    expect(restingDuckPose('hello')).toBe(0);
    expect(restingDuckPose('think')).toBe(4);
    expect(restingDuckPose('celebrate')).toBe(5);
    expect(restingDuckPose('concern')).toBe(6);
    for (const state of ['idle', 'hello', 'think', 'celebrate', 'concern'] as const) {
      expect(duckPoseAt(state, 2700, true)).toBe(restingDuckPose(state));
    }
  });
  it('keeps concern and waiting distinct from celebration and never leaves its 9-frame atlas', () => {
    expect(duckPoseAt('concern', 0)).toBe(6);
    expect(duckPoseAt('think', 0)).toBe(4);
    expect(duckPoseAt('celebrate', 0)).toBe(5);
    for (const state of ['idle', 'hello', 'think', 'celebrate', 'concern'] as const) {
      for (const event of duckPosePlan(state)) expect(event.pose).toBeGreaterThanOrEqual(0);
      for (const event of duckPosePlan(state)) expect(event.pose).toBeLessThan(9);
    }
  });
});
