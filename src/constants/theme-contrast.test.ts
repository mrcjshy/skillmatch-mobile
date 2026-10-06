// @ts-expect-error -- Node-only token harness; the Expo app omits Node declarations.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- Node-only token harness.
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

type Tokens = {
  colors: Record<string, string>;
  type: Record<string, { fontSize: number; lineHeight: number; fontWeight: string }>;
  spacing: Record<string, number>;
  radius: Record<string, number>;
  size: Record<string, number>;
};

function loadTokens(): Tokens {
  const exports: Record<string, any> = {};
  runInNewContext(
    ts.transpileModule(readFileSync('src/constants/theme.ts', 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports,
      require: (name: string) => {
        if (name === 'react-native') return { Platform: { select: (v: Record<string, unknown>) => v.android ?? v.default } };
        if (name === '@/global.css') return {};
        throw Error('Unexpected import: ' + name);
      },
    },
  );
  return exports.SkillMatchTheme.ui as Tokens;
}

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5]
    .map((o) => parseInt(hex.slice(o, o + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
};
const contrast = (fg: string, bg: string) => {
  const a = luminance(fg), b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

const ui = loadTokens();
const c = ui.colors;

// [foreground token, background token] pairs that the design language actually composes.
const TEXT_PAIRS: [string, string][] = [
  ['textPrimary', 'canvas'], ['textPrimary', 'surface'], ['textPrimary', 'surfaceRaised'], ['textPrimary', 'surfaceSunken'],
  ['textPrimary', 'accentSubtle'], ['textPrimary', 'accentSubtlePressed'],
  ['textSecondary', 'canvas'], ['textSecondary', 'surface'], ['textSecondary', 'surfaceSunken'],
  ['textSecondary', 'accentSubtle'], ['textSecondary', 'accentSubtlePressed'],
  ['textMuted', 'canvas'], ['textMuted', 'surface'], ['textMuted', 'surfaceSunken'], ['textMuted', 'accentSubtle'],
  ['accent', 'canvas'], ['accent', 'surface'], ['accent', 'surfaceSunken'], ['accent', 'accentSubtle'], ['accent', 'accentSubtlePressed'],
  ['onAccent', 'accent'], ['onAccent', 'accentPressed'],
  ['onAccentSecondary', 'accent'], ['onAccentSecondary', 'accentPressed'],
  ['accentPressed', 'accentSubtle'], ['accentPressed', 'accentSubtlePressed'],
  ['success', 'canvas'], ['success', 'surface'], ['success', 'successTint'],
  ['warning', 'canvas'], ['warning', 'surface'], ['warning', 'warningTint'],
  ['error', 'canvas'], ['error', 'surface'], ['error', 'errorTint'],
  ['info', 'surface'], ['info', 'infoTint'],
];
const CONTROL_PAIRS: [string, string][] = [
  ['controlBorder', 'canvas'], ['controlBorder', 'surface'], ['controlBorder', 'surfaceSunken'],
  ['accent', 'surface'], ['accent', 'canvas'], ['error', 'surface'],
];

describe('Iteration 06 Wave 0 token contract', () => {
  it.each(TEXT_PAIRS)('text %s on %s is at least 4.5:1', (fg, bg) => {
    expect(contrast(c[fg], c[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(CONTROL_PAIRS)('control/icon colour %s on %s is at least 3:1', (fg, bg) => {
    expect(contrast(c[fg], c[bg])).toBeGreaterThanOrEqual(3);
  });

  it('keeps one blue accent family and never lets a status colour stand in for it', () => {
    const channels = (hex: string) => [1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16));
    for (const token of ['accent', 'accentPressed', 'accentSubtle', 'accentSubtlePressed']) {
      const [r, , b] = channels(c[token]);
      expect(b, token).toBeGreaterThan(r);
    }
    const statuses = [c.success, c.warning, c.error, c.successTint, c.warningTint, c.errorTint];
    for (const status of statuses) expect([c.accent, c.accentPressed, c.accentSubtle]).not.toContain(status);
    expect(c.info).toBe(c.accent);
  });

  it('uses a warm off-white canvas, not the Iteration 05 cool slate or legacy cream-green', () => {
    expect(c.canvas).toBe('#F7F6F3');
    expect(['#F5F6F8', '#F9F6EF']).not.toContain(c.canvas);
    const [r, , b] = [1, 3, 5].map((o) => parseInt(c.canvas.slice(o, o + 2), 16));
    expect(r).toBeGreaterThanOrEqual(b); // warm: red channel not below blue
  });

  it('pressed states are visibly distinct from their resting colours', () => {
    expect(c.accentPressed).not.toBe(c.accent);
    expect(c.accentSubtlePressed).not.toBe(c.accentSubtle);
  });

  it('limits weights to 400 / 600 / 700, keeps body at 16sp and nothing tappable below 14sp', () => {
    for (const [name, t] of Object.entries(ui.type)) expect(['400', '600', '700'], name).toContain(t.fontWeight);
    expect(ui.type.body.fontSize).toBe(16);
    for (const name of ['label', 'button', 'helper', 'body', 'bodyEmphasis']) expect(ui.type[name].fontSize, name).toBeGreaterThanOrEqual(14);
    for (const t of Object.values(ui.type)) expect(t.lineHeight).toBeGreaterThan(t.fontSize);
    expect(ui.type.screenTitle.fontSize).toBeGreaterThan(ui.type.money.fontSize); // job title outranks its budget
  });

  it('uses the 4pt spacing grid apart from the one documented 2dp title-to-line step', () => {
    for (const [name, value] of Object.entries(ui.spacing)) if (name !== 'xxs') expect(value % 4, name).toBe(0);
    expect(Object.keys(ui.spacing)).not.toEqual(expect.arrayContaining(['xxxl']));
    expect(Object.keys(ui.spacing)).not.toContain('legacyLarge');
    expect(ui.spacing.gutter).toBe(20);
  });

  it('has no Wave 0 compatibility aliases left (Wave 5): one canonical name per token', () => {
    for (const alias of ['background', 'primary', 'primaryPressed', 'surfaceSubtle', 'border', 'selected', 'danger', 'dangerTint',
      'textInverse', 'textDisabled', 'accentSoft', 'overlay', 'navigationSurface', 'botanical', 'brandIvory', 'brandSage',
      'accentWorker', 'accentClient', 'accentAdmin']) expect(c, alias).not.toHaveProperty(alias);
    expect(ui).not.toHaveProperty('gradients');
    expect(Object.keys(ui.radius).sort()).toEqual(['card', 'control', 'pill', 'sheet', 'sm']);
    expect(ui.type).not.toHaveProperty('cardTitle');
    expect(ui.type).not.toHaveProperty('bodySmall');
  });

  it('defines the radius scale and 48dp touch-target rules', () => {
    expect(ui.radius.control).toBe(12);
    expect(ui.radius.card).toBe(16);
    expect(ui.radius.sheet).toBe(24);
    expect(ui.size.minTarget).toBe(48);
    for (const name of ['secondaryButton', 'ghostButton', 'compactButton', 'iconButton']) expect(ui.size[name], name).toBeGreaterThanOrEqual(48);
    expect(ui.size.primaryButton).toBe(52);
    expect(ui.size.fieldHeight).toBe(52);
    expect(ui.size.listRowMinHeight).toBeGreaterThanOrEqual(56);
  });
});
