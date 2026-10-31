import type { Room } from 'livekit-client';
import type { CallMedia } from './video-call';

type Runtime = { native: typeof import('@livekit/react-native'); client: typeof import('livekit-client') };
let runtime: Runtime | null | undefined;
let audioOwner = 0;
/** Never load WebRTC during app bootstrap; old APKs retain a usable fallback. */
export function loadVideoRuntime(): Runtime | null {
  if (runtime !== undefined) return runtime;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const native = require('@livekit/react-native') as Runtime['native'];
    native.registerGlobals();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    runtime = { native, client: require('livekit-client') as Runtime['client'] };
  } catch { runtime = null; }
  return runtime;
}

export function createNativeCallMedia(onRoom: (room: Room | null) => void, sdk: Runtime | null = loadVideoRuntime(), onDisconnected: () => void = () => {}): CallMedia {
  if (!sdk) throw new Error('Video calling needs a compatible SkillMatch build. Your current installation can still use booking chat.');
  const room = new sdk.client.Room();
  let stopped = false;
  const ownAudio = ++audioOwner;
  let tracks: Awaited<ReturnType<Runtime['client']['createLocalTracks']>> = [];
  const halt = () => {
    room.off(sdk.client.RoomEvent.Disconnected, disconnected);
    for (const track of tracks) track.stop();
    for (const publication of room.localParticipant.trackPublications.values()) publication.track?.stop();
    void room.disconnect(true).catch(() => {});
    if (audioOwner === ownAudio) void sdk.native.AudioSession.stopAudioSession().catch(() => {});
  };
  const disconnected = () => {
    if (stopped) return;
    stopped = true;
    halt(); onRoom(null); onDisconnected();
  };
  room.on(sdk.client.RoomEvent.Disconnected, disconnected);
  return {
    async connect(url, token) {
      try {
        await sdk.native.AudioSession.startAudioSession();
        if (stopped) { halt(); return; }
        await room.connect(url, token);
        if (stopped) { halt(); return; }
        // Own capture handles before publication can await a network response.
        tracks = await sdk.client.createLocalTracks({ audio: true, video: true });
        if (stopped) { halt(); return; }
        for (const track of tracks) {
          await room.localParticipant.publishTrack(track);
          if (stopped) { halt(); return; }
        }
        onRoom(room);
      } catch (error) { stopped = true; halt(); throw error; }
    },
    stop() { stopped = true; halt(); onRoom(null); },
  };
}
