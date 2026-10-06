import { Link, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppSymbol } from '@/components/app-symbol';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';

type ConsentCheckProps = {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** Spoken name of the checkbox, e.g. "I agree to the Terms and Conditions". */
  accessibilityLabel: string;
  /** Sentence lead-in shown before the document link, e.g. "I agree to the". */
  lead: string;
  linkLabel: string;
  href: Href;
};

/**
 * One consent statement with the document it refers to. The box is a 48dp checkbox target; the
 * document name is an inline link so the reader can open it before agreeing. Shared by
 * registration and the post-sign-in consent gate.
 */
export function ConsentCheck({
  checked,
  onToggle,
  disabled = false,
  accessibilityLabel,
  lead,
  linkLabel,
  href,
}: ConsentCheckProps) {
  const ui = useUiTheme();
  const { colors } = ui;
  const styles = createStyles(ui);

  return (
    <View style={styles.row}>
      <Pressable
        style={styles.hit}
        onPress={onToggle}
        disabled={disabled}
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled }}
        accessibilityLabel={accessibilityLabel}
      >
        <View style={[styles.box, checked ? styles.boxChecked : null]}>
          {checked ? (
            <AppSymbol
              synchronousGlyph
              pointerEvents="none"
              accessible={false}
              name={{ android: 'check', ios: 'checkmark' }}
              size={18}
              tintColor={colors.onAccent}
            />
          ) : null}
        </View>
      </Pressable>
      <Text style={styles.text}>
        {lead}{' '}
        <Link href={href} style={styles.link}>
          {linkLabel}
        </Link>
      </Text>
    </View>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing, size } = ui;
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
    hit: {
      // The 48dp target extends 12dp left of the column so the 24dp box lines up with field edges.
      marginLeft: -spacing.md,
      minWidth: size.minTarget,
      minHeight: size.minTarget,
      alignItems: 'center',
      justifyContent: 'center',
    },
    box: {
      width: 24,
      height: 24,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: colors.controlBorder,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    boxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
    // Vertically centred on the 48dp box's first line.
    text: { ...type.body, flex: 1, color: colors.textPrimary, paddingTop: spacing.md },
    link: { ...type.bodyEmphasis, color: colors.accent, textDecorationLine: 'underline' },
  });
}
