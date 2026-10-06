import { createContext, useContext, type ReactNode } from 'react';

import { SkillMatchTheme } from '@/constants/theme';

export type UiTheme = Omit<typeof SkillMatchTheme.ui, 'colors'> & {
  colors: { [K in keyof typeof SkillMatchTheme.ui.colors]: string };
};

/**
 * Not a second palette: RefinementTheme carries exactly the values of SkillMatchTheme.ui. Its only
 * remaining job (kept in Wave 5) is its identity: AppSymbol draws glyphs through the synchronous
 * font path when it renders under RefinementThemeProvider, which is the PB-03 repair. Retiring the
 * provider would switch every other screen's glyph path at once, so it stays until that path is
 * validated on its own (release-native validation).
 */
export const RefinementTheme: UiTheme = {
  ...SkillMatchTheme.ui,
  colors: { ...SkillMatchTheme.ui.colors },
};

const UiThemeContext = createContext<UiTheme>(SkillMatchTheme.ui);

export function RefinementThemeProvider({ children }: { children: ReactNode }) {
  return <UiThemeContext.Provider value={RefinementTheme}>{children}</UiThemeContext.Provider>;
}

export function useUiTheme(): UiTheme {
  return useContext(UiThemeContext);
}
