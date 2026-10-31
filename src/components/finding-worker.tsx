import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CardDivider, FactLine, IdentifierBlock, PaymentRow, SupportEntry } from '@/components/booking-card-parts';
import { SkillMatchTheme } from '@/constants/theme';

const { colors, type, spacing, radius } = SkillMatchTheme.ui;

// The animated card carousel lives in finding-worker-carousel.tsx (Reanimated + Compose).
export { SupportEntry };

/**
 * The open job's card, in the reference layout. Before acceptance there is no booking, so it shows the Job ID
 * (never a Booking ID), the posted schedule and the posted payment method and budget.
 */
export function FindingCard({ title, id, time, payment, amount, children }: {
  title: string; id: string; time: string; payment: { label: string; qr: boolean }; amount: string; children?: ReactNode;
}) {
  return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.title}>{title}</Text>
    <IdentifierBlock label="Job ID" value={id} />
    <FactLine label="Date & time" value={time} />
    {children}
    <CardDivider />
    <PaymentRow qr={payment.qr} method={payment.label} amount={amount} />
  </View>;
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.lg, padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline, borderCurve: 'continuous',
  },
  title: { ...type.sectionTitle, color: colors.textPrimary },
});
