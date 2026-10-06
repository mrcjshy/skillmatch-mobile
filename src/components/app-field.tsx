import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { SkillMatchTheme } from '@/constants/theme';

const { colors, type, spacing, radius, size } = SkillMatchTheme.ui;

type AppFieldProps = TextInputProps & {
  label?: string;
  helperText?: string;
  errorText?: string;
  disabled?: boolean;
  variant?: 'default' | 'search';
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
};

export function AppField({
  label,
  helperText,
  errorText,
  disabled = false,
  variant = 'default',
  containerStyle,
  inputStyle,
  style,
  editable,
  multiline = false,
  onFocus,
  onBlur,
  placeholderTextColor,
  accessibilityState,
  accessibilityLabel,
  ...inputProps
}: AppFieldProps) {
  const [focused, setFocused] = useState(false);
  const isSearch = variant === 'search';
  const hasError = typeof errorText === 'string' && errorText.length > 0;
  const canEdit = disabled ? false : editable;
  const noneditable = disabled || editable === false;
  const hasExplicitNameOrReference =
    inputProps['aria-label'] !== undefined ||
    inputProps.accessibilityLabelledBy !== undefined ||
    inputProps['aria-labelledby'] !== undefined;

  return (
    <View style={containerStyle}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        {...inputProps}
        accessibilityLabel={accessibilityLabel ?? (hasExplicitNameOrReference ? undefined : label)}
        multiline={multiline}
        editable={canEdit}
        accessibilityState={{ ...accessibilityState, disabled: noneditable }}
        aria-disabled={noneditable}
        placeholderTextColor={placeholderTextColor ?? colors.textDisabled}
        underlineColorAndroid="transparent"
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[
          styles.input,
          isSearch ? styles.search : styles.defaultField,
          multiline ? styles.multiline : null,
          focused && !hasError ? styles.focused : null,
          hasError ? styles.error : null,
          noneditable ? styles.disabled : null,
          style,
          inputStyle,
        ]}
      />
      {hasError ? <Text style={styles.errorText}>{errorText}</Text> : null}
      {!hasError && helperText ? <Text style={styles.helper}>{helperText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  input: {
    ...type.body,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceSubtle,
  },
  defaultField: {
    minHeight: size.fieldHeight,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.controlBorder,
    borderCurve: 'continuous',
  },
  search: {
    minHeight: size.searchHeight,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.controlBorder,
  },
  multiline: {
    minHeight: 96,
    paddingVertical: spacing.md,
    textAlignVertical: 'top',
  },
  focused: {
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  error: {
    borderWidth: 1.5,
    borderColor: colors.danger,
  },
  disabled: {
    backgroundColor: colors.surfaceSubtle,
    color: colors.textSecondary,
  },
  helper: {
    ...type.helper,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  errorText: {
    ...type.helper,
    color: colors.danger,
    marginTop: spacing.xs,
  },
});
