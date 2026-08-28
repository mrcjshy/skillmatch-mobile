import { StyleSheet, Text, View } from 'react-native';

export default function WorkerHome() {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Worker Placeholder</Text>
      <Text style={styles.note}>Worker features are not implemented in N1B.</Text>
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
