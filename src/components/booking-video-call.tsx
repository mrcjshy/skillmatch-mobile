import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState, PermissionsAndroid, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Room } from 'livekit-client';
import { AppSymbol } from '@/components/app-symbol';
import { useAccount } from '@/providers/account-provider';
import { createVideoCallApi, createVideoSession, validCallId, type VideoSessionView } from '@/lib/video-call';
import { callPresentation, counterpartLabel, type CallAction } from '@/lib/video-call-view';
import { createNativeCallMedia, loadVideoRuntime } from '@/lib/native-video-call';
import { subscribeInvalidation, userNotificationsTopic } from '@/lib/realtime';

/** Call surfaces are always dark so video and white controls keep their contrast in either theme. */
const CALL = { canvas: '#0B0F14', panel: 'rgba(255,255,255,0.14)', text: '#FFFFFF', muted: 'rgba(255,255,255,0.72)',
  danger: '#E5484D', accept: '#2F9E44', active: '#FFFFFF', onActive: '#0B0F14' };

export default function BookingVideoCall({ bookingId }: { bookingId: string | null }) {
  const { account, status } = useAccount();
  const allowed = status === 'resolved' && account?.is_active && (account.role === 'worker' || account.role === 'client');
  if (!allowed || !validCallId(bookingId)) return <View style={styles.root}><Text style={styles.message}>Video call unavailable.</Text></View>;
  return <CallScreen key={`${account.id}:${bookingId}`} bookingId={bookingId} accountId={account.id} role={account.role as 'worker' | 'client'} />;
}

function CallScreen({ bookingId, accountId, role }: { bookingId: string; accountId: string; role: 'worker' | 'client' }) {
  const owner = useRef<ReturnType<typeof createVideoSession> | null>(null);
  const focused = useRef(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<VideoSessionView>({ call: null, busy: false, connected: false, message: null, cleanupPending: false });
  const [room, setRoom] = useState<Room | null>(null);
  const [ended, setEnded] = useState(false);
  const [permissionNote, setPermissionNote] = useState<string | null>(null);
  const permissionBusy = useRef(false);
  useLayoutEffect(() => {
    let mounted = true;
    const session = createVideoSession({ bookingId, request: createVideoCallApi().request,
      media: () => createNativeCallMedia(next => { if (mounted) setRoom(next); }),
      onChange: next => { if (mounted) setView(next); } });
    owner.current = session;
    const update = (state: string) => { session.setActive(focused.current && state === 'active'); if (state === 'active') void session.refresh(); };
    const subscription = AppState.addEventListener('change', update);
    update(AppState.currentState);
    const unsubscribe = subscribeInvalidation({ topic: userNotificationsTopic(accountId), events: ['call_state_changed'], onInvalidate: () => void session.refresh() });
    return () => { mounted = false; subscription.remove(); unsubscribe(); session.end(); owner.current = null; };
  }, [bookingId, accountId]);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    owner.current?.setActive(AppState.currentState === 'active');
    void owner.current?.refresh();
    return () => { focused.current = false; owner.current?.end(); setEnded(true); };
  }, []));
  async function act(action: 'start' | 'accept' | 'rejoin') {
    if (permissionBusy.current || ended) return;
    permissionBusy.current = true;
    try {
      if (!loadVideoRuntime()) { setPermissionNote('Video calling is unavailable in this installation. A compatible native build is required.'); return; }
      if (action !== 'start' && Platform.OS === 'android') {
        const result = await PermissionsAndroid.requestMultiple([PermissionsAndroid.PERMISSIONS.CAMERA, PermissionsAndroid.PERMISSIONS.RECORD_AUDIO]);
        if (Object.values(result).some(value => value !== PermissionsAndroid.RESULTS.GRANTED)) {
          setPermissionNote('Allow camera and microphone access to join. You can continue using booking chat.'); return;
        }
      }
      if (!focused.current || AppState.currentState !== 'active') return;
      setPermissionNote(null); await owner.current?.act(action);
    } finally { permissionBusy.current = false; }
  }
  const finish = () => { setEnded(true); owner.current?.end(); };
  const presentation = callPresentation({ view, ended });
  const who = counterpartLabel(role);
  const live = room !== null && view.connected && !ended;
  const leavable = presentation.stage === 'idle' || presentation.stage === 'finished' || presentation.stage === 'closed';
  const run: Record<CallAction, () => void> = {
    start: () => void act('start'), accept: () => void act('accept'), join: () => void act('rejoin'),
    decline: finish, cancel: finish, end: finish, retry_end: () => owner.current?.retryEnd(),
  };
  const controls = presentation.actions.map(action => <RoundControl key={action} {...CONTROL[action]} disabled={view.busy && action !== 'end' && action !== 'cancel' && action !== 'decline' && action !== 'retry_end'} onPress={run[action]} />);
  return <View style={styles.root}>
    <StatusBar style="light" />
    {live ? <CallTracks room={room} counterpart={who} previewTop={insets.top + 72} /> : null}
    <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
      {leavable ? <Pressable accessibilityRole="button" accessibilityLabel="Navigate up" style={styles.iconButton} onPress={() => router.back()}>
        <AppSymbol name={{ android: 'arrow_back', ios: 'chevron.left' }} size={24} tintColor={CALL.text} />
      </Pressable> : <View style={styles.iconSpacer} />}
      <View style={styles.topCopy}>
        <Text numberOfLines={1} style={styles.topTitle}>{who}</Text>
        {live ? <Text accessibilityLiveRegion="polite" style={styles.topStatus}>{presentation.status}</Text> : null}
      </View>
      {!ended && !live ? <Pressable accessibilityRole="button" accessibilityLabel="Refresh call status" style={styles.iconButton} onPress={() => void owner.current?.refresh()}>
        <AppSymbol name={{ android: 'refresh', ios: 'arrow.clockwise' }} size={22} tintColor={CALL.text} />
      </Pressable> : <View style={styles.iconSpacer} />}
    </View>
    {!live ? <View style={styles.center}>
      <View style={styles.avatar}><AppSymbol name={{ android: 'person', ios: 'person.fill' }} size={56} tintColor={CALL.text} /></View>
      <Text style={styles.name}>{who}</Text>
      <Text accessibilityLiveRegion="polite" style={styles.status}>{presentation.status}</Text>
      <Text style={styles.privacy}>Camera and microphone are shared only with this booking’s participant. No recording or screen sharing. Leaving this screen ends your call; backgrounding stops camera and microphone.</Text>
    </View> : null}
    <View style={[styles.bottom, { paddingBottom: insets.bottom + 24 }]}>
      {permissionNote || view.message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{permissionNote ?? view.message}</Text> : null}
      {view.call?.counterpart_away ? <Text style={styles.message}>The other participant is away.</Text> : null}
      <View style={styles.controls}>
        {live ? <MediaToggles room={room} /> : null}
        {controls}
      </View>
    </View>
  </View>;
}

const CONTROL: Record<CallAction, { label: string; icon: { android: string; ios: string }; tone: 'danger' | 'accept' | 'neutral' }> = {
  start: { label: 'Start video call', icon: { android: 'videocam', ios: 'video.fill' }, tone: 'accept' },
  accept: { label: 'Accept video call', icon: { android: 'call', ios: 'phone.fill' }, tone: 'accept' },
  join: { label: 'Join video call', icon: { android: 'videocam', ios: 'video.fill' }, tone: 'accept' },
  decline: { label: 'Decline call', icon: { android: 'call_end', ios: 'phone.down.fill' }, tone: 'danger' },
  cancel: { label: 'Cancel call', icon: { android: 'call_end', ios: 'phone.down.fill' }, tone: 'danger' },
  end: { label: 'End call', icon: { android: 'call_end', ios: 'phone.down.fill' }, tone: 'danger' },
  retry_end: { label: 'Retry ending call', icon: { android: 'refresh', ios: 'arrow.clockwise' }, tone: 'neutral' },
};

function RoundControl({ label, icon, tone, onPress, disabled = false, selected }: {
  label: string; icon: { android: string; ios: string }; tone: 'danger' | 'accept' | 'neutral' | 'active';
  onPress: () => void; disabled?: boolean; selected?: boolean;
}) {
  const fill = tone === 'danger' ? CALL.danger : tone === 'accept' ? CALL.accept : tone === 'active' ? CALL.active : CALL.panel;
  return <View style={styles.control}>
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.controlButton, { backgroundColor: fill, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }]}>
      <AppSymbol name={icon as never} size={26} tintColor={tone === 'active' ? CALL.onActive : CALL.text} />
    </Pressable>
    <Text numberOfLines={2} style={styles.controlLabel}>{label}</Text>
  </View>;
}

/** Microphone and camera toggles over the existing published tracks (LiveKit mute/unmute; no new native API). */
function MediaToggles({ room }: { room: Room }) {
  // Reads the mutable LiveKit participant on every redraw (see CallTracks).
  'use no memo';
  const [, redraw] = useState(0);
  const sdk = loadVideoRuntime();
  useLayoutEffect(() => {
    if (!sdk) return;
    const update = () => redraw(value => value + 1);
    const events = [sdk.client.RoomEvent.TrackMuted, sdk.client.RoomEvent.TrackUnmuted, sdk.client.RoomEvent.LocalTrackPublished];
    for (const event of events) room.on(event, update);
    return () => { for (const event of events) room.off(event, update); };
  }, [room, sdk]);
  const local = room.localParticipant;
  const micOn = local.isMicrophoneEnabled;
  const cameraOn = local.isCameraEnabled;
  const toggle = (change: Promise<unknown>) => { void change.catch(() => {}).finally(() => redraw(value => value + 1)); };
  return <>
    <RoundControl label={micOn ? 'Mute microphone' : 'Unmute microphone'} icon={micOn ? { android: 'mic', ios: 'mic.fill' } : { android: 'mic_off', ios: 'mic.slash.fill' }}
      tone={micOn ? 'neutral' : 'active'} selected={!micOn} onPress={() => toggle(local.setMicrophoneEnabled(!micOn))} />
    <RoundControl label={cameraOn ? 'Turn camera off' : 'Turn camera on'} icon={cameraOn ? { android: 'videocam', ios: 'video.fill' } : { android: 'videocam_off', ios: 'video.slash.fill' }}
      tone={cameraOn ? 'neutral' : 'active'} selected={!cameraOn} onPress={() => toggle(local.setCameraEnabled(!cameraOn))} />
  </>;
}

function CallTracks({ room, counterpart, previewTop }: { room: Room; counterpart: string; previewTop: number }) {
  // LiveKit mutates room.remoteParticipants and publications in place; React
  // Compiler would cache the tiles on those unchanged references, so a counterpart
  // who joins after this device never appears. Re-read the room on every redraw.
  'use no memo';
  const [, redraw] = useState(0);
  const sdk = loadVideoRuntime();
  useLayoutEffect(() => {
    if (!sdk) return;
    const update = () => redraw(value => value + 1);
    const events = [sdk.client.RoomEvent.TrackSubscribed, sdk.client.RoomEvent.TrackUnsubscribed, sdk.client.RoomEvent.LocalTrackPublished, sdk.client.RoomEvent.TrackMuted, sdk.client.RoomEvent.TrackUnmuted, sdk.client.RoomEvent.ParticipantDisconnected];
    for (const event of events) room.on(event, update);
    return () => { for (const event of events) room.off(event, update); };
  }, [room, sdk]);
  if (!sdk) return null;
  const VideoTrack = sdk.native.VideoTrack;
  const source = sdk.client.Track.Source.Camera;
  const remote = [...room.remoteParticipants.values()][0];
  const remoteCamera = remote?.getTrackPublication(source);
  const localCamera = room.localParticipant.getTrackPublication(source);
  return <View style={StyleSheet.absoluteFill}>
    {/* The counterpart fills the screen. */}
    {remote && remoteCamera?.track && !remoteCamera.isMuted
      ? <VideoTrack style={StyleSheet.absoluteFill} objectFit="cover" trackRef={{ participant: remote, publication: remoteCamera, source }} />
      : <View style={styles.remotePlaceholder}>
        <View style={styles.avatar}><AppSymbol name={{ android: 'person', ios: 'person.fill' }} size={56} tintColor={CALL.text} /></View>
        <Text style={styles.status}>{remote ? `${counterpart}: Camera off` : `Waiting for ${counterpart} to join`}</Text>
      </View>}
    {/* Your own camera: a small floating preview inside the safe area. */}
    <View style={[styles.preview, { top: previewTop }]} accessibilityLabel="Your camera preview">
      {localCamera?.track && !localCamera.isMuted
        ? <VideoTrack style={StyleSheet.absoluteFill} objectFit="cover" mirror zOrder={1} trackRef={{ participant: room.localParticipant, publication: localCamera, source }} />
        : <View style={styles.previewOff}><Text style={styles.previewText}>Your camera is off</Text></View>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: CALL.canvas },
  topBar: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8,
    backgroundColor: 'rgba(0,0,0,0.28)', paddingBottom: 8 },
  topCopy: { flex: 1, minWidth: 0 },
  topTitle: { color: CALL.text, fontSize: 18, fontWeight: '700' },
  topStatus: { color: CALL.muted, fontSize: 13 },
  iconButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  iconSpacer: { width: 48, height: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  avatar: { width: 112, height: 112, borderRadius: 56, backgroundColor: CALL.panel, alignItems: 'center', justifyContent: 'center' },
  name: { color: CALL.text, fontSize: 26, fontWeight: '700', textAlign: 'center' },
  status: { color: CALL.muted, fontSize: 17, textAlign: 'center' },
  privacy: { color: CALL.muted, fontSize: 13, textAlign: 'center', marginTop: 12 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, gap: 12, paddingTop: 16, backgroundColor: 'rgba(0,0,0,0.28)' },
  message: { color: CALL.text, fontSize: 14, textAlign: 'center' },
  controls: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 20 },
  control: { alignItems: 'center', width: 84, gap: 6 },
  controlButton: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  controlLabel: { color: CALL.text, fontSize: 12, textAlign: 'center' },
  remotePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 },
  preview: { position: 'absolute', right: 16, width: 112, height: 150, borderRadius: 16, overflow: 'hidden', backgroundColor: '#1C232B',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)' },
  previewOff: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 8 },
  previewText: { color: CALL.muted, fontSize: 12, textAlign: 'center' },
});
