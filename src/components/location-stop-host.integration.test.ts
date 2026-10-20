import { act, createElement, Fragment, useEffect } from 'react';
import { expect, it, vi } from 'vitest';
import { LocationStopHost } from './location-stop-host';
import { useLocationSharing } from '@/hooks/use-location-sharing';
import { locationStopQueue } from '@/lib/location-stop-queue';

const b = vi.hoisted(() => ({ state: 'active', listeners: new Set<(state: string) => void>(),
  revision: 1, fail: true, remove: vi.fn(), watch: vi.fn(), messages: [] as string[],
  sends: [] as { token: string; args: unknown }[],
  owner: null as null | { session: { user: { id: string }; access_token: string }; sessionLifetime: { ownerId: string; isCurrent: () => boolean }; isSessionLoading: boolean },
}));
vi.mock('@/providers/session-provider', () => ({ useSession: () => b.owner }));
vi.mock('expo-router', () => ({ useFocusEffect: (fn: () => void | (() => void)) => useEffect(fn, [fn]) }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock('react-native', () => ({ AppState: {
  get currentState() { return b.state; },
  addEventListener: (_: string, fn: (state: string) => void) => { b.listeners.add(fn); return { remove: () => b.listeners.delete(fn) }; },
}, View: ({ children }: { children: unknown }) => children,
Text: ({ children }: { children: unknown }) => { b.messages.push(String(children)); return null; } }));
vi.mock('@/components/app-button', () => ({ AppButton: () => null }));
vi.mock('expo-location', () => ({ Accuracy: { Balanced: 3 }, requestForegroundPermissionsAsync: async () => ({ granted: true }),
  hasServicesEnabledAsync: async () => true, watchPositionAsync: b.watch }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (name: string, args: unknown) => {
  if (name === 'start_my_booking_location_share') return Promise.resolve({ data: 'share-a', error: null });
  let token = '';
  const request = {
    setHeader: (_: string, value: string) => { token = value; return request; },
    abortSignal: () => request,
    then: (resolve: (value: unknown) => unknown) => {
      b.sends.push({ token, args });
      return Promise.resolve({ data: b.fail ? null : 'stopped', error: b.fail ? { code: '08006' } : null }).then(resolve);
    },
  }; return request;
} } }));

it('root cleanup survives navigation, displays unconfirmed Stop, pauses for another account and resumes under a replacement session', async () => {
  const setOwner = (id: string, token: string) => {
    const version = ++b.revision;
    b.owner = { session: { user: { id }, access_token: token }, isSessionLoading: false,
      sessionLifetime: { ownerId: id, isCurrent: () => b.revision === version } };
  };
  setOwner('a', 'token-a'); b.watch.mockResolvedValue({ remove: b.remove });
  const doc: Record<string, unknown> = { nodeType: 9, activeElement: null, documentElement: {}, addEventListener() {}, removeEventListener() {} };
  const win = { document: doc, event: undefined, HTMLIFrameElement: class {} }; doc.defaultView = win;
  const container = { nodeType: 1, tagName: 'DIV', ownerDocument: doc, firstChild: null, lastChild: null,
    addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {}, insertBefore() {} };
  vi.stubGlobal('document', doc); vi.stubGlobal('window', win); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const module: string = 'react-dom/client';
  const { createRoot } = await import(/* @vite-ignore */ module) as { createRoot: (container: unknown) => { render: (node: unknown) => void; unmount: () => void } };
  const root = createRoot(container);
  let sharing!: ReturnType<typeof useLocationSharing>;
  function MapAdapter() { sharing = useLocationSharing('booking', b.owner!.session.user.id, true); return null; }
  const render = (map: boolean) => root.render(createElement(Fragment, null, createElement(LocationStopHost), map ? createElement(MapAdapter) : null));
  try {
    await act(async () => { render(true); });
    await act(async () => { sharing.start(); }); expect(b.watch).toHaveBeenCalledOnce();
    await act(async () => { render(false); });
    await act(async () => { await locationStopQueue.tick(); });
    expect(b.remove).toHaveBeenCalledOnce(); expect(locationStopQueue.getSnapshot()[0].status).toBe('unconfirmed');
    expect(b.messages.some(message => message.includes('Server Stop is still unconfirmed'))).toBe(true);
    await act(async () => { render(true); });
    expect(sharing.state.cleanupPending).toBe(true);
    await act(async () => { sharing.start(); }); expect(b.watch).toHaveBeenCalledOnce();
    setOwner('b', 'token-b'); await act(async () => { render(false); locationStopQueue.retry('a'); });
    await act(async () => { await locationStopQueue.tick(); });
    expect(b.sends.every(send => send.token === 'Bearer token-a')).toBe(true);
    setOwner('a', 'token-a-new-session'); b.fail = false;
    await act(async () => { render(false); });
    await act(async () => { locationStopQueue.retry('a'); await locationStopQueue.tick(); });
    expect(locationStopQueue.getSnapshot()).toEqual([]);
    expect(b.sends.at(-1)).toEqual({ token: 'Bearer token-a-new-session', args: { p_booking_id: 'booking', p_share_id: 'share-a' } });
    expect(b.watch).toHaveBeenCalledOnce();
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
  expect(b.listeners.size).toBe(0);
});
