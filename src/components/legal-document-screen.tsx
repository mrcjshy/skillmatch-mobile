import { Link, useRouter } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { SkillMatchTheme } from '@/constants/theme';
import { type LegalDocument } from '@/lib/legal-documents';

const { colors, type, spacing, size } = SkillMatchTheme.ui;

type LegalDocumentScreenProps = {
  document: LegalDocument;
};

export function LegalDocumentScreen({ document }: LegalDocumentScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const canGoBack = router.canGoBack();

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/login');
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + spacing.lg,
          paddingBottom: insets.bottom + spacing.xxl,
        },
      ]}
    >
      {canGoBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={handleBack}
          style={({ pressed }) => [styles.backHit, pressed ? styles.backPressed : null]}
        >
          <Text style={styles.backLabel}>Back</Text>
        </Pressable>
      ) : (
        <Link href="/login" style={styles.backLink} accessibilityLabel="Back">
          Back
        </Link>
      )}

      <View style={styles.brand}>
        <Image
          source={require('@/assets/images/skillmatch-logo.png')}
          style={styles.brandLogo}
          accessibilityIgnoresInvertColors
        />
        <Text style={styles.brandName}>SkillMatch</Text>
      </View>

      <Text style={styles.heading} accessibilityRole="header">
        {document.title}
      </Text>
      <Text style={styles.version}>Version {document.version}</Text>

      <View style={styles.body}>
        {document.paragraphs.map((paragraph) => (
          <Text key={paragraph} style={styles.paragraph}>
            {paragraph}
          </Text>
        ))}
      </View>

      <AppButton label="Back" variant="secondary" onPress={handleBack} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.gutter,
    gap: spacing.lg,
  },
  backHit: {
    alignSelf: 'flex-start',
    minHeight: size.ghostButton,
    justifyContent: 'center',
    paddingVertical: 12,
  },
  backPressed: {
    opacity: 0.72,
  },
  backLabel: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 20,
    color: colors.primary,
  },
  backLink: {
    alignSelf: 'flex-start',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 20,
    color: colors.primary,
    paddingVertical: 12,
  },
  brand: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  brandLogo: {
    width: 56,
    height: 56,
  },
  brandName: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  heading: {
    ...type.display,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  version: {
    ...type.helper,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  body: {
    gap: spacing.lg,
  },
  paragraph: {
    ...type.body,
    color: colors.textPrimary,
  },
});
