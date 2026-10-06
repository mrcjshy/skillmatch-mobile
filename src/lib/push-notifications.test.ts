import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ANDROID_CHANNEL_ID,
  ANDROID_CHANNEL_NAME,
  ANDROID_NOTIFICATION_SOUND,
  LEGACY_ANDROID_CHANNEL_ID,
  chatTapDestination,
  consumeReadyPushNavigation,
  getPendingChatBookingId,
  parseChatPushData,
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
  deletedChannels: string[];
  handlers: number;
} {
  let status = initialStatus;
  const permissionCalls = { get: 0, request: 0 };
  const tokensRequested: { projectId: string }[] = [];
  const channels: { id: string; name: string }[] = [];
  const deletedChannels: string[] = [];
  let handlers = 0;

  return {
    permissionCalls,
    tokensRequested,
    channels,
    deletedChannels,
    get handlers() {
      return handlers;
    },
    AndroidImportance: { DEFAULT: 5, HIGH: 6 },
    async setNotificationChannelAsync(id, channel) {
      channels.push({ id, name: channel.name });
      return { id };
    },
    async deleteNotificationChannelAsync(id) {
      deletedChannels.push(id);
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

function notificationWith(data: unknown) {
  return { request: { content: { data } } };
}

const BOOKING_ID = '44444444-4444-4444-8444-444444444444';

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
      handleNotification: (notification: unknown) => Promise<Record<string, boolean>>;
    }[] = [];
    const notifications = fakeNotifications('granted');
    notifications.setNotificationHandler = (next) => {
      captured.push(next);
    };
    configureForegroundHandler(notifications);
    configureForegroundHandler(notifications);
    expect(isForegroundHandlerConfigured()).toBe(true);
    expect(captured).toHaveLength(1);
    await expect(captured[0]?.handleNotification(notificationWith({ notification_id: 'x' }))).resolves.toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });
  });

  it('suppresses the OS presentation of a foreground chat push (the in-app banner covers it)', async () => {
    const captured: { handleNotification: (n: unknown) => Promise<Record<string, boolean>> }[] = [];
    const notifications = fakeNotifications('granted');
    notifications.setNotificationHandler = (next) => {
      captured.push(next);
    };
    configureForegroundHandler(notifications);
    await expect(
      captured[0]?.handleNotification(notificationWith({ kind: 'message', booking_id: BOOKING_ID }))
    ).resolves.toEqual({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    });
    // A general notification or a malformed chat payload keeps the normal presentation.
    for (const data of [{ notification_id: 'x' }, { kind: 'message' }, null]) {
      await expect(captured[0]?.handleNotification(notificationWith(data))).resolves.toMatchObject({
        shouldShowBanner: true,
        shouldPlaySound: true,
      });
    }
  });

  it('sets the Android notification channel once for the same process', async () => {
    const notifications = fakeNotifications('granted');
    const options: Record<string, unknown>[] = [];
    const record = notifications.setNotificationChannelAsync;
    notifications.setNotificationChannelAsync = async (id, channel) => {
      options.push({ ...channel });
      return record(id, channel);
    };
    await ensureAndroidNotificationChannel(notifications, 'android');
    await ensureAndroidNotificationChannel(notifications, 'android');
    expect(isAndroidChannelReady()).toBe(true);
    expect(notifications.channels).toEqual([
      { id: ANDROID_CHANNEL_ID, name: ANDROID_CHANNEL_NAME },
    ]);
    // The versioned channel carries the bundled Tugma file (expo-notifications `sounds`) at HIGH.
    expect(options).toEqual([
      { name: ANDROID_CHANNEL_NAME, importance: 6, sound: ANDROID_NOTIFICATION_SOUND },
    ]);
    expect(notifications.deletedChannels).toEqual([LEGACY_ANDROID_CHANNEL_ID]);
  });

  it('uses a new versioned channel id and the bundled Tugma file name', () => {
    expect(ANDROID_CHANNEL_ID).toBe('skillmatch_alerts_v1');
    expect(LEGACY_ANDROID_CHANNEL_ID).toBe('default');
    expect(ANDROID_NOTIFICATION_SOUND).toBe('skillmatch_tugma.wav');
  });

  it('keeps the channel usable when the legacy channel cannot be deleted', async () => {
    const notifications = fakeNotifications('granted');
    notifications.deleteNotificationChannelAsync = async () => {
      throw new Error('no such channel');
    };
    await ensureAndroidNotificationChannel(notifications, 'android');
    expect(isAndroidChannelReady()).toBe(true);
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

describe('W7 booking chat push tap', () => {
  function ready(role: 'worker' | 'client' | 'administrator'): PendingInboxNavInput {
    return {
      hasPendingInboxIntent: true,
      isSessionLoading: false,
      hasSession: true,
      accountStatus: 'resolved',
      role,
      isActive: true,
      isNotificationTypeResolved: true,
      notificationType: null,
    };
  }

  beforeEach(() => {
    resetPushClientState();
  });

  it('parses only kind=message with a UUID booking id', () => {
    expect(parseChatPushData({ kind: 'message', booking_id: BOOKING_ID })).toEqual({ bookingId: BOOKING_ID });
    expect(parseChatPushData({ kind: 'message', booking_id: 'abc' })).toBeNull();
    expect(parseChatPushData({ booking_id: BOOKING_ID })).toBeNull();
    expect(parseChatPushData({ kind: 'notification', booking_id: BOOKING_ID })).toBeNull();
    expect(parseChatPushData(null)).toBeNull();
  });

  it('records a pending chat booking id from a chat tap, and none from a general tap', () => {
    captureNotificationResponse(tapResponse({ kind: 'message', booking_id: BOOKING_ID }));
    expect(hasPendingNotificationsInboxIntent()).toBe(true);
    expect(getPendingChatBookingId()).toBe(BOOKING_ID);
    expect(getPendingNotificationId()).toBeNull();
    captureNotificationResponse(tapResponse({ notification_id: '33333333-3333-4333-8333-333333333333' }));
    expect(getPendingChatBookingId()).toBeNull();
  });

  it('opens the role chat only when the Booking was re-authorized', () => {
    expect(chatTapDestination('client', BOOKING_ID, true)).toEqual({
      kind: 'chat', pathname: '/client/chat', bookingId: BOOKING_ID,
    });
    expect(chatTapDestination('worker', BOOKING_ID, true)).toEqual({
      kind: 'chat', pathname: '/worker/chat', bookingId: BOOKING_ID,
    });
  });

  it('falls back to the role inbox when the Booking is not authorized or not confirmed', () => {
    expect(chatTapDestination('client', BOOKING_ID, false)).toEqual({ kind: 'inbox', href: '/client/notifications' });
    expect(chatTapDestination('worker', BOOKING_ID, false)).toEqual({ kind: 'inbox', href: '/worker/notifications' });
    expect(chatTapDestination('worker', null, true)).toEqual({ kind: 'inbox', href: '/worker/notifications' });
  });

  it('never opens a chat for an Administrator or an unknown role', () => {
    expect(chatTapDestination('administrator', BOOKING_ID, true)).toEqual({ kind: 'inbox', href: '/admin/notifications' });
    expect(chatTapDestination('guest', BOOKING_ID, true)).toBeNull();
  });

  it('waits (does not consume) until session and account are resolved', () => {
    captureNotificationResponse(tapResponse({ kind: 'message', booking_id: BOOKING_ID }));
    expect(consumeReadyPushNavigation({ ...ready('client'), hasSession: false }, true)).toBeNull();
    expect(consumeReadyPushNavigation({ ...ready('client'), accountStatus: 'pending' }, true)).toBeNull();
    expect(consumeReadyPushNavigation({ ...ready('client'), isActive: false }, true)).toBeNull();
    expect(getPendingChatBookingId()).toBe(BOOKING_ID);
  });

  it('consumes a ready chat intent exactly once', () => {
    captureNotificationResponse(tapResponse({ kind: 'message', booking_id: BOOKING_ID }));
    expect(consumeReadyPushNavigation(ready('worker'), true)).toEqual({
      kind: 'chat', pathname: '/worker/chat', bookingId: BOOKING_ID,
    });
    expect(hasPendingNotificationsInboxIntent()).toBe(false);
    expect(getPendingChatBookingId()).toBeNull();
    expect(consumeReadyPushNavigation(ready('worker'), true)).toBeNull();
  });

  it('routes an unauthorized chat tap to the inbox and clears it', () => {
    captureNotificationResponse(tapResponse({ kind: 'message', booking_id: BOOKING_ID }));
    expect(consumeReadyPushNavigation(ready('client'), false)).toEqual({ kind: 'inbox', href: '/client/notifications' });
    expect(hasPendingNotificationsInboxIntent()).toBe(false);
  });

  it('keeps general taps on the existing inbox path', () => {
    captureNotificationResponse(tapResponse({ notification_id: '33333333-3333-4333-8333-333333333333' }));
    expect(consumeReadyPushNavigation(ready('client'), false)).toEqual({ kind: 'inbox', href: '/client/notifications' });
  });

  it('clears a pending chat intent on sign-out', () => {
    captureNotificationResponse(tapResponse({ kind: 'message', booking_id: BOOKING_ID }));
    clearPendingNotificationsInboxIntent();
    expect(getPendingChatBookingId()).toBeNull();
  });
});
