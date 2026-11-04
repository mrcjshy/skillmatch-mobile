/**
 * SkillMatchTheme.ui is the light-only visual authority (Iteration 06 design language;
 * see SKILLMATCH-DESIGN.md). Since Wave 5 there are no compatibility aliases: every consumer
 * uses these canonical names.
 */

import '@/global.css';

import { Platform } from 'react-native';

/**
 * Material 3 colour roles from the SkillMatch cobalt seed (owner choice 2026-11-04, "Material 3 +
 * cobalt"). Tones come from Google's material-color-utilities tonal palettes of #1C3AA6 (hue 276.7);
 * the brand cobalt itself stays the primary, so filled actions keep the SkillMatch blue. Token names
 * are the app's; the M3 role each one plays is noted. Success / warning / error are status colours
 * only and are never the brand colour. All text pairs are verified by
 * `src/constants/theme-contrast.test.ts` (text >= 4.5:1, control borders >= 3:1).
 */
const canonical = {
  // Surfaces (M3 surface containers, faintly cobalt-tinted)
  canvas: '#FBF8FF', // surface
  surface: '#FFFFFF', // surfaceContainerLowest: cards, groups, fields
  surfaceRaised: '#F5F2FA', // surfaceContainerLow: sheets, dialogs
  surfaceSunken: '#E9E7EF', // surfaceContainerHigh: input wells, disabled, segmented track
  surfaceContainer: '#EFEDF4', // navigation bar, menus
  surfaceContainerHighest: '#E3E1E9', // filled cards, text-field fills
  hairline: '#C5C5D3', // outlineVariant: dividers; never the only boundary of a control
  controlBorder: '#757682', // outline: control outlines, >= 3:1 on canvas / surface / sunken
  // Primary: the brand cobalt
  accent: '#1C3AA6', // primary
  accentPressed: '#142B7F',
  accentSubtle: '#DDE1FF', // primaryContainer (tone 90)
  accentSubtlePressed: '#D2D8FF', // pressed / selected-pressed state of an accentSubtle surface
  onAccent: '#FFFFFF', // onPrimary
  onAccentSecondary: '#DDE1FF', // secondary text on primary
  onAccentSubtle: '#001355', // onPrimaryContainer (tone 10)
  // Tonal accent (M3 secondaryContainer): the navigation indicator, selected segments, tonal buttons
  accentTonal: '#DFE1F9',
  onAccentTonal: '#171B2C',
  // Inverse: snackbars
  inverseSurface: '#303036',
  inverseOnSurface: '#F2F0F7',
  // Text
  textPrimary: '#1B1B21', // onSurface
  textSecondary: '#454651', // onSurfaceVariant
  textMuted: '#5C5E69', // metadata and placeholders; >= 4.5:1 on every surface
  // Status (never brand)
  success: '#1F7A45',
  successTint: '#E7F4EC',
  warning: '#8A5300',
  warningTint: '#FFF4DC',
  error: '#BA1A1A', // M3 error
  errorTint: '#FFDAD6', // errorContainer
  info: '#1C3AA6', // informational state uses the primary
  infoTint: '#DDE1FF',
  scrim: '#00000052', // M3 scrim, 32% black
} as const;

// Use the platform-rendered sans deliberately: Roboto on Android, System on iOS.
const nativeSans = Platform.select({ android: 'sans-serif', ios: 'System', default: 'system-ui' });

const font = { fontFamily: nativeSans, includeFontPadding: false } as const;

const ui = {
  colors: canonical,
  /**
   * Hierarchy (sp at 100% text; all scale with the system font scale) on the Material 3 scale:
   * Regular 400 for reading, Medium 500 for titles, labels and buttons, Bold 700 only for money.
   * Tracking follows M3 (body 0.5, supporting 0.25, labels 0.1). Nothing tappable is below 14.
   */
  type: {
    display: { ...font, fontSize: 28, fontWeight: '500' as const, lineHeight: 36, letterSpacing: 0 }, // headlineMedium, emphasized
    screenTitle: { ...font, fontSize: 22, fontWeight: '500' as const, lineHeight: 28, letterSpacing: 0 }, // titleLarge, emphasized
    sectionTitle: { ...font, fontSize: 18, fontWeight: '500' as const, lineHeight: 24, letterSpacing: 0.15 }, // titleMedium
    body: { ...font, fontSize: 16, fontWeight: '400' as const, lineHeight: 24, letterSpacing: 0.5 }, // bodyLarge
    bodyEmphasis: { ...font, fontSize: 16, fontWeight: '500' as const, lineHeight: 24, letterSpacing: 0.15 },
    helper: { ...font, fontSize: 14, fontWeight: '400' as const, lineHeight: 20, letterSpacing: 0.25 }, // bodyMedium
    label: { ...font, fontSize: 14, fontWeight: '500' as const, lineHeight: 20, letterSpacing: 0.1 }, // labelLarge
    caption: { ...font, fontSize: 12, fontWeight: '400' as const, lineHeight: 16, letterSpacing: 0.4 }, // bodySmall
    button: { ...font, fontSize: 16, fontWeight: '500' as const, lineHeight: 24, letterSpacing: 0.1 },
    badge: { ...font, fontSize: 13, fontWeight: '500' as const, lineHeight: 18, letterSpacing: 0.5 }, // labelMedium
    money: { ...font, fontSize: 20, fontWeight: '700' as const, lineHeight: 26, letterSpacing: 0, fontVariant: ['tabular-nums'] as 'tabular-nums'[] },
    numeric: { ...font, fontSize: 18, fontWeight: '500' as const, lineHeight: 24, letterSpacing: 0.15, fontVariant: ['tabular-nums'] as 'tabular-nums'[] },
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
   * control 12 (buttons, fields) - card 16 - sheet 28 (M3 extra-large) - pill for chips / avatars. `sm` (8) is only for
   * an element nested inside a control or card (checkbox, QR inset, a text button's pressed fill).
   */
  radius: {
    sm: 8,
    control: 12,
    card: 16,
    sheet: 28,
    pill: 999,
  },
  /**
   * M3 elevation as CSS box shadows (the Expo native-UI rule: never the legacy shadow / elevation
   * props). `floating` is M3 level 3 (FAB, floating buttons, banners); `sheet` lifts a bottom sheet
   * upward. Surfaces otherwise separate by tone, not shadow.
   */
  elevation: {
    flat: {},
    floating: {
      boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.24), 0px 4px 8px 3px rgba(0, 0, 0, 0.12)',
    },
    sheet: {
      boxShadow: '0px -1px 3px rgba(0, 0, 0, 0.10), 0px -6px 16px rgba(0, 0, 0, 0.08)',
    },
  },
  size: {
    minTarget: 48,
    icon: 20,
    tabIcon: 24,
    tabIndicatorWidth: 64, // M3 navigation active indicator: 64 x 32
    tabIndicatorHeight: 32,
    // How far tab scenes run under the floating bar. Scrolling content ends with this much bottom
    // padding, and anything fixed at a scene's bottom (the Home booking dock) adds it, so neither
    // rests under the bar.
    tabBarOverlap: 48,
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
    chipHeight: 32, // M3 chip
    homeAvatar: 40,
    profileAvatar: 72,
    listRowMinHeight: 56,
    sheetMaxHeightRatio: 0.9,
    sheetHandleWidth: 32, // M3 drag handle
    sheetHandleHeight: 4,
    mapPickerHeight: 180,
    mapApproxHeight: 160,
  },
} as const;

/** The single Iteration 06 visual authority. Screens read `SkillMatchTheme.ui` (or `useUiTheme()`). */
export const SkillMatchTheme = { ui } as const;
