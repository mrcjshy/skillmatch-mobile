import { defaultConfig } from '@tamagui/config/v5';
import { createFont, createTamagui, createTokens } from 'tamagui';

import { SkillMatchTheme } from './src/constants/theme';

const { colors, spacing, radius, size, type } = SkillMatchTheme.ui;

// Keep the existing UI tokens authoritative while components migrate incrementally.
function typographyValues<K extends 'fontSize' | 'lineHeight' | 'fontWeight'>(key: K) {
  return Object.fromEntries(
    Object.entries(type).map(([name, style]) => [name, style[key]])
  ) as { [Name in keyof typeof type]: (typeof type)[Name][K] };
}

const systemFont = createFont({
  family: 'System',
  size: { ...typographyValues('fontSize'), true: type.body.fontSize },
  lineHeight: { ...typographyValues('lineHeight'), true: type.body.lineHeight },
  weight: { ...typographyValues('fontWeight'), true: type.body.fontWeight },
  letterSpacing: {
    ...Object.fromEntries(Object.keys(type).map((name) => [name, 0])),
    display: type.display.letterSpacing,
  },
});

export const tamaguiConfig = createTamagui({
  ...defaultConfig,
  tokens: createTokens({
    ...defaultConfig.tokens,
    color: colors,
    space: { ...defaultConfig.tokens.space, ...spacing },
    radius: { ...defaultConfig.tokens.radius, ...radius },
    size: { ...defaultConfig.tokens.size, ...size },
  }),
  fonts: { body: systemFont, heading: systemFont },
  // Operational UI stays on its current palette regardless of device color scheme.
  themes: {
    skillmatch: {
      ...defaultConfig.themes.light,
      ...colors,
      background: colors.canvas,
      color: colors.textPrimary,
      colorHover: colors.textPrimary,
      colorPress: colors.textPrimary,
      colorFocus: colors.textPrimary,
      colorDisabled: colors.textMuted,
      backgroundHover: colors.surfaceSunken,
      backgroundPress: colors.surfaceSunken,
      backgroundFocus: colors.surfaceSunken,
      backgroundDisabled: colors.surfaceSunken,
      borderColor: colors.hairline,
      borderColorHover: colors.hairline,
      borderColorPress: colors.hairline,
      borderColorFocus: colors.accent,
      borderColorDisabled: colors.hairline,
      placeholderColor: colors.textMuted,
    },
  },
  settings: { ...defaultConfig.settings, onlyAllowShorthands: false },
});

export default tamaguiConfig;

type SkillMatchTamaguiConfig = typeof tamaguiConfig;

declare module 'tamagui' {
  // Tamagui's supported module augmentation requires an interface for merging.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface TamaguiCustomConfig extends SkillMatchTamaguiConfig {}
}
