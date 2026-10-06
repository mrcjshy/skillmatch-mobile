import { Link, Redirect } from 'expo-router';

import { AppButton } from '@/components/app-button';
import { StateScreen } from '@/components/state-screen';
import { useSession } from '@/providers/session-provider';

export default function NotFoundScreen() {
  const { session } = useSession();

  // Authenticated unknown/unauthorized route → canonical index dispatcher,
  // which forwards to this account's own route. No role logic here.
  if (session) {
    return <Redirect href="/" />;
  }

  return (
    <StateScreen
      icon={{ android: 'link_off', ios: 'link.badge.plus' }}
      title="Page not found"
      message="This page does not exist or may have moved."
    >
      <Link href="/" asChild>
        <AppButton label="Go to home" />
      </Link>
    </StateScreen>
  );
}
