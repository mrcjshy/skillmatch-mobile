import { describe, expect, it } from 'vitest';
import {
  DUCK_MOVES, DUCK_PLAY_LIMIT, DUCK_POSES, duckFxPlan, duckMove, duckPoseAt, duckPosePlan, loopRepeats, playLength,
  poseIndex, restingDuckPose, splitTrack, type DuckExpression,
} from './mascot-motion';

const ALL: DuckExpression[] = ['idle', 'hello', 'think', 'celebrate', 'oops', 'sleep', 'point', 'love', 'concern'];

describe('Itik move library', () => {
  it('uses one 3x3 atlas in a fixed pose order', () => {
    expect(DUCK_POSES).toEqual(['idle', 'blink', 'wave', 'think', 'celebrate', 'oops', 'sleep', 'point', 'love']);
    for (const state of ALL) for (const event of duckPosePlan(state)) {
      expect(event.pose).toBeGreaterThanOrEqual(0);
      expect(event.pose).toBeLessThan(9);
    }
  });
  it('waves after an anticipation squash, then returns to a calm idle', () => {
    expect(duckPoseAt('hello', 0)).toBe(poseIndex('idle'));
    expect(duckPoseAt('hello', 140)).toBe(poseIndex('wave'));
    expect(duckPoseAt('hello', 1500)).toBe(poseIndex('wave'));
    expect(duckPoseAt('hello', 1620)).toBe(poseIndex('idle'));
    expect(duckPoseAt('hello', 60_000)).toBe(poseIndex('idle'));
  });
  it('celebrates in the air and lands back on the calm face', () => {
    expect(duckPoseAt('celebrate', 100)).toBe(poseIndex('idle'));
    expect(duckPoseAt('celebrate', 200)).toBe(poseIndex('celebrate'));
    expect(duckPoseAt('celebrate', 1950)).toBe(poseIndex('idle'));
  });
  it('flinches into a worried oops and stays worried; concern is the same move', () => {
    expect(duckMove('concern')).toBe('oops');
    expect(duckPoseAt('oops', 80)).toBe(poseIndex('oops'));
    expect(duckPoseAt('concern', 5000)).toBe(poseIndex('oops'));
  });
  it('blinks briefly only on the calm face, and every timeline ends', () => {
    const blinks = duckPosePlan('idle').filter(event => event.pose === poseIndex('blink'));
    expect(blinks.length).toBeGreaterThan(1);
    expect(duckPoseAt('idle', blinks[0].at)).toBe(poseIndex('blink'));
    expect(duckPoseAt('idle', blinks[0].at + 130)).toBe(poseIndex('idle'));
    // No blink while waving or in the air.
    for (const event of duckPosePlan('hello').filter(e => e.pose === poseIndex('blink'))) expect(event.at).toBeGreaterThanOrEqual(2000);
    for (const event of duckPosePlan('celebrate').filter(e => e.pose === poseIndex('blink'))) expect(event.at).toBeGreaterThanOrEqual(2200);
    for (const state of ALL) {
      expect(Math.max(...duckPosePlan(state).map(e => e.at))).toBeLessThanOrEqual(DUCK_PLAY_LIMIT * 1000);
      expect(playLength(duckMove(state))).toBeLessThanOrEqual(DUCK_PLAY_LIMIT + 0.01);
    }
  });
  it('holds the pose that carries the meaning when motion is reduced', () => {
    expect(restingDuckPose('idle')).toBe(poseIndex('idle'));
    expect(restingDuckPose('hello')).toBe(poseIndex('idle'));
    expect(restingDuckPose('think')).toBe(poseIndex('think'));
    expect(restingDuckPose('celebrate')).toBe(poseIndex('celebrate'));
    expect(restingDuckPose('concern')).toBe(poseIndex('oops'));
    expect(restingDuckPose('sleep')).toBe(poseIndex('sleep'));
    expect(restingDuckPose('point')).toBe(poseIndex('point'));
    expect(restingDuckPose('love')).toBe(poseIndex('love'));
    for (const state of ALL) expect(duckPoseAt(state, 2700, true)).toBe(restingDuckPose(state));
  });
  it('loops a finite number of times from the loop point', () => {
    expect(loopRepeats('hello')).toBe(0);
    for (const move of ['idle', 'think', 'oops', 'sleep', 'point', 'love'] as const) expect(loopRepeats(move)).toBeGreaterThanOrEqual(1);
    const { intro, loop } = splitTrack(DUCK_MOVES.oops.tracks.rot!, 0.8, 2.6);
    expect(intro[0]).toEqual([0, 0]);
    expect(intro[intro.length - 1][0]).toBe(0.8);
    expect(loop[0]).toEqual([0, 0]);
    expect(loop[loop.length - 1][0]).toBeCloseTo(1.8);
    // A short track holds its last value to the end of the move so tracks stay in step.
    const tx = splitTrack(DUCK_MOVES.oops.tracks.tx!, 0.8, 2.6);
    expect(tx.loop[tx.loop.length - 1]).toEqual([1.8, 0]);
    expect(splitTrack(DUCK_MOVES.hello.tracks.ty!, undefined, 2).intro.at(-1)).toEqual([2, 0]);
  });
  it('plans each move\'s effect: sparkle, confetti, thought dots, Zzz and hearts', () => {
    expect(duckFxPlan('hello')).toEqual([{ fx: 'sparkle', at: 340 }]);
    expect(duckFxPlan('celebrate')).toEqual([{ fx: 'confetti', at: 420 }]);
    expect(duckFxPlan('think')).toEqual([{ fx: 'dots', at: 0 }]);
    expect(duckFxPlan('sleep')).toEqual([{ fx: 'zzz', at: 0 }]);
    expect(duckFxPlan('love')).toEqual([{ fx: 'hearts', at: 0 }]);
    expect(duckFxPlan('idle')).toEqual([]);
    expect(duckFxPlan('concern')).toEqual([]);
  });
});
