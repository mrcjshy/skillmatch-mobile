import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ANDROID_CHANNEL_ID,
  ANDROID_CHANNEL_NAME,
  ADMIN_NOTIFICATIONS_HREF,
  ADMIN_REPORTS_HREF,
  CLIENT_NOTIFICATIONS_HREF,
  WORKER_NOTIFICATIONS_HREF,
  acquireExpoPushToken,
  configureForegroundHandler,
  ensureAndroidNotificationChannel,
  extractTapData,
  getPendingNotificationId,
  inboxHrefForRole,
  inspectPermission,
  isAndroidChannelReady,
  isForegroundHandlerConfigured,
  isPushRegistrationRole,
  notificationActivationHref,
  parsePushTapData,
  registerCurrentPushDevice,
  registerExpoPushToken,
  requestPermissionIfUndetermined,
  resetPushClientState,
  resolveEasProjectId,
  resolveTapInboxHref,
  captureNotificationResponse,
  clearPendingNotificationsInboxIntent,
  consumeReadyInboxNavigation,
  decidePendingInboxNavigation,
  hasPendingNotificationsInboxIntent,
  isSkillMatchNotificationResponse,
  OPEN_NOTIFICATIONS_INBOX,
  type NotificationsLike,
  type PendingInboxNavInput,
  type ProjectIdSource,
} from './push-notifications';

const PROJECT_ID = 'fd7953f8-210a-492a-a8e1-9fd842246159';
const EXPO_TOKEN = 'ExponentPushToken[test-token]';

function fakeNotifications(initialStatus = 'granted'): NotificationsLike & {
  permissionCalls: { get: number; request: number };
  tokensRequested: { projectId: string }[];
  channels: { id: string; name: string }[];
  handlers: number;
} {
  let status = initialStatus;
  const permissionCalls = { get: 0, request: 0 };
  const tokensRequested: { projectId: string }[] = [];
  const channels: { id: string; name: string }[] = [];
  let handlers = 0;

  return {
    permissionCalls,
    tokensRequested,
    channels,
    get handlers() {
      return handlers;
    },
    AndroidImportance: { DEFAULT: 5, HIGH: 6 },
    async setNotificationChannelAsync(id, channel) {
      channels.push({ id, name: channel.name });
      return { id };
    },
    async getPermissionsAsync() {
      permissionCalls.get += 1;
      return { status };
    },
    async requestPermissionsAsync() {
      permissionCalls.request += 1;
      status = 'granted';
      return { status };
    },
    async getExpoPushTokenAsync(options) {
      tokensRequested.push(options);
      return { data: EXPO_TOKEN };
    },
    setNotificationHandler() {
      handlers += 1;
    },
    async getLastNotificationResponseAsync() {
      return null;
    },
    addNotificationResponseReceivedListener() {
      return { remove() {} };
    },
  };
}

function constantsWithProject(projectId?: string): ProjectIdSource {
  return {
    expoConfig: { extra: { eas: projectId === undefined ? {} : { projectId } } },
    easConfig: projectId ? { projectId } : null,
  };
}

function tapResponse(data: unknown) {
  return { notification: { request: { content: { data } } } };
}

describe('push-notifications', () => {
  beforeEach(() => {
    resetPushClientState();
  });

  it('does not request permission again when already granted', async () => {
    const notifications = fakeNotifications('granted');
    await expect(requestPermissionIfUndetermined(notifications)).resolves.toBe('granted');
    expect(notifications.permissionCalls.get).toBe(1);
    expect(notifications.permissionCalls.request).toBe(0);
  });

  it('requests permission when undetermined', async () => {
    const notifications = fakeNotifications('undetermined');
    await expect(requestPermissionIfUndetermined(notifications)).resolves.toBe('granted');
    expect(notifications.permissionCalls.request).toBe(1);
  });

  it('does not acquire a token or register when permission is denied', async () => {
    const notifications = fakeNotifications('denied');
    const rpc = vi.fn();
    const result = await registerCurrentPushDevice({
      platform: 'android',
      isExpoGo: false,
      notifications,
      constants: constantsWithProject(PROJECT_ID),
      rpc,
    });
    expect(result).toEqual({ ok: false, code: 'permission_denied' });
    expect(notifications.tokensRequested).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('fails safely when the EAS project id cannot be resolved', async () => {
    const notifications = fakeNotifications('granted');
    const rpc = vi.fn();
    const result = await registerCurrentPushDevice({
      platform: 'android',
      isExpoGo: false,
      notifications,
      constants: constantsWithProject(),
      rpc,
    });
    expect(result).toEqual({ ok: false, code: 'missing_project_id' });
    expect(notifications.tokensRequested).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('registers the Expo token through register_my_push_device when granted', async () => {
    const notifications = fakeNotifications('granted');
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const result = await registerCurrentPushDevice({
      platform: 'android',
      isExpoGo: false,
      notifications,
      constants: constantsWithProject(PROJECT_ID),
      rpc,
    });
    expect(result).toEqual({ ok: true, tokenPresent: true });
    expect(rpc).toHaveBeenCalledWith('register_my_push_device', {
      p_expo_push_token: EXPO_TOKEN,
    });
  });

  it('sends only the Expo push token, never a raw FCM token', async () => {
    const notifications = fakeNotifications('granted');
    notifications.getExpoPushTokenAsync = async (options) => {
      notifications.tokensRequested.push(options);
      return { data: EXPO_TOKEN };
    };
    const rpc = vi.fn().mockResolvedValue({ error: null });
    await registerCurrentPushDevice({
      platform: 'android',
      isExpoGo: false,
      notifications,
      constants: constantsWithProject(PROJECT_ID),
      rpc,
    });
    expect(notifications.tokensRequested).toEqual([{ projectId: PROJECT_ID }]);
    expect(rpc.mock.calls[0]?.[1]).toEqual({ p_expo_push_token: EXPO_TOKEN });
    expect(JSON.stringify(rpc.mock.calls)).not.toMatch(/fcm/i);
  });

  it('swallows registration failure so bootstrap can continue', async () => {
    const notifications = fakeNotifications('granted');
    const rpc = vi.fn().mockRejectedValue(new Error('network'));
    await expect(
      registerCurrentPushDevice({
        platform: 'android',
        isExpoGo: false,
        notifications,
        constants: constantsWithProject(PROJECT_ID),
        rpc,
      })
    ).resolves.toEqual({ ok: false, code: 'register_failed' });
  });

  it('allows repeated registration of the same Expo token', async () => {
    const notifications = fakeNotifications('granted');
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const deps = {
      platform: 'android',
      isExpoGo: false,
      notifications,
      constants: constantsWithProject(PROJECT_ID),
      rpc,
    };
    await expect(registerCurrentPushDevice(deps)).resolves.toEqual({
      ok: true,
      tokenPresent: true,
    });
    await expect(registerCurrentPushDevice(deps)).resolves.toEqual({
      ok: true,
      tokenPresent: true,
    });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(2, 'register_my_push_device', {
      p_expo_push_token: EXPO_TOKEN,
    });
  });

  it('routes a Worker tap to the existing Worker inbox', () => {
    expect(inboxHrefForRole('worker')).toBe(WORKER_NOTIFICATIONS_HREF);
    expect(
      resolveTapInboxHref('worker', parsePushTapData({ notification_id: '11111111-1111-4111-8111-111111111111' }))
    ).toBe('/worker/notifications');
  });

  it('routes a Client tap to the existing Client inbox', () => {
    expect(inboxHrefForRole('client')).toBe(CLIENT_NOTIFICATIONS_HREF);
    expect(resolveTapInboxHref('client', null)).toBe('/client/notifications');
  });

  it('keeps Worker, Client, and Admin eligible for the shared push registration path', () => {
    expect(isPushRegistrationRole('worker')).toBe(true);
    expect(isPushRegistrationRole('client')).toBe(true);
    expect(isPushRegistrationRole('administrator')).toBe(true);
    expect(isPushRegistrationRole('admin')).toBe(false);
    expect(isPushRegistrationRole(null)).toBe(false);
  });

  it('routes a trusted Admin report notification to the report list only', () => {
    expect(notificationActivationHref('administrator', 'report_submitted')).toBe(
      ADMIN_REPORTS_HREF
    );
    expect(notificationActivationHref('administrator', 'report_submitted')).toBe(
      '/admin/reports'
    );
    expect(notificationActivationHref('administrator', 'report_submitted')).not.toBe(
      '/admin/report-details'
    );
    expect(notificationActivationHref('administrator', 'unknown')).toBe(
      ADMIN_NOTIFICATIONS_HREF
    );
  });

  it('preserves Worker and Client destinations regardless of notification type', () => {
    expect(notificationActivationHref('worker', 'report_submitted')).toBe(
      WORKER_NOTIFICATIONS_HREF
    );
    expect(notificationActivationHref('client', 'report_submitted')).toBe(
      CLIENT_NOTIFICATIONS_HREF
    );
  });

  it('does not let an inappropriate role or type fabricate an Admin destination', () => {
    expect(notificationActivationHref('worker', '/admin/reports')).toBe(
      WORKER_NOTIFICATIONS_HREF
    );
    expect(notificationActivationHref('client', 'report_submitted')).not.toMatch(/^\/admin\//);
    expect(notificationActivationHref('administrator', '/admin/report-details')).toBe(
      ADMIN_NOTIFICATIONS_HREF
    );
    expect(notificationActivationHref('unexpected', 'report_submitted')).toBeNull();
  });

  it('does not bypass role guards for unresolved or unauthenticated taps', () => {
    expect(inboxHrefForRole(null)).toBeNull();
    expect(inboxHrefForRole('unexpected')).toBeNull();
    expect(resolveTapInboxHref(undefined, parsePushTapData({ notification_id: '11111111-1111-4111-8111-111111111111' }))).toBeNull();
  });

  it('does not treat push notification_id as business authority', () => {
    const hint = parsePushTapData({
      notification_id: '22222222-2222-4222-8222-222222222222',
      booking_id: 'should-be-ignored',
      role: 'administrator',
    });
    expect(hint).toEqual({ notificationId: '22222222-2222-4222-8222-222222222222' });
    expect(resolveTapInboxHref('worker', hint)).toBe('/worker/notifications');
    expect(extractTapData(tapResponse({ booking_id: 'abc' }))).toEqual({ booking_id: 'abc' });
    expect(parsePushTapData({ booking_id: 'abc' })).toBeNull();
  });

  it('configures a presentation-only foreground handler', async () => {
    const captured: {
      handleNotification: () => Promise<Record<string, boolean>>;
    }[] = [];
    const notifications = fakeNotifications('granted');
    notifications.setNotificationHandler = (next) => {
      captured.push(next);
    };
    configureForegroundHandler(notifications);
    configureForegroundHandler(notifications);
    expect(isForegroundHandlerConfigured()).toBe(true);
    expect(captured).toHaveLength(1);
    await expect(captured[0]?.handleNotification()).resolves.toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });
  });

  it('sets the Android notification channel once for the same process', async () => {
    const notifications = fakeNotifications('granted');
    await ensureAndroidNotificationChannel(notifications, 'android');
    await ensureAndroidNotificationChannel(notifications, 'android');
    expect(isAndroidChannelReady()).toBe(true);
    expect(notifications.channels).toEqual([
      { id: ANDROID_CHANNEL_ID, name: ANDROID_CHANNEL_NAME },
    ]);
  });

  it('does not expose or wrap the R5 realtime helper', async () => {
    const push = await import('./push-notifications');
    expect(push).not.toHaveProperty('subscribeInvalidation');
    expect(push).not.toHaveProperty('NOTIFICATION_INSERTED');
    expect(push).not.toHaveProperty('userNotificationsTopic');
  });

  it('inspects permission without requesting it', async () => {
    const notifications = fakeNotifications('denied');
    await expect(inspectPermission(notifications)).resolves.toBe('denied');
    expect(notifications.permissionCalls.request).toBe(0);
  });

  it('resolves the existing EAS project id from runtime config', () => {
    expect(resolveEasProjectId(constantsWithProject(PROJECT_ID))).toBe(PROJECT_ID);
    expect(resolveEasProjectId({ expoConfig: null, easConfig: null })).toBeNull();
  });

  it('returns the Expo token string from getExpoPushTokenAsync', async () => {
    const notifications = fakeNotifications('granted');
    await expect(acquireExpoPushToken(notifications, PROJECT_ID)).resolves.toBe(EXPO_TOKEN);
  });

  it('registers a rotated Expo token through the same RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    await registerExpoPushToken(rpc, 'ExponentPushToken[one]');
    await registerExpoPushToken(rpc, 'ExponentPushToken[two]');
    expect(rpc).toHaveBeenNthCalledWith(2, 'register_my_push_device', {
      p_expo_push_token: 'ExponentPushToken[two]',
    });
  });
});

describe('pending OPEN_NOTIFICATIONS_INBOX intent', () => {
  const payload = {
    notification_id: '33333333-3333-4333-8333-333333333333',
    role: 'administrator',
    booking_id: 'booking-should-not-route',
    payment_id: 'payment-should-not-route',
  };

  function readyClient(overrides: Partial<PendingInboxNavInput> = {}): PendingInboxNavInput {
    return {
      hasPendingInboxIntent: true,
      isSessionLoading: false,
      hasSession: true,
      accountStatus: 'resolved',
      role: 'client',
      isActive: true,
      ...overrides,
    };
  }

  function readyWorker(overrides: Partial<PendingInboxNavInput> = {}): PendingInboxNavInput {
    return { ...readyClient(overrides), role: 'worker' };
  }

  function readyAdmin(overrides: Partial<PendingInboxNavInput> = {}): PendingInboxNavInput {
    return {
      ...readyClient(),
      role: 'administrator',
      isNotificationTypeResolved: true,
      notificationType: 'report_submitted',
      ...overrides,
    };
  }

  beforeEach(() => {
    resetPushClientState();
  });

  it('does not navigate while a cold response exists before role bootstrap', () => {
    expect(captureNotificationResponse(tapResponse(payload))).toBe(true);
    expect(hasPendingNotificationsInboxIntent()).toBe(true);
    expect(OPEN_NOTIFICATIONS_INBOX).toBe('OPEN_NOTIFICATIONS_INBOX');
    expect(
      decidePendingInboxNavigation(
        readyClient({ isSessionLoading: true, hasSession: false, accountStatus: 'idle', role: undefined })
      )
    ).toEqual({ kind: 'wait' });
    expect(consumeReadyInboxNavigation(readyClient({ accountStatus: 'pending' }))).toBeNull();
    expect(hasPendingNotificationsInboxIntent()).toBe(true);
  });

  it('replaces to the Client inbox exactly once after Client bootstrap', () => {
    captureNotificationResponse(tapResponse(payload));
    expect(consumeReadyInboxNavigation(readyClient())).toBe('/client/notifications');
    expect(hasPendingNotificationsInboxIntent()).toBe(false);
    expect(consumeReadyInboxNavigation(readyClient())).toBeNull();
  });

  it('replaces to the Worker inbox exactly once after Worker bootstrap', () => {
    captureNotificationResponse(tapResponse(payload));
    expect(consumeReadyInboxNavigation(readyWorker())).toBe('/worker/notifications');
    expect(consumeReadyInboxNavigation(readyWorker())).toBeNull();
  });

  it('waits for the owned notification row before routing an Admin push tap', () => {
    captureNotificationResponse(tapResponse(payload));
    expect(
      decidePendingInboxNavigation(
        readyAdmin({ isNotificationTypeResolved: false, notificationType: undefined })
      )
    ).toEqual({ kind: 'wait' });
    expect(
      consumeReadyInboxNavigation(
        readyAdmin({ isNotificationTypeResolved: false, notificationType: undefined })
      )
    ).toBeNull();
    expect(hasPendingNotificationsInboxIntent()).toBe(true);
    expect(consumeReadyInboxNavigation(readyAdmin())).toBe('/admin/reports');
    expect(hasPendingNotificationsInboxIntent()).toBe(false);
  });

  it('falls back to the protected Admin inbox for a non-report trusted type', () => {
    captureNotificationResponse(tapResponse(payload));
    expect(
      consumeReadyInboxNavigation(readyAdmin({ notificationType: 'worker_verified' }))
    ).toBe('/admin/notifications');
  });

  it('does not enter a protected inbox when there is no session', () => {
    captureNotificationResponse(tapResponse(payload));
    expect(
      decidePendingInboxNavigation(
        readyClient({ hasSession: false, accountStatus: 'idle', role: undefined, isActive: null })
      )
    ).toEqual({ kind: 'wait' });
    expect(
      consumeReadyInboxNavigation(
        readyClient({ hasSession: false, accountStatus: 'idle', role: undefined, isActive: null })
      )
    ).toBeNull();
    expect(hasPendingNotificationsInboxIntent()).toBe(true);
  });

  it('consumes a still-pending cold intent after a later Client login', () => {
    captureNotificationResponse(tapResponse(payload));
    expect(
      consumeReadyInboxNavigation(
        readyClient({ hasSession: false, accountStatus: 'idle', role: undefined })
      )
    ).toBeNull();
    expect(consumeReadyInboxNavigation(readyClient())).toBe('/client/notifications');
    expect(hasPendingNotificationsInboxIntent()).toBe(false);
  });

  it('does not open the inbox when account lookup fails', () => {
    captureNotificationResponse(tapResponse(payload));
    expect(decidePendingInboxNavigation(readyClient({ accountStatus: 'error' }))).toEqual({
      kind: 'wait',
    });
    expect(consumeReadyInboxNavigation(readyClient({ accountStatus: 'error' }))).toBeNull();
  });

  it('does not open the inbox for inactive or unsupported accounts', () => {
    captureNotificationResponse(tapResponse(payload));
    expect(consumeReadyInboxNavigation(readyClient({ isActive: false }))).toBeNull();
    expect(consumeReadyInboxNavigation(readyClient({ role: 'unexpected' }))).toBeNull();
    expect(hasPendingNotificationsInboxIntent()).toBe(true);
  });

  it('retains only notification_id from the response for the trusted Admin lookup', () => {
    captureNotificationResponse(
      tapResponse({
        notification_id: '55555555-5555-4555-8555-555555555555',
        type: 'report_submitted',
        href: '/admin/report-details',
      })
    );
    expect(getPendingNotificationId()).toBe('55555555-5555-4555-8555-555555555555');
    clearPendingNotificationsInboxIntent();
    expect(getPendingNotificationId()).toBeNull();
  });

  it('does not redirect on an ordinary launch with no notification response', () => {
    expect(isSkillMatchNotificationResponse(null)).toBe(false);
    expect(captureNotificationResponse(null)).toBe(false);
    expect(hasPendingNotificationsInboxIntent()).toBe(false);
    expect(decidePendingInboxNavigation(readyClient({ hasPendingInboxIntent: false }))).toEqual({
      kind: 'idle',
    });
    expect(consumeReadyInboxNavigation(readyClient({ hasPendingInboxIntent: false }))).toBeNull();
  });

  it('does not redirect a second time after consume plus remount', () => {
    captureNotificationResponse(tapResponse(payload));
    expect(consumeReadyInboxNavigation(readyClient())).toBe('/client/notifications');
    expect(decidePendingInboxNavigation(readyClient({ hasPendingInboxIntent: false }))).toEqual({
      kind: 'idle',
    });
    expect(consumeReadyInboxNavigation(readyClient({ hasPendingInboxIntent: false }))).toBeNull();
  });

  it('still routes a background Worker response from authoritative Worker state', () => {
    captureNotificationResponse(tapResponse({ notification_id: '44444444-4444-4444-8444-444444444444' }));
    expect(consumeReadyInboxNavigation(readyWorker())).toBe('/worker/notifications');
  });

  it('still routes a background Client response from authoritative Client state', () => {
    captureNotificationResponse(tapResponse({}));
    expect(consumeReadyInboxNavigation(readyClient())).toBe('/client/notifications');
  });

  it('does not let the payload choose the role', () => {
    captureNotificationResponse(tapResponse({ role: 'worker' }));
    expect(consumeReadyInboxNavigation(readyClient())).toBe('/client/notifications');
  });

  it('does not let the payload open Booking', () => {
    const response = tapResponse({ booking_id: 'abc', href: '/client/bookings' });
    expect(captureNotificationResponse(response)).toBe(true);
    expect(consumeReadyInboxNavigation(readyClient())).toBe('/client/notifications');
    expect(parsePushTapData(extractTapData(response))).toBeNull();
  });

  it('does not let the payload open Payment', () => {
    captureNotificationResponse(tapResponse({ payment_id: 'pay-1', href: '/client/payments' }));
    expect(consumeReadyInboxNavigation(readyWorker())).toBe('/worker/notifications');
  });

  it('clears a pending inbox intent on explicit sign-out', () => {
    captureNotificationResponse(tapResponse(payload));
    expect(hasPendingNotificationsInboxIntent()).toBe(true);
    clearPendingNotificationsInboxIntent();
    expect(hasPendingNotificationsInboxIntent()).toBe(false);
    expect(consumeReadyInboxNavigation(readyClient())).toBeNull();
  });
});
