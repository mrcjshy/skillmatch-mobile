// From Native Cook "Roadmap Path Stepper" (react-native/src/blocks/navigation/roadmap-path-stepper).
// Only change: @expo/vector-icons is not in this app, so the three Material glyphs come from the
// app's AppSymbol (same Material Symbols).
import { Canvas, Line, Path, vec } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  ReduceMotion,
  type SharedValue,
  cancelAnimation,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import { AppSymbol } from '@/components/app-symbol';

export type RoadmapStep = { title: string; description: string };

type Props = {
  steps?: RoadmapStep[];
  /** The step that is reached when the screen opens, from 0. */
  initialStep?: number;
  /** One or two lines. */
  heading?: string;
  /** The two parts of the pill in the top bar; the second one is heavier. */
  tripLabel?: string;
  tripDate?: string;
  continueLabel?: string;
  accent?: string;
  /** Replays the entrance every LOOP seconds, starting from the finished screen. */
  autoPlay?: boolean;
  /** Called with the step a tap chose. */
  onSelect?: (index: number) => void;
  /** Called with the step Continue moved to. */
  onContinue?: (index: number) => void;
  /** Called when Continue is pressed on the last step. */
  onDone?: () => void;
  onBack?: () => void;
  onHome?: () => void;
};

const STEPS: RoadmapStep[] = [
  { title: 'You are here', description: "You've made the greatest decision of your life to use Passa" },
  { title: 'Submit docs on Passa', description: 'Plug your information into free templates!' },
  { title: 'Passa reviews docs', description: "We'll ensure your application is error free" },
  { title: 'We submit to Govt.', description: 'The embassy reviews your application' },
  { title: 'Track trip status', description: "We'll always update you on your trip" },
  { title: 'Get there on time!', description: "You're ready to start packing for your trip!" },
];

const SCREEN = '#ffffff';
const ACCENT = '#413ef0';
const INK = '#1f1f24';
const MUTE = '#6b6b76';
const TRACK = '#e1e1e1';
const OUTLINE = '#d5d5dc';

// The top bar, below the safe area.
const SIDE = 20;
const BAR_TOP = 11;
const BAR = 32;
const ROUND = 26;
// The stage holds the heading, the path and the list. Everything below is measured from its top
// left corner, which sits this far under the safe area.
const STAGE_TOP = 59;
const HEADING_X = 86;
const HEADING_LINE = 34;
// The path: from the pin beside the heading's first line, left, down, right, and down the rail.
const PIN_X = 72;
const PIN_Y = 17;
const BRACKET_X = 31;
const BRACKET_DROP = 68;
const CORNER = 10;
const RAIL_X = 98;
const STROKE = 2.5;
const RAIL = 2;
// The list scrolls under this line; a step's node sits NODE_INSET under the top of its row.
const LIST_TOP = 113;
const NODE_INSET = 16;
const ROW = 120;
// What the last step needs under its node: three lines of description and some air.
const TAIL = 96;
const NUMBER_X = 63;
const TEXT_X = 129;
const TEXT_WIDTH = 220;
const NODE = 16;
const HOLLOW = 14;
const DOT = 5;
// The pin is a node with one corner left sharp, turned to point down, and a larger dot.
const PIN_TIP = 2;
const PIN_DOT = 6;
const BUTTON = 44;
const PANEL_PAD = 12;
const BUTTON_LIFT = 8;

const RUN_A = PIN_X - BRACKET_X - CORNER;
const RUN_B = BRACKET_DROP - CORNER * 2;
const RUN_C = RAIL_X - BRACKET_X - CORNER * 2;
const TURN = (Math.PI * CORNER) / 2;
// The length of the path down to the list's top edge, and to the first node.
const PATH_TO_LIST = RUN_A + RUN_B + RUN_C + TURN * 3 + (LIST_TOP - PIN_Y - BRACKET_DROP - CORNER);
const PATH_TO_NODE = PATH_TO_LIST + NODE_INSET;
// The path is drawn this much longer than the list, for a pull past the top.
const OVERSCROLL = 240;

/** Seconds. The loop rests on the finished screen, clears it, and plays the entrance again. */
export const LOOP = 10;
const PLAY_AT = 1.5;
// Before the entrance the finished screen fades to white, then stays empty for a beat.
const OUT = 0.45;
const GAP = 0.1;
// The entrance, from the moment the screen is empty: the heading and the first step fade in at
// mid-screen while the pin pops and the path draws itself; the pin rides the path to the first
// node; the screen rises as the accent runs down the rail and brings in a step at each node;
// Continue slides up; then the list goes back to the reached step.
const HEAD_IN = 0.4;
const POP = 0.45;
const DRAW = 0.5;
const GREY_AT = 0.1;
const GREY = 0.5;
const TRAVEL_AT = 0.4;
const TRAVEL = 0.8;
const TOUR_AT = 1.2;
const TOUR = 4.6;
// The share of the tour spent speeding up, and slowing down.
const RAMP = 0.2;
const BUTTON_AT = 5.3;
const BUTTON_IN = 0.4;
const END = 6.3;
// After the entrance the accent takes this long to go back up to the reached step.
const RETURN = 1.2;
// A step starts to show when the accent is LEAD above its node and is whole REVEAL further on.
const LEAD = 56;
const REVEAL = 44;
const SLIDE = 12;
// A node turns over the last points before the accent's end reaches its centre.
const NODE_SPAN = 10;
// Points a second, for the accent on the rail after a tap.
const FILL_SPEED = 300;
// With reduced motion a change is a fade this long.
const FADE = 0.25;
// After a touch the loop waits, puts the screen back and waits for that to end.
const USER_HOLD = 3;
const SETTLE = 2.2;
// A flick carries the list this many seconds of its speed further.
const GLIDE = 0.3;
const BAND = 180;
// A flick settles without a bounce (critical damping); a scripted move overshoots a little.
const GLIDE_SPRING = { mass: 1, stiffness: 90, damping: 2 * Math.sqrt(90) };
const RETURN_SPRING = { mass: 1, stiffness: 90, damping: 14 };

function clamp01(x: number) {
  'worklet';
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function easeOut(t: number) {
  'worklet';
  const u = 1 - clamp01(t);
  return 1 - u * u * u;
}

function easeInOut(t: number) {
  'worklet';
  const u = clamp01(t);
  return u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
}

/** Ease-out that goes a little past 1 and comes back. */
function overshoot(t: number) {
  'worklet';
  const u = clamp01(t) - 1;
  return 1 + 2.70158 * u * u * u + 1.70158 * u * u;
}

function smooth(t: number) {
  'worklet';
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
}

/** A constant speed with a short ramp at each end. */
function steady(t: number) {
  'worklet';
  const u = clamp01(t);
  const area = 2 * RAMP * (1 - RAMP);
  if (u < RAMP) return (u * u) / area;
  if (u > 1 - RAMP) return 1 - ((1 - u) * (1 - u)) / area;
  return (u - RAMP / 2) / (1 - RAMP);
}

/** The point at a length along the path: three straight runs, three corners, then the rail. */
function pathPoint(length: number) {
  'worklet';
  let l = length;
  if (l <= RUN_A) return { x: PIN_X - l, y: PIN_Y };
  l -= RUN_A;
  if (l <= TURN) return { x: BRACKET_X + CORNER - CORNER * Math.sin(l / CORNER), y: PIN_Y + CORNER - CORNER * Math.cos(l / CORNER) };
  l -= TURN;
  if (l <= RUN_B) return { x: BRACKET_X, y: PIN_Y + CORNER + l };
  l -= RUN_B;
  if (l <= TURN) {
    return { x: BRACKET_X + CORNER - CORNER * Math.cos(l / CORNER), y: PIN_Y + BRACKET_DROP - CORNER + CORNER * Math.sin(l / CORNER) };
  }
  l -= TURN;
  if (l <= RUN_C) return { x: BRACKET_X + CORNER + l, y: PIN_Y + BRACKET_DROP };
  l -= RUN_C;
  if (l <= TURN) {
    return { x: RAIL_X - CORNER + CORNER * Math.sin(l / CORNER), y: PIN_Y + BRACKET_DROP + CORNER - CORNER * Math.cos(l / CORNER) };
  }
  return { x: RAIL_X, y: PIN_Y + BRACKET_DROP + CORNER + l - TURN };
}

/** A pull past an edge moves the list less and less. */
function banded(raw: number, max: number) {
  'worklet';
  if (raw < 0) return -(-raw / (1 - raw / BAND));
  if (raw > max) return max + (raw - max) / (1 + (raw - max) / BAND);
  return raw;
}

function unbanded(shown: number, max: number) {
  'worklet';
  const past = shown < 0 ? -shown : shown > max ? shown - max : 0;
  const pulled = past / (1 - Math.min(past, BAND - 1) / BAND);
  return shown < 0 ? -pulled : shown > max ? max + pulled : shown;
}

/** How far a node has turned for an accent that reaches `fill` points under the first node. */
function reachedBy(fill: number, index: number) {
  'worklet';
  return clamp01((fill - index * ROW) / NODE_SPAN + 1);
}

function pathTo(end: number) {
  return (
    `M${PIN_X} ${PIN_Y}H${BRACKET_X + CORNER}A${CORNER} ${CORNER} 0 0 0 ${BRACKET_X} ${PIN_Y + CORNER}` +
    `V${PIN_Y + BRACKET_DROP - CORNER}A${CORNER} ${CORNER} 0 0 0 ${BRACKET_X + CORNER} ${PIN_Y + BRACKET_DROP}` +
    `H${RAIL_X - CORNER}A${CORNER} ${CORNER} 0 0 1 ${RAIL_X} ${PIN_Y + BRACKET_DROP + CORNER}V${end}`
  );
}

function Row({
  index,
  step,
  accent,
  width,
  selected,
  rows,
  onPress,
}: {
  index: number;
  step: RoadmapStep;
  accent: string;
  width: number;
  selected: boolean;
  /** For each step, how much of it shows and how far its node has turned. */
  rows: SharedValue<number[]>;
  onPress: () => void;
}) {
  const rowStyle = useAnimatedStyle(() => {
    const shown = rows.get()[index * 2] ?? 1;
    return { opacity: shown, transform: [{ translateY: (1 - shown) * SLIDE }] };
  });
  const nodeStyle = useAnimatedStyle(() => {
    const reached = rows.get()[index * 2 + 1] ?? 0;
    return { opacity: reached, transform: [{ scale: 0.6 + 0.4 * reached }] };
  });
  return (
    <Animated.View style={[styles.row, { top: index * ROW }, rowStyle]}>
      <Pressable
        style={styles.fill}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`${index + 1}. ${step.title}. ${step.description}`}
      >
        <Text style={styles.number}>{index + 1}</Text>
        <View style={styles.hollow} />
        <Animated.View style={[styles.node, { backgroundColor: accent }, nodeStyle]}>
          <View style={styles.dot} />
        </Animated.View>
        <Text style={styles.title} numberOfLines={1}>
          {step.title}
        </Text>
        {/* Wraps as SwiftUI does: no single word left alone on the last line. */}
        <Text style={[styles.description, { width }]} numberOfLines={3} lineBreakStrategyIOS="standard">
          {step.description}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/**
 * A roadmap screen: a heading, and a path that leaves a pin beside it, turns under it and becomes
 * the rail of a list of steps. On entry the path draws itself, the pin rides it to the first step,
 * and the accent runs down the rail while the screen rises, bringing each step in as it reaches its
 * node. After that the list scrolls, a tap on a step moves the accent to it, and Continue goes one
 * step on.
 */
export function RoadmapPathStepper({
  steps = STEPS,
  initialStep = 0,
  heading = 'The Roadmap to\nYour Trip',
  tripLabel = 'Trip on',
  tripDate = '22 Dec, 09:52 PM',
  continueLabel = 'Continue',
  accent = ACCENT,
  autoPlay = false,
  onSelect,
  onContinue,
  onDone,
  onBack,
  onHome,
}: Props) {
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  // The screen as laid out; the window's size stands in until then.
  const [laidOut, setLaidOut] = useState<{ width: number; height: number } | null>(null);
  const size = laidOut ?? window;
  const last = Math.max(steps.length - 1, 0);
  const first = Math.min(Math.max(initialStep, 0), last);
  const [index, setIndex] = useState(first);
  // The entrance is on its way: touches wait for it.
  const [playing, setPlaying] = useState(!autoPlay && !reducedMotion);
  // Changes on every touch, which restarts the autoPlay loop behind a pause.
  const [touches, setTouches] = useState(0);

  const bottom = Math.max(insets.bottom, 16) + BUTTON_LIFT;
  const panel = PANEL_PAD + BUTTON + bottom;
  const stageTop = insets.top + STAGE_TOP;
  const stageHeight = size.height - stageTop;
  // From the first node to the last.
  const span = last * ROW;
  const maxScroll = Math.max(0, NODE_INSET + span + TAIL - (stageHeight - panel - LIST_TOP));
  // The entrance starts with the heading's first line at mid-screen, this far under its place.
  const rise = Math.max(0, size.height / 2 - stageTop - PIN_Y);
  const riseSpan = Math.min(rise, span);
  const total = PATH_TO_NODE + span + OVERSCROLL;
  const textWidth = Math.min(TEXT_WIDTH, size.width - TEXT_X - SIDE);

  // Seconds since the screen was emptied for the entrance; END and later is the finished screen.
  const elapsed = useSharedValue(playing ? 0 : END);
  const scroll = useSharedValue(0);
  const grab = useSharedValue(0);
  // The accent's end under the first node moves from one place to another.
  const fillFrom = useSharedValue(first * ROW);
  const fillTo = useSharedValue(first * ROW);
  const fillMoved = useSharedValue(1);

  // While the entrance runs it places everything; before and after, the list's own values do.
  const live = useDerivedValue(() => !reducedMotion && elapsed.get() >= 0 && elapsed.get() < END);
  // How far the accent has run down the rail during the entrance.
  const tour = useDerivedValue(() => span * steady((elapsed.get() - TOUR_AT) / TOUR));
  const offset = useDerivedValue(() => (live.get() ? Math.min(Math.max(tour.get() - riseSpan, 0), maxScroll) : scroll.get()));

  const rows = useDerivedValue(() => {
    const e = elapsed.get();
    const from = fillFrom.get();
    const to = fillTo.get();
    const moved = fillMoved.get();
    const out: number[] = [];
    for (let k = 0; k <= last; k++) {
      if (live.get()) {
        const landed = e >= TRAVEL_AT + TRAVEL;
        out.push(k === 0 ? smooth(e / HEAD_IN) : smooth((tour.get() - (k * ROW - LEAD)) / REVEAL));
        out.push(!landed ? 0 : k === 0 ? 1 : reachedBy(tour.get(), k));
      } else {
        out.push(1);
        // With reduced motion the two states cross-fade; otherwise the accent passes the node.
        out.push(reducedMotion ? reachedBy(from, k) * (1 - moved) + reachedBy(to, k) * moved : reachedBy(from + (to - from) * moved, k));
      }
    }
    return out;
  });

  // The accent's length along the path: one stroke, and with reduced motion a second one that
  // fades in or out over the stretch that changes.
  const strokes = useDerivedValue(() => {
    const e = elapsed.get();
    const lengthFor = (fill: number) => Math.max(PATH_TO_LIST, PATH_TO_NODE + fill - offset.get());
    if (live.get()) {
      const drawn = e < DRAW ? PATH_TO_NODE * easeOut(e / DRAW) : lengthFor(tour.get());
      return [drawn, drawn, 0];
    }
    const from = fillFrom.get();
    const to = fillTo.get();
    const moved = fillMoved.get();
    if (!reducedMotion) {
      const now = lengthFor(from + (to - from) * moved);
      return [now, now, 0];
    }
    return [lengthFor(Math.min(from, to)), lengthFor(Math.max(from, to)), to > from ? moved : 1 - moved];
  });
  const solidEnd = useDerivedValue(() => strokes.get()[0] / total);
  const ghostEnd = useDerivedValue(() => strokes.get()[1] / total);
  const ghostOpacity = useDerivedValue(() => strokes.get()[2]);

  const greyFrom = useDerivedValue(() => vec(RAIL_X, Math.max(LIST_TOP, LIST_TOP + NODE_INSET - offset.get())));
  const greyTo = useDerivedValue(() => {
    const top = Math.max(LIST_TOP, LIST_TOP + NODE_INSET - offset.get());
    const full = Math.min(Math.max(top, LIST_TOP + NODE_INSET + span - offset.get()), stageHeight);
    const grown = live.get() ? easeOut((elapsed.get() - GREY_AT) / GREY) : 1;
    return vec(RAIL_X, top + (full - top) * grown);
  });

  const stageStyle = useAnimatedStyle(() => {
    if (!live.get()) return { transform: [{ translateY: 0 }] };
    const lifted = riseSpan > 0 ? Math.min(tour.get() / riseSpan, 1) : steady((elapsed.get() - TOUR_AT) / TOUR);
    return { transform: [{ translateY: rise * (1 - lifted) }] };
  });
  const headingStyle = useAnimatedStyle(() => ({ opacity: live.get() ? clamp01(elapsed.get() / HEAD_IN) : 1 }));
  const contentStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -offset.get() }] }));
  const pinStyle = useAnimatedStyle(() => {
    const e = elapsed.get();
    const along = easeInOut((e - TRAVEL_AT) / TRAVEL);
    const point = pathPoint(PATH_TO_NODE * along);
    // Near the node the tip rounds off and the pin is the node.
    const round = smooth((along - 0.7) / 0.3);
    return {
      opacity: live.get() && e < TRAVEL_AT + TRAVEL ? 1 : 0,
      borderBottomLeftRadius: PIN_TIP + (NODE / 2 - PIN_TIP) * round,
      transform: [{ translateX: point.x - NODE / 2 }, { translateY: point.y - NODE / 2 }, { scale: overshoot(e / POP) }, { rotate: '-45deg' }],
    };
  });
  const pinDotStyle = useAnimatedStyle(() => {
    const round = smooth((easeInOut((elapsed.get() - TRAVEL_AT) / TRAVEL) - 0.7) / 0.3);
    return { transform: [{ scale: 1 - (1 - DOT / PIN_DOT) * round }] };
  });
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: live.get() ? panel * (1 - easeOut((elapsed.get() - BUTTON_AT) / BUTTON_IN)) : 0 }],
  }));
  const veilStyle = useAnimatedStyle(() => {
    const e = elapsed.get();
    return { opacity: e < 0 ? clamp01((e + OUT + GAP) / OUT) : reducedMotion ? 1 - clamp01(e / FADE) : 0 };
  });

  // The entrance ends at the last step: it hands the list over there, and the list goes back.
  useAnimatedReaction(
    () => (reducedMotion || elapsed.get() < 0 ? 0 : elapsed.get() < END ? 1 : 2),
    (now, old) => {
      if (now === 1 && old !== 1) {
        cancelAnimation(scroll);
        cancelAnimation(fillMoved);
        scroll.set(maxScroll);
        fillFrom.set(span);
        fillMoved.set(0);
      } else if (now === 2 && old === 1) {
        scroll.set(withSpring(0, { ...RETURN_SPRING, reduceMotion: ReduceMotion.Never }));
        fillMoved.set(withTiming(1, { duration: RETURN * 1000, easing: Easing.linear, reduceMotion: ReduceMotion.Never }));
      }
    },
  );

  useEffect(
    () => () => {
      cancelAnimation(elapsed);
      cancelAnimation(scroll);
      cancelAnimation(fillMoved);
    },
    [elapsed, scroll, fillMoved],
  );

  const fillTowards = (target: number) => {
    'worklet';
    const now = fillFrom.get() + (fillTo.get() - fillFrom.get()) * fillMoved.get();
    const duration = (reducedMotion ? FADE : Math.abs(target - now) / FILL_SPEED) * 1000;
    fillFrom.set(now);
    fillTo.set(target);
    fillMoved.set(0);
    fillMoved.set(withTiming(1, { duration, easing: Easing.linear, reduceMotion: ReduceMotion.Never }));
  };

  /** Moves the accent, and the reached node, to a step. */
  const reach = (step: number) => {
    setIndex(step);
    scheduleOnUI(fillTowards, step * ROW);
  };

  const scrollTo = (to: number) => {
    scroll.set(reducedMotion ? to : withSpring(to, { ...RETURN_SPRING, reduceMotion: ReduceMotion.Never }));
  };

  /** Plays the entrance: over the finished screen, which fades out first, or from an empty one. */
  const play = (fromRest: boolean) => {
    const from = fromRest ? -(OUT + GAP) : 0;
    const to = reducedMotion ? FADE : END;
    setPlaying(true);
    elapsed.set(from);
    elapsed.set(
      withTiming(to, { duration: (to - from) * 1000, easing: Easing.linear, reduceMotion: ReduceMotion.Never }, (finished) => {
        if (finished) scheduleOnRN(setPlaying, false);
      }),
    );
  };

  const select = (step: number) => {
    if (playing) return;
    if (process.env.EXPO_OS !== 'web') Haptics.selectionAsync().catch(() => {});
    reach(step);
    onSelect?.(step);
  };

  const advance = () => {
    if (playing) return;
    if (process.env.EXPO_OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (index >= last) return onDone?.();
    reach(index + 1);
    // The step it moved to is brought under the one before it at the top.
    scrollTo(Math.min(index * ROW, maxScroll));
    onContinue?.(index + 1);
  };

  // The timers read the latest state when they fire.
  const latest = useRef({ play, reach, scrollTo, playing, first });
  useEffect(() => {
    latest.current = { play, reach, scrollTo, playing, first };
  });

  // Without autoPlay the entrance plays once, when the screen appears.
  useEffect(() => {
    if (!autoPlay && !reducedMotion) latest.current.play(false);
  }, [autoPlay, reducedMotion]);

  useEffect(() => {
    if (!autoPlay) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const after = (ms: number, run: () => void) => timers.push(setTimeout(run, ms));
    const cycle = (origin: number) => {
      after(origin + PLAY_AT * 1000 - Date.now(), () => latest.current.play(true));
      after(origin + LOOP * 1000 - Date.now(), () => cycle(origin + LOOP * 1000));
    };
    const rest = () => {
      if (latest.current.playing) return after(100, rest);
      // The loop starts over from the screen it was given.
      latest.current.reach(latest.current.first);
      latest.current.scrollTo(0);
      after(SETTLE * 1000, () => cycle(Date.now()));
    };
    if (touches === 0) cycle(Date.now());
    else after(USER_HOLD * 1000, rest);
    return () => timers.forEach(clearTimeout);
  }, [autoPlay, touches]);

  const pan = Gesture.Pan()
    .enabled(!playing)
    .activeOffsetY([-6, 6])
    .onStart((event) => {
      cancelAnimation(scroll);
      // The list is taken where it is, not where the finger was when the drag was recognised.
      grab.set(unbanded(scroll.get(), maxScroll) + event.translationY);
    })
    .onUpdate((event) => {
      scroll.set(banded(grab.get() - event.translationY, maxScroll));
    })
    .onEnd((event) => {
      const velocity = -event.velocityY;
      const to = Math.min(Math.max(scroll.get() + velocity * GLIDE, 0), maxScroll);
      scroll.set(withSpring(to, { ...GLIDE_SPRING, velocity, reduceMotion: ReduceMotion.Never }));
    });

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setLaidOut({ width, height });
  };

  return (
    <View style={styles.screen} onLayout={onLayout} onTouchStart={() => setTouches((n) => n + 1)}>
      <StatusBar style="dark" />

      <Animated.View style={[styles.stage, { top: stageTop, height: stageHeight }, stageStyle]}>
        <Animated.Text style={[styles.heading, headingStyle]} numberOfLines={2} accessibilityRole="header">
          {heading}
        </Animated.Text>

        <Canvas style={styles.fill} pointerEvents="none">
          <Line p1={greyFrom} p2={greyTo} color={TRACK} strokeWidth={RAIL} />
          <Path
            path={pathTo(LIST_TOP + NODE_INSET + span + OVERSCROLL)}
            style="stroke"
            strokeWidth={STROKE}
            strokeCap="round"
            color={accent}
            end={ghostEnd}
            opacity={ghostOpacity}
          />
          <Path
            path={pathTo(LIST_TOP + NODE_INSET + span + OVERSCROLL)}
            style="stroke"
            strokeWidth={STROKE}
            strokeCap="round"
            color={accent}
            end={solidEnd}
          />
        </Canvas>

        <GestureDetector gesture={pan}>
          <View style={styles.list}>
            <Animated.View style={contentStyle}>
              {steps.map((step, k) => (
                <Row key={k} index={k} step={step} accent={accent} width={textWidth} selected={k === index} rows={rows} onPress={() => select(k)} />
              ))}
            </Animated.View>
          </View>
        </GestureDetector>

        <Animated.View pointerEvents="none" style={[styles.pin, { backgroundColor: accent }, pinStyle]}>
          <Animated.View style={[styles.pinDot, pinDotStyle]} />
        </Animated.View>
      </Animated.View>

      <Animated.View style={[styles.panel, { height: panel }, panelStyle]}>
        <Pressable onPress={advance} accessibilityRole="button">
          {({ pressed }) => (
            <Animated.View
              style={[styles.button, { backgroundColor: accent, opacity: pressed ? 0.8 : 1, transitionProperty: 'opacity', transitionDuration: 120 }]}
            >
              <Text style={styles.buttonLabel} numberOfLines={1}>
                {continueLabel}
              </Text>
            </Animated.View>
          )}
        </Pressable>
      </Animated.View>

      <Animated.View pointerEvents="none" style={[styles.fill, styles.veil, veilStyle]} />

      <View style={[styles.bar, { top: insets.top + BAR_TOP }]}>
        <Pressable style={[styles.round, styles.back, { borderColor: accent }]} hitSlop={10} onPress={onBack} accessibilityRole="button" accessibilityLabel="Back">
          <AppSymbol name={{ android: 'arrow_back', ios: 'arrow.left' }} size={16} tintColor={accent} />
        </Pressable>
        <View style={[styles.pill, { backgroundColor: accent }]}>
          <AppSymbol name={{ android: 'verified_user', ios: 'checkmark.shield' }} size={14} tintColor={SCREEN} />
          <Text style={styles.pillLabel} numberOfLines={1}>
            {tripLabel} <Text style={styles.pillDate}>{tripDate}</Text>
          </Text>
        </View>
        <Pressable style={[styles.round, { backgroundColor: accent }]} hitSlop={10} onPress={onHome} accessibilityRole="button" accessibilityLabel="Home">
          <AppSymbol name={{ android: 'home', ios: 'house' }} size={16} tintColor={SCREEN} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: SCREEN,
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  stage: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  heading: {
    position: 'absolute',
    left: HEADING_X,
    right: SIDE,
    top: 0,
    color: INK,
    fontSize: 26,
    lineHeight: HEADING_LINE,
    fontWeight: '500',
    includeFontPadding: false,
  },
  list: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: LIST_TOP,
    bottom: 0,
    overflow: 'hidden',
  },
  row: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: ROW,
  },
  number: {
    position: 'absolute',
    left: NUMBER_X - 20,
    top: NODE_INSET - 9,
    width: 40,
    color: INK,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  hollow: {
    position: 'absolute',
    left: RAIL_X - HOLLOW / 2,
    top: NODE_INSET - HOLLOW / 2,
    width: HOLLOW,
    height: HOLLOW,
    borderRadius: HOLLOW / 2,
    borderWidth: 1.5,
    borderColor: OUTLINE,
    backgroundColor: SCREEN,
  },
  node: {
    position: 'absolute',
    left: RAIL_X - NODE / 2,
    top: NODE_INSET - NODE / 2,
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: SCREEN,
  },
  title: {
    position: 'absolute',
    left: TEXT_X,
    right: SIDE,
    top: NODE_INSET - 11,
    color: INK,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '500',
    includeFontPadding: false,
  },
  description: {
    position: 'absolute',
    left: TEXT_X,
    top: NODE_INSET + 17,
    color: MUTE,
    fontSize: 14,
    lineHeight: 19,
    includeFontPadding: false,
  },
  pin: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinDot: {
    width: PIN_DOT,
    height: PIN_DOT,
    borderRadius: PIN_DOT / 2,
    backgroundColor: SCREEN,
  },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: PANEL_PAD,
    paddingHorizontal: SIDE,
    backgroundColor: SCREEN,
  },
  button: {
    height: BUTTON,
    borderRadius: 8,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: {
    color: SCREEN,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
    includeFontPadding: false,
  },
  veil: {
    backgroundColor: SCREEN,
  },
  bar: {
    position: 'absolute',
    left: SIDE,
    right: SIDE,
    height: BAR,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  round: {
    width: ROUND,
    height: ROUND,
    borderRadius: ROUND / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  back: {
    borderWidth: 1.5,
  },
  pill: {
    height: BAR,
    paddingHorizontal: 14,
    borderRadius: BAR / 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pillLabel: {
    color: SCREEN,
    fontSize: 13,
    lineHeight: 17,
    includeFontPadding: false,
  },
  pillDate: {
    fontWeight: '500',
  },
});
