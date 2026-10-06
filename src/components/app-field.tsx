import { useState, type ReactNode, type Ref } from 'react';
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

import { useUiTheme, type UiTheme } from '@/components/refinement-theme';



export type AppFieldProps = TextInputProps & {
  label?: string;
  helperText?: string;
  errorText?: string;
  disabled?: boolean;
  variant?: 'default' | 'search';
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  /** Imperative handle for focus management (e.g. focusing the first invalid field). */
  inputRef?: Ref<TextInput>;
  /**
   * Optional control drawn inside the right edge of the input (e.g. a password
   * visibility toggle). It reserves a 48dp target; when absent the layout is unchanged.
   */
  trailing?: ReactNode;
};

export function AppField({
  label,
  helperText,
  errorText,
  disabled = false,
  variant = 'default',
  containerStyle,
  inputStyle,
  inputRef,
  trailing,
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
  const ui = useUiTheme();
  const { colors } = ui;
  const { styles } = createStyles(ui);

  const [focused, setFocused] = useState(false);
  const isSearch = variant === 'search';
  const hasError = typeof errorText === 'string' && errorText.length > 0;
  const canEdit = disabled ? false : editable;
  const noneditable = disabled || editable === false;
  const hasExplicitNameOrReference =
    inputProps['aria-label'] !== undefined ||
    inputProps.accessibilityLabelledBy !== undefined ||
    inputProps['aria-labelledby'] !== undefined;
  // React Native has no input-to-description relationship (no aria-describedby), so an error is
  // tied to the input itself: appended to its name when the field names itself, otherwise given as
  // its hint. The visible error line is then hidden from accessibility so it is not read twice.
  const fieldName = accessibilityLabel ?? (hasExplicitNameOrReference ? undefined : label);
  const errorDescription = hasError ? `Error: ${errorText}` : undefined;
  const inputName = errorDescription && fieldName ? `${fieldName}, ${errorDescription}` : fieldName;
  const inputHint = errorDescription && !fieldName ? errorDescription : inputProps.accessibilityHint;

  const inputNode = (
    <TextInput
      {...inputProps}
      ref={inputRef}
      accessibilityLabel={inputName}
      accessibilityHint={inputHint}
      multiline={multiline}
      editable={canEdit}
      accessibilityState={{ ...accessibilityState, disabled: noneditable }}
      aria-disabled={noneditable}
      placeholderTextColor={placeholderTextColor ?? colors.textMuted}
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
        trailing ? styles.withTrailing : null,
        noneditable ? styles.disabled : null,
        style,
        inputStyle,
      ]}
    />
  );

  return (
    <View style={containerStyle}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {trailing ? (
        <View style={styles.inputWrap}>
          {inputNode}
          <View style={styles.trailing}>{trailing}</View>
        </View>
      ) : (
        inputNode
      )}
      {hasError ? <Text style={styles.errorText} accessibilityElementsHidden importantForAccessibility="no">{errorText}</Text> : null}
      {!hasError && helperText ? <Text style={styles.helper}>{helperText}</Text> : null}
    </View>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing, radius, size } = ui;
const styles = StyleSheet.create({
  label: {
    ...type.label,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  input: {
    ...type.body,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  defaultField: {
    minHeight: size.fieldHeight,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderCurve: 'continuous',
  },
  search: {
    minHeight: size.searchHeight,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.controlBorder,
  },
  multiline: {
    minHeight: 96,
    paddingVertical: spacing.md,
    textAlignVertical: 'top',
  },
  focused: {
    borderColor: colors.accent,
  },
  error: {
    borderColor: colors.error,
  },
  disabled: {
    backgroundColor: colors.surfaceSunken,
    color: colors.textSecondary,
  },
  inputWrap: { position: 'relative' },
  withTrailing: { paddingRight: size.iconButton },
  trailing: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: size.iconButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helper: {
    ...type.helper,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  errorText: {
    ...type.helper,
    color: colors.error,
    marginTop: spacing.xs,
  },
});

  return { styles };
}
