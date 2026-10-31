import { useState } from 'react';
import { Clipboard, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIconButton } from '@/components/app-icon-button';
import { AppSymbol } from '@/components/app-symbol';
import { MotionView, usePressScale } from '@/components/motion';
import { SkillMatchTheme } from '@/constants/theme';

const { colors, type, spacing, radius } = SkillMatchTheme.ui;

/**
 * Rows of the reference booking card (UI-V2), shared by Booking details and the open-job "finding" state so the
 * two read as one system. Nothing truncates: long identifiers and large font scales wrap.
 */

/** Caption above a full, selectable identifier (Job ID before acceptance, Booking ID after). */
export function IdentifierBlock({ label, value, copyable = false }: { label: string; value: string; copyable?: boolean }) {
  return <View style={styles.idBlock}>
    <Text style={styles.caption}>{label}</Text>
    <View style={styles.idRow}>
      <Text selectable style={styles.idValue}>{value}</Text>
      {copyable ? <CopyIdentifier key={value} label={label} value={value} /> : null}
    </View>
  </View>;
}

function CopyIdentifier({ label, value }: { label: string; value: string }) {
  const [result, setResult] = useState<'copied' | 'failed' | null>(null);
  const copy = () => {
    try {
      Clipboard.setString(value);
      setResult('copied');
    } catch {
      setResult('failed');
    }
  };
  return <View style={styles.copyAction}>
    <AppIconButton icon={result === 'copied' ? { android: 'check', ios: 'checkmark' } : { android: 'content_copy', ios: 'doc.on.doc' }}
      accessibilityLabel={`Copy ${label}`} variant="tonal" onPress={copy} />
    {result ? <Text accessibilityLiveRegion="polite" style={styles.caption}>
      {result === 'copied' ? 'Copied' : 'Touch and hold the ID to copy'}
    </Text> : null}
  </View>;
}

/** Label and value on one line; at large font scales the value wraps onto its own line instead of squeezing. */
export function FactLine({ label, value }: { label: string; value: string }) {
  return <View style={styles.fact}>
    <Text style={styles.factLabel}>{label}</Text>
    <Text style={styles.factValue}>{value}</Text>
  </View>;
}

/** Method (bold) with whose payment it is, and the amount once, at the right. */
export function PaymentRow({ qr, method, amount }: { qr: boolean; method: string; amount: string }) {
  return <View style={styles.payment}>
    <View style={styles.payIcon}>
      <AppSymbol name={qr ? { android: 'qr_code_2', ios: 'qrcode' } : { android: 'payments', ios: 'banknote' }} size={22} tintColor={colors.accent} />
    </View>
    <Text style={[styles.payMethod, styles.payCopy]}>{method}</Text>
    <Text style={styles.amount}>{amount}</Text>
  </View>;
}

export function CardDivider() {
  return <View style={styles.divider} />;
}

/**
 * "Service information support": the existing FAQ chatbot, entered from the support area. Press feedback is
 * the app's own scale-on-hold (`usePressScale`), the same restrained spring-press idea as react-native-motion's
 * Button; it never delays the navigation.
 */
export function SupportEntry({ onPress }: { onPress: () => void }) {
  const press = usePressScale(0.98);
  return <MotionView style={press.style}>
    <Pressable accessibilityRole="button" accessibilityLabel="Chat and FAQs. Opens the help assistant"
      onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut}
      style={({ pressed }) => [styles.support, pressed && styles.supportPressed]}>
      <View style={styles.payIcon}>
        <AppSymbol name={{ android: 'support_agent', ios: 'questionmark.bubble' }} size={22} tintColor={colors.accent} />
      </View>
      <View style={styles.payCopy}>
        <Text style={styles.supportLabel}>Chat and FAQs</Text>
      </View>
      <AppSymbol name={{ android: 'chevron_right', ios: 'chevron.right' }} size={22} tintColor={colors.textSecondary} />
    </Pressable>
  </MotionView>;
}

const styles = StyleSheet.create({
  idBlock: { gap: spacing.xxs },
  idRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  copyAction: { alignItems: 'center', flexShrink: 0, maxWidth: 100 },
  caption: { ...type.helper, color: colors.textSecondary },
  idValue: { ...type.helper, fontVariant: ['tabular-nums'], color: colors.textPrimary, flex: 1, minWidth: 0 },
  fact: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', columnGap: spacing.md, rowGap: spacing.xxs },
  factLabel: { ...type.helper, color: colors.textSecondary },
  factValue: { ...type.bodyEmphasis, color: colors.textPrimary, flexGrow: 1, textAlign: 'right' },
  payment: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  payIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accentSubtle, alignItems: 'center', justifyContent: 'center' },
  payCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  payMethod: { ...type.bodyEmphasis, color: colors.textPrimary },
  amount: { ...type.money, color: colors.textPrimary },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline, marginHorizontal: -spacing.lg },
  support: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 72, paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.controlBorder, borderCurve: 'continuous',
  },
  supportPressed: { backgroundColor: colors.accentSubtle },
  supportLabel: { ...type.bodyEmphasis, color: colors.textPrimary },
});
