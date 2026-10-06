import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { AppField, type AppFieldProps } from '@/components/app-field';
import { AppSymbol } from '@/components/app-symbol';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';

export type PasswordFieldProps = Omit<AppFieldProps, 'secureTextEntry' | 'trailing'>;

/**
 * AppField for a password with a show/hide control inside the field. Hidden by default; the
 * control is a 48dp button whose spoken name always states the action it will take.
 */
export function PasswordField({ disabled = false, ...fieldProps }: PasswordFieldProps) {
  const ui = useUiTheme();
  const { colors } = ui;
  const styles = createStyles(ui);
  const [visible, setVisible] = useState(false);

  return (
    <AppField
      {...fieldProps}
      disabled={disabled}
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      trailing={
        <Pressable
          style={styles.toggle}
          onPress={() => setVisible((current) => !current)}
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          accessibilityState={{ disabled }}
          disabled={disabled}
          hitSlop={4}
        >
          <AppSymbol
            synchronousGlyph
            pointerEvents="none"
            accessible={false}
            name={visible ? { android: 'visibility_off', ios: 'eye.slash' } : { android: 'visibility', ios: 'eye' }}
            size={22}
            tintColor={disabled ? colors.textMuted : colors.textSecondary}
          />
        </Pressable>
      }
    />
  );
}

function createStyles(ui: UiTheme) {
  const { size } = ui;
  return StyleSheet.create({
    toggle: { width: size.minTarget, height: size.minTarget, alignItems: 'center', justifyContent: 'center' },
  });
}
