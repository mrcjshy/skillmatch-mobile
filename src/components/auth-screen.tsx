import { Link } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useRef, type ComponentProps, type ReactNode, type RefObject } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useUiTheme, type UiTheme } from '@/components/refinement-theme';

/** Space kept above a revealed field so its label stays visible (label + gap + breathing room). */
const REVEAL_OFFSET = 88;

type AuthScreenProps = {
  /** From `useAuthScroll()`; lets the screen scroll a focused invalid field clear of the top edge. */
  scrollRef?: RefObject<ScrollView | null>;
  title: string;
  description?: string;
  /** Compact wordmark above the title; on for entry screens, off for later steps. */
  brand?: boolean;
  children?: ReactNode;
  /** Secondary navigation, visually subordinate to the form's one primary action. */
  footer?: ReactNode;
  /**
   * The screen's primary action pinned below the scrolling content, for short reading flows
   * (consent) where the action must stay reachable at 130% text. Not used for forms: the
   * keyboard owns the bottom of those screens.
   */
  stickyFooter?: ReactNode;
};

/**
 * Shared shell for sign-in, recovery, registration, verification and consent: flat canvas, one
 * left-aligned column, a title that carries the screen, then the form. Root insets are applied as
 * padding (edge-to-edge on API 36), the scroll viewport clips to its own bounds, and the keyboard
 * pads the column so the focused field and primary action stay reachable.
 */
/**
 * Focus management for forms: focus a field, then scroll it so its label stays visible. Android
 * otherwise aligns the focused input's top edge with the viewport's top edge, hiding the label.
 */
export function useAuthScroll() {
  const scrollRef = useRef<ScrollView>(null);
  const focusField = useCallback((ref: RefObject<TextInput | null>) => {
    ref.current?.focus();
    // Wait one beat for the keyboard to open and the viewport to settle before measuring.
    setTimeout(() => {
      const input = ref.current;
      // getInnerViewRef is the current ScrollView API; the shipped typings only list the legacy node getter.
      const inner = (scrollRef.current as unknown as { getInnerViewRef?: () => unknown } | null)?.getInnerViewRef?.();
      if (!input || !inner || typeof input.measureLayout !== 'function') return;
      input.measureLayout(
        inner as never,
        (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - REVEAL_OFFSET), animated: true }),
        () => undefined,
      );
    }, 120);
  }, []);
  return { scrollRef, focusField };
}

export function AuthScreen({ scrollRef, title, description, brand = true, children, footer, stickyFooter }: AuthScreenProps) {
  const ui = useUiTheme();
  const styles = createStyles(ui);
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView
          ref={scrollRef}
          style={styles.viewport}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          <View style={styles.column}>
            {brand ? <BrandMark /> : null}
            <View style={styles.header}>
              <Text accessibilityRole="header" style={styles.title}>
                {title}
              </Text>
              {description ? <Text style={styles.description}>{description}</Text> : null}
            </View>
            {children}
            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </View>
        </ScrollView>
        {stickyFooter ? <View style={styles.sticky}>{stickyFooter}</View> : null}
      </KeyboardAvoidingView>
    </View>
  );
}

/**
 * Compact wordmark. Its colour is provisional (it follows the accent through the token aliases)
 * and is deliberately not treated as a branding decision here.
 */
function BrandMark() {
  const styles = createStyles(useUiTheme());
  return (
    <View style={styles.brand} accessible accessibilityLabel="SkillMatch" accessibilityRole="image">
      <Image
        source={require('@/assets/images/skillmatch-logo.png')}
        style={styles.brandLogo}
        accessibilityIgnoresInvertColors
      />
      <Text style={styles.brandName}>SkillMatch</Text>
    </View>
  );
}

/** A titled group of related fields: tight inside, generous between groups. */
export function AuthSection({ title, children }: { title?: string; children: ReactNode }) {
  const styles = createStyles(useUiTheme());
  return (
    <View style={styles.section}>
      {title ? (
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

/** Text link for secondary navigation: 48dp target, accent colour, centred under the action. */
export function AuthLink({ style, ...props }: ComponentProps<typeof Link>) {
  const styles = createStyles(useUiTheme());
  return <Link {...props} style={[styles.link, style]} />;
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing, size } = ui;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    flex: { flex: 1 },
    viewport: { flex: 1, overflow: 'hidden' },
    content: {
      flexGrow: 1,
      paddingHorizontal: spacing.gutter,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xxl,
    },
    column: {
      width: '100%',
      maxWidth: 520,
      alignSelf: 'center',
      gap: spacing.xl,
    },
    brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    brandLogo: { width: 32, height: 32 },
    brandName: { ...type.sectionTitle, color: colors.accent },
    header: { gap: spacing.sm },
    title: { ...type.screenTitle, color: colors.textPrimary },
    description: { ...type.body, color: colors.textSecondary },
    section: { gap: spacing.lg },
    sectionTitle: { ...type.sectionTitle, color: colors.textPrimary },
    footer: { gap: spacing.md, alignItems: 'stretch' },
    sticky: {
      gap: spacing.md,
      paddingHorizontal: spacing.gutter,
      paddingTop: spacing.md,
      paddingBottom: spacing.md,
      backgroundColor: colors.canvas,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.hairline,
    },
    link: {
      ...type.button,
      minHeight: size.minTarget,
      textAlign: 'center',
      textAlignVertical: 'center',
      color: colors.accent,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
    },
  });
}
