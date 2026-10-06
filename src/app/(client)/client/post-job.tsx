import { Stack } from 'expo-router';
import { ClientPostJobScreen } from '@/components/client-post-job-screen';

export default function PostJobRoute() {
  return <><Stack.Screen options={{ title: 'Post Job' }} /><ClientPostJobScreen /></>;
}
