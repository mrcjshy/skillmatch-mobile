import { useCallback, useState } from 'react';
import type { ViewStyle } from 'react-native';

import { TAB_BAR_OVERLAP } from '@/components/client-tab-bar';

/**
 * Wires a tab layout to the overlay bar: pass `onHeight` to the bar and merge `sceneStyle` into the
 * screen options. Scenes then run under the bar by TAB_BAR_OVERLAP and no further, so content
 * scrolls beneath the fade and the top of the translucent pill while the last row stays reachable.
 */
export function useFloatingTabBar(): { onHeight: (height: number) => void; sceneStyle: ViewStyle } {
  const [height, setHeight] = useState(0);
  const onHeight = useCallback((next: number) => {
    setHeight((current) => (Math.abs(next - current) >= 1 ? next : current));
  }, []);
  return { onHeight, sceneStyle: { paddingBottom: Math.max(0, Math.round(height) - TAB_BAR_OVERLAP) } };
}
