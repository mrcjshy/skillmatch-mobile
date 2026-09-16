/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

/** Role-neutral SkillMatch semantic design tokens for operational UI. */
export const SkillMatchTheme = {
  brand: {
    background: '#F5F3EF',
    primary: '#163300',
    primaryPressed: '#0F2400',
    primaryMuted: '#E4ECDF',
  },
  surface: {
    default: '#FFFFFF',
    subtle: '#F0EDE8',
  },
  border: {
    default: '#E8E5DF',
  },
  text: {
    primary: '#111827',
    secondary: '#6B7280',
    inverse: '#FFFFFF',
  },
  feedback: {
    success: '#15803D',
    warning: '#B45309',
    danger: '#B91C1C',
    info: '#1D4ED8',
  },
  status: {
    open: '#1D4ED8',
    confirmed: '#1D4ED8',
    completed: '#15803D',
    cancelled: '#B91C1C',
    pending: '#B45309',
    paid: '#15803D',
  },
  spacing: {
    screenGutter: 16,
    cardPadding: 16,
    cardGap: 12,
    sectionGap: 20,
  },
  radius: {
    card: 16,
    input: 12,
  },
  size: {
    iconTarget: 44,
    primaryCtaHeight: 52,
  },
  /**
   * Wise-inspired V2-F visual authority. Additive: production screens must keep
   * using the legacy accessors above until an authorized adoption gate.
   */
  ui: {
    colors: {
      background: '#FFFFFF',
      surface: '#FFFFFF',
      surfaceSubtle: '#F4F4EC',
      primary: '#163300',
      primaryPressed: '#0F2400',
      accent: '#9FE870',
      accentPressed: '#7ED856',
      accentSoft: '#E2F6D5',
      textPrimary: '#163300',
      textSecondary: '#6A6C6A',
      textDisabled: '#868685',
      textOnAccent: '#163300',
      textInverse: '#FFFFFF',
      border: '#E8EBE6',
      success: '#163300',
      warning: '#B45309',
      danger: '#B91C1C',
      info: '#163300',
      selected: '#9FE870',
      overlay: '#0E0F0C66',
      warningTint: '#FFFBEB',
      dangerTint: '#FEF2F2',
      accentWorker: '#9FE870',
      accentClient: '#70C8E8',
      accentAdmin: '#F4F4EC',
    },
    type: {
      display: { fontSize: 32, fontWeight: '800' as const, lineHeight: 38, letterSpacing: -0.3 },
      screenTitle: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28 },
      sectionTitle: { fontSize: 16, fontWeight: '700' as const, lineHeight: 22 },
      cardTitle: { fontSize: 16, fontWeight: '700' as const, lineHeight: 22 },
      body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 22 },
      bodyEmphasis: { fontSize: 16, fontWeight: '600' as const, lineHeight: 22 },
      helper: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
      caption: { fontSize: 12, fontWeight: '500' as const, lineHeight: 16 },
      button: { fontSize: 16, fontWeight: '700' as const, lineHeight: 20 },
      badge: { fontSize: 12, fontWeight: '700' as const, lineHeight: 16 },
    },
    spacing: {
      xxs: 2,
      xs: 4,
      sm: 8,
      md: 12,
      lg: 16,
      gutter: 20,
      xl: 24,
      xxl: 32,
      xxxl: 40,
    },
    radius: {
      sm: 8,
      md: 16,
      lg: 24,
      pill: 999,
    },
    size: {
      icon: 20,
      tabIcon: 24,
      iconCircle: 40,
      actionCircle: 56,
      fieldHeight: 52,
      searchHeight: 44,
      primaryButton: 56,
      secondaryButton: 48,
      ghostButton: 44,
      compactButton: 36,
      segmentHeight: 40,
      chipHeight: 28,
      homeAvatar: 40,
      profileAvatar: 64,
      listRowMinHeight: 56,
      mapPickerHeight: 180,
      mapApproxHeight: 160,
    },
  },
} as const;

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
