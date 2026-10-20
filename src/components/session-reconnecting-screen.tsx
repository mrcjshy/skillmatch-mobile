import { useState } from 'react';

import { AppButton } from '@/components/app-button';
import { StateScreen } from '@/components/state-screen';
import { AUTH_UNAVAILABLE_COPY } from '@/lib/auth-errors';

/**
 * Auth could not be reached while restoring a stored session. The session is kept and is
 * picked up automatically once Auth answers; Try again re-checks now. No route tree renders
 * behind this, so nothing protected is reachable while the session is unconfirmed.
 */
export function SessionReconnectingScreen({ onRetry }: { onRetry?: () => Promise<void> }) {
  const [isRetrying, setIsRetrying] = useState(false);

  async function retry() {
    if (isRetrying || !onRetry) return;
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  }

  return (
    <StateScreen
      tone="warning"
      icon={{ android: 'cloud_off', ios: 'icloud.slash' }}
      title="Unable to connect"
      message={AUTH_UNAVAILABLE_COPY}
    >
      <AppButton label="Try again" onPress={retry} loading={isRetrying} disabled={isRetrying} />
    </StateScreen>
  );
}
