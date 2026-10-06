/**
 * SkillMatchTheme.ui is the light-only visual authority. Legacy exports below
 * remain compatibility adapters while screens migrate incrementally.
 */

import '@/global.css';

import { Platform } from 'react-native';

/** Role-neutral UI-HIG visual tokens; controls adopt sizing behavior in Wave 2. */
const uiColors = {
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceSubtle: '#F4F4EC',
  elevatedSurface: '#FFFFFF',
  primary: '#163300',
  primaryPressed: '#0F2400',
  accent: '#9FE870',
  accentPressed: '#7ED856',
  accentSoft: '#E2F6D5',
  textPrimary: '#111827',
  textSecondary: '#5F6360',
  textDisabled: '#6A6C6A',
  textOnAccent: '#163300',
  textInverse: '#FFFFFF',
  border: '#D9DDD7',
  controlBorder: '#737A70',
  success: '#15803D',
  warning: '#B45309',
  danger: '#B91C1C',
  info: '#1D4ED8',
  selected: '#E2F6D5',
  overlay: '#0E0F0C66',
  warningTint: '#FFFBEB',
  dangerTint: '#FEF2F2',
  successTint: '#ECFDF3',
  infoTint: '#EFF6FF',
} as const;

const ui = {
  colors: {
    ...uiColors,
    // Transitional role aliases share the same brand accent.
    accentWorker: uiColors.accent,
    accentClient: uiColors.accent,
    accentAdmin: uiColors.accent,
  },
  type: {
    display: { fontSize: 32, fontWeight: '700' as const, lineHeight: 38, letterSpacing: -0.3 },
    screenTitle: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28 },
    sectionTitle: { fontSize: 17, fontWeight: '600' as const, lineHeight: 22 },
    cardTitle: { fontSize: 17, fontWeight: '600' as const, lineHeight: 22 },
    body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
    bodyEmphasis: { fontSize: 16, fontWeight: '600' as const, lineHeight: 24 },
    helper: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
    caption: { fontSize: 12, fontWeight: '500' as const, lineHeight: 16 },
    button: { fontSize: 16, fontWeight: '600' as const, lineHeight: 20 },
    badge: { fontSize: 12, fontWeight: '600' as const, lineHeight: 16 },
  },
  spacing: {
    xxs: 2, // Transitional optical/legacy spacing; not a new layout step.
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    gutter: 20,
    xl: 24,
    xxl: 32,
    xxxl: 40, // Transitional legacy spacing.
    xxxxl: 48,
    legacyLarge: 64, // Preserve Spacing.six until its consumers migrate.
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    pill: 999,
  },
  size: {
    icon: 20,
    tabIcon: 24,
    iconCircle: 40,
    actionCircle: 56,
    fieldHeight: 52,
    searchHeight: 52,
    primaryButton: 56,
    secondaryButton: 52,
    ghostButton: 48,
    compactButton: 48,
    segmentHeight: 40,
    chipHeight: 28,
    homeAvatar: 40,
    profileAvatar: 64,
    listRowMinHeight: 56,
    mapPickerHeight: 180,
    mapApproxHeight: 160,
  },
} as const;

/** Existing compatibility shapes derive from the operational ui authority. */
export const SkillMatchTheme = {
  brand: {
    background: ui.colors.background,
    primary: ui.colors.primary,
    primaryPressed: ui.colors.primaryPressed,
    primaryMuted: ui.colors.accentSoft,
  },
  surface: { default: ui.colors.surface, subtle: ui.colors.surfaceSubtle },
  border: { default: ui.colors.border },
  text: {
    primary: ui.colors.textPrimary,
    secondary: ui.colors.textSecondary,
    inverse: ui.colors.textInverse,
  },
  feedback: {
    success: ui.colors.success,
    warning: ui.colors.warning,
    danger: ui.colors.danger,
    info: ui.colors.info,
  },
  status: {
    open: ui.colors.info,
    confirmed: ui.colors.info,
    completed: ui.colors.success,
    cancelled: ui.colors.danger,
    pending: ui.colors.warning,
    paid: ui.colors.success,
  },
  spacing: {
    screenGutter: ui.spacing.gutter,
    cardPadding: ui.spacing.lg,
    cardGap: ui.spacing.md,
    sectionGap: ui.spacing.xl,
  },
  radius: { card: ui.radius.lg, input: ui.radius.md },
  // Transitional dimensions: minimum targets and control reflow are Wave 2.
  size: { iconTarget: ui.size.ghostButton, primaryCtaHeight: ui.size.fieldHeight },
  ui,
} as const;

const legacyColors = {
  text: ui.colors.textPrimary,
  background: ui.colors.background,
  backgroundElement: ui.colors.surfaceSubtle,
  backgroundSelected: ui.colors.selected,
  textSecondary: ui.colors.textSecondary,
} as const;

export const Colors = {
  light: legacyColors,
  dark: legacyColors,
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
    sans: 'system-ui',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: ui.spacing.xxs,
  one: ui.spacing.xs,
  two: ui.spacing.sm,
  three: ui.spacing.lg,
  four: ui.spacing.xl,
  five: ui.spacing.xxl,
  six: ui.spacing.legacyLarge,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
