import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
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

type LegalLanguage = 'en' | 'fil';

const LANGUAGES: { value: LegalLanguage; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'fil', label: 'Filipino' },
];

/**
 * Reading layout for Terms and Privacy: one flat column at a comfortable measure, the document
 * title, an English / Filipino switch, then each section as a heading and a body. The wording is
 * rendered exactly as authored. Back stays a plain control at the top and again at the end.
 */
export function LegalDocumentScreen({ document }: LegalDocumentScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [language, setLanguage] = useState<LegalLanguage>('en');
  const shown = language === 'fil' ? document.filipino : document;
  const sections = toLegalSections(shown.paragraphs);

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
              {shown.title}
            </Text>
            <Text style={styles.version}>
              {language === 'fil' ? 'Bersyon' : 'Version'} {document.version} ·{' '}
              {language === 'fil' ? 'May bisa simula' : 'Effective'} {shown.effectiveDate}
            </Text>
          </View>

          <View style={styles.languages} accessibilityRole="radiogroup" accessibilityLabel="Language">
            {LANGUAGES.map((option) => {
              const selected = option.value === language;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityLabel={option.label}
                  accessibilityState={{ checked: selected }}
                  onPress={() => setLanguage(option.value)}
                  style={({ pressed }) => [
                    styles.language,
                    selected ? styles.languageSelected : null,
                    pressed && !selected ? styles.languagePressed : null,
                  ]}
                >
                  <Text style={[styles.languageLabel, selected ? styles.languageLabelSelected : null]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
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
  languages: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  language: {
    minHeight: size.ghostButton,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    backgroundColor: colors.surface,
  },
  languageSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSubtle,
  },
  languagePressed: {
    backgroundColor: colors.accentSubtle,
  },
  languageLabel: {
    ...type.button,
    color: colors.textSecondary,
  },
  languageLabelSelected: {
    color: colors.accent,
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
