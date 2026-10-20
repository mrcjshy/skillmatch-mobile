import { expect, it, vi } from 'vitest';
import { createNativeCallMedia } from './native-video-call';
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
it('stops acquired but unpublished tracks immediately when backgrounded during publication', async () => {
  const pending = deferred<void>();
  const stop = vi.fn(); const publish = vi.fn(() => pending.promise); const onRoom = vi.fn();
  const sdk = { client: { Room: class { localParticipant = { trackPublications: new Map(), publishTrack: publish }; connect = async () => {}; disconnect = async () => {}; },
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
  const sdk = { client: { Room: class { localParticipant = { trackPublications: new Map(), publishTrack: publish }; connect = async () => {}; disconnect = async () => {}; },
    createLocalTracks: () => pending.promise }, native: { AudioSession: { startAudioSession: async () => {}, stopAudioSession: async () => {} } } };
  const media = createNativeCallMedia(() => {}, sdk as unknown as NonNullable<Parameters<typeof createNativeCallMedia>[1]>);
  const joining = media.connect('wss://test.invalid', 'synthetic-token'); await flush();
  media.stop(); pending.resolve([{ stop }]); await joining;
  expect(stop).toHaveBeenCalledOnce(); expect(publish).not.toHaveBeenCalled();
});
