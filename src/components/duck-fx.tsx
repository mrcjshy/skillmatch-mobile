import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, ReduceMotion, cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { DUCK_FX_LIFE, duckFxPlan, duckMove, playLength, type DuckExpression, type DuckFx } from '@/lib/mascot-motion';

/**
 * Itik's effects, ported from Mascot Designer's runtime: sparkles (hello), confetti (celebrate),
 * a thought bubble (think), Zzz (sleep) and hearts (love). Units are fractions of the mascot's box;
 * anchors are measured from the idle pose in the cropped atlas cell. Every clock is finite and the
 * layer is decorative: hidden from accessibility, never touchable, and absent under reduced motion.
 */
const A = { cx: 0.5007, top: 0.0157, left: 0.227, right: 0.776 } as const;
/** The source runtime's box was 1024 px; Itik's cell is a 700 px crop of it. */
const K = 1024 / 700;
const COLOURS = {
  spark: '#FFC93C',
  ink: '#372A1B',
  heart: '#FF4F7B',
  confetti: ['#1C3AA6', '#F5911E', '#FFC93C', '#6C7BD0', '#FF4F7B', '#F2CFA0'],
} as const;
const linear = Easing.bezier(0, 0, 1, 1);
const NEVER = ReduceMotion.Never;
const rnd = (i: number, k: number) => { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); };

/** A finite clock in seconds for one effect. */
function useClock(seconds: number) {
  const clock = useSharedValue(0);
  useEffect(() => {
    clock.set(withTiming(seconds, { duration: seconds * 1000, easing: linear, reduceMotion: NEVER }));
    return () => cancelAnimation(clock);
  }, [clock, seconds]);
  return clock;
}

function Sparkle({ size }: { size: number }) {
  const clock = useClock(DUCK_FX_LIFE.sparkle / 1000);
  // [x, y, radius, delay] in the source box, re-based to Itik's cell.
  const points = [[A.left - 0.03 * K, A.top + 0.06 * K, 0.045 * K, 0], [A.left + 0.05 * K, A.top - 0.05 * K, 0.034 * K, 0.1],
    [A.left - 0.08 * K, A.top + 0.2 * K, 0.028 * K, 0.2], [A.right + 0.03 * K, A.top + 0.02 * K, 0.03 * K, 0.15]] as const;
  return <>{points.map(([x, y, r, delay], index) => <Star key={index} clock={clock} x={x} y={y} r={r} delay={delay} size={size} />)}</>;
}
function Star({ clock, x, y, r, delay, size }: { clock: ReturnType<typeof useClock>; x: number; y: number; r: number; delay: number; size: number }) {
  const style = useAnimatedStyle(() => {
    const k = Math.min(1, Math.max(0, (clock.get() - delay) / 0.55));
    const s = k <= 0 || k >= 1 ? 0 : Math.sin(Math.PI * k);
    return { opacity: s > 0 ? 1 : 0, transform: [{ rotate: '45deg' }, { scale: (0.4 + 0.8 * s) * s }] };
  });
  const side = r * size * 1.3;
  return <Animated.View style={[styles.abs, { left: x * size - side / 2, top: y * size - side / 2, width: side, height: side, borderRadius: side * 0.18, backgroundColor: COLOURS.spark }, style]} />;
}

function Confetti({ size }: { size: number }) {
  const clock = useClock(DUCK_FX_LIFE.confetti / 1000);
  return <>{Array.from({ length: 18 }, (_, index) => <Confetto key={index} index={index} clock={clock} size={size} />)}</>;
}
function Confetto({ index, clock, size }: { index: number; clock: ReturnType<typeof useClock>; size: number }) {
  const angle = -Math.PI / 2 + (rnd(index, 1) - 0.5) * 2.4;
  const speed = 0.75 + rnd(index, 2) * 0.75;
  const spin = 4 + rnd(index, 3) * 8;
  const flip = 6 + rnd(index, 4) * 6;
  const round = index % 3 === 0;
  const w = (round ? 0.022 : 0.018) * K * size, h = (round ? 0.022 : 0.032) * K * size;
  const style = useAnimatedStyle(() => {
    const t = clock.get();
    const x = A.cx + (Math.cos(angle) * speed * t + Math.sin(t * 6 + index) * 0.012) * K;
    const y = A.top + (0.04 + Math.sin(angle) * speed * t + 1.6 * t * t) * K;
    const fade = t > 1.45 ? Math.max(0, (1.9 - t) / 0.45) : 1;
    return { opacity: t > 0 ? fade : 0, transform: [{ translateX: x * size - w / 2 }, { translateY: y * size - h / 2 },
      { rotate: `${t * spin + index}rad` }, { scaleY: Math.cos(t * flip + index) }] };
  });
  return <Animated.View style={[styles.abs, { left: 0, top: 0, width: w, height: h, borderRadius: round ? w / 2 : 1,
    backgroundColor: COLOURS.confetti[index % COLOURS.confetti.length] }, style]} />;
}

function ThoughtDots({ size, seconds }: { size: number; seconds: number }) {
  const clock = useClock(seconds);
  const bx = A.right - 0.08 * K, by = A.top - 0.13 * K, bw = 0.22 * K, bh = 0.11 * K;
  const pop = useAnimatedStyle(() => {
    const k = Math.min(1, clock.get() / 0.25);
    const scale = 1 - (1 - k) * (1 - k);
    return { opacity: clock.get() < seconds ? 1 : 0, transform: [{ scale }] };
  });
  return (
    <Animated.View style={[styles.abs, { left: bx * size, top: by * size, width: bw * size, height: (bh + 0.07 * K) * size, transformOrigin: '10% 100%' }, pop]}>
      <View style={[styles.bubble, { width: bw * size, height: bh * size, borderRadius: bh * size / 2 }]}>
        {[0, 1, 2].map((dot) => <Dot key={dot} clock={clock} dot={dot} size={size} />)}
      </View>
      <View style={[styles.bubble, styles.abs, { left: 0.03 * K * size - 0.017 * K * size, top: (bh + 0.02 * K) * size - 0.017 * K * size, width: 0.034 * K * size, height: 0.034 * K * size, borderRadius: size }]} />
      <View style={[styles.bubble, styles.abs, { left: 0.005 * K * size - 0.009 * K * size, top: (bh + 0.055 * K) * size - 0.009 * K * size, width: 0.018 * K * size, height: 0.018 * K * size, borderRadius: size }]} />
    </Animated.View>
  );
}
function Dot({ clock, dot, size }: { clock: ReturnType<typeof useClock>; dot: number; size: number }) {
  const style = useAnimatedStyle(() => {
    const phase = ((clock.get() - dot * 0.18) % 1.2 + 1.2) % 1.2;
    const k = phase < 0.5 ? Math.sin((phase / 0.5) * Math.PI) : 0;
    return { opacity: 0.35 + 0.65 * k, transform: [{ translateY: -k * 0.014 * K * size }] };
  });
  const d = 0.03 * K * size;
  return <Animated.View style={[{ width: d, height: d, borderRadius: d / 2, backgroundColor: COLOURS.ink, marginHorizontal: d * 0.36 }, style]} />;
}

function Zzz({ size, seconds }: { size: number; seconds: number }) {
  const clock = useClock(seconds);
  return <>{[0, 1, 2].map((k) => <Zee key={k} k={k} clock={clock} size={size} seconds={seconds} />)}</>;
}
function Zee({ k, clock, size, seconds }: { k: number; clock: ReturnType<typeof useClock>; size: number; seconds: number }) {
  const style = useAnimatedStyle(() => {
    const t = clock.get(), life = 2.1, local = t - k * 0.7;
    if (local < 0 || t >= seconds) return { opacity: 0 };
    const u = (local % life) / life;
    const alpha = u < 0.12 ? u / 0.12 : u > 0.65 ? (1 - u) / 0.35 : 1;
    const x = A.right + (-0.05 + u * 0.1 + Math.sin(u * 5) * 0.014) * K;
    const y = A.top + (0.06 - u * 0.22) * K;
    return { opacity: alpha, transform: [{ translateX: x * size }, { translateY: y * size }, { rotate: '-0.15rad' }, { scale: 0.65 + u * 0.5 }] };
  });
  return <Animated.Text style={[styles.abs, styles.zee, { left: 0, top: 0, fontSize: 0.1 * K * size, color: COLOURS.ink }, style]}>z</Animated.Text>;
}

function Hearts({ size, seconds }: { size: number; seconds: number }) {
  const clock = useClock(seconds);
  return <>{[0, 1].map((k) => <Heart key={k} k={k} clock={clock} size={size} seconds={seconds} />)}</>;
}
function Heart({ k, clock, size, seconds }: { k: number; clock: ReturnType<typeof useClock>; size: number; seconds: number }) {
  const side = k % 2 ? 1 : -1;
  const style = useAnimatedStyle(() => {
    const t = clock.get(), life = 1.6, local = t - k * 0.8;
    if (local < 0 || t >= seconds) return { opacity: 0 };
    const p = (local % life) / life;
    const alpha = p < 0.15 ? p / 0.15 : p > 0.6 ? (1 - p) / 0.4 : 1;
    const x = A.cx + (side * 0.17 + Math.sin(p * 6) * 0.015) * K;
    const y = A.top + (0.12 - p * 0.2) * K;
    return { opacity: alpha, transform: [{ translateX: x * size }, { translateY: y * size }, { scale: 0.6 + p * 0.6 }] };
  });
  return <Animated.Text style={[styles.abs, styles.heart, { left: 0, top: 0, fontSize: 0.075 * K * size, color: COLOURS.heart }, style]}>♥</Animated.Text>;
}

/** The effects for one expression, timed from when the duck starts the move. */
export function DuckFxLayer({ expression, active, size }: { expression: DuckExpression; active: boolean; size: number }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState<{ expression: DuckExpression; fx: DuckFx[] }>({ expression, fx: [] });
  useEffect(() => {
    // Start each effect at its moment; one-shots end with their life, loops with the move.
    if (!active || reduced) return;
    const length = playLength(duckMove(expression)) * 1000;
    const timers = duckFxPlan(expression).flatMap(({ fx, at }) => {
      const end = Number.isFinite(DUCK_FX_LIFE[fx]) ? at + DUCK_FX_LIFE[fx] : length;
      return [
        setTimeout(() => setShown(current => ({ expression, fx: [...(current.expression === expression ? current.fx : []), fx] })), at),
        setTimeout(() => setShown(current => ({ expression, fx: current.expression === expression ? current.fx.filter(item => item !== fx) : [] })), end),
      ];
    });
    return () => { timers.forEach(clearTimeout); setShown({ expression, fx: [] }); };
  }, [active, expression, reduced]);
  const fx = !active || reduced || shown.expression !== expression ? [] : shown.fx;
  if (!fx.length) return null;
  const seconds = playLength(duckMove(expression));
  return (
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.layer, { width: size, height: size }]}>
      {fx.includes('sparkle') ? <Sparkle size={size} /> : null}
      {fx.includes('confetti') ? <Confetti size={size} /> : null}
      {fx.includes('dots') ? <ThoughtDots size={size} seconds={seconds} /> : null}
      {fx.includes('zzz') ? <Zzz size={size} seconds={seconds} /> : null}
      {fx.includes('hearts') ? <Hearts size={size} seconds={seconds} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, top: 0 },
  abs: { position: 'absolute' },
  bubble: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF',
    boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.14)' },
  zee: { fontWeight: '900' },
  heart: { fontWeight: '700' },
});
