// @ts-expect-error -- Node-only static composition harness.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  ANDROID_CHANNEL_ID,
  ANDROID_NOTIFICATION_SOUND,
} from '@/lib/push-notifications';

/**
 * Iteration 06 Wave 7 — W7-C2/C3/C4 native configuration and chat-tap wiring. Static evidence only:
 * the native build and TesterArmy/device runs prove runtime receipt, sound and routing.
 */
const source = (path: string): string => readFileSync(path, 'utf8');
const appJson = JSON.parse(source('app.json')) as { expo: Record<string, any> };
const plugin = (name: string) =>
  (appJson.expo.plugins as unknown[]).find(
    (entry) => Array.isArray(entry) && entry[0] === name
  ) as [string, Record<string, any>] | undefined;

describe('W7 notification channel and Tugma sound (native config)', () => {
  const options = plugin('expo-notifications')?.[1] ?? {};

  it('makes the versioned channel the FCM default channel', () => {
    expect(options.defaultChannel).toBe(ANDROID_CHANNEL_ID);
    expect(options.defaultChannel).toBe('skillmatch_alerts_v1');
  });

  it('bundles exactly the Tugma WAV under the file name the channel uses', () => {
    expect(options.sounds).toEqual(['./assets/sounds/skillmatch_tugma.wav']);
    expect(options.sounds[0].endsWith('/' + ANDROID_NOTIFICATION_SOUND)).toBe(true);
    // Android res/raw names: lowercase letters, digits and underscores only.
    expect(ANDROID_NOTIFICATION_SOUND).toMatch(/^[a-z0-9_]+\.wav$/);
  });

  it('ships a real 44.1 kHz mono 16-bit PCM WAV of about one second', () => {
    const wav: Uint8Array = readFileSync('assets/sounds/skillmatch_tugma.wav');
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    const text = (at: number) => String.fromCharCode(...wav.slice(at, at + 4));
    expect(text(0)).toBe('RIFF');
    expect(text(8)).toBe('WAVE');
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint16(34, true)).toBe(16);
    const seconds = (wav.byteLength - 44) / (44100 * 2);
    expect(seconds).toBeGreaterThan(0.9);
    expect(seconds).toBeLessThan(1.1);
  });

  it('uses the Interlock S notification silhouette tinted Work Blue', () => {
    expect(options.icon).toBe('./assets/images/notification-icon.png');
    expect(existsSync('assets/images/notification-icon.png')).toBe(true);
    expect(options.color).toBe('#1C3AA6');
  });
});

describe('W7 branding slots keep the existing product palette', () => {
  it('keeps the warm canvas behind the adaptive icon and splash', () => {
    expect(appJson.expo.android.adaptiveIcon.backgroundColor).toBe('#F5F3EF');
    const splash = plugin('expo-splash-screen')?.[1] ?? {};
    expect(splash.backgroundColor).toBe('#F5F3EF');
    expect(splash.image).toBe('./assets/images/skillmatch-splash-icon.png');
  });

  it('keeps every referenced brand asset present', () => {
    for (const path of [
      appJson.expo.icon,
      appJson.expo.android.adaptiveIcon.foregroundImage,
      appJson.expo.android.adaptiveIcon.monochromeImage,
      appJson.expo.web.favicon,
      './assets/images/skillmatch-logo.png',
    ]) {
      expect(existsSync(path)).toBe(true);
    }
  });
});

describe('W7 chat tap re-authorizes before opening a chat', () => {
  const intent = source('src/components/push-notification-inbox-intent.tsx');

  it('reads only the role-owned Booking list and requires a confirmed Booking', () => {
    expect(intent).toContain("import { loadClientBookings, loadWorkerBookings } from '@/lib/booking-records';");
    expect(intent).toMatch(/booking\.booking_id === chatBookingId && booking\.booking_status === 'confirmed'/);
  });

  it('does not read a Booking before session and account readiness', () => {
    const gate = intent.indexOf("decidePendingInboxNavigation(readiness()).kind !== 'replace'");
    const read = intent.indexOf('await loadWorkerBookings()');
    expect(gate).toBeGreaterThan(-1);
    expect(read).toBeGreaterThan(gate);
  });

  it('a failed authorization read falls back to the inbox, never the chat', () => {
    expect(intent).toMatch(/let authorized = false;\s*try \{/);
    expect(intent).toContain('consumeReadyPushNavigation(readiness(), authorized)');
  });

  it('pushes only the chat, once the root dispatcher has left "/" (no racing replace)', () => {
    // Cold start (runtime M3): a replace(home) + push(chat) pair raced the root dispatcher's own
    // redirect and the chat push was lost. The dispatcher now forwards to Home; the intent waits for
    // that and pushes the chat on top, so Back still leaves the chat for Home.
    expect(intent).not.toContain("router.replace((access === 'worker' ? '/worker' : '/client') as Href);");
    expect(intent).toContain('router.push({ pathname: destination.pathname, params: { bookingId: destination.bookingId } } as Href);');
    const wait = intent.indexOf("if (pathname === '/') {");
    const read = intent.indexOf('await loadWorkerBookings()');
    expect(wait).toBeGreaterThan(-1);
    expect(read).toBeGreaterThan(wait);
  });
});

describe('W7 root dispatcher leaves chat taps to the intent', () => {
  const index = source('src/app/index.tsx');

  it('never redirects a pending chat tap to the inbox', () => {
    expect(index).toContain('getPendingChatBookingId');
    expect(index).toMatch(/inbox\.kind === 'replace' &&\s*getPendingChatBookingId\(\) === null/);
  });
});
