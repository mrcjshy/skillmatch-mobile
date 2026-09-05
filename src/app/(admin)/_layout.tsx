import { Stack } from 'expo-router';

// The admin group currently holds a single screen, `admin/index`, which sets no
// title and so renders its raw route name. There is no sub-screen depending on
// the header for a title or a back button, so hiding it group-wide is safe.
export default function AdminLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
