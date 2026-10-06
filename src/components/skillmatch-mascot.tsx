import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

/**
 * The SkillMatch mascot (M6): static, decorative artwork next to text that already says the same
 * thing, so it is kept out of the accessibility tree and carries no name. Approved placements only
 * (see mascot.test.ts). It never moves: the screen's own motion, such as the success check, stays
 * the feedback.
 */
const POSES = {
  empty: require('@/assets/images/mascot/mascot-empty.svg'),
  success: require('@/assets/images/mascot/mascot-success.svg'),
} as const;

/** The full figure's approved minimum: the 260 x 200 artboard drawn 64 dp tall. */
export const MASCOT_HEIGHT = 64;
const MASCOT_WIDTH = (MASCOT_HEIGHT * 260) / 200;

export function SkillMatchMascot({ pose }: { pose: keyof typeof POSES }) {
  return (
    <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Image source={POSES[pose]} style={styles.art} contentFit="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  art: { width: MASCOT_WIDTH, height: MASCOT_HEIGHT },
});
