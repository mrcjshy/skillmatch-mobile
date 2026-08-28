import { StyleSheet, Text, View } from 'react-native';

export default function BlockedScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Access Blocked</Text>
      <Text style={styles.note}>
        This screen is reserved for accounts whose authoritative state disallows
        access. Determining who is blocked is implemented in a later piece.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  heading: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  note: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.7,
  },
});
