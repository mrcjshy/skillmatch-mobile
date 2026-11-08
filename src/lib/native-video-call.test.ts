import { expect, it, vi } from 'vitest';
import { createNativeCallMedia, localCameraFacing, switchLocalCamera } from './native-video-call';
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const cameraSdk = { client: { Track: { Source: { Camera: 'camera' } } }, native: {} };
it('RTC-06: re-opens the camera with the other facing even where applyConstraints exists, and reports the camera it really opened', async () => {
  // Infinix + TECNO (11-08): LiveKit's WebRTC fork keeps the first camera for applyConstraints, so the old
  // in-place switch only un-mirrored the front camera. Only a restart opens the other camera.
  const applyConstraints = vi.fn(async () => {});
  const track = { kind: 'video', mediaStreamTrack: { applyConstraints, getSettings: () => ({ facingMode: 'user' }) },
    restartTrack: vi.fn(async ({ facingMode }: { facingMode: string }) => { track.mediaStreamTrack = { applyConstraints, getSettings: () => ({ facingMode }) }; }) };
  const getTrackPublication = vi.fn(() => ({ track }));
  const room = { localParticipant: { getTrackPublication } };
  await expect(switchLocalCamera(room as never, 'environment', cameraSdk as never)).resolves.toBe('environment');
  expect(getTrackPublication).toHaveBeenCalledWith('camera');
  expect(track.restartTrack).toHaveBeenCalledWith({ facingMode: 'environment' });
  await expect(switchLocalCamera(room as never, 'user', cameraSdk as never)).resolves.toBe('user');
  expect(track.restartTrack).toHaveBeenLastCalledWith({ facingMode: 'user' });
  expect(applyConstraints).not.toHaveBeenCalled();
});
it('RTC-06: reports the camera still in use when the restart did not change it, so the preview is not un-mirrored', async () => {
  const track = { kind: 'video', restartTrack: vi.fn(async () => {}), mediaStreamTrack: { getSettings: () => ({ facingMode: 'user' }) } };
  const room = { localParticipant: { getTrackPublication: () => ({ track }) } };
  await expect(switchLocalCamera(room as never, 'environment', cameraSdk as never)).resolves.toBe('user');
});
it('RTC-04: reads which camera the published track really uses (LiveKit re-opens the camera when it is turned back on)', () => {
  const room = (facingMode?: string) => ({ localParticipant: { getTrackPublication: () => ({ track: { kind: 'video', mediaStreamTrack: { getSettings: () => ({ facingMode }) } } }) } });
  expect(localCameraFacing(room('environment') as never, cameraSdk as never)).toBe('environment');
  expect(localCameraFacing(room('user') as never, cameraSdk as never)).toBe('user');
  expect(localCameraFacing(room(undefined) as never, cameraSdk as never)).toBeNull();
  expect(localCameraFacing({ localParticipant: { getTrackPublication: () => undefined } } as never, cameraSdk as never)).toBeNull();
});
it('RTC-02: re-opens the published camera track with the other facing; an unknown facing reports the requested one', async () => {
  const restartTrack = vi.fn(async () => {});
  const room = { localParticipant: { getTrackPublication: () => ({ track: { kind: 'video', restartTrack, mediaStreamTrack: {} } }) } };
  await expect(switchLocalCamera(room as never, 'environment', cameraSdk as never)).resolves.toBe('environment');
  expect(restartTrack).toHaveBeenCalledWith({ facingMode: 'environment' });
});
it('RTC-02: refuses without a published camera track or without the video runtime', async () => {
  const none = { localParticipant: { getTrackPublication: () => undefined } };
  await expect(switchLocalCamera(none as never, 'user', cameraSdk as never)).rejects.toThrow();
  const audioOnly = { localParticipant: { getTrackPublication: () => ({ track: { kind: 'audio' } }) } };
  await expect(switchLocalCamera(audioOnly as never, 'user', cameraSdk as never)).rejects.toThrow();
  await expect(switchLocalCamera(none as never, 'user', null)).rejects.toThrow();
});
it('stops acquired but unpublished tracks immediately when backgrounded during publication', async () => {
  const pending = deferred<void>();
  const stop = vi.fn(); const publish = vi.fn(() => pending.promise); const onRoom = vi.fn();
  const sdk = { client: { RoomEvent: { Disconnected: 'disconnected' }, Room: class { on = () => {}; off = () => {}; localParticipant = { trackPublications: new Map(), publishTrack: publish }; connect = async () => {}; disconnect = async () => {}; },
    createLocalTracks: async () => [{ stop }, { stop }] }, native: { AudioSession: { startAudioSession: async () => {}, stopAudioSession: async () => {} } } };
  const media = createNativeCallMedia(onRoom, sdk as unknown as NonNullable<Parameters<typeof createNativeCallMedia>[1]>);
  const joining = media.connect('wss://test.invalid', 'synthetic-token'); await flush();
  expect(publish).toHaveBeenCalledOnce();
  media.stop(); expect(stop).toHaveBeenCalledTimes(2);
  pending.resolve(); await joining;
  expect(publish).toHaveBeenCalledOnce();
  expect(onRoom).not.toHaveBeenCalledWith(expect.objectContaining({ localParticipant: expect.anything() }));
});
it('stops late acquired tracks before any publication after navigation', async () => {
  const pending = deferred<{ stop: () => void }[]>(); const stop = vi.fn(); const publish = vi.fn();
  const sdk = { client: { RoomEvent: { Disconnected: 'disconnected' }, Room: class { on = () => {}; off = () => {}; localParticipant = { trackPublications: new Map(), publishTrack: publish }; connect = async () => {}; disconnect = async () => {}; },
    createLocalTracks: () => pending.promise }, native: { AudioSession: { startAudioSession: async () => {}, stopAudioSession: async () => {} } } };
  const media = createNativeCallMedia(() => {}, sdk as unknown as NonNullable<Parameters<typeof createNativeCallMedia>[1]>);
  const joining = media.connect('wss://test.invalid', 'synthetic-token'); await flush();
  media.stop(); pending.resolve([{ stop }]); await joining;
  expect(stop).toHaveBeenCalledOnce(); expect(publish).not.toHaveBeenCalled();
});

it('a final room disconnect releases owned media and reports it to the session', async () => {
  const listeners = new Map<string, () => void>();
  const stop = vi.fn(), stopAudioSession = vi.fn(async () => {}), onRoom = vi.fn(), disconnected = vi.fn();
  const sdk = { client: { RoomEvent: { Disconnected: 'disconnected' }, Room: class {
    localParticipant = { trackPublications: new Map(), publishTrack: async () => {} };
    connect = async () => {}; disconnect = async () => {};
    on(event: string, listener: () => void) { listeners.set(event, listener); }
    off(event: string) { listeners.delete(event); }
  }, createLocalTracks: async () => [{ stop }] }, native: { AudioSession: { startAudioSession: async () => {}, stopAudioSession } } };
  const media = createNativeCallMedia(onRoom, sdk as unknown as NonNullable<Parameters<typeof createNativeCallMedia>[1]>, disconnected);
  await media.connect('wss://test.invalid', 'synthetic-token');
  listeners.get('disconnected')?.();
  expect(onRoom).toHaveBeenLastCalledWith(null);
  expect(stop).toHaveBeenCalled();
  expect(stopAudioSession).toHaveBeenCalled();
  expect(disconnected).toHaveBeenCalledOnce();
});

function eventRuntime(createLocalTracks: () => Promise<{ stop: () => void }[]> = async () => [{ stop: vi.fn() }]) {
  const listeners = new Set<() => void>();
  const stopped = vi.fn(async () => {}), publish = vi.fn(async () => {});
  const sdk = { client: { RoomEvent: { Disconnected: 'disconnected' }, Room: class {
    private ownListeners = new Set<() => void>();
    localParticipant = { trackPublications: new Map(), publishTrack: publish };
    connect = async () => {}; disconnect = async () => { for (const listener of this.ownListeners) listener(); };
    on(_event: string, listener: () => void) { listeners.add(listener); this.ownListeners.add(listener); }
    off(_event: string, listener: () => void) { listeners.delete(listener); this.ownListeners.delete(listener); }
  }, createLocalTracks }, native: { AudioSession: { startAudioSession: async () => {}, stopAudioSession: stopped } } };
  return { sdk: sdk as unknown as NonNullable<Parameters<typeof createNativeCallMedia>[1]>, listeners, stopped, publish };
}

it('intentional stop removes the disconnect listener and ignores an already queued final event', async () => {
  const runtime = eventRuntime(), disconnected = vi.fn();
  const media = createNativeCallMedia(() => {}, runtime.sdk, disconnected);
  await media.connect('wss://test.invalid', 'synthetic-token');
  const queued = [...runtime.listeners][0];
  media.stop(); queued();
  expect(runtime.listeners.size).toBe(0);
  expect(disconnected).not.toHaveBeenCalled();
});

it('a final disconnect during capture stops late tracks without publishing or restoring the room', async () => {
  const pending = deferred<{ stop: () => void }[]>(), stop = vi.fn();
  const runtime = eventRuntime(() => pending.promise), onRoom = vi.fn(), disconnected = vi.fn();
  const media = createNativeCallMedia(onRoom, runtime.sdk, disconnected);
  const joining = media.connect('wss://test.invalid', 'synthetic-token'); await flush();
  const queued = [...runtime.listeners][0]; queued(); queued();
  pending.resolve([{ stop }]); await joining;
  expect(stop).toHaveBeenCalled();
  expect(runtime.publish).not.toHaveBeenCalled();
  expect(onRoom.mock.calls.every(([room]) => room === null)).toBe(true);
  expect(disconnected).toHaveBeenCalledOnce();
  expect(runtime.listeners.size).toBe(0);
});

it('a retired media owner cannot stop the newer owner audio session', async () => {
  const runtime = eventRuntime();
  const first = createNativeCallMedia(() => {}, runtime.sdk);
  await first.connect('wss://test.invalid', 'synthetic-token');
  const second = createNativeCallMedia(() => {}, runtime.sdk);
  await second.connect('wss://test.invalid', 'synthetic-token');
  first.stop();
  expect(runtime.stopped).not.toHaveBeenCalled();
  second.stop();
  expect(runtime.stopped).toHaveBeenCalledOnce();
});

it('a failed publish still attempts local cleanup when disconnect and audio stop reject', async () => {
  const stop = vi.fn(), disconnected = vi.fn(), onRoom = vi.fn();
  const runtime = eventRuntime(async () => [{ stop }]);
  runtime.publish.mockRejectedValueOnce(new Error('synthetic publish failure'));
  runtime.stopped.mockRejectedValueOnce(new Error('synthetic audio cleanup failure'));
  const OriginalRoom = runtime.sdk.client.Room;
  const disconnect = vi.fn(async () => { throw new Error('synthetic disconnect failure'); });
  const sdk = { ...runtime.sdk, client: { ...runtime.sdk.client, Room: class extends OriginalRoom { disconnect = disconnect; } } };
  const media = createNativeCallMedia(onRoom, sdk, disconnected);
  await expect(media.connect('wss://test.invalid', 'synthetic-token')).rejects.toThrow('synthetic publish failure');
  await flush();
  expect(stop).toHaveBeenCalledOnce();
  expect(disconnect).toHaveBeenCalledWith(true);
  expect(runtime.stopped).toHaveBeenCalledOnce();
  expect(runtime.listeners.size).toBe(0);
  expect(onRoom).not.toHaveBeenCalled();
  expect(disconnected).not.toHaveBeenCalled();
});
