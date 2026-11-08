// Derived from Native Cook "Boarding Pass Stack" (react-native/src/blocks/cards/boarding-pass-stack).
// Kept as in the source: the panel, the pass shape with its tear line and notches, the three
// colours, the header that rolls, and the whole shuffle (timings, easing, spring, tilt, haptics,
// reduced motion). Changed for the Worker portfolio (owner 2026-11-06):
//  * each card is one portfolio project; there is no airline, route, plane or drawn code;
//  * one or two projects work too: nothing shuffles with one, and a tap never pulls more cards
//    than there are behind the front one;
//  * a tap on the front card opens it: it grows to fill the panel and shows the whole project
//    (photos, scale, date, description); Close or Android Back puts it back.
// Android only: every text uses the app's 'sans-serif' family (src/constants/theme.ts). Without a
// family the phone's own font drew wider than React Native measured, and text was cut short.
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import {
  BackHandler, type GestureResponderEvent, Image, Pressable, ScrollView, StyleSheet, Text, type TextStyle, View,
} from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, LinearGradient as SvgLinearGradient, Path, Polyline, RadialGradient, Stop } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

export type PortfolioCard = {
  /** The card's colour at its top and at its bottom. */
  color: string;
  deep: string;
  title: string;
  /** e.g. "Small job". */
  scale: string;
  /** e.g. "06 NOV 2026". */
  added: string;
  description: string;
  /** Signed photo URLs, in order. */
  photos: string[];
  /** Photos saved for the project (some may have no URL yet). */
  photoCount: number;
  /** e.g. "01". */
  number: string;
  /** e.g. "03". */
  total: string;
  accessibilityLabel: string;
};

type Props = {
  /** The cards, front first. At least one. */
  cards: PortfolioCard[];
  brand?: string;
  headerLabel?: string;
  photosLabel?: string;
  positionLabel?: string;
  editLabel?: string;
  /** Called with the index of the card that is now in front. */
  onChange?: (index: number) => void;
  onEdit?: () => void;
};

const WIDTH = 340;
const HEIGHT = 600;
const RADIUS = 32;
const GLOW_RADIUS = 190;

// Header: the title's box, the row of three items, and the boxes its values roll through.
const CITY_BOX = 54;
const ROW_Y = 112;
const ROW_HEIGHT = 44;
const COLUMN = 100;
const TIME_BOX = 28;

const PASS_X = 20;
const PASS_WIDTH = 300;
const PASS_HEIGHT = 330;
const PASS_RADIUS = 12;
// Height of the strip at the top of a card.
const STRIP = 52;
// Where the stub tears off, and the radius of the notch at each end of that line.
const TEAR = 230;
const NOTCH = 7;
// Top of the front card in the panel, and of the area that takes the stack's touches.
const FRONT_Y = 246;
const STACK_Y = 170;
// The opened card: its inset from the panel's edges and its corner radius.
const OPEN_INSET = 12;
const OPEN_RADIUS = 24;
// The opened card's content width (18 pt padding each side), and three thumbnails to a row under the first photo.
const OPEN_CONTENT = WIDTH - OPEN_INSET * 2 - 36;
const THUMB = (OPEN_CONTENT - 16) / 3;

// Where a card rests behind the front one: its top edge above the front's, scale and darkening.
const SLOT_A = { top: -34, scale: 0.94, shade: 0.16, alpha: 1 };
const SLOT_B = { top: -68, scale: 0.88, shade: 0.3, alpha: 1 };
const SLOT_FRONT = { top: 0, scale: 1, shade: 0, alpha: 1 };
// Cards deeper than the second stay hidden under it.
const SLOT_HIDDEN = { ...SLOT_B, alpha: 0 };
// How far the front card ducks down, and how far the next one is pulled up, before they swap.
const SINK = 190;
const LIFT = 130;
// Degrees the pulled card tips its top edge towards the viewer, and the eye's distance in points.
const TILT = 14;
const PERSPECTIVE = 900;

// Seconds one shuffle takes, and the share of it after which the two cards have swapped depth.
const SHUFFLE = 1.3;
const SHUFFLE_REDUCED = 0.35;
const SWAP = 0.45;
// The spring the pulled card lands on (also used to open a card).
const STIFFNESS = 170;
const DAMPING = 16;
const MASS = 1;

// After a touch the stack waits this long before it settles.
const USER_HOLD = 2.5;
// Finger travel upwards that pulls the next card, and the most a tap may move.
const SWIPE = 36;
const TAP_SLOP = 8;

const INK = '#1b2233';
const ink = (alpha: number) => `rgba(27,34,51,${alpha})`;
const FONT: TextStyle = process.env.EXPO_OS === 'android' ? { fontFamily: 'sans-serif' } : {};

// The outline of a card: a rounded rectangle with a half-round notch at each end of the tear line.
const OUTLINE =
  `M${PASS_RADIUS} 0H${PASS_WIDTH - PASS_RADIUS}A${PASS_RADIUS} ${PASS_RADIUS} 0 0 1 ${PASS_WIDTH} ${PASS_RADIUS}` +
  `V${TEAR - NOTCH}A${NOTCH} ${NOTCH} 0 0 0 ${PASS_WIDTH} ${TEAR + NOTCH}V${PASS_HEIGHT - PASS_RADIUS}` +
  `A${PASS_RADIUS} ${PASS_RADIUS} 0 0 1 ${PASS_WIDTH - PASS_RADIUS} ${PASS_HEIGHT}H${PASS_RADIUS}` +
  `A${PASS_RADIUS} ${PASS_RADIUS} 0 0 1 0 ${PASS_HEIGHT - PASS_RADIUS}V${TEAR + NOTCH}A${NOTCH} ${NOTCH} 0 0 0 0 ${TEAR - NOTCH}` +
  `V${PASS_RADIUS}A${PASS_RADIUS} ${PASS_RADIUS} 0 0 1 ${PASS_RADIUS} 0Z`;
const STRIP_OUTLINE =
  `M${PASS_RADIUS} 0H${PASS_WIDTH - PASS_RADIUS}A${PASS_RADIUS} ${PASS_RADIUS} 0 0 1 ${PASS_WIDTH} ${PASS_RADIUS}` +
  `V${STRIP}H0V${PASS_RADIUS}A${PASS_RADIUS} ${PASS_RADIUS} 0 0 1 ${PASS_RADIUS} 0Z`;

type Pose = {
  /** Top edge, measured from where the front card rests. */
  top: number;
  scale: number;
  /** Degrees around the horizontal axis; negative tips the top edge towards the viewer. */
  tilt: number;
  /** Opacity of the dark veil on a card behind. */
  shade: number;
  alpha: number;
  z: number;
};

function wrapIndex(index: number, count: number) {
  'worklet';
  return ((index % count) + count) % count;
}

function segment(t: number, from: number, to: number) {
  'worklet';
  return Math.min(1, Math.max(0, (t - from) / (to - from)));
}

function easeOut(t: number) {
  'worklet';
  return 1 - Math.pow(1 - t, 3);
}

function easeInOut(t: number) {
  'worklet';
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(2 - 2 * t, 3) / 2;
}

function smooth(t: number) {
  'worklet';
  return t * t * (3 - 2 * t);
}

function mix(a: number, b: number, t: number) {
  'worklet';
  return a + (b - a) * t;
}

/** Step response of the landing spring `seconds` after it is released: 0 → 1 with one overshoot. */
function spring(seconds: number) {
  'worklet';
  if (seconds <= 0) return 0;
  const omega = Math.sqrt(STIFFNESS / MASS);
  const zeta = DAMPING / (2 * Math.sqrt(STIFFNESS * MASS));
  const damped = omega * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * omega * seconds) * (Math.cos(damped * seconds) + ((zeta * omega) / damped) * Math.sin(damped * seconds));
}

/** Place of card `index` in the stack: 0 in front, 1 and 2 behind it, and below 0 while it ducks away. */
function relative(index: number, pos: number, count: number) {
  'worklet';
  let place = (index - pos) % count;
  if (place <= -1) place += count;
  if (place > count - 1) place -= count;
  return place;
}

/** The same place counted from the nearest side, for things that cross-fade: −0.5 … 0.5 around the front. */
function centered(index: number, pos: number, count: number) {
  'worklet';
  let place = (index - pos) % count;
  if (place <= -count / 2) place += count;
  if (place > count / 2) place -= count;
  return place;
}

/** The header changes later than the stack: its position moves only during a part of each shuffle. */
function headerPosition(pos: number, from: number, to: number) {
  'worklet';
  const whole = Math.floor(pos);
  return whole + easeInOut(segment(pos - whole, from, to));
}

/** Opacity of a value that rolls through its box at `place`: it fades only as it leaves the box. */
function rollFade(place: number) {
  'worklet';
  return smooth(Math.min(1, Math.max(0, (0.75 - Math.abs(place)) / 0.3)));
}

/** Where a card rests `depth` places behind the front. */
function slot(depth: number) {
  'worklet';
  if (depth === 0) return SLOT_FRONT;
  if (depth === 1) return SLOT_A;
  return depth === 2 ? SLOT_B : SLOT_HIDDEN;
}

function pose(at: number, count: number, reduced: boolean): Pose {
  'worklet';
  // Reduced motion: every card jumps to its next place half-way while the stack fades through.
  let place = at;
  let fade = 1;
  if (reduced) {
    const nearest = Math.round(place);
    fade = 1 - 2 * Math.abs(place - nearest);
    place = nearest;
  }

  const p: Pose = { top: 0, scale: 1, tilt: 0, shade: 0, alpha: 1, z: 0 };
  if (place <= 0) {
    // The front card ducks down, and once the next one is over it, comes up again at the back.
    const t = -place;
    const back = slot(count - 1);
    if (t < SWAP) {
      const down = easeInOut(segment(t, 0, 0.42));
      p.top = SINK * down;
      p.scale = 1 - 0.03 * down;
      p.shade = 0.1 * down;
      p.z = 3;
    } else {
      const up = easeOut(segment(t, SWAP, 0.95));
      p.top = mix(SINK, back.top, up);
      p.scale = mix(0.97, back.scale, up);
      p.shade = mix(0.1, back.shade, up);
      p.alpha = mix(1, back.alpha, up);
    }
  } else if (place <= 1) {
    // The next card is pulled up out of the stack, tips towards the viewer and drops in front.
    const part = 1 - place;
    const from = slot(1);
    const rise = easeInOut(segment(part, 0, 0.42));
    if (part < SWAP) {
      p.top = from.top - LIFT * rise;
      p.scale = mix(from.scale, 1.03, rise);
      p.z = 2;
    } else {
      const landed = mix(spring((part - SWAP) * SHUFFLE), 1, smooth(segment(part, 0.88, 1)));
      p.top = mix(from.top - LIFT, 0, landed);
      p.scale = mix(1.03, 1, landed);
      p.z = 4;
    }
    p.tilt = -TILT * Math.sin(Math.PI * segment(part, 0.08, 0.85));
    p.shade = from.shade * (1 - rise);
  } else {
    // The cards further back move up one place.
    const depth = Math.ceil(place);
    const from = slot(depth);
    const to = slot(depth - 1);
    const step = easeInOut(segment(depth - place, 0.3, 0.8));
    p.top = mix(from.top, to.top, step);
    p.scale = mix(from.scale, to.scale, step);
    p.shade = mix(from.shade, to.shade, step);
    p.alpha = mix(from.alpha, to.alpha, step);
    p.z = depth === 2 ? 1 : 0;
  }
  p.alpha *= fade;
  return p;
}

type Motion = {
  pos: SharedValue<number>;
  index: number;
  count: number;
  reduced: boolean;
};

function Glow({ color, opacity, x, y }: { color: string; opacity: number; x: number; y: number }) {
  return (
    <Svg width={GLOW_RADIUS * 2} height={GLOW_RADIUS * 2} style={{ position: 'absolute', left: x - GLOW_RADIUS, top: y - GLOW_RADIUS }}>
      <Defs>
        <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
          <Stop offset={0} stopColor={color} stopOpacity={opacity} />
          <Stop offset={1} stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={GLOW_RADIUS} cy={GLOW_RADIUS} r={GLOW_RADIUS} fill="url(#glow)" />
    </Svg>
  );
}

/** A second light in the colour of the card in front. */
function CardGlow({ color, pos, index, count }: { color: string } & Motion) {
  const style = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - Math.abs(centered(index, pos.get(), count))) }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <Glow color={color} opacity={0.2} x={290} y={120} />
    </Animated.View>
  );
}

/** One of the header's values in the box it rolls through: the old one leaves upwards as the new one comes up from below. */
function Rolling({
  text,
  style,
  box,
  from,
  to,
  pos,
  index,
  count,
  reduced,
}: { text: string; style: TextStyle; box: number; from: number; to: number } & Motion) {
  const motion = useAnimatedStyle(() => {
    const place = centered(index, headerPosition(pos.get(), from, to), count);
    return {
      opacity: reduced ? Math.max(0, 1 - Math.abs(place)) : rollFade(place),
      transform: [{ translateY: reduced ? 0 : place * box }],
    };
  });
  return (
    <Animated.Text style={[styles.rolling, style, { lineHeight: box }, motion]} numberOfLines={1}>
      {text}
    </Animated.Text>
  );
}

function Field({ label, value, end = false }: { label: string; value: string; end?: boolean }) {
  return (
    <View style={end ? styles.fieldEnd : null}>
      <Text style={styles.fieldLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.fieldValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/** The SkillMatch mark used on the strip: a rising line in a ring, in a 20 × 20 box. */
function Mark() {
  return (
    <Svg width={20} height={20} fill="none">
      <Circle cx={10} cy={10} r={8.5} stroke={INK} strokeWidth={1.6} />
      <Polyline points="5,12.6 8.8,8.4 10.8,11 15,6.6" stroke={INK} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** A photo, or a quiet frame when the project has none to show. */
function PhotoTile({ uri, size }: { uri: string | undefined; size: number }) {
  return (
    <View style={[styles.photoTile, { width: size, height: size }]}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size - 8, height: size - 8, borderRadius: 5 }} resizeMode="cover" accessible={false} />
      ) : (
        <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
          <Path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" stroke={ink(0.45)} strokeWidth={1.6} />
          <Path d="M4 16l4.5-4.5 3.5 3.5 2.5-2.5L20 18" stroke={ink(0.45)} strokeWidth={1.6} strokeLinejoin="round" />
        </Svg>
      )}
    </View>
  );
}

/** One project card: strip, title and summary, and the stub with its first photo. */
function ProjectCard({
  card,
  brand,
  front,
  pos,
  index,
  count,
  reduced,
}: { card: PortfolioCard; brand: string; front: boolean } & Motion) {
  const current = useDerivedValue(() => pose(relative(index, pos.get(), count), count, reduced));

  const cardStyle = useAnimatedStyle(() => {
    const p = current.get();
    return {
      opacity: p.alpha,
      zIndex: p.z,
      transform: [
        { translateY: p.top - ((1 - p.scale) * PASS_HEIGHT) / 2 },
        { perspective: PERSPECTIVE },
        { rotateX: `${p.tilt}deg` },
        { scale: p.scale },
      ],
    };
  });
  const shadeStyle = useAnimatedStyle(() => ({ opacity: current.get().shade }));

  return (
    <Animated.View
      style={[styles.pass, cardStyle]}
      accessible={front}
      accessibilityElementsHidden={!front}
      importantForAccessibility={front ? 'yes' : 'no-hide-descendants'}
      accessibilityLabel={card.accessibilityLabel}
    >
      <Svg width={PASS_WIDTH} height={PASS_HEIGHT} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgLinearGradient id="paper" x1="0" y1="0" x2="0" y2="1">
            <Stop offset={0} stopColor={card.color} />
            <Stop offset={1} stopColor={card.deep} />
          </SvgLinearGradient>
        </Defs>
        <Path d={OUTLINE} fill="url(#paper)" />
        {/* The strip is a shade lighter than the body. */}
        <Path d={STRIP_OUTLINE} fill="rgba(255,255,255,0.1)" />
        <Line x1={0} y1={STRIP + 0.5} x2={PASS_WIDTH} y2={STRIP + 0.5} stroke={ink(0.14)} strokeWidth={1} />
        {/* The perforation between the two notches. */}
        <Line
          x1={NOTCH + 6}
          y1={TEAR}
          x2={PASS_WIDTH - NOTCH - 6}
          y2={TEAR}
          stroke={ink(0.3)}
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeDasharray="1 5"
        />
      </Svg>

      <View style={styles.brand}>
        <Mark />
        <Text style={styles.brandName} numberOfLines={1}>
          {brand}
        </Text>
      </View>
      <View style={styles.position}>
        <Field label="PROJECT" value={`${card.number} of ${card.total}`} end />
      </View>

      {/* One column, so the summary follows a one-line title without a gap. */}
      <View style={styles.body}>
        <Text style={styles.meta} numberOfLines={1}>
          {card.scale} · {card.added}
        </Text>
        <Text style={styles.title} numberOfLines={2}>
          {card.title}
        </Text>
        <Text style={styles.summary} numberOfLines={3}>
          {card.description || 'No description yet.'}
        </Text>
      </View>

      <View style={styles.stubTile}>
        <PhotoTile uri={card.photos[0]} size={72} />
      </View>
      <View style={styles.stub}>
        <Field label="PHOTOS" value={`${card.photoCount} of 5`} />
        <Text style={styles.hint} numberOfLines={1}>
          {front ? 'Tap to open' : ''}
        </Text>
      </View>

      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, shadeStyle]}>
        <Svg width={PASS_WIDTH} height={PASS_HEIGHT}>
          <Path d={OUTLINE} fill="#000000" />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

/** The front card, opened: it grows from its place in the stack to fill the panel. */
function OpenedCard({
  card,
  brand,
  editLabel,
  progress,
  onClose,
  onEdit,
}: {
  card: PortfolioCard;
  brand: string;
  editLabel: string;
  progress: SharedValue<number>;
  onClose: () => void;
  onEdit?: () => void;
}) {
  const frame = useAnimatedStyle(() => {
    const t = progress.get();
    return {
      opacity: segment(t, 0, 0.12),
      top: mix(FRONT_Y, OPEN_INSET, t),
      left: mix(PASS_X, OPEN_INSET, t),
      width: mix(PASS_WIDTH, WIDTH - OPEN_INSET * 2, t),
      height: mix(PASS_HEIGHT, HEIGHT - OPEN_INSET * 2, t),
      borderRadius: mix(PASS_RADIUS, OPEN_RADIUS, t),
    };
  });
  const content = useAnimatedStyle(() => ({ opacity: segment(progress.get(), 0.45, 0.95) }));

  return (
    <Animated.View style={[styles.opened, frame]} accessibilityViewIsModal>
      <LinearGradient colors={[card.color, card.deep]} style={StyleSheet.absoluteFill} />
      <Animated.View style={[styles.openedInner, content]}>
        <View style={styles.openedTop}>
          <View style={styles.openedBrand}>
            <Mark />
            <Text style={styles.brandName} numberOfLines={1}>
              {brand}
            </Text>
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close project" hitSlop={10} style={styles.close}>
            <Text style={styles.closeLabel}>Close</Text>
          </Pressable>
        </View>
        <ScrollView style={styles.openedScroll} contentContainerStyle={styles.openedContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.openedMeta}>
            PROJECT {card.number} OF {card.total}
          </Text>
          <Text style={styles.openedTitle} accessibilityRole="header">
            {card.title}
          </Text>
          <View style={styles.openedFacts}>
            <Field label="SCALE" value={card.scale} />
            <Field label="ADDED" value={card.added} />
            <Field label="PHOTOS" value={`${card.photoCount} of 5`} />
          </View>
          {card.photos.length ? (
            <View style={styles.gallery}>
              {card.photos.map((uri, i) => (
                <PhotoTile key={`${i}:${uri}`} uri={uri} size={i === 0 ? OPEN_CONTENT : THUMB} />
              ))}
            </View>
          ) : null}
          <Text style={styles.fieldLabel}>DESCRIPTION</Text>
          <Text style={styles.description}>{card.description || 'No description yet.'}</Text>
          {onEdit ? (
            <Pressable onPress={onEdit} accessibilityRole="button" style={styles.edit}>
              <Text style={styles.editLabel}>{editLabel}</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </Animated.View>
    </Animated.View>
  );
}

/**
 * The Worker's portfolio as a wallet of project cards on a dark panel, under a header with the
 * front project's title. A tap on a card behind, or a swipe up, shuffles the stack as in the
 * source block. A tap on the front card opens it to show the whole project.
 */
export function PortfolioCardStack({
  cards,
  brand = 'SkillMatch',
  headerLabel = 'PORTFOLIO PROJECT',
  photosLabel = 'Photos',
  positionLabel = 'Project',
  editLabel = 'Edit portfolio',
  onChange,
  onEdit,
}: Props) {
  const reducedMotion = useReducedMotion();
  const count = cards.length;
  const duration = reducedMotion ? SHUFFLE_REDUCED : SHUFFLE;

  // `pos` counts the shuffles so far; its fraction is how far the running one has come.
  const pos = useSharedValue(0);
  const target = useSharedValue(0);
  // Shuffles asked for by a finger that the next frame has to start.
  const requests = useSharedValue(0);
  // Seconds the stack still waits after a touch before it settles its count.
  const hold = useSharedValue(0);
  // 0 closed … 1 open, for the opened card.
  const opening = useSharedValue(0);

  const [front, setFront] = useState(0);
  const [opened, setOpened] = useState<number | null>(null);

  useFrameCallback((frame) => {
    const dt = Math.min(frame.timeSincePreviousFrame ?? 16, 64) / 1000;
    let p = pos.get();
    let goal = target.get();
    if (requests.get() > 0) {
      goal = Math.min(goal + requests.get(), Math.floor(p) + 2);
      requests.set(0);
    }
    if (p < goal) {
      p = Math.min(goal, p + dt / duration);
    } else if (hold.get() > 0) {
      hold.set(hold.get() - dt);
      if (hold.get() <= 0) {
        p = wrapIndex(Math.round(p), count);
        goal = p;
      }
    }
    pos.set(p);
    target.set(goal);
  });

  const changed = (index: number) => {
    setFront(index);
    onChange?.(index);
  };
  useAnimatedReaction(
    () => wrapIndex(Math.round(pos.get()), count),
    (now, old) => {
      if (old !== null && now !== old) scheduleOnRN(changed, now);
    },
  );

  // One card has nothing to shuffle with, and a tap never pulls more than the cards behind.
  const pull = (by: number) => {
    const steps = Math.min(by, count - 1);
    if (steps <= 0) return;
    hold.set(USER_HOLD);
    requests.set(requests.get() + steps);
    if (process.env.EXPO_OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const open = (index: number) => {
    setOpened(index);
    opening.set(0);
    opening.set(reducedMotion ? withTiming(1, { duration: 200 }) : withSpring(1, { stiffness: STIFFNESS, damping: DAMPING * 1.6, mass: MASS }));
    if (process.env.EXPO_OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };
  const close = () => {
    opening.set(
      withTiming(0, { duration: reducedMotion ? 150 : 320 }, (finished) => {
        if (finished) scheduleOnRN(setOpened, null);
      }),
    );
  };

  // Android Back closes an opened card before it leaves the screen.
  useEffect(() => {
    if (opened === null) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => subscription.remove();
    // close only reads shared values and stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const finger = useRef({ x: 0, y: 0, at: 0 });

  const onGrant = (e: GestureResponderEvent) => {
    finger.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, at: e.nativeEvent.locationY };
  };

  const onRelease = (e: GestureResponderEvent) => {
    const f = finger.current;
    const dx = e.nativeEvent.pageX - f.x;
    const dy = e.nativeEvent.pageY - f.y;
    const resting = Math.abs(pos.get() - Math.round(pos.get())) < 0.001;
    if (dy < -SWIPE && Math.abs(dy) > Math.abs(dx)) {
      pull(1);
    } else if (Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP && resting) {
      // The strips of the cards behind lie above the front card; the rest of the area is the front card.
      if (f.at < FRONT_Y - STACK_Y) pull(f.at < FRONT_Y + SLOT_B.top - STACK_Y ? 2 : 1);
      else if (f.at < FRONT_Y - STACK_Y + PASS_HEIGHT) open(front);
    }
  };

  const motion = { pos, count, reduced: reducedMotion };
  const openedCard = opened === null ? null : cards[opened];

  return (
    <View style={styles.panel}>
      <LinearGradient colors={['#161d30', '#0a0e18']} style={StyleSheet.absoluteFill} />
      <Glow color="#4a6fe0" opacity={0.2} x={60} y={30} />
      {cards.map((card, index) => (
        <CardGlow key={index} color={card.color} index={index} {...motion} />
      ))}

      <View style={styles.cityBox} accessibilityRole="header">
        {cards.map((card, index) => (
          <Rolling key={index} text={card.title} style={styles.cityName} box={CITY_BOX} from={0.3} to={0.75} index={index} {...motion} />
        ))}
      </View>
      <Text style={styles.destination} numberOfLines={1}>
        {headerLabel}
      </Text>

      {[0, 1].map((side) => (
        <View key={side} style={[styles.column, { left: 20 + side * COLUMN * 2 }]} accessible>
          <View style={styles.timeBox}>
            {cards.map((card, index) => (
              <Rolling
                key={index}
                text={side === 0 ? `${card.photoCount}/5` : `${card.number}/${card.total}`}
                style={styles.time}
                box={TIME_BOX}
                from={0.55}
                to={0.98}
                index={index}
                {...motion}
              />
            ))}
          </View>
          <Text style={styles.timeLabel} numberOfLines={1}>
            {side === 0 ? photosLabel : positionLabel}
          </Text>
        </View>
      ))}
      <Pressable style={styles.ride} onPress={onEdit} accessibilityRole="button">
        <Text style={styles.rideLabel} numberOfLines={1}>
          {editLabel}
        </Text>
      </Pressable>
      {/* Dashed rules between the three items. */}
      <Svg width={WIDTH} height={ROW_HEIGHT} style={styles.rules} pointerEvents="none">
        {[20 + COLUMN, 20 + COLUMN * 2].map((x) => (
          <Line key={x} x1={x} y1={3} x2={x} y2={ROW_HEIGHT - 3} stroke="rgba(255,255,255,0.22)" strokeWidth={1} strokeDasharray="3 3" />
        ))}
      </Svg>

      {cards.map((card, index) => (
        <ProjectCard key={index} card={card} brand={brand} front={index === front} index={index} {...motion} />
      ))}

      {/* Touches on the stack: a tap on a strip behind or a swipe up shuffles; a tap on the front card opens it. */}
      <View
        style={styles.touch}
        accessibilityActions={[
          ...(count > 1 ? [{ name: 'activate', label: 'Next project' }] : []),
          { name: 'longpress', label: 'Open project details' },
        ]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'longpress') open(front);
          else pull(1);
        }}
        onStartShouldSetResponder={() => opened === null}
        onResponderTerminationRequest={() => false}
        onResponderGrant={onGrant}
        onResponderRelease={onRelease}
      />

      {openedCard ? (
        <OpenedCard card={openedCard} brand={brand} editLabel={editLabel} progress={opening} onClose={close} onEdit={onEdit} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: WIDTH,
    height: HEIGHT,
    borderRadius: RADIUS,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: '#0a0e18',
  },
  cityBox: {
    position: 'absolute',
    left: 20,
    top: 26,
    width: WIDTH - 40,
    height: CITY_BOX,
    overflow: 'hidden',
  },
  rolling: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    textAlign: 'center',
    color: '#ffffff',
  },
  cityName: {
    ...FONT,
    fontSize: 42,
    fontWeight: '200',
  },
  destination: {
    ...FONT,
    position: 'absolute',
    left: 0,
    top: 82,
    width: WIDTH,
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  column: {
    position: 'absolute',
    top: ROW_Y,
    width: COLUMN,
    alignItems: 'center',
  },
  timeBox: {
    width: COLUMN,
    height: TIME_BOX,
    overflow: 'hidden',
  },
  time: {
    ...FONT,
    fontSize: 22,
    fontWeight: '200',
    fontVariant: ['tabular-nums'],
  },
  timeLabel: {
    ...FONT,
    marginTop: 2,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    lineHeight: 13,
  },
  ride: {
    position: 'absolute',
    left: 20 + COLUMN,
    top: ROW_Y,
    width: COLUMN,
    height: ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rideLabel: {
    ...FONT,
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '300',
  },
  rules: {
    position: 'absolute',
    left: 0,
    top: ROW_Y,
  },
  touch: {
    position: 'absolute',
    left: 0,
    top: STACK_Y,
    width: WIDTH,
    height: HEIGHT - STACK_Y,
    zIndex: 9,
  },
  pass: {
    position: 'absolute',
    left: PASS_X,
    top: FRONT_Y,
    width: PASS_WIDTH,
    height: PASS_HEIGHT,
    borderRadius: PASS_RADIUS,
    boxShadow: '0 -4px 28px rgba(0,0,0,0.3)',
  },
  brand: {
    position: 'absolute',
    left: 18,
    top: 0,
    height: STRIP,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandName: {
    ...FONT,
    color: INK,
    fontSize: 15,
    fontWeight: '700',
  },
  position: {
    position: 'absolute',
    right: 18,
    top: 0,
    height: STRIP,
    justifyContent: 'center',
  },
  fieldEnd: {
    alignItems: 'flex-end',
  },
  fieldLabel: {
    ...FONT,
    color: ink(0.55),
    fontSize: 7.5,
    lineHeight: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  fieldValue: {
    ...FONT,
    marginTop: 1,
    color: INK,
    fontSize: 13,
    lineHeight: 17,
    fontVariant: ['tabular-nums'],
  },
  body: {
    position: 'absolute',
    left: 18,
    top: 66,
    width: PASS_WIDTH - 36,
    gap: 6,
  },
  meta: {
    ...FONT,
    color: ink(0.62),
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  title: {
    ...FONT,
    marginLeft: -1,
    color: ink(0.92),
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '200',
  },
  summary: {
    ...FONT,
    color: ink(0.72),
    fontSize: 12,
    lineHeight: 16,
  },
  stubTile: {
    position: 'absolute',
    left: 18,
    top: 244,
  },
  photoTile: {
    borderRadius: 8,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stub: {
    position: 'absolute',
    left: 108,
    top: 247,
    gap: 9,
  },
  hint: {
    ...FONT,
    color: ink(0.62),
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  opened: {
    position: 'absolute',
    zIndex: 20,
    overflow: 'hidden',
    borderCurve: 'continuous',
    boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
  },
  openedInner: {
    flex: 1,
  },
  openedTop: {
    height: STRIP,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: ink(0.14),
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  openedBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  close: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 20,
    justifyContent: 'center',
    backgroundColor: ink(0.12),
  },
  closeLabel: {
    ...FONT,
    color: INK,
    fontSize: 14,
    fontWeight: '700',
  },
  openedScroll: {
    flex: 1,
  },
  openedContent: {
    padding: 18,
    gap: 12,
  },
  openedMeta: {
    ...FONT,
    color: ink(0.62),
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  openedTitle: {
    ...FONT,
    color: ink(0.92),
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '200',
  },
  openedFacts: {
    flexDirection: 'row',
    gap: 24,
  },
  gallery: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  description: {
    ...FONT,
    color: INK,
    fontSize: 15,
    lineHeight: 22,
    marginTop: -6,
  },
  edit: {
    marginTop: 6,
    minHeight: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: INK,
  },
  editLabel: {
    ...FONT,
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
