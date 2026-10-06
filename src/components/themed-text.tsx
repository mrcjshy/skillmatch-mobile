import { StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, SkillMatchTheme, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const { colors, type: typography } = SkillMatchTheme.ui;

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'link' | 'linkPrimary' | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        type === 'default' && styles.default,
        type === 'title' && styles.title,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'subtitle' && styles.subtitle,
        type === 'link' && styles.link,
        type === 'linkPrimary' && styles.linkPrimary,
        type === 'code' && styles.code,
        { color: themeColor ? theme[themeColor] : type === 'linkPrimary' ? colors.primary : theme.text },
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: {
    ...typography.helper,
  },
  smallBold: {
    ...typography.helper,
    fontWeight: typography.bodyEmphasis.fontWeight,
  },
  default: {
    ...typography.body,
  },
  title: {
    ...typography.screenTitle,
  },
  subtitle: {
    ...typography.sectionTitle,
  },
  link: {
    ...typography.body,
  },
  linkPrimary: {
    ...typography.body,
  },
  code: {
    ...typography.caption,
    fontFamily: Fonts.mono,
  },
});
