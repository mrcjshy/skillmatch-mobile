import { Link, Redirect } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/providers/session-provider';

export default function NotFoundScreen() {
  const { session } = useSession();

  // Authenticated unknown/unauthorized route → canonical index dispatcher,
  // which forwards to this account's own route. No role logic here.
  if (session) {
    return <Redirect href="/" />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Page Not Found</Text>
      <Link href="/" style={styles.link}>
        Go to home
      </Link>
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
  link: {
    fontSize: 18,
    color: '#1d4ed8',
    padding: 4,
  },
});
