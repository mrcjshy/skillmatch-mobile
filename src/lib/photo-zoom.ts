/**
 * Zoom, pan and swipe maths for the full-screen job photo viewer (`src/components/job-photo-viewer.tsx`).
 *
 * Geometry: a photo is fitted (contain) inside the viewport and centred. It is drawn as
 * translate(x, y) then scale(scale) about its centre, so a point `p` of the fitted photo, measured
 * from the photo's centre, appears on screen at `p * scale + (x, y)`, measured from the viewport's
 * centre. Focal points (taps, pinch centres) are measured from the viewport's centre as well.
 *
 * Every function is a worklet so gesture callbacks can call it on the UI thread. None takes a
 * default parameter: a default parameter inside a worklet crashes on device. Helpers are declared
 * before the functions that call them, because a workletised function declaration is not hoisted.
 */

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
export const DOUBLE_TAP_ZOOM = 2;
/** A scale this close to 1 counts as not zoomed (pinch rounding). */
export const ZOOM_EPSILON = 0.01;
/** A downward drag this share of the viewport height closes the viewer. */
export const DISMISS_DISTANCE_RATIO = 0.2;
/** ...or a downward flick at least this fast (dp/s) that has travelled `DISMISS_MIN_DISTANCE`. */
export const DISMISS_VELOCITY = 1000;
export const DISMISS_MIN_DISTANCE = 32;
/** A horizontal drag this share of the page width moves to the neighbouring photo. */
export const PAGE_DISTANCE_RATIO = 0.25;
/** ...or a horizontal flick at least this fast (dp/s) in the same direction. */
export const PAGE_VELOCITY = 600;
/** Pulling the first photo right, or the last photo left, moves it this fraction of the drag. */
export const EDGE_RESISTANCE = 0.3;

export type Size = { width: number; height: number };
export type Point = { x: number; y: number };
export type ZoomState = { scale: number; x: number; y: number };

/** The scale kept inside 1x to 4x (anything non-finite is 1x). */
export function clampZoom(scale: number): number {
  'worklet';
  if (!Number.isFinite(scale)) return MIN_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
}

/** True once the photo is meaningfully larger than its fitted size. */
export function isZoomed(scale: number): boolean {
  'worklet';
  return scale > MIN_ZOOM + ZOOM_EPSILON;
}

/** 0 at rest, 1 zoomed, 2 at the 4x limit: decides which screen-reader zoom actions apply. */
export function zoomStage(scale: number): number {
  'worklet';
  if (!isZoomed(scale)) return 0;
  return scale >= MAX_ZOOM - ZOOM_EPSILON ? 2 : 1;
}

/** The size a photo of `natural` pixels takes when fitted (contain) in `viewport`; the viewport while unknown. */
export function fitContain(natural: Size, viewport: Size): Size {
  'worklet';
  const width = Math.max(0, viewport.width), height = Math.max(0, viewport.height);
  if (!(natural.width > 0) || !(natural.height > 0) || width === 0 || height === 0) return { width, height };
  const ratio = Math.min(width / natural.width, height / natural.height);
  return { width: natural.width * ratio, height: natural.height * ratio };
}

/** How far the photo may move from centre on each axis at `scale` before an edge would come inside the screen. */
export function panBounds(scale: number, content: Size, viewport: Size): Point {
  'worklet';
  return {
    x: Math.max(0, (content.width * scale - viewport.width) / 2),
    y: Math.max(0, (content.height * scale - viewport.height) / 2),
  };
}

function clampAxis(offset: number, bound: number): number {
  'worklet';
  // `|| 0` turns -0 and NaN into 0.
  return Math.min(bound, Math.max(-bound, offset)) || 0;
}

/**
 * The translation kept so the photo never leaves the screen: an axis larger than the screen keeps
 * its edges at or beyond the screen's edges; an axis that fits stays centred.
 */
export function clampTranslation(x: number, y: number, scale: number, content: Size, viewport: Size): Point {
  'worklet';
  const bounds = panBounds(scale, content, viewport);
  return { x: clampAxis(x, bounds.x), y: clampAxis(y, bounds.y) };
}

/**
 * The translation that keeps the photo point under `from` (at `fromScale`, translated by `offset`)
 * under `to` once the scale is `toScale`. Unclamped; the caller keeps the result on screen.
 */
export function focalTranslation(from: Point, to: Point, fromScale: number, offset: Point, toScale: number): Point {
  'worklet';
  const ratio = fromScale > 0 ? toScale / fromScale : 1;
  return { x: to.x - (from.x - offset.x) * ratio, y: to.y - (from.y - offset.y) * ratio };
}

/** Back to the fitted photo. */
export function restingZoom(): ZoomState {
  'worklet';
  return { scale: MIN_ZOOM, x: 0, y: 0 };
}

/** Double tap: a zoomed photo returns to 1x; otherwise it zooms to 2x around the tapped point, kept on screen. */
export function doubleTapZoom(tap: Point, current: ZoomState, content: Size, viewport: Size): ZoomState {
  'worklet';
  if (isZoomed(current.scale)) return restingZoom();
  const moved = focalTranslation(tap, tap, current.scale, { x: current.x, y: current.y }, DOUBLE_TAP_ZOOM);
  const kept = clampTranslation(moved.x, moved.y, DOUBLE_TAP_ZOOM, content, viewport);
  return { scale: DOUBLE_TAP_ZOOM, x: kept.x, y: kept.y };
}

/**
 * Pinch: `factor` scales the zoom the gesture started at (kept inside 1x to 4x), and the photo point
 * that was under the fingers follows their current centre, kept on screen.
 */
export function pinchZoom(start: ZoomState, startFocal: Point, focal: Point, factor: number, content: Size, viewport: Size): ZoomState {
  'worklet';
  const scale = clampZoom(start.scale * factor);
  const moved = focalTranslation(startFocal, focal, start.scale, { x: start.x, y: start.y }, scale);
  const kept = clampTranslation(moved.x, moved.y, scale, content, viewport);
  return { scale, x: kept.x, y: kept.y };
}

/**
 * Screen-reader zoom: one step doubles (direction 1) or halves (direction -1) the scale about the
 * screen centre, kept inside 1x to 4x and on screen. A step that lands at 1x returns to rest.
 */
export function stepZoom(current: ZoomState, direction: number, content: Size, viewport: Size): ZoomState {
  'worklet';
  const scale = clampZoom(direction > 0 ? current.scale * 2 : current.scale / 2);
  if (!isZoomed(scale)) return restingZoom();
  const ratio = current.scale > 0 ? scale / current.scale : 1;
  const kept = clampTranslation(current.x * ratio, current.y * ratio, scale, content, viewport);
  return { scale, x: kept.x, y: kept.y };
}

/** Swipe down to close (the viewer asks only when not zoomed): far enough, or a quick downward flick past a short distance. */
export function shouldDismiss(translationY: number, velocityY: number, viewportHeight: number): boolean {
  'worklet';
  if (!(translationY > 0) || !(viewportHeight > 0)) return false;
  return translationY >= viewportHeight * DISMISS_DISTANCE_RATIO
    || (translationY >= DISMISS_MIN_DISTANCE && velocityY >= DISMISS_VELOCITY);
}

/** 0 at rest up to 1 once a dismiss drag has travelled half the viewport: the backdrop fades as the photo leaves. */
export function dismissProgress(translationY: number, viewportHeight: number): number {
  'worklet';
  if (!(viewportHeight > 0)) return 0;
  return Math.min(1, Math.abs(translationY) / (viewportHeight / 2));
}

/** The photo strip's offset while page `index` is dragged by `translationX`; the ends resist being pulled past. */
export function pagerOffset(index: number, count: number, translationX: number, pageWidth: number): number {
  'worklet';
  const pastEnd = (index <= 0 && translationX > 0) || (index >= count - 1 && translationX < 0);
  return -index * pageWidth + (pastEnd ? translationX * EDGE_RESISTANCE : translationX) || 0;
}

/** The page a released horizontal drag settles on: the neighbour after a quarter page or a flick that way, never past the ends. */
export function settlePage(index: number, count: number, translationX: number, velocityX: number, pageWidth: number): number {
  'worklet';
  if (count <= 0) return 0;
  const current = Math.min(count - 1, Math.max(0, index));
  const threshold = pageWidth > 0 ? pageWidth * PAGE_DISTANCE_RATIO : Infinity;
  if (translationX < 0 && (translationX <= -threshold || velocityX <= -PAGE_VELOCITY)) return Math.min(count - 1, current + 1);
  if (translationX > 0 && (translationX >= threshold || velocityX >= PAGE_VELOCITY)) return Math.max(0, current - 1);
  return current;
}
