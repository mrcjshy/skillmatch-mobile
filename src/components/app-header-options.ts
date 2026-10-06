import { SkillMatchTheme } from '@/constants/theme';

const { colors, type } = SkillMatchTheme.ui;

/**
 * The one navigator header for Worker, Client and Admin, used by every role Stack (pushed screens)
 * and by the tab navigators. Navigator-owned centering balances Back and actions without changing
 * native Back. The title is the section style (18 / 700) on the canvas, with no shadow; the native
 * Stack header accepts only family, size and weight, so the tab header adds the line height itself.
 */
export const APP_HEADER_OPTIONS = {
  headerTitleAlign: 'center' as const,
  headerStyle: { backgroundColor: colors.canvas },
  headerShadowVisible: false,
  headerTintColor: colors.textPrimary,
  headerTitleStyle: {
    fontFamily: type.sectionTitle.fontFamily,
    fontSize: type.sectionTitle.fontSize,
    fontWeight: type.sectionTitle.fontWeight,
  },
};

/** Options for a role's Stack: the shared header plus the canvas behind every pushed screen. */
export const APP_STACK_SCREEN_OPTIONS = {
  ...APP_HEADER_OPTIONS,
  statusBarStyle: 'dark' as const,
  contentStyle: { backgroundColor: colors.canvas },
};
