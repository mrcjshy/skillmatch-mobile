// @ts-expect-error -- Node-only asset and config checks; the Expo app tsconfig omits Node declarations.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- Node-only PNG decoding.
import { inflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';

import { SkillMatchTheme } from '@/constants/theme';
import {
  LAUNCH_ATLAS_CELL,
  LAUNCH_BACKGROUND,
  LAUNCH_DENSITIES,
  LAUNCH_ICON_CANVAS,
  LAUNCH_ICON_MARGIN,
  LAUNCH_ICON_RADIUS,
  LAUNCH_MASCOT_BOUNDS,
  LAUNCH_MASCOT_EXPRESSION,
  LAUNCH_MASCOT_OFFSET_Y,
  LAUNCH_MASCOT_SIZE,
  LAUNCH_SPLASH_IMAGE_WIDTH,
  LAUNCH_TIMING,
  launchExitDuration,
  launchMascotReach,
  launchShouldLeave,
} from '@/lib/launch-splash';
import { DUCK_MOVES, duckPoseAt, poseIndex, restingDuckPose } from '@/lib/mascot-motion';

vi.mock('react-native', () => ({ Platform: { OS: 'android', select: (choices: Record<string, unknown>) => choices.android ?? choices.default } }));

/**
 * The launch splash (native drawable + in-app overlay). Static evidence: geometry, the shipped
 * PNGs and app.json. Whether Android draws the drawable where its documentation says is a device
 * check, not proven here.
 */

/** A minimal decoder for the 8-bit RGBA, non-interlaced PNGs this feature ships. */
function decodePng(path: string) {
  const png: Uint8Array = readFileSync(path);
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  expect([png[24], png[25], png[28]], `${path}: 8-bit RGBA, not interlaced`).toEqual([8, 6, 0]);
  const parts: Uint8Array[] = [];
  for (let at = 8; at < png.length; at += 12 + view.getUint32(at)) {
    if (String.fromCharCode(...png.subarray(at + 4, at + 8)) === 'IDAT') parts.push(png.subarray(at + 8, at + 8 + view.getUint32(at)));
  }
  const joined = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  parts.reduce((offset, part) => { joined.set(part, offset); return offset + part.length; }, 0);
  const raw: Uint8Array = inflateSync(joined);
  const stride = width * 4;
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const c = x >= 4 && y > 0 ? pixels[(y - 1) * stride + x - 4] : 0;
      const p = a + b - c;
      const paeth = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
      const predictor = [0, a, b, (a + b) >> 1, paeth][filter];
      pixels[y * stride + x] = (raw[y * (stride + 1) + 1 + x] + predictor) & 255;
    }
  }
  /** Alpha bounding box of a region, right/bottom exclusive (PIL getbbox semantics). */
  const alphaBox = (x0: number, y0: number, x1: number, y1: number) => {
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (pixels[(y * width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x - x0); right = Math.max(right, x - x0 + 1);
      top = Math.min(top, y - y0); bottom = Math.max(bottom, y - y0 + 1);
    }
    return { left, top, right, bottom };
  };
  return { width, height, alphaBox };
}

const appJson = JSON.parse(readFileSync('app.json', 'utf8')) as { expo: { plugins: unknown[] } };
const splashPlugin = (appJson.expo.plugins.find((entry) => Array.isArray(entry) && entry[0] === 'expo-splash-screen') as [string, Record<string, any>])[1];
const LIMIT = LAUNCH_ICON_RADIUS - LAUNCH_ICON_MARGIN;

describe('launch splash frame', () => {
  it("is the worker hello's first frame, which is also the pose hello rests on", () => {
    expect(LAUNCH_MASCOT_EXPRESSION).toBe('hello');
    expect(DUCK_MOVES.hello.frames.map(([, pose]) => pose)).toContain('wave');
    expect(duckPoseAt('hello', 0)).toBe(poseIndex('idle'));
    expect(restingDuckPose('hello')).toBe(poseIndex('idle'));
    expect(poseIndex('idle')).toBe(0);
  });

  it("measures the frame's bounds from the atlas itself", () => {
    const atlas = decodePng('assets/images/mascot/itik-worker-poses.png');
    expect(atlas.width).toBe(3 * LAUNCH_ATLAS_CELL);
    expect(atlas.height).toBe(3 * LAUNCH_ATLAS_CELL);
    expect(atlas.alphaBox(0, 0, LAUNCH_ATLAS_CELL, LAUNCH_ATLAS_CELL)).toEqual(LAUNCH_MASCOT_BOUNDS);
  });
});

describe('launch splash geometry (dp)', () => {
  it('fits the duck inside the 192 dp circle with at least 6 dp to spare', () => {
    const reach = launchMascotReach(LAUNCH_MASCOT_SIZE, LAUNCH_MASCOT_OFFSET_Y);
    expect(reach).toBeLessThanOrEqual(LIMIT);
    expect(LAUNCH_ICON_RADIUS - reach).toBeGreaterThanOrEqual(6);
    expect(reach).toBeCloseTo(89.91, 2);
  });

  it('is the largest whole-dp size that fits at any offset, centred by the nearest whole dp', () => {
    const best = (size: number) => Math.min(...Array.from({ length: 4001 }, (_, i) => launchMascotReach(size, -20 + i / 100)));
    expect(best(LAUNCH_MASCOT_SIZE)).toBeLessThanOrEqual(LIMIT);
    expect(best(LAUNCH_MASCOT_SIZE + 1)).toBeGreaterThan(LIMIT);
    const { top, bottom } = LAUNCH_MASCOT_BOUNDS;
    const centring = (LAUNCH_ATLAS_CELL / 2 - (top + bottom) / 2) * (LAUNCH_MASCOT_SIZE / LAUNCH_ATLAS_CELL);
    expect(LAUNCH_MASCOT_OFFSET_Y).toBe(Math.round(centring));
  });

  it('lands on whole pixels on the 480 dpi test phone', () => {
    const xxhdpi = LAUNCH_DENSITIES.xxhdpi;
    for (const dp of [LAUNCH_MASCOT_SIZE, LAUNCH_MASCOT_OFFSET_Y, (LAUNCH_ICON_CANVAS - LAUNCH_MASCOT_SIZE) / 2]) {
      expect(Number.isInteger(dp * xxhdpi), String(dp)).toBe(true);
    }
  });

  it('paints the app canvas behind it', () => {
    expect(LAUNCH_BACKGROUND).toBe(SkillMatchTheme.ui.colors.canvas);
  });
});

describe('native splash configuration', () => {
  it('points expo-splash-screen at Itik on the app canvas, light and dark', () => {
    expect(splashPlugin).toMatchObject({
      image: './assets/images/itik-splash.png',
      imageWidth: LAUNCH_SPLASH_IMAGE_WIDTH,
      backgroundColor: LAUNCH_BACKGROUND,
      dark: { image: './assets/images/itik-splash.png', backgroundColor: LAUNCH_BACKGROUND },
    });
    // The plugin fits `image` into imageWidth x density and centres it on a 288 x density canvas:
    // with imageWidth 288 the source image is the whole canvas, so the drawable is the image resized.
    expect(LAUNCH_SPLASH_IMAGE_WIDTH).toBe(LAUNCH_ICON_CANVAS);
  });

  it('ships the source image as the xxxhdpi canvas with the duck where the constants put it', () => {
    const density = LAUNCH_DENSITIES.xxxhdpi;
    const image = decodePng('assets/images/itik-splash.png');
    expect(image.width).toBe(LAUNCH_ICON_CANVAS * density);
    expect(image.height).toBe(LAUNCH_ICON_CANVAS * density);
    const scale = (LAUNCH_MASCOT_SIZE * density) / LAUNCH_ATLAS_CELL;
    const left = ((LAUNCH_ICON_CANVAS - LAUNCH_MASCOT_SIZE) / 2) * density;
    const top = left + LAUNCH_MASCOT_OFFSET_Y * density;
    const box = image.alphaBox(0, 0, image.width, image.height);
    const expected = {
      left: left + LAUNCH_MASCOT_BOUNDS.left * scale, right: left + LAUNCH_MASCOT_BOUNDS.right * scale,
      top: top + LAUNCH_MASCOT_BOUNDS.top * scale, bottom: top + LAUNCH_MASCOT_BOUNDS.bottom * scale,
    };
    // Resampling may spread a faint edge by a pixel or two at most.
    for (const side of ['left', 'top', 'right', 'bottom'] as const) expect(Math.abs(box[side] - expected[side]), side).toBeLessThanOrEqual(2);
  });
});

describe('launch overlay timing', () => {
  it('holds for about 1.3 s, never past 4 s, and leaves in about 250 ms', () => {
    expect(LAUNCH_TIMING.minimum).toBe(1300);
    expect(LAUNCH_TIMING.cap).toBe(4000);
    expect(launchExitDuration(false)).toBe(250);
    expect(launchExitDuration(true)).toBeLessThan(launchExitDuration(false));
    expect(LAUNCH_TIMING.exitScale).toBeGreaterThan(1);
    expect(LAUNCH_TIMING.exitScale).toBeLessThanOrEqual(1.06);
  });

  const at = (ready: boolean, minimumPassed: boolean, capPassed: boolean, reduced = false) =>
    launchShouldLeave({ ready, minimumPassed, capPassed, reduced });

  it('minimum: a fast boot still waits for the hello', () => {
    expect(at(true, false, false)).toBe(false);
    expect(at(true, true, false)).toBe(true);
  });

  it('ready: after the minimum it waits for the boot state, then leaves at once', () => {
    expect(at(false, true, false)).toBe(false);
    expect(at(true, true, false)).toBe(true);
  });

  it('cap: a boot state that never resolves cannot hold it', () => {
    expect(at(false, true, true)).toBe(true);
    expect(at(false, true, true, true)).toBe(true);
  });

  it('reduced motion: there is no hello to wait for, so ready is enough', () => {
    expect(at(true, false, false, true)).toBe(true);
    expect(at(false, false, false, true)).toBe(false);
  });
});
