import type { LocalVideoTrack, Room } from 'livekit-client';
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

/** RTC-02 (owner, 2026-11-06): which camera the call is sending; calls start on the front camera. */
export type CameraFacing = 'user' | 'environment';

/**
 * Re-opens the published camera with the other facing; LiveKit swaps it into the same publication.
 * Resolves to the camera the track really uses afterwards (the requested one when the runtime cannot tell).
 *
 * RTC-06 (Infinix + TECNO, 2026-11-08): do not use `applyConstraints` here. LiveKit's WebRTC fork keeps the
 * track's first camera for it (CameraCaptureController.applyConstraints reads the initial facingMode), so
 * RTC-04's in-place switch never left the front camera; only the preview's mirroring flipped.
 */
export async function switchLocalCamera(room: Room, facing: CameraFacing, sdk: Runtime | null = loadVideoRuntime()): Promise<CameraFacing> {
  if (!sdk) throw new Error('Video calling is unavailable in this installation.');
  const track = room.localParticipant.getTrackPublication(sdk.client.Track.Source.Camera)?.track;
  if (!track || track.kind !== 'video') throw new Error('Your camera is not available right now.');
  const started = Date.now();
  try {
    await (track as LocalVideoTrack).restartTrack({ facingMode: facing });
  } catch (error) {
    console.warn(`[RTC-06] camera switch requested=${facing} failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
  const actual = localCameraFacing(room, sdk);
  // One line per switch in the device log (ReactNativeJS), so a phone that keeps the old camera is visible.
  console.info(`[RTC-06] camera switch requested=${facing} actual=${actual ?? 'unknown'} track=${(track as LocalVideoTrack).mediaStreamTrack?.id ?? '?'} ms=${Date.now() - started}`);
  return actual ?? facing;
}

/** RTC-04: the facing the published camera track really uses, or null when unknown. */
export function localCameraFacing(room: Room, sdk: Runtime | null = loadVideoRuntime()): CameraFacing | null {
  if (!sdk) return null;
  const track = room.localParticipant.getTrackPublication(sdk.client.Track.Source.Camera)?.track;
  const media = track?.mediaStreamTrack as unknown as { getSettings?: () => { facingMode?: string } } | undefined;
  const facing = typeof media?.getSettings === 'function' ? media.getSettings().facingMode : undefined;
  return facing === 'user' || facing === 'environment' ? facing : null;
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
