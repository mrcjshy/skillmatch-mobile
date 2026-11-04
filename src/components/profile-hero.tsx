import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { type SymbolViewProps } from 'expo-symbols';

import { AppButton } from '@/components/app-button';
import { AppSymbol } from '@/components/app-symbol';
import { InitialsAvatar } from '@/components/initials-avatar';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import { SkillMatchMascot } from '@/components/skillmatch-mascot';

/** A fact about the account, shown as a pill under the role line. */
export type ProfileHeroBadge = {
  label: string;
  icon: SymbolViewProps['name'];
  /** A status (Verified): a white pill whose glyph and words take this colour. Omit for a glass pill. */
  statusColor?: string;
  /** What a screen reader says instead of the label, e.g. "Area: Santa Ana, Pateros". */
  accessibilityLabel?: string;
  selectable?: boolean;
};

/** One number in the stats row. `null` is not known (yet): a dash, read as "Not available". */
export type ProfileHeroStat = { label: string; value: string | null };

export type ProfileHeroAction = {
  label: string;
  icon: SymbolViewProps['name'];
  onPress: () => void;
  disabled?: boolean;
  /** Set when the action opens or closes something right below the card (Edit profile). */
  expanded?: boolean;
};

type ProfileHeroProps = {
  name: string;
  role: string;
  photoUri?: string | null;
  badges?: ProfileHeroBadge[];
  stats: ProfileHeroStat[];
  action?: ProfileHeroAction;
};

/**
 * The card's cobalt sheen. The middle stop sits at 85% so the brightest blue stays in the corner
 * behind the white action: small white words on the glass pills and tiles keep 4.5:1 everywhere
 * on the card (at a 60% stop the right-hand stat labels fell to about 3.7:1).
 */
export const PROFILE_HERO_SHEEN = 'linear-gradient(135deg, #1C3AA6 0%, #2F55D4 85%, #4C7BEA 100%)';
/** Narrowest a stat tile gets at 100% text (room for "0 of 3" at 20sp); it grows with the font scale. */
export const PROFILE_STAT_MIN_WIDTH = 76;
export const PROFILE_FOOTER = 'SkillMatch · Barangay Santa Ana, Pateros';

const HERO_RADIUS = 28;
const AVATAR_RING = 3;
const MASCOT_SIZE = 84;
const PILL_GLASS = 'rgba(255, 255, 255, 0.16)';
const TILE_GLASS = 'rgba(255, 255, 255, 0.14)';
const MASCOT_GLOW = 'rgba(255, 255, 255, 0.12)';

/**
 * The card that opens the Worker and Client Profile tabs: a ringed avatar, the name (the screen's
 * header), a role line, fact pills, two or three numbers and the tab's one main action, with Itik
 * waving from the top-right corner. Nothing truncates: long names and areas wrap, the pills wrap,
 * and the stat tiles reserve room for their value at the current text size, so at large text they
 * wrap onto a second row instead of squeezing.
 */
export function ProfileHero({ name, role, photoUri = null, badges = [], stats, action }: ProfileHeroProps) {
  const ui = useUiTheme();
  const { colors, size } = ui;
  const styles = createStyles(ui);
  const { fontScale } = useWindowDimensions();
  const statMinWidth = Math.ceil(PROFILE_STAT_MIN_WIDTH * Math.max(1, fontScale));
  return (
    <View style={styles.card}>
      {/* Decorative: the mascot plays only its own bounded wave, is never touchable and is hidden from screen readers. */}
      <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.mascot}>
        <View style={styles.mascotGlow} />
        <SkillMatchMascot expression="hello" size={MASCOT_SIZE} />
      </View>
      <View style={styles.avatarRing}>
        <InitialsAvatar name={name} accent={colors.accentSubtle} size={size.profileAvatar} photoUri={photoUri} />
      </View>
      <View style={styles.identity}>
        <Text selectable accessibilityRole="header" style={styles.name}>{name}</Text>
        <Text style={styles.role}>{role}</Text>
      </View>
      {badges.length > 0 ? (
        <View style={styles.badges}>
          {badges.map((badge) => (
            <View
              key={badge.label}
              accessible
              accessibilityRole="text"
              accessibilityLabel={badge.accessibilityLabel ?? badge.label}
              style={[styles.badge, badge.statusColor ? styles.badgeStatus : styles.badgeGlass]}
            >
              <AppSymbol name={badge.icon} size={16} tintColor={badge.statusColor ?? colors.onAccent} />
              <Text selectable={badge.selectable} style={[styles.badgeText, badge.statusColor ? { color: badge.statusColor } : null]}>{badge.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.stats}>
        {stats.map((stat) => (
          <View
            key={stat.label}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`${stat.label}: ${stat.value ?? 'Not available'}`}
            style={[styles.stat, { minWidth: statMinWidth }]}
          >
            <Text style={styles.statValue}>{stat.value ?? '—'}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>
      {action ? (
        <AppButton
          variant="inverse"
          label={action.label}
          icon={action.icon}
          onPress={action.onPress}
          disabled={action.disabled}
          expanded={action.expanded}
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

/** The quiet line that closes both Profile tabs. */
export function ProfileFooter() {
  const styles = createStyles(useUiTheme());
  return <Text style={styles.footer}>{PROFILE_FOOTER}</Text>;
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing, radius, size } = ui;
  const ringed = size.profileAvatar + AVATAR_RING * 2;
  const glow = MASCOT_SIZE + spacing.xxl;
  return StyleSheet.create({
    card: {
      borderRadius: HERO_RADIUS,
      borderCurve: 'continuous',
      padding: spacing.gutter,
      gap: spacing.md,
      overflow: 'hidden',
      backgroundColor: colors.accent,
      experimental_backgroundImage: PROFILE_HERO_SHEEN,
    },
    mascot: { position: 'absolute', top: spacing.sm, right: -spacing.sm, width: MASCOT_SIZE, height: MASCOT_SIZE },
    mascotGlow: { position: 'absolute', top: -spacing.lg, left: -spacing.lg, width: glow, height: glow, borderRadius: glow / 2, backgroundColor: MASCOT_GLOW },
    avatarRing: { alignSelf: 'flex-start', padding: AVATAR_RING, borderRadius: ringed / 2, backgroundColor: colors.onAccent },
    identity: { gap: spacing.xxs },
    name: { ...type.screenTitle, fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -0.3, color: colors.onAccent },
    role: { ...type.bodyEmphasis, color: colors.onAccentSecondary },
    badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      maxWidth: '100%',
      minHeight: 32,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
    },
    badgeGlass: { backgroundColor: PILL_GLASS },
    badgeStatus: { backgroundColor: colors.onAccent },
    badgeText: { ...type.badge, color: colors.onAccent, flexShrink: 1 },
    stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    stat: {
      flexGrow: 1,
      flexBasis: 0,
      gap: spacing.xxs,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      borderRadius: radius.card,
      borderCurve: 'continuous',
      backgroundColor: TILE_GLASS,
    },
    statValue: { ...type.numeric, fontSize: 20, lineHeight: 26, fontWeight: '800', color: colors.onAccent },
    statLabel: { ...type.caption, color: colors.onAccent },
    action: { borderRadius: radius.pill, minHeight: size.minTarget, marginTop: spacing.xs },
    footer: { ...type.caption, color: colors.textMuted, textAlign: 'center' },
  });
}
