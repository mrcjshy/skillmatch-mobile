/**
 * R5B Android push client — delivery hint only.
 *
 * `public.notifications` remains the authoritative persistent record.
 * R5 private Broadcast remains the in-app freshness transport.
 * Expo Push is an out-of-app Android delivery hint. The payload is untrusted
 * metadata (`notification_id` at most) and is never business authority.
 *
 * Expo Go is NOT valid runtime proof for Android remote push on the current
 * SDK. A later native/development build is required.
 */

export const ANDROID_CHANNEL_ID = 'default';
export const ANDROID_CHANNEL_NAME = 'SkillMatch Notifications';
export const WORKER_NOTIFICATIONS_HREF = '/worker/notifications';
export const CLIENT_NOTIFICATIONS_HREF = '/client/notifications';
export const PERMISSION_SETTLE_MS = 800;
/** The only R5B navigation intent. Role/route are never taken from the payload. */
export const OPEN_NOTIFICATIONS_INBOX = 'OPEN_NOTIFICATIONS_INBOX';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PushPermissionStatus = 'granted' | 'denied' | 'undetermined';

export type PushFailureCode =
  | 'unsupported_platform'
  | 'expo_go_unsupported'
  | 'permission_denied'
  | 'missing_project_id'
  | 'token_unavailable'
  | 'register_failed'
  | 'deactivate_failed';

export type PushRole = 'worker' | 'client';

export type InboxHref = typeof WORKER_NOTIFICATIONS_HREF | typeof CLIENT_NOTIFICATIONS_HREF;

export type PushDeliveryHint = {
  /** Untrusted delivery metadata. Never a business record. */
  notificationId: string;
};

export type PushRegistrationResult =
  | { ok: true; tokenPresent: true }
  | { ok: false; code: PushFailureCode };

export type NotificationsLike = {
  setNotificationChannelAsync: (
    channelId: string,
    channel: { name: string; importance: number; sound?: string | null }
  ) => Promise<unknown>;
  getPermissionsAsync: () => Promise<{ status: string }>;
  requestPermissionsAsync: () => Promise<{ status: string }>;
  getExpoPushTokenAsync: (options: { projectId: string }) => Promise<{ data: string }>;
  setNotificationHandler: (handler: {
    handleNotification: () => Promise<{
      shouldShowBanner: boolean;
      shouldShowList: boolean;
      shouldPlaySound: boolean;
      shouldSetBadge: boolean;
    }>;
  }) => void;
  AndroidImportance: { DEFAULT: number; HIGH: number };
  getLastNotificationResponseAsync: () => Promise<unknown>;
  clearLastNotificationResponseAsync?: () => Promise<unknown>;
  addNotificationResponseReceivedListener: (listener: (response: unknown) => void) => {
    remove: () => void;
  };
};

export type PushRpcResult = { error: { message?: string } | null };

export type PushRpcLike = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<PushRpcResult>;
};

export type ProjectIdSource = {
  expoConfig?: { extra?: { eas?: { projectId?: unknown } } } | null;
  easConfig?: { projectId?: unknown } | null;
};

export type PushRegistrationDeps = {
  platform: string;
  isExpoGo: boolean;
  notifications: NotificationsLike;
  constants: ProjectIdSource;
  rpc: PushRpcLike['rpc'];
};

let rememberedExpoPushToken: string | null = null;
let androidChannelReady = false;
let foregroundHandlerConfigured = false;
/** Generic pending launch intent. Stores no role, route, or business ids. */
let pendingOpenNotificationsInbox = false;

export function getRememberedExpoPushToken(): string | null {
  return rememberedExpoPushToken;
}

export function rememberExpoPushToken(token: string): void {
  rememberedExpoPushToken = token;
}

export function clearRememberedExpoPushToken(): void {
  rememberedExpoPushToken = null;
}

/** Test-only reset for module-level idempotence flags. */
export function resetPushClientState(): void {
  rememberedExpoPushToken = null;
  androidChannelReady = false;
  foregroundHandlerConfigured = false;
  pendingOpenNotificationsInbox = false;
}

export function hasPendingNotificationsInboxIntent(): boolean {
  return pendingOpenNotificationsInbox;
}

export function clearPendingNotificationsInboxIntent(): void {
  pendingOpenNotificationsInbox = false;
}

export type PendingInboxAccountStatus = 'idle' | 'pending' | 'resolved' | 'error';

export type PendingInboxNavInput = {
  hasPendingInboxIntent: boolean;
  isSessionLoading: boolean;
  hasSession: boolean;
  accountStatus: PendingInboxAccountStatus;
  role: unknown;
  isActive?: boolean | null;
};

export type PendingInboxNavDecision =
  | { kind: 'idle' }
  | { kind: 'wait' }
  | { kind: 'replace'; href: InboxHref };

/**
 * Expo notification-response shape only. Payload fields are never authority.
 */
export function isSkillMatchNotificationResponse(response: unknown): boolean {
  if (typeof response !== 'object' || response === null) return false;
  const notification = (response as { notification?: unknown }).notification;
  if (typeof notification !== 'object' || notification === null) return false;
  const request = (notification as { request?: unknown }).request;
  return typeof request === 'object' && request !== null;
}

/** Records OPEN_NOTIFICATIONS_INBOX. Returns true when a new pending intent was set. */
export function captureNotificationResponse(response: unknown): boolean {
  if (!isSkillMatchNotificationResponse(response)) return false;
  pendingOpenNotificationsInbox = true;
  return true;
}

export function decidePendingInboxNavigation(input: PendingInboxNavInput): PendingInboxNavDecision {
  if (!input.hasPendingInboxIntent) return { kind: 'idle' };
  if (input.isSessionLoading) return { kind: 'wait' };
  if (!input.hasSession) return { kind: 'wait' };
  if (input.accountStatus === 'idle' || input.accountStatus === 'pending') return { kind: 'wait' };
  if (input.accountStatus === 'error') return { kind: 'wait' };
  if (input.isActive !== true) return { kind: 'wait' };
  const href = inboxHrefForRole(input.role);
  if (!href) return { kind: 'wait' };
  return { kind: 'replace', href };
}

/**
 * Exactly-once consume: returns the inbox href and clears the pending intent
 * only when bootstrap is ready to route. Does not consume while waiting.
 */
export function consumeReadyInboxNavigation(input: PendingInboxNavInput): InboxHref | null {
  if (!pendingOpenNotificationsInbox) return null;
  const decision = decidePendingInboxNavigation({
    ...input,
    hasPendingInboxIntent: true,
  });
  if (decision.kind !== 'replace') return null;
  pendingOpenNotificationsInbox = false;
  return decision.href;
}

export function classifyPermissionStatus(status: string): PushPermissionStatus {
  if (status === 'granted') return 'granted';
  if (status === 'undetermined') return 'undetermined';
  return 'denied';
}

export function resolveEasProjectId(source: ProjectIdSource): string | null {
  const fromEas =
    typeof source.easConfig?.projectId === 'string' ? source.easConfig.projectId.trim() : '';
  if (fromEas) return fromEas;
  const fromExtra =
    typeof source.expoConfig?.extra?.eas?.projectId === 'string'
      ? source.expoConfig.extra.eas.projectId.trim()
      : '';
  return fromExtra || null;
}

export function inboxHrefForRole(role: unknown): InboxHref | null {
  if (role === 'worker') return WORKER_NOTIFICATIONS_HREF;
  if (role === 'client') return CLIENT_NOTIFICATIONS_HREF;
  return null;
}

/**
 * Reads `notification_id` as delivery metadata only. Callers must not load
 * bookings, payments, or any other business record from this value.
 */
export function parsePushTapData(data: unknown): PushDeliveryHint | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const raw = (data as { notification_id?: unknown }).notification_id;
  if (typeof raw !== 'string' || !UUID_RE.test(raw)) return null;
  return { notificationId: raw };
}

export function extractTapData(response: unknown): unknown {
  if (typeof response !== 'object' || response === null) return null;
  const notification = (response as { notification?: unknown }).notification;
  if (typeof notification !== 'object' || notification === null) return null;
  const request = (notification as { request?: unknown }).request;
  if (typeof request !== 'object' || request === null) return null;
  const content = (request as { content?: unknown }).content;
  if (typeof content !== 'object' || content === null) return null;
  return (content as { data?: unknown }).data ?? null;
}

export function resolveTapInboxHref(role: unknown, _hint: PushDeliveryHint | null): InboxHref | null {
  // Role comes from the authoritative account, never from the payload.
  void _hint;
  return inboxHrefForRole(role);
}

export async function inspectPermission(
  notifications: Pick<NotificationsLike, 'getPermissionsAsync'>
): Promise<PushPermissionStatus> {
  const current = await notifications.getPermissionsAsync();
  return classifyPermissionStatus(current.status);
}

export async function requestPermissionIfUndetermined(
  notifications: Pick<NotificationsLike, 'getPermissionsAsync' | 'requestPermissionsAsync'>
): Promise<PushPermissionStatus> {
  const current = await inspectPermission(notifications);
  if (current !== 'undetermined') return current;
  const requested = await notifications.requestPermissionsAsync();
  return classifyPermissionStatus(requested.status);
}

export async function ensureAndroidNotificationChannel(
  notifications: Pick<NotificationsLike, 'setNotificationChannelAsync' | 'AndroidImportance'>,
  platform: string
): Promise<void> {
  if (platform !== 'android') return;
  if (androidChannelReady) return;
  await notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: ANDROID_CHANNEL_NAME,
    importance: notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });
  androidChannelReady = true;
}

export function isAndroidChannelReady(): boolean {
  return androidChannelReady;
}

export function configureForegroundHandler(
  notifications: Pick<NotificationsLike, 'setNotificationHandler'>
): void {
  if (foregroundHandlerConfigured) return;
  notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  foregroundHandlerConfigured = true;
}

export function isForegroundHandlerConfigured(): boolean {
  return foregroundHandlerConfigured;
}

export async function acquireExpoPushToken(
  notifications: Pick<NotificationsLike, 'getExpoPushTokenAsync'>,
  projectId: string
): Promise<string | null> {
  const result = await notifications.getExpoPushTokenAsync({ projectId });
  const token = typeof result?.data === 'string' ? result.data.trim() : '';
  return token || null;
}

export async function registerExpoPushToken(
  rpc: PushRpcLike['rpc'],
  token: string
): Promise<{ ok: true } | { ok: false; code: 'register_failed' }> {
  try {
    const { error } = await rpc('register_my_push_device', {
      p_expo_push_token: token,
    });
    if (error) return { ok: false, code: 'register_failed' };
    rememberExpoPushToken(token);
    return { ok: true };
  } catch {
    return { ok: false, code: 'register_failed' };
  }
}

export async function deactivateExpoPushToken(
  rpc: PushRpcLike['rpc'],
  token: string | null
): Promise<{ ok: true; skipped: boolean } | { ok: false; code: 'deactivate_failed' }> {
  if (!token) return { ok: true, skipped: true };
  try {
    const { error } = await rpc('deactivate_my_push_device', {
      p_expo_push_token: token,
    });
    if (error) return { ok: false, code: 'deactivate_failed' };
    return { ok: true, skipped: false };
  } catch {
    return { ok: false, code: 'deactivate_failed' };
  }
}

export async function registerCurrentPushDevice(
  deps: PushRegistrationDeps
): Promise<PushRegistrationResult> {
  if (deps.platform !== 'android') {
    return { ok: false, code: 'unsupported_platform' };
  }

  try {
    configureForegroundHandler(deps.notifications);
    await ensureAndroidNotificationChannel(deps.notifications, deps.platform);

    const permission = await requestPermissionIfUndetermined(deps.notifications);
    if (permission !== 'granted') {
      return { ok: false, code: 'permission_denied' };
    }

    const projectId = resolveEasProjectId(deps.constants);
    if (!projectId) {
      return { ok: false, code: 'missing_project_id' };
    }

    if (deps.isExpoGo) {
      return { ok: false, code: 'expo_go_unsupported' };
    }

    const token = await acquireExpoPushToken(deps.notifications, projectId);
    if (!token) {
      return { ok: false, code: 'token_unavailable' };
    }

    const registered = await registerExpoPushToken(deps.rpc, token);
    if (!registered.ok) return registered;
    return { ok: true, tokenPresent: true };
  } catch {
    return { ok: false, code: 'register_failed' };
  }
}
