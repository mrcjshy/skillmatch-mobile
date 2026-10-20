import { Redirect } from 'expo-router';

/**
 * Obsolete Worker links return to maintenance, never to a Client booking viewer.
 */
export default function WorkerResume() {
  return <Redirect href="/worker/profile" />;
}
