import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useUiTheme, type UiTheme } from '@/components/refinement-theme';

type AppDialogProps = {
  visible: boolean;
  /** Called for Android Back and for a scrim tap (when `dismissible`). */
  onRequestClose: () => void;
  title: string;
  message?: string;
  children?: ReactNode;
  /** Buttons, stacked full width. At most one primary action. */
  actions?: ReactNode;
  /** Set false while a request is in flight so a stray tap cannot dismiss it. */
  dismissible?: boolean;
};

/**
 * Centred confirmation dialog. Dialogs FADE (sheets slide). Scrim covers the window from the
 * first frame; the card is capped to 90% of the window and scrolls when text is large.
 */
export function AppDialog({ visible, onRequestClose, title, message, children, actions, dismissible = true }: AppDialogProps) {
  const ui = useUiTheme();
  const { styles } = createStyles(ui);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onRequestClose}
    >
      <View style={styles.scrim}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss dialog"
          accessibilityState={{ disabled: !dismissible }}
          disabled={!dismissible}
          style={StyleSheet.absoluteFill}
          onPress={onRequestClose}
        />
        <ScrollView
          style={styles.cardScroll}
          contentContainerStyle={styles.card}
          keyboardShouldPersistTaps="handled"
          accessibilityViewIsModal
        >
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          {children}
          {actions ? <View style={styles.actions}>{actions}</View> : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing, radius, elevation } = ui;
  const styles = StyleSheet.create({
    scrim: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.gutter,
      backgroundColor: colors.scrim,
    },
    cardScroll: { maxHeight: '90%', width: '100%', maxWidth: 420, flexGrow: 0 },
    card: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.card,
      borderCurve: 'continuous',
      padding: spacing.xl,
      gap: spacing.md,
      ...elevation.floating,
    },
    title: { ...type.sectionTitle, color: colors.textPrimary },
    message: { ...type.body, color: colors.textSecondary },
    actions: { gap: spacing.sm, marginTop: spacing.sm },
  });
  return { styles };
}
