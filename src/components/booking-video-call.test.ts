// @ts-expect-error -- Node-only component harness, not native rendering evidence.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- Node-only component harness.
import path from 'node:path';
// @ts-expect-error -- Node-only component harness.
import { runInNewContext } from 'node:vm';
// @ts-expect-error -- Build-time Babel, untyped in this app (no @types/babel__core).
import { transformSync } from '@babel/core';
import { expect, it, vi } from 'vitest';

// CallTracks is compiled exactly as the app build does (React Compiler on, app.json
// experiments.reactCompiler), then rendered with a minimal hook runtime.
// E2E 2026-10-15, booking 29d054bb, call 58a24f64: the Worker joined first and never
// showed the Client's tile while the Client showed the Worker's.
type Node = { type: unknown; props: Record<string, any>; key?: string };

function compileCallTracks(component = '__CallTracks', props: Record<string, unknown> = { counterpart: 'Your Client', previewTop: 96 }) {
  const file = path.resolve('src/components/booking-video-call.tsx');
  const { code } = transformSync(readFileSync(file, 'utf8'), {
    filename: file, babelrc: false, configFile: false,
    presets: [['@babel/preset-typescript', { isTSX: true, allExtensions: true }]],
    plugins: ['babel-plugin-react-compiler', ['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }],
      '@babel/plugin-transform-modules-commonjs'],
  })!;
  let state: unknown[] = [];
  let cursor = 0;
  let cache: unknown[] | null = null;
  let dirty = false;
  const effects: { deps: unknown[] | undefined; cleanup?: (() => void) | void }[] = [];
  const pending: (() => void)[] = [];
  const react = {
    useState: (initial: unknown) => {
      const i = cursor++;
      if (!(i in state)) state[i] = initial;
      const set = (next: unknown) => { state[i] = typeof next === 'function' ? (next as (v: unknown) => unknown)(state[i]) : next; dirty = true; };
      return [state[i], set];
    },
    useLayoutEffect: (fn: () => (() => void) | void, deps?: unknown[]) => {
      const i = cursor++;
      const previous = effects[i];
      if (!previous || !deps || deps.some((d, k) => d !== previous.deps?.[k])) {
        pending.push(() => { previous?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; });
      }
    },
    useRef: (value: unknown) => ({ current: value }), useCallback: (fn: unknown) => fn,
  };
  const modules: Record<string, unknown> = {
    react,
    'react/compiler-runtime': { c: (size: number) => (cache ??= Array.from({ length: size }, () => Symbol.for('react.memo_cache_sentinel'))) },
    'react/jsx-runtime': { jsx: (type: unknown, props: object, key?: string) => ({ type, props, key }), jsxs: (type: unknown, props: object, key?: string) => ({ type, props, key }) },
    'react-native': { Text: 'Text', View: 'View', Pressable: 'Pressable', AppState: {}, PermissionsAndroid: {}, Platform: {},
      StyleSheet: { absoluteFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }, create: (styles: object) => styles } },
    'expo-status-bar': { StatusBar: 'StatusBar' }, 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 16 }) },
    '@/components/app-symbol': { AppSymbol: 'AppSymbol' }, '@/lib/video-call-view': {}, 'expo-linear-gradient': { LinearGradient: 'LinearGradient' },
    'expo-router': { useFocusEffect: () => {}, useRouter: () => ({}) },
    '@/components/app-button': { AppButton: 'AppButton' },
    '@/providers/account-provider': { useAccount: () => ({}) },
    '@/lib/video-call': {}, '@/lib/realtime': {},
    '@/lib/call-alert': { callAlert: {} }, '@/lib/push-notifications': {},
    '@/lib/native-video-call': { loadVideoRuntime: () => sdk, createNativeCallMedia: () => { throw new Error('No media'); },
      switchLocalCamera: (...args: unknown[]) => switchCamera(...args), localCameraFacing: () => cameraFacingNow },
  };
  const exports: Record<string, any> = {};
  runInNewContext(`${code}\n;exports.__CallTracks = CallTracks; exports.__MediaToggles = MediaToggles;`, { exports, require: (name: string) => {
    if (!(name in modules)) throw new Error(`Unexpected import ${name}`);
    return modules[name];
  }, Symbol });
  const CallTracks = exports[component] as (props: Record<string, unknown>) => Node;
  return (room: unknown) => {
    let tree!: Node;
    do {
      dirty = false; cursor = 0;
      tree = CallTracks({ room, ...props });
      while (pending.length) pending.shift()!();
    } while (dirty);
    return {
      tree,
      rerenderIfScheduled: () => { if (dirty) { do { dirty = false; cursor = 0; tree = CallTracks({ room, ...props }); while (pending.length) pending.shift()!(); } while (dirty); } return tree; },
    };
  };
}

const switchCamera = vi.fn(async (..._args: unknown[]) => {});
const cameraFacingNow: 'user' | 'environment' | null = 'user';

const sdk = {
  client: { RoomEvent: { TrackSubscribed: 'trackSubscribed', TrackUnsubscribed: 'trackUnsubscribed', LocalTrackPublished: 'localTrackPublished',
    TrackMuted: 'trackMuted', TrackUnmuted: 'trackUnmuted', ParticipantDisconnected: 'participantDisconnected', ParticipantConnected: 'participantConnected' },
    Track: { Source: { Camera: 'camera' } } },
  native: { VideoTrack: 'VideoTrack' },
};

function fakeRoom() {
  const listeners = new Map<string, Set<() => void>>();
  const participant = (identity: string, camera: boolean) => ({ identity, camera,
    getTrackPublication(this: { camera: boolean }) { return this.camera ? { track: {} } : undefined; } });
  return {
    localParticipant: participant('worker', true),
    // LiveKit mutates this Map in place as participants come and go.
    remoteParticipants: new Map<string, ReturnType<typeof participant>>(),
    on(event: string, fn: () => void) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event)!.add(fn); },
    off(event: string, fn: () => void) { listeners.get(event)?.delete(fn); },
    emit(event: string) { for (const fn of listeners.get(event) ?? []) fn(); },
    participant,
  };
}

const texts = (node: unknown): string[] => {
  if (Array.isArray(node)) return node.flatMap(texts);
  if (!node || typeof node !== 'object') return [];
  const { type, props } = node as Node;
  if (type === 'Text' && typeof props.children === 'string') return [props.children];
  return texts(props.children);
};
const videoTracks = (node: unknown): number => {
  if (Array.isArray(node)) return node.reduce((sum, child) => sum + videoTracks(child), 0);
  if (!node || typeof node !== 'object') return 0;
  const { type, props } = node as Node;
  return (type === 'VideoTrack' ? 1 : 0) + videoTracks(props.children);
};

const tracksIn = (node: unknown): Node[] => {
  if (Array.isArray(node)) return node.flatMap(tracksIn);
  if (!node || typeof node !== 'object') return [];
  const { type, props } = node as Node;
  return [...(type === 'VideoTrack' ? [node as Node] : []), ...tracksIn(props.children)];
};
const find = (node: unknown, test: (n: Node) => boolean): Node | undefined => {
  if (Array.isArray(node)) { for (const child of node) { const hit = find(child, test); if (hit) return hit; } return undefined; }
  if (!node || typeof node !== 'object') return undefined;
  return test(node as Node) ? node as Node : find((node as Node).props.children, test);
};

it('the participant who joined first renders a counterpart who subscribes later', () => {
  const room = fakeRoom();
  const view = compileCallTracks()(room);
  expect(texts(view.tree)).toEqual(['Waiting for Your Client to join']);
  expect(videoTracks(view.tree)).toBe(1);
  room.remoteParticipants.set('client', room.participant('client', true));
  room.emit('trackSubscribed');
  const after = view.rerenderIfScheduled();
  expect(texts(after)).toEqual([]);
  expect(videoTracks(after)).toBe(2);
});

it('a counterpart joining with camera off replaces the waiting placeholder', () => {
  const room = fakeRoom();
  const view = compileCallTracks()(room);
  room.remoteParticipants.set('client', room.participant('client', false));
  room.emit('participantConnected');
  expect(texts(view.rerenderIfScheduled())).toEqual(['Your Client: Camera off']);
});

it('a counterpart camera that stops shows a camera-off placeholder, and a departure shows waiting again', () => {
  const room = fakeRoom();
  const remote = room.participant('client', true);
  room.remoteParticipants.set('client', remote);
  const view = compileCallTracks()(room);
  expect(videoTracks(view.tree)).toBe(2);
  remote.camera = false;
  room.emit('trackUnsubscribed');
  expect(texts(view.rerenderIfScheduled())).toEqual(['Your Client: Camera off']);
  room.remoteParticipants.delete('client');
  room.emit('participantDisconnected');
  expect(texts(view.rerenderIfScheduled())).toEqual(['Waiting for Your Client to join']);
});

it('the remote video fills the screen and your camera is a small mirrored preview inside the safe area', () => {
  const room = fakeRoom();
  room.remoteParticipants.set('client', room.participant('client', true));
  const tree = compileCallTracks('__CallTracks', { counterpart: 'Your Client', previewTop: 120 })(room).tree;
  const [remote, local] = tracksIn(tree);
  expect(remote.props.trackRef.participant.identity).toBe('client');
  expect(remote.props.style).toEqual({ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 });
  expect(remote.props.objectFit).toBe('cover');
  expect(local.props.trackRef.participant.identity).toBe('worker');
  expect(local.props).toMatchObject({ mirror: true, zOrder: 1, objectFit: 'cover' });
  const preview = find(tree, n => n.props.accessibilityLabel === 'Your camera preview')!;
  expect(preview.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ top: 120 })]));
  const frame = Object.assign({}, ...preview.props.style);
  expect(frame).toMatchObject({ position: 'absolute', right: 16, width: 112, height: 150, borderRadius: 16, overflow: 'hidden' });
});

it('a muted own camera shows a camera-off preview, never a remote placeholder in its place', () => {
  const room = fakeRoom();
  room.remoteParticipants.set('client', room.participant('client', true));
  room.localParticipant.getTrackPublication = () => ({ track: {}, isMuted: true }) as never;
  const tree = compileCallTracks()(room).tree;
  expect(texts(tree)).toEqual(['Your camera is off']);
  expect(tracksIn(tree).map(track => track.props.trackRef.participant.identity)).toEqual(['client']);
});

it('RTC-02: Switch camera flips between the front and back camera, and waits while the camera is off', async () => {
  const room = fakeRoom();
  const local = Object.assign(room.localParticipant, { isMicrophoneEnabled: true, isCameraEnabled: true, setMicrophoneEnabled: vi.fn(), setCameraEnabled: vi.fn() });
  const onFacing = vi.fn();
  switchCamera.mockClear();
  const view = compileCallTracks('__MediaToggles', { facing: 'user', onFacing })(room);
  const control = (tree: unknown) => find(tree, n => typeof n.type === 'function' && n.props.label === 'Switch camera')!;
  expect(control(view.tree).props).toMatchObject({ disabled: false, icon: { android: 'cameraswitch', ios: 'camera.rotate' } });
  switchCamera.mockResolvedValueOnce('environment' as never);
  control(view.tree).props.onPress();
  expect(switchCamera).toHaveBeenCalledWith(room, 'environment');
  for (let i = 0; i < 6; i++) await Promise.resolve();
  expect(onFacing).toHaveBeenCalledWith('environment');
  local.isCameraEnabled = false;
  room.emit('trackMuted');
  expect(control(view.rerenderIfScheduled()).props.disabled).toBe(true);
});

it('RTC-06: the preview follows the camera really in use, not the one requested', async () => {
  const room = fakeRoom();
  Object.assign(room.localParticipant, { isMicrophoneEnabled: true, isCameraEnabled: true, setMicrophoneEnabled: vi.fn(), setCameraEnabled: vi.fn() });
  const onFacing = vi.fn();
  const view = compileCallTracks('__MediaToggles', { facing: 'user', onFacing })(room);
  const control = find(view.tree, n => typeof n.type === 'function' && n.props.label === 'Switch camera')!;
  // The camera did not change: the front camera stays mirrored.
  switchCamera.mockResolvedValueOnce('user' as never);
  control.props.onPress();
  for (let i = 0; i < 6; i++) await Promise.resolve();
  expect(onFacing).toHaveBeenLastCalledWith('user');
  // A failed switch re-reads the camera the track uses.
  onFacing.mockClear();
  switchCamera.mockRejectedValueOnce(new Error('synthetic camera failure'));
  find(view.rerenderIfScheduled(), n => typeof n.type === 'function' && n.props.label === 'Switch camera')!.props.onPress();
  for (let i = 0; i < 6; i++) await Promise.resolve();
  expect(onFacing).toHaveBeenCalledWith('user');
});

it('RTC-06: a new camera track remounts your preview, so it never stays on the old camera\'s last frame', () => {
  const room = fakeRoom();
  room.remoteParticipants.set('client', room.participant('client', true));
  const publication = { track: { mediaStreamTrack: { id: 'front-track' } }, isMuted: false };
  room.localParticipant.getTrackPublication = () => publication as never;
  const before = tracksIn(compileCallTracks('__CallTracks', { counterpart: 'Your Client', previewTop: 96, facing: 'user' })(room).tree)[1];
  publication.track.mediaStreamTrack = { id: 'back-track' };
  const after = tracksIn(compileCallTracks('__CallTracks', { counterpart: 'Your Client', previewTop: 96, facing: 'environment' })(room).tree)[1];
  expect(before.key).toBe('front-track');
  expect(after.key).toBe('back-track');
});

it('RTC-02: your own preview is mirrored only for the front camera', () => {
  const room = fakeRoom();
  room.remoteParticipants.set('client', room.participant('client', true));
  const back = compileCallTracks('__CallTracks', { counterpart: 'Your Client', previewTop: 96, facing: 'environment' })(room).tree;
  expect(tracksIn(back)[1].props.mirror).toBe(false);
});

it('microphone and camera toggles mute the existing published tracks and follow LiveKit mute events', async () => {
  const room = fakeRoom();
  const local = Object.assign(room.localParticipant, {
    isMicrophoneEnabled: true, isCameraEnabled: true,
    setMicrophoneEnabled: vi.fn(async (on: boolean) => { local.isMicrophoneEnabled = on; }),
    setCameraEnabled: vi.fn(async (on: boolean) => { local.isCameraEnabled = on; }),
  });
  const view = compileCallTracks('__MediaToggles', {})(room);
  const controls = (tree: unknown) => [find(tree, n => typeof n.type === 'function' && /microphone/.test(n.props.label))!, find(tree, n => typeof n.type === 'function' && /camera/.test(n.props.label))!];
  let [mic, camera] = controls(view.tree);
  expect([mic.props.label, camera.props.label]).toEqual(['Mute microphone', 'Turn camera off']);
  mic.props.onPress();
  camera.props.onPress();
  expect(local.setMicrophoneEnabled).toHaveBeenCalledWith(false);
  expect(local.setCameraEnabled).toHaveBeenCalledWith(false);
  await Promise.resolve(); await Promise.resolve();
  room.emit('trackMuted');
  [mic, camera] = controls(view.rerenderIfScheduled());
  expect([mic.props.label, camera.props.label]).toEqual(['Unmute microphone', 'Turn camera on']);
  expect([mic.props.selected, camera.props.selected]).toEqual([true, true]);
  // No call action is reachable from the toggles: ending stays the explicit End control.
  expect(find(view.rerenderIfScheduled(), n => /End call|Decline|Cancel/.test(String(n.props.label ?? '')))).toBeUndefined();
});

it('RTC-07: in a live call the controls sit in one icon-only dock, still named for screen readers', () => {
  const room = fakeRoom();
  Object.assign(room.localParticipant, { isMicrophoneEnabled: true, isCameraEnabled: true, setMicrophoneEnabled: vi.fn(), setCameraEnabled: vi.fn() });
  const tree = compileCallTracks('__MediaToggles', { facing: 'user', compact: true })(room).tree;
  const controls = (Array.isArray(tree) ? tree : (tree as Node).props.children as Node[]).filter(n => n && typeof n.type === 'function');
  expect(controls.map(n => n.props.label)).toEqual(['Mute microphone', 'Turn camera off', 'Switch camera']);
  expect(controls.every(n => n.props.compact === true)).toBe(true);
});

it('RTC-07: every call text uses the Android system font, so OEM fonts never clip the status, and no technical copy shows', () => {
  const source = readFileSync(path.resolve('src/components/booking-video-call.tsx'), 'utf8');
  expect(source).toMatch(/const FONT: TextStyle = Platform\.OS === 'android' \? \{ fontFamily: 'sans-serif' \} : \{\};/);
  const styles = source.slice(source.indexOf('const styles = StyleSheet.create('));
  for (const [, name, body] of styles.matchAll(/\n {2}(\w+): \{([^}]*)\}/g)) {
    if (/fontSize/.test(body)) expect(`${name}: ${body}`).toMatch(/\.\.\.FONT/);
  }
  expect(source).not.toMatch(/Provider cleanup|closed on this device/);
});
