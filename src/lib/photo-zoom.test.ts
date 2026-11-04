// @ts-expect-error -- Node-only source guard; the app tsconfig carries no Node types.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  DOUBLE_TAP_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  clampTranslation,
  clampZoom,
  dismissProgress,
  doubleTapZoom,
  fitContain,
  focalTranslation,
  isZoomed,
  pagerOffset,
  panBounds,
  pinchZoom,
  restingZoom,
  settlePage,
  shouldDismiss,
  stepZoom,
  zoomStage,
} from './photo-zoom';

/** A 400 x 800 dp phone screen. */
const SCREEN = { width: 400, height: 800 };
/** A 4000 x 3000 landscape photo fitted to the screen: 400 x 300. */
const LANDSCAPE = fitContain({ width: 4000, height: 3000 }, SCREEN);
/** A 1000 x 1500 portrait photo fitted to the screen: 400 x 600. */
const PORTRAIT = fitContain({ width: 1000, height: 1500 }, SCREEN);
const REST = restingZoom();

/** Where a point of the fitted photo (from its centre) appears on screen (from the screen centre). */
const onScreen = (point: { x: number; y: number }, zoom: { scale: number; x: number; y: number }) =>
  ({ x: point.x * zoom.scale + zoom.x, y: point.y * zoom.scale + zoom.y });

describe('zoom limits', () => {
  it('keeps the scale inside 1x to 4x and treats anything non-finite as 1x', () => {
    expect([MIN_ZOOM, MAX_ZOOM, DOUBLE_TAP_ZOOM]).toEqual([1, 4, 2]);
    expect([0.2, 1, 2.5, 4, 9].map(clampZoom)).toEqual([1, 1, 2.5, 4, 4]);
    expect([Number.NaN, Infinity, -Infinity].map(clampZoom)).toEqual([1, 1, 1]);
  });

  it('counts only a meaningful enlargement as zoomed, and names the 4x limit', () => {
    expect([1, 1.005, 1.01, 1.02, 2].map(isZoomed)).toEqual([false, false, false, true, true]);
    expect([1, 1.005, 2, 3.995, 4].map(zoomStage)).toEqual([0, 0, 1, 2, 2]);
    expect(REST).toEqual({ scale: 1, x: 0, y: 0 });
  });
});

describe('fitting the photo (contain at 1x)', () => {
  it('fits by the tighter side and keeps the aspect ratio', () => {
    expect(LANDSCAPE).toEqual({ width: 400, height: 300 });
    expect(PORTRAIT).toEqual({ width: 400, height: 600 });
    expect(fitContain({ width: 200, height: 1600 }, SCREEN)).toEqual({ width: 100, height: 800 });
  });

  it('uses the whole viewport while the photo size is unknown, and nothing before layout', () => {
    expect(fitContain({ width: 0, height: 0 }, SCREEN)).toEqual(SCREEN);
    expect(fitContain({ width: Number.NaN, height: 10 }, SCREEN)).toEqual(SCREEN);
    expect(fitContain({ width: 100, height: 100 }, { width: 0, height: -5 })).toEqual({ width: 0, height: 0 });
  });
});

describe('clamping the pan so the photo never leaves the screen', () => {
  it('allows panning only by the part that overflows the screen', () => {
    expect(panBounds(1, LANDSCAPE, SCREEN)).toEqual({ x: 0, y: 0 });
    expect(panBounds(2, LANDSCAPE, SCREEN)).toEqual({ x: 200, y: 0 });
    expect(panBounds(4, LANDSCAPE, SCREEN)).toEqual({ x: 600, y: 200 });
  });

  it('stops each edge at the screen edge and keeps a fitting axis centred', () => {
    expect(clampTranslation(500, 100, 2, LANDSCAPE, SCREEN)).toEqual({ x: 200, y: 0 });
    expect(clampTranslation(-500, -100, 2, LANDSCAPE, SCREEN)).toEqual({ x: -200, y: 0 });
    expect(clampTranslation(120, -150, 4, LANDSCAPE, SCREEN)).toEqual({ x: 120, y: -150 });
    expect(clampTranslation(9000, -9000, 4, LANDSCAPE, SCREEN)).toEqual({ x: 600, y: -200 });
    // At 1x nothing moves, and a centred axis is a plain 0 (never -0).
    const rest = clampTranslation(-40, -40, 1, LANDSCAPE, SCREEN);
    expect(Object.is(rest.x, 0) && Object.is(rest.y, 0)).toBe(true);
  });

  it('keeps every corner of the zoomed photo at or beyond the screen edges', () => {
    for (const scale of [1.5, 2, 3, 4]) {
      for (const [x, y] of [[-9999, -9999], [9999, 9999], [37, -12]]) {
        const kept = clampTranslation(x, y, scale, PORTRAIT, SCREEN);
        const halfW = (PORTRAIT.width * scale) / 2, halfH = (PORTRAIT.height * scale) / 2;
        if (halfW * 2 >= SCREEN.width) {
          expect(kept.x - halfW).toBeLessThanOrEqual(-SCREEN.width / 2);
          expect(kept.x + halfW).toBeGreaterThanOrEqual(SCREEN.width / 2);
        } else expect(kept.x).toBe(0);
        if (halfH * 2 >= SCREEN.height) {
          expect(kept.y - halfH).toBeLessThanOrEqual(-SCREEN.height / 2);
          expect(kept.y + halfH).toBeGreaterThanOrEqual(SCREEN.height / 2);
        } else expect(kept.y).toBe(0);
      }
    }
  });
});

describe('focal zoom', () => {
  it('keeps the photo point under the focal point fixed as the scale changes', () => {
    const start = { scale: 1.5, x: 30, y: -20 }, focal = { x: 80, y: -60 };
    const moved = focalTranslation(focal, focal, start.scale, start, 3);
    const point = { x: (focal.x - start.x) / start.scale, y: (focal.y - start.y) / start.scale };
    const seen = onScreen(point, { scale: 3, ...moved });
    expect(seen.x).toBeCloseTo(focal.x);
    expect(seen.y).toBeCloseTo(focal.y);
    expect(focalTranslation(focal, focal, 2, { x: 5, y: 6 }, 2)).toEqual({ x: 5, y: 6 });
  });

  it('double tap zooms to 2x around the tapped point', () => {
    const tap = { x: 100, y: -50 };
    const zoom = doubleTapZoom(tap, REST, SCREEN, SCREEN);
    expect(zoom).toEqual({ scale: 2, x: -100, y: 50 });
    expect(onScreen(tap, zoom)).toEqual(tap);
  });

  it('double tap keeps the zoomed photo on screen near an edge or letterbox', () => {
    // Landscape: the photo is 300 dp tall, 600 dp at 2x, still shorter than the screen, so it stays centred.
    expect(doubleTapZoom({ x: 100, y: 300 }, REST, LANDSCAPE, SCREEN)).toEqual({ scale: 2, x: -100, y: 0 });
    // Portrait: 1200 dp tall at 2x may pan 200 dp; a tap near the bottom stops at that edge.
    expect(doubleTapZoom({ x: 0, y: 350 }, REST, PORTRAIT, SCREEN)).toEqual({ scale: 2, x: 0, y: -200 });
  });

  it('double tap on a zoomed photo returns to 1x', () => {
    expect(doubleTapZoom({ x: 10, y: 10 }, { scale: 2, x: -80, y: 0 }, SCREEN, SCREEN)).toEqual(REST);
    expect(doubleTapZoom({ x: 10, y: 10 }, { scale: 3.4, x: 5, y: 5 }, SCREEN, SCREEN)).toEqual(REST);
  });

  it('pinch scales from where it started, stays inside 1x to 4x and follows the fingers', () => {
    expect(pinchZoom(REST, { x: 0, y: 0 }, { x: 0, y: 0 }, 10, SCREEN, SCREEN)).toEqual({ scale: 4, x: 0, y: 0 });
    expect(pinchZoom({ scale: 2, x: 50, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, 0.2, SCREEN, SCREEN)).toEqual(REST);
    const start = { x: 100, y: 100 }, now = { x: 120, y: 100 };
    const zoom = pinchZoom(REST, start, now, 2, SCREEN, SCREEN);
    expect(zoom).toEqual({ scale: 2, x: -80, y: -100 });
    expect(onScreen(start, zoom)).toEqual(now);
  });

  it('screen-reader steps double or halve the zoom about the centre, kept on screen', () => {
    expect(stepZoom(REST, 1, SCREEN, SCREEN)).toEqual({ scale: 2, x: 0, y: 0 });
    expect(stepZoom({ scale: 2, x: 100, y: 0 }, 1, SCREEN, SCREEN)).toEqual({ scale: 4, x: 200, y: 0 });
    expect(stepZoom({ scale: 4, x: 200, y: 0 }, 1, SCREEN, SCREEN)).toEqual({ scale: 4, x: 200, y: 0 });
    expect(stepZoom({ scale: 4, x: 600, y: 0 }, -1, SCREEN, SCREEN)).toEqual({ scale: 2, x: 200, y: 0 });
    expect(stepZoom({ scale: 2, x: 100, y: 0 }, -1, SCREEN, SCREEN)).toEqual(REST);
    expect(stepZoom(REST, -1, SCREEN, SCREEN)).toEqual(REST);
  });
});

describe('swipe down to close', () => {
  it('closes after a fifth of the screen, or a quick flick past a short distance', () => {
    expect(shouldDismiss(159, 0, 800)).toBe(false);
    expect(shouldDismiss(160, 0, 800)).toBe(true);
    expect(shouldDismiss(40, 1200, 800)).toBe(true);
    expect(shouldDismiss(20, 3000, 800)).toBe(false);
    expect(shouldDismiss(100, 999, 800)).toBe(false);
  });

  it('never closes for an upward drag or before layout', () => {
    expect(shouldDismiss(-300, -3000, 800)).toBe(false);
    expect(shouldDismiss(0, 3000, 800)).toBe(false);
    expect(shouldDismiss(500, 3000, 0)).toBe(false);
  });

  it('fades the backdrop with the drag, fully at half the screen', () => {
    expect(dismissProgress(0, 800)).toBe(0);
    expect(dismissProgress(200, 800)).toBe(0.5);
    expect(dismissProgress(-200, 800)).toBe(0.5);
    expect(dismissProgress(1000, 800)).toBe(1);
    expect(dismissProgress(100, 0)).toBe(0);
  });
});

describe('paging between photos', () => {
  it('follows the finger between photos and resists past the first and last', () => {
    expect(pagerOffset(1, 3, -50, 400)).toBe(-450);
    expect(pagerOffset(1, 3, 0, 400)).toBe(-400);
    expect(pagerOffset(0, 3, 100, 400)).toBe(30);
    expect(pagerOffset(2, 3, -100, 400)).toBe(-830);
    expect(pagerOffset(0, 1, -100, 400)).toBe(-30);
    expect(Object.is(pagerOffset(0, 3, 0, 400), 0)).toBe(true);
  });

  it('settles on the neighbour after a quarter page or a flick that way', () => {
    expect(settlePage(0, 3, -100, 0, 400)).toBe(1);
    expect(settlePage(0, 3, -99, 0, 400)).toBe(0);
    expect(settlePage(0, 3, -20, -700, 400)).toBe(1);
    expect(settlePage(1, 3, 20, 700, 400)).toBe(0);
    expect(settlePage(1, 3, 120, 0, 400)).toBe(0);
    // A flick against the drag direction stays put.
    expect(settlePage(1, 3, -20, 700, 400)).toBe(1);
  });

  it('never goes past the ends, and copes with no photos or no width', () => {
    expect(settlePage(2, 3, -300, -2000, 400)).toBe(2);
    expect(settlePage(0, 3, 300, 2000, 400)).toBe(0);
    expect(settlePage(5, 3, 0, 0, 400)).toBe(2);
    expect(settlePage(0, 0, -300, -2000, 400)).toBe(0);
    expect(settlePage(0, 3, -50, 0, 0)).toBe(0);
    expect(settlePage(0, 3, -50, -700, 0)).toBe(1);
  });
});

describe('worklet safety (native crash found on device)', () => {
  const source = readFileSync('src/lib/photo-zoom.ts', 'utf8');
  it('marks every function as a worklet and gives none a default parameter', () => {
    const functions = [...source.matchAll(/function (\w+)\(([^)]*)\)[^{]*\{(\s*'worklet';)?/g)];
    expect(functions.length).toBeGreaterThanOrEqual(15);
    for (const [, name, params, worklet] of functions) {
      expect(worklet, `${name} is a worklet`).toBeDefined();
      expect(params, `${name} has no default parameter`).not.toContain('=');
    }
  });

  it('declares each helper before the functions that call it (workletised declarations are not hoisted)', () => {
    const names = [...source.matchAll(/function (\w+)\(/g)].map((match) => match[1]);
    names.forEach((name, position) => {
      const declared = source.indexOf(`function ${name}(`);
      const firstCall = source.search(new RegExp(`(?<!\\w)${name}\\(`));
      expect(firstCall, `${name} (#${position}) is declared before use`).toBeGreaterThanOrEqual(declared);
    });
  });
});
