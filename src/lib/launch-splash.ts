import { MotionTokens } from '@/constants/motion';
import type { DuckExpression } from '@/lib/mascot-motion';

/**
 * The launch splash: Itik on the app canvas. One geometry serves the native Android 12+ splash
 * (app.json expo-splash-screen -> the splashscreen_logo drawables) and the in-app LaunchOverlay
 * that takes over from it, so the hand-off has no jump.
 *
 * Android draws windowSplashScreenAnimatedIcon as a 288 dp square centred in the window and masks
 * it to the centred 192 dp circle (radius 96). The splash frame is the first frame of Itik's worker
 * hello: at t = 0 the move shows atlas cell 0, 'idle' (the wave starts at 0.14 s), which is also the
 * pose hello rests on, so the native frame and the overlay's first frame are the same cell.
 *
 *   atlas cell 418 px; alpha bbox of cell 0: x 92..327, y 4..401 (px, right/bottom exclusive)
 *   about the cell centre (209, 209): x -117..+118, y -205..+192
 *   k = S / 418 dp per px. The bbox centre is 6.5 px above the cell centre: OFFSET_Y = 6.5k (down)
 *   farthest corner, centred = k * sqrt(118^2 + 198.5^2) = 230.92k <= 96 - 6 = 90
 *     => k <= 0.38974 => S <= 162.9 dp => S = 162 (S = 163 reaches 90.05 dp)
 *   S = 162: k = 0.38756, OFFSET_Y = round(6.5k = 2.52) = 3 dp
 *   bbox in dp about the circle centre: x -45.34..+45.73, y -76.45..+77.41
 *     => reach = sqrt(45.73^2 + 77.41^2) = 89.91 dp, margin 6.09 dp
 *
 * Native drawable: a transparent 288 dp canvas with the cell drawn at S dp, centred, OFFSET_Y lower:
 * 288 / 432 / 576 / 864 / 1152 px at mdpi..xxxhdpi. assets/images/itik-splash.png is the xxxhdpi
 * canvas (1152 px), and app.json gives expo-splash-screen imageWidth 288: its plugin fits `image`
 * into imageWidth x density px, centred on a 288 x density canvas, so the image fills the canvas and
 * a native build regenerates the same drawables.
 */

/** Hello: the friendly worker greeting. Its t = 0 frame is the native splash frame. */
export const LAUNCH_MASCOT_EXPRESSION: DuckExpression = 'hello';
/** Itik's size (dp): the side of one atlas cell, as SkillMatchMascot `size`. */
export const LAUNCH_MASCOT_SIZE = 162;
/** How far below the window centre Itik's cell sits (dp), so the duck itself is centred. */
export const LAUNCH_MASCOT_OFFSET_Y = 3;
/** The app canvas (colors.canvas): the native splash background and the overlay's. */
export const LAUNCH_BACKGROUND = '#FBF8FF';

/** Android 12+ splash icon: the drawable canvas and the visible circle's radius (dp). */
export const LAUNCH_ICON_CANVAS = 288;
export const LAUNCH_ICON_RADIUS = 96;
/** The clear ring kept between the duck and the circle's edge (dp). */
export const LAUNCH_ICON_MARGIN = 6;
/** expo-splash-screen imageWidth: the source image is the whole 288 dp canvas. */
export const LAUNCH_SPLASH_IMAGE_WIDTH = LAUNCH_ICON_CANVAS;
/** Android density buckets (px per dp) the drawable is generated for. */
export const LAUNCH_DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 } as const;

/** One atlas cell (px) and the alpha bounding box of the splash frame (cell 0) within it. */
export const LAUNCH_ATLAS_CELL = 418;
export const LAUNCH_MASCOT_BOUNDS = { left: 92, top: 4, right: 327, bottom: 401 } as const;

/** The farthest corner of the duck's bounding box from the circle's centre (dp), for a size and offset. */
export function launchMascotReach(size: number, offsetY: number): number {
  const k = size / LAUNCH_ATLAS_CELL;
  const half = LAUNCH_ATLAS_CELL / 2;
  const { left, top, right, bottom } = LAUNCH_MASCOT_BOUNDS;
  const x = Math.max(half - left, right - half) * k;
  const y = Math.max((half - top) * k - offsetY, (bottom - half) * k + offsetY);
  return Math.hypot(x, y);
}

/** Overlay timing, from the motion tokens (ms). */
export const LAUNCH_TIMING = MotionTokens.launch;

export type LaunchClock = {
  /** The root boot state has left 'session-restoring' / 'account-pending' (latched). */
  ready: boolean;
  /** LAUNCH_TIMING.minimum has passed since the overlay mounted. */
  minimumPassed: boolean;
  /** LAUNCH_TIMING.cap has passed since the overlay mounted. */
  capPassed: boolean;
  reduced: boolean;
};

/**
 * Whether the overlay starts to leave: once the app is ready and the minimum has passed, or at the
 * cap whatever the boot state. Under reduced motion there is no hello to wait for: ready is enough.
 */
export function launchShouldLeave({ ready, minimumPassed, capPassed, reduced }: LaunchClock): boolean {
  return capPassed || (ready && (minimumPassed || reduced));
}

/** How long the leaving fade lasts before the overlay unmounts (ms). */
export function launchExitDuration(reduced: boolean): number {
  return reduced ? LAUNCH_TIMING.reducedExit : LAUNCH_TIMING.exit;
}
