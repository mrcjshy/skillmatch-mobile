/**
 * SkillMatchTheme.ui is the light-only visual authority (Iteration 06 design language;
 * see SKILLMATCH-DESIGN.md). Since Wave 5 there are no compatibility aliases: every consumer
 * uses these canonical names.
 */

import '@/global.css';

import { Platform } from 'react-native';

/**
 * One accent (blue), one ink, one warm canvas. Success / warning / error are status colours
 * only and are never the brand colour. All text pairs are verified by
 * `src/constants/theme-contrast.test.ts` (text >= 4.5:1, control borders >= 3:1).
 */
const canonical = {
  // Surfaces
  canvas: '#F7F6F3',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF', // sheets, dialogs, snackbars: separated by elevation, not by colour
  surfaceSunken: '#EFEEEA', // input wells, disabled, segmented track
  hairline: '#E1DFD9', // decorative dividers; never the only boundary of a control
  controlBorder: '#7A818C', // control outlines, >= 3:1 on canvas / surface / sunken
  // Accent
  accent: '#1C3AA6', // deeper cobalt-navy; same single blue family
  accentPressed: '#142B7F',
  accentSubtle: '#E9EEFC',
  accentSubtlePressed: '#DCE4FA', // pressed / selected-pressed state of an accentSubtle surface
  onAccent: '#FFFFFF',
  onAccentSecondary: '#E3E9FB',
  // Text
  textPrimary: '#1B1F24',
  textSecondary: '#59606B',
  textMuted: '#636A75', // metadata and placeholders; >= 4.5:1 on every surface
  // Status (never brand)
  success: '#1F7A45',
  successTint: '#E7F4EC',
  warning: '#8A5300',
  warningTint: '#FFF4DC',
  error: '#B3261E',
  errorTint: '#FCEAE8',
  info: '#1C3AA6', // informational state uses the accent family
  infoTint: '#E9EEFC',
  scrim: '#1B1F2466',
} as const;

// Use the platform-rendered sans deliberately: Roboto on Android, System on iOS.
const nativeSans = Platform.select({ android: 'sans-serif', ios: 'System', default: 'system-ui' });

const font = { fontFamily: nativeSans, includeFontPadding: false } as const;

const ui = {
  colors: canonical,
  /**
   * Hierarchy (sp at 100% text; all scale with the system font scale). Weights are limited to
   * 400 / 600 / 700. Nothing tappable is below 14.
   */
  type: {
    display: { ...font, fontSize: 28, fontWeight: '700' as const, lineHeight: 34, letterSpacing: -0.2 },
    screenTitle: { ...font, fontSize: 22, fontWeight: '700' as const, lineHeight: 28, letterSpacing: -0.2 },
    sectionTitle: { ...font, fontSize: 18, fontWeight: '700' as const, lineHeight: 24, letterSpacing: 0 },
    body: { ...font, fontSize: 16, fontWeight: '400' as const, lineHeight: 24, letterSpacing: 0 },
    bodyEmphasis: { ...font, fontSize: 16, fontWeight: '600' as const, lineHeight: 24, letterSpacing: 0 },
    helper: { ...font, fontSize: 14, fontWeight: '400' as const, lineHeight: 20, letterSpacing: 0 },
    label: { ...font, fontSize: 14, fontWeight: '600' as const, lineHeight: 20, letterSpacing: 0 },
    caption: { ...font, fontSize: 12, fontWeight: '400' as const, lineHeight: 16, letterSpacing: 0 },
    button: { ...font, fontSize: 16, fontWeight: '600' as const, lineHeight: 24, letterSpacing: 0 },
    badge: { ...font, fontSize: 13, fontWeight: '600' as const, lineHeight: 18, letterSpacing: 0 },
    money: { ...font, fontSize: 20, fontWeight: '700' as const, lineHeight: 26, letterSpacing: -0.2, fontVariant: ['tabular-nums'] as 'tabular-nums'[] },
    numeric: { ...font, fontSize: 18, fontWeight: '600' as const, lineHeight: 24, letterSpacing: 0, fontVariant: ['tabular-nums'] as 'tabular-nums'[] },
  },
  /**
   * 4-pt grid. `xxs` (2) is the one retained sub-grid step: the gap between a row's title and its
   * supporting line, used the same way by every role's rows.
   */
  spacing: {
    xxs: 2,
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    gutter: 20,
    // Compact shared upper/header insets; body rows retain their existing gutter.
    headerGutter: 24,
    headerTop: 16,
    headerGap: 4,
    xl: 24,
    xxl: 32,
    xxxxl: 48,
  },
  /**
   * control 12 (buttons, fields) - card 16 - sheet 24 - pill for chips / avatars. `sm` (8) is only for
   * an element nested inside a control or card (checkbox, QR inset, a text button's pressed fill).
   */
  radius: {
    sm: 8,
    control: 12,
    card: 16,
    sheet: 24,
    pill: 999,
  },
  /** Two surface levels (canvas, surface) separated by hairlines; shadow only for floating layers. */
  elevation: {
    flat: {},
    floating: {
      shadowColor: '#1B1F24',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.14,
      shadowRadius: 12,
      elevation: 6,
    },
    sheet: {
      shadowColor: '#1B1F24',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
      elevation: 12,
    },
  },
  size: {
    minTarget: 48,
    icon: 20,
    tabIcon: 24,
    tabIndicatorWidth: 52,
    tabIndicatorHeight: 32,
    iconCircle: 40,
    actionCircle: 56,
    fieldHeight: 52,
    searchHeight: 52,
    primaryButton: 52,
    secondaryButton: 48,
    ghostButton: 48,
    compactButton: 48,
    iconButton: 48,
    segmentHeight: 40,
    chipHeight: 28,
    homeAvatar: 40,
    profileAvatar: 72,
    listRowMinHeight: 56,
    sheetMaxHeightRatio: 0.9,
    sheetHandleWidth: 36,
    sheetHandleHeight: 4,
    mapPickerHeight: 180,
    mapApproxHeight: 160,
  },
} as const;

/** The single Iteration 06 visual authority. Screens read `SkillMatchTheme.ui` (or `useUiTheme()`). */
export const SkillMatchTheme = { ui } as const;
