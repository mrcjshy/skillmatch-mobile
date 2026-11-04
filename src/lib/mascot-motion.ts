/**
 * Itik, the SkillMatch worker duck: the move library.
 *
 * Ported from Mascot Designer's runtime/motion.json (times in seconds; tx/ty are fractions of
 * the mascot's box, ty < 0 is up; rot is degrees; sx/sy scale around the feet). Every loop here is
 * finite: an endless animation never lets Android report the UI idle, and a resting duck is calm.
 */

export type DuckExpression = 'idle' | 'hello' | 'think' | 'celebrate' | 'oops' | 'sleep' | 'point' | 'love'
  /** Compatibility alias for 'oops' (existing call sites). */
  | 'concern';
export type DuckMove = Exclude<DuckExpression, 'concern'>;
/** Atlas order: a 3x3 sprite sheet, row by row. */
export const DUCK_POSES = ['idle', 'blink', 'wave', 'think', 'celebrate', 'oops', 'sleep', 'point', 'love'] as const;
export type DuckPose = (typeof DUCK_POSES)[number];
export type DuckEase = 'linear' | 'in' | 'out' | 'inOut';
export type DuckKey = readonly [at: number, value: number, ease?: DuckEase];
export type DuckTrack = 'sx' | 'sy' | 'rot' | 'tx' | 'ty';
export type DuckFx = 'sparkle' | 'confetti' | 'dots' | 'zzz' | 'hearts';
export type DuckMoveDef = {
  duration: number;
  /** Loops from this second onward (0 = the whole move). Absent = plays once, then idles. */
  loopFrom?: number;
  blink: boolean;
  frames: readonly (readonly [at: number, pose: DuckPose])[];
  tracks: Partial<Record<DuckTrack, readonly DuckKey[]>>;
  /** One-shot effects at a time in the move. */
  fx?: readonly (readonly [at: number, fx: DuckFx])[];
  /** An effect that lasts as long as the move. */
  loopFx?: DuckFx;
};

/** Feet line (fraction of the box) that squash and stretch pivot on. */
export const DUCK_GROUND = 0.94;
export const DUCK_BLINK = { duration: 0.13, every: [3.1, 2.4, 0.32, 4.2, 2.9, 3.6, 0.3, 2.2, 4.8] } as const;
/** Bounded playback: a move (and the idle after a one-shot) ends at rest within ~13 s. */
export const DUCK_PLAY_LIMIT = 13;

export const DUCK_MOVES: Record<DuckMove, DuckMoveDef> = {
  idle: {
    duration: 3.6, loopFrom: 0, blink: true, frames: [[0, 'idle']],
    tracks: {
      sy: [[0, 1], [1.8, 1.016, 'inOut'], [3.6, 1, 'inOut']],
      sx: [[0, 1], [1.8, 0.992, 'inOut'], [3.6, 1, 'inOut']],
      rot: [[0, 0], [0.9, 0.6, 'inOut'], [2.7, -0.6, 'inOut'], [3.6, 0, 'inOut']],
    },
  },
  hello: {
    duration: 2.0, blink: true, frames: [[0, 'idle'], [0.14, 'wave'], [1.62, 'idle']],
    tracks: {
      sy: [[0, 1], [0.14, 0.92, 'out'], [0.3, 1.06, 'out'], [0.46, 0.99, 'inOut'], [0.6, 1, 'inOut'], [1.5, 1], [1.62, 0.95, 'in'], [1.78, 1.02, 'out'], [1.95, 1, 'inOut']],
      sx: [[0, 1], [0.14, 1.06, 'out'], [0.3, 0.96, 'out'], [0.46, 1.01, 'inOut'], [0.6, 1, 'inOut'], [1.5, 1], [1.62, 1.04, 'in'], [1.78, 0.99, 'out'], [1.95, 1, 'inOut']],
      rot: [[0, 0], [0.3, -3, 'out'], [0.55, 3.5, 'inOut'], [0.8, -3, 'inOut'], [1.05, 3, 'inOut'], [1.3, -1.5, 'inOut'], [1.55, 0, 'inOut']],
      ty: [[0, 0], [0.14, 0], [0.3, -0.03, 'out'], [0.48, 0, 'in']],
    },
    fx: [[0.34, 'sparkle']],
  },
  think: {
    duration: 2.4, loopFrom: 0, blink: false, frames: [[0, 'think']],
    tracks: {
      ty: [[0, 0], [1.2, -0.018, 'inOut'], [2.4, 0, 'inOut']],
      rot: [[0, -1.5], [1.2, 1.5, 'inOut'], [2.4, -1.5, 'inOut']],
      sy: [[0, 1], [1.2, 1.01, 'inOut'], [2.4, 1, 'inOut']],
    },
    loopFx: 'dots',
  },
  celebrate: {
    duration: 2.2, blink: true, frames: [[0, 'idle'], [0.2, 'celebrate'], [1.95, 'idle']],
    tracks: {
      sy: [[0, 1], [0.2, 0.84, 'out'], [0.36, 1.12, 'out'], [0.56, 1.02, 'inOut'], [0.74, 1.06, 'in'], [0.82, 0.86, 'out'], [0.96, 1.05, 'out'], [1.1, 0.98, 'inOut'], [1.24, 1, 'inOut'], [1.85, 1], [1.95, 0.96, 'in'], [2.1, 1, 'out']],
      sx: [[0, 1], [0.2, 1.12, 'out'], [0.36, 0.92, 'out'], [0.56, 0.99, 'inOut'], [0.74, 0.96, 'in'], [0.82, 1.13, 'out'], [0.96, 0.97, 'out'], [1.1, 1.01, 'inOut'], [1.24, 1, 'inOut'], [1.85, 1], [1.95, 1.03, 'in'], [2.1, 1, 'out']],
      ty: [[0, 0], [0.2, 0], [0.5, -0.2, 'out'], [0.56, -0.205], [0.8, 0, 'in'], [1.0, -0.035, 'out'], [1.12, 0, 'in']],
      rot: [[0, 0], [0.5, -4, 'out'], [0.8, 0, 'in'], [1.0, 3, 'out'], [1.12, 0, 'in']],
    },
    fx: [[0.42, 'confetti']],
  },
  oops: {
    duration: 2.6, loopFrom: 0.8, blink: false, frames: [[0, 'idle'], [0.08, 'oops']],
    tracks: {
      sy: [[0, 1], [0.08, 0.9, 'out'], [0.22, 1.03, 'out'], [0.34, 0.97, 'inOut'], [0.8, 0.97], [1.7, 0.985, 'inOut'], [2.6, 0.97, 'inOut']],
      sx: [[0, 1], [0.08, 1.07, 'out'], [0.22, 0.98, 'out'], [0.34, 1.01, 'inOut'], [0.8, 1.01], [1.7, 1.003, 'inOut'], [2.6, 1.01, 'inOut']],
      tx: [[0, 0], [0.1, 0.03, 'out'], [0.2, -0.024, 'inOut'], [0.3, 0.018, 'inOut'], [0.4, -0.012, 'inOut'], [0.5, 0.006, 'inOut'], [0.6, 0, 'inOut']],
      rot: [[0, 0], [0.1, 2.5, 'out'], [0.2, -2, 'inOut'], [0.3, 1.5, 'inOut'], [0.4, -1, 'inOut'], [0.5, 0, 'inOut'], [0.8, 0], [1.7, -1.2, 'inOut'], [2.6, 0, 'inOut']],
    },
  },
  sleep: {
    duration: 4.4, loopFrom: 0, blink: false, frames: [[0, 'sleep']],
    tracks: {
      sy: [[0, 1], [2.2, 1.03, 'inOut'], [4.4, 1, 'inOut']],
      sx: [[0, 1], [2.2, 1.012, 'inOut'], [4.4, 1, 'inOut']],
      rot: [[0, 0], [2.2, 0.8, 'inOut'], [4.4, 0, 'inOut']],
    },
    loopFx: 'zzz',
  },
  point: {
    duration: 2.4, loopFrom: 0.5, blink: false, frames: [[0, 'point']],
    tracks: {
      sy: [[0, 1], [0.1, 0.95, 'out'], [0.28, 1.03, 'out'], [0.45, 1, 'inOut']],
      sx: [[0, 1], [0.1, 1.04, 'out'], [0.28, 0.98, 'out'], [0.45, 1, 'inOut']],
      tx: [[0, 0], [0.5, 0], [0.75, 0.02, 'out'], [1.0, 0, 'inOut'], [1.2, 0.012, 'out'], [1.4, 0, 'inOut'], [2.4, 0]],
      rot: [[0, 0], [0.28, 2, 'out'], [0.5, 0, 'inOut'], [0.75, 2.5, 'out'], [1.0, 0, 'inOut'], [2.4, 0]],
    },
  },
  love: {
    duration: 2.4, loopFrom: 0, blink: false, frames: [[0, 'love']],
    tracks: {
      sy: [[0, 1], [0.12, 1.035, 'out'], [0.26, 0.995, 'inOut'], [0.4, 1.025, 'out'], [0.6, 1, 'inOut'], [2.4, 1]],
      sx: [[0, 1], [0.12, 1.02, 'out'], [0.26, 1, 'inOut'], [0.4, 1.015, 'out'], [0.6, 1, 'inOut'], [2.4, 1]],
      rot: [[0, -1], [1.2, 1, 'inOut'], [2.4, -1, 'inOut']],
    },
    loopFx: 'hearts',
  },
};

export const NEUTRAL: Record<DuckTrack, number> = { sx: 1, sy: 1, rot: 0, tx: 0, ty: 0 };

export const duckMove = (expression: DuckExpression): DuckMove => expression === 'concern' ? 'oops' : expression;
export const poseIndex = (pose: DuckPose): number => DUCK_POSES.indexOf(pose);

/** What the duck shows when nothing may move (reduced motion, paused): the move's meaning, still. */
export function restingDuckPose(expression: DuckExpression): number {
  const move = duckMove(expression);
  // A greeting rests on the calm face; every other move keeps the pose that carries its meaning.
  return poseIndex(move === 'hello' || move === 'idle' ? 'idle' : move === 'celebrate' ? 'celebrate' : move === 'oops' ? 'oops' : move);
}

/** How many times a looping move repeats its loop before resting (bounded by DUCK_PLAY_LIMIT). */
export function loopRepeats(move: DuckMove): number {
  const def = DUCK_MOVES[move];
  if (def.loopFrom === undefined) return 0;
  const intro = def.loopFrom;
  return Math.max(1, Math.floor((DUCK_PLAY_LIMIT - intro) / (def.duration - intro)));
}

/** Seconds this move plays before it rests (one-shots are followed by a bounded idle). */
export function playLength(move: DuckMove): number {
  const def = DUCK_MOVES[move];
  if (def.loopFrom === undefined) {
    const idle = DUCK_MOVES.idle;
    return def.duration + idle.duration * Math.max(1, Math.floor((DUCK_PLAY_LIMIT - def.duration) / idle.duration));
  }
  return def.loopFrom + (def.duration - def.loopFrom) * loopRepeats(move);
}

export type DuckPoseEvent = { at: number; pose: number };

/** Sprite changes in ms: the move's frames, the idle after a one-shot, and blinks on their own clock. */
export function duckPosePlan(expression: DuckExpression): readonly DuckPoseEvent[] {
  const move = duckMove(expression);
  const def = DUCK_MOVES[move];
  const length = playLength(move);
  const frames = def.frames.map(([at, pose]) => ({ at, pose }));
  if (def.loopFrom === undefined) frames.push({ at: def.duration, pose: 'idle' });
  const poseAt = (t: number) => { let pose: DuckPose = frames[0].pose; for (const f of frames) if (f.at <= t) pose = f.pose; return pose; };
  const events: DuckPoseEvent[] = frames.map(({ at, pose }) => ({ at: Math.round(at * 1000), pose: poseIndex(pose) }));
  if (def.blink) {
    let t = 0;
    for (let i = 0; ; i++) {
      t += DUCK_BLINK.every[i % DUCK_BLINK.every.length];
      if (t + DUCK_BLINK.duration >= length) break;
      // Blink only on the calm face, never mid-wave or mid-jump.
      if (poseAt(t) !== 'idle' || poseAt(t + DUCK_BLINK.duration) !== 'idle') continue;
      events.push({ at: Math.round(t * 1000), pose: poseIndex('blink') }, { at: Math.round((t + DUCK_BLINK.duration) * 1000), pose: poseIndex('idle') });
    }
  }
  return events.sort((a, b) => a.at - b.at);
}

export function duckPoseAt(expression: DuckExpression, elapsedMs: number, reduced = false): number {
  if (reduced) return restingDuckPose(expression);
  let pose = duckPosePlan(expression)[0]?.pose ?? restingDuckPose(expression);
  for (const event of duckPosePlan(expression)) if (event.at <= elapsedMs) pose = event.pose;
  return pose;
}

/** Splits a track at the loop point: keys played once, then keys repeated (re-based to 0). */
export function splitTrack(keys: readonly DuckKey[], loopFrom: number | undefined, duration: number): { intro: DuckKey[]; loop: DuckKey[] } {
  const valueAt = (t: number) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1]; const [t1, v1] = keys[i];
      return t1 === t0 ? v1 : v0 + (v1 - v0) * ((t - t0) / (t1 - t0));
    }
    return keys[keys.length - 1][1];
  };
  // Every track spans the whole move so tracks stay in step (a missing tail holds its last value).
  const full: DuckKey[] = [...keys];
  if (full[full.length - 1][0] < duration) full.push([duration, full[full.length - 1][1]]);
  if (loopFrom === undefined) return { intro: full, loop: [] };
  const intro = full.filter(([t]) => t <= loopFrom);
  if (intro[intro.length - 1][0] < loopFrom) intro.push([loopFrom, valueAt(loopFrom)]);
  const loop: DuckKey[] = [[0, valueAt(loopFrom)], ...full.filter(([t]) => t > loopFrom).map(([t, v, e]): DuckKey => e ? [t - loopFrom, v, e] : [t - loopFrom, v])];
  return { intro: loopFrom === 0 ? [] : intro, loop };
}

/** The effect a move shows, and when it starts (ms). One-shot effects last a fixed time. */
export const DUCK_FX_LIFE: Record<DuckFx, number> = { sparkle: 900, confetti: 1900, dots: Infinity, zzz: Infinity, hearts: Infinity };
export function duckFxPlan(expression: DuckExpression): { fx: DuckFx; at: number }[] {
  const def = DUCK_MOVES[duckMove(expression)];
  return [...(def.fx ?? []).map(([at, fx]) => ({ fx, at: Math.round(at * 1000) })), ...(def.loopFx ? [{ fx: def.loopFx, at: 0 }] : [])];
}
