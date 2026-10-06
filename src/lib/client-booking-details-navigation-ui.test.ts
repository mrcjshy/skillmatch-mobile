// @ts-expect-error -- Vitest runs in Node; the Expo app tsconfig omits Node declarations.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- Vitest runs in Node; the Expo app tsconfig omits Node declarations.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(resolve(path), 'utf8');

describe('Client Booking Details navigation UI', () => {
  it('renders no permanent footer navigation to Client Home', () => {
    const details = readSource('src/components/booking-details.tsx');

    expect(details).not.toContain('label="← Home"');
    expect(details).not.toContain('accessibilityLabel="Back to Client Home"');
  });

  it('keeps ordinary Booking Details on the normal Stack header and push history', () => {
    const route = readSource('src/app/(client)/client/booking-details.tsx');
    const bookings = readSource('src/components/my-bookings-list.tsx');

    expect(route).toContain("<Stack.Screen options={{ title: 'Booking details' }} />");
    expect(route).not.toMatch(/headerShown\s*:\s*false|headerLeft/);
    expect(bookings).toMatch(
      /router\.push\(\{\s*pathname,\s*params:\s*\{\s*bookingId:\s*booking\.booking_id\s*\}/,
    );
  });

  it('preserves Client Home in history for the automatic acceptance transition', () => {
    const home = readSource('src/app/(client)/(tabs)/client/index.tsx');
    const handoffNavigation = home.match(
      /onNavigate:\s*\(bookingId\)\s*=>\s*\{\s*if \(isOwnerCurrent\(\)\) router\.(push|replace)\(\{\s*pathname:\s*'\/client\/booking-details',\s*params:\s*\{\s*bookingId\s*\}/,
    );

    expect(handoffNavigation?.[1]).toBe('push');
  });
});

describe('retained parent and secondary navigation boundaries', () => {
  it.each(['client', 'worker'])('%s keeps parent role protection and secondary screen overrides', (role) => {
    const root = readSource('src/app/_layout.tsx');
    expect(root).toContain('<Stack screenOptions={{ headerShown: false }}>');
    expect(root).toContain(`<Stack.Protected guard={access === '${role}'}>`);
    expect(root).toContain('<SessionProvider>');
    expect(root).toContain('<AccountProvider>');
    const layout = readSource(`src/app/(${role})/_layout.tsx`);
    expect(layout).not.toMatch(/headerLeft|router\.(push|replace)|useFocusEffect|subscribe/);
    for (const [screen, title] of [['notifications', 'Notifications'], ['chat', 'Booking chat'], ['booking-details', 'Booking details']]) {
      const wrapper = readSource(`src/app/(${role})/${role}/${screen}.tsx`);
      expect(wrapper).toContain(`title: '${title}'`);
      expect(wrapper).not.toMatch(/headerLeft|headerShown\s*:\s*false/);
    }
    for (const screen of ['terms', 'privacy']) expect(readSource(`src/app/(${role})/${role}/${screen}.tsx`)).toContain('options={{ headerShown: false }}');
    expect(readSource('src/app/(auth)/_layout.tsx')).toContain('headerShown: false');
  });
});
