import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppSymbol } from '@/components/app-symbol';
import { SkillMatchTheme } from '@/constants/theme';
import { type LegalDocument } from '@/lib/legal-documents';
import { toLegalSections } from '@/lib/legal-document-sections';

const { colors, type, spacing, radius, size } = SkillMatchTheme.ui;

type LegalDocumentScreenProps = {
  document: LegalDocument;
};

/**
 * Reading layout for Terms and Privacy: one flat column at a comfortable measure, the document
 * title, then each section as a heading and a body. The wording is rendered exactly as authored.
 * Back stays a plain control at the top and again at the end of a long document.
 */
export function LegalDocumentScreen({ document }: LegalDocumentScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const sections = toLegalSections(document.paragraphs);

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/login');
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + spacing.headerTop,
            paddingBottom: insets.bottom + spacing.xxl,
          },
        ]}
      >
        <View style={styles.column}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={handleBack}
            style={({ pressed }) => [styles.backHit, pressed ? styles.backPressed : null]}
          >
            <AppSymbol
              synchronousGlyph
              pointerEvents="none"
              accessible={false}
              name={{ android: 'arrow_back', ios: 'chevron.left' }}
              size={20}
              tintColor={colors.accent}
            />
            <Text style={styles.backLabel}>Back</Text>
          </Pressable>

          <View style={styles.header}>
            <Text style={styles.heading} accessibilityRole="header">
              {document.title}
            </Text>
            <Text style={styles.version}>Version {document.version}</Text>
          </View>

          <View style={styles.body}>
            {sections.map((section, index) => (
              <View key={`${index}-${section.heading ?? 'continued'}`} style={styles.section}>
                {section.heading ? (
                  <Text style={styles.sectionHeading} accessibilityRole="header">
                    {section.heading}
                  </Text>
                ) : null}
                <Text style={styles.paragraph}>{section.body}</Text>
              </View>
            ))}
          </View>

          <AppButton label="Back" variant="secondary" onPress={handleBack} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.gutter,
  },
  column: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    gap: spacing.xl,
  },
  backHit: {
    marginHorizontal: spacing.headerGutter - spacing.gutter,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: size.ghostButton,
    paddingRight: spacing.md,
  },
  backPressed: {
    backgroundColor: colors.accentSubtle,
    borderRadius: radius.control,
  },
  backLabel: {
    ...type.button,
    color: colors.accent,
  },
  header: {
    paddingHorizontal: spacing.headerGutter - spacing.gutter,
    gap: spacing.headerGap,
  },
  heading: {
    ...type.screenTitle,
    color: colors.textPrimary,
  },
  version: {
    ...type.helper,
    color: colors.textSecondary,
  },
  body: {
    gap: spacing.xl,
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeading: {
    ...type.sectionTitle,
    color: colors.textPrimary,
  },
  paragraph: {
    ...type.body,
    color: colors.textPrimary,
  },
});
