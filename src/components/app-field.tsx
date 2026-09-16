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
  ...inputProps
}: AppFieldProps) {
  const [focused, setFocused] = useState(false);
  const isSearch = variant === 'search';
  const hasError = typeof errorText === 'string' && errorText.length > 0;
  const canEdit = disabled ? false : editable;

  return (
    <View style={containerStyle}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        {...inputProps}
        multiline={multiline}
        editable={canEdit}
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
          multiline && !isSearch ? styles.multiline : null,
          focused && !hasError ? styles.focused : null,
          hasError ? styles.error : null,
          disabled ? styles.disabled : null,
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
    height: size.fieldHeight,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderCurve: 'continuous',
  },
  search: {
    height: size.searchHeight,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  multiline: {
    height: undefined,
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
    opacity: 0.6,
    color: colors.textDisabled,
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
