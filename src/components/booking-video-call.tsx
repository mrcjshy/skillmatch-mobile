import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { AccessibilityInfo, Animated, AppState, Easing, PermissionsAndroid, Platform, Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Room } from 'livekit-client';
import { AppSymbol } from '@/components/app-symbol';
import { useAccount } from '@/providers/account-provider';
import { createVideoCallApi, createVideoSession, validCallId, type VideoSessionView } from '@/lib/video-call';
import { callPresentation, callToAutoJoin, counterpartLabel, formatCallDuration, ringEffects, type CallAction } from '@/lib/video-call-view';
import { callAlert } from '@/lib/call-alert';
import { takePendingCallChoice } from '@/lib/push-notifications';
import { createNativeCallMedia, loadVideoRuntime, localCameraFacing, switchLocalCamera, type CameraFacing } from '@/lib/native-video-call';
import { subscribeInvalidation, userNotificationsTopic } from '@/lib/realtime';

/** Call surfaces are always dark so video and white controls keep their contrast in either theme. */
const CALL = { canvas: '#05070D', panel: 'rgba(255,255,255,0.16)', dock: 'rgba(16,18,26,0.78)', text: '#FFFFFF', muted: 'rgba(255,255,255,0.74)',
  faint: 'rgba(255,255,255,0.12)', danger: '#F0443A', accept: '#22C55E', active: '#FFFFFF', onActive: '#0B0F14' };
/** RTC-07 (owner 2026-11-08, "premium like Messenger"): SkillMatch cobalt fading to night behind every non-video state. */
const LOBBY = ['#2B4FD8', '#142A7A', '#070B1A'] as const;
const AVATAR = ['#5B7CFF', '#2440B8'] as const;
const SCRIM_TOP = ['rgba(0,0,0,0.62)', 'rgba(0,0,0,0)'] as const;
const SCRIM_BOTTOM = ['rgba(0,0,0,0)', 'rgba(0,0,0,0.66)'] as const;
/** OEM fonts (Infinix XOS) render wider than React Native measures and clip the last word; the system font does not. */
const FONT: TextStyle = Platform.OS === 'android' ? { fontFamily: 'sans-serif' } : {};
const PRIVACY = 'Camera and microphone are shared only with this booking’s participant. No recording or screen sharing. Leaving this screen ends your call; backgrounding stops camera and microphone.';

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
  // RTC-02: every new connection starts on the front camera.
  const [facing, setFacing] = useState<CameraFacing>('user');
  const [ended, setEnded] = useState(false);
  const [permissionNote, setPermissionNote] = useState<string | null>(null);
  // RTC-05: Answer tapped on the call notification; show Connecting while it is accepted.
  const [answering, setAnswering] = useState(false);
  const permissionBusy = useRef(false);
  const autoJoined = useRef<string | null>(null);
  useLayoutEffect(() => {
    let mounted = true;
    const session = createVideoSession({ bookingId, request: createVideoCallApi().request,
      media: onDisconnected => createNativeCallMedia(next => { if (mounted) { setRoom(next); setFacing('user'); } }, undefined, onDisconnected),
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
  // Whoever placed the call connects as soon as it is answered; nobody should have to tap Join.
  useEffect(() => {
    const callId = callToAutoJoin(view, ended, autoJoined.current);
    if (!callId) return;
    autoJoined.current = callId;
    void act('rejoin');
  });
  const finish = () => { setEnded(true); owner.current?.end(); };
  // RTC-03: ringback for the caller; the callee's ringing stops once the call stops ringing for them,
  // or once they end it here (finish sets ended).
  const ring = ringEffects({ view, ended });
  useEffect(() => {
    if (ring.ringback) callAlert.startRingback(); else callAlert.stopRingback();
  }, [ring.ringback]);
  useEffect(() => {
    if (ring.stopIncomingRing) callAlert.cancelIncoming();
  }, [ring.stopIncomingRing]);
  // Leaving the screen of a call that rings for you declines it (session end), so its ringing stops too.
  const ringingHere = useRef(false);
  useEffect(() => { ringingHere.current = view.call?.role === 'callee' && view.call.state === 'ringing'; });
  useEffect(() => () => {
    callAlert.stopRingback();
    callAlert.showWhenLocked(false);
    if (ringingHere.current) callAlert.cancelIncoming();
  }, []);
  // RTC-03: Answer or Decline already chosen on the ringing notification, applied once.
  useEffect(() => {
    const call = view.call;
    if (ended || !call || call.role !== 'callee' || call.state !== 'ringing') return;
    const choice = takePendingCallChoice(call.call_id);
    if (!choice) return;
    callAlert.cancelIncoming();
    if (choice === 'answer') void Promise.resolve().then(() => { setAnswering(true); return act('accept'); }).finally(() => setAnswering(false));
    else void Promise.resolve().then(finish);
  });
  const presentation = callPresentation({ view, ended, answering });
  const who = counterpartLabel(role);
  const live = room !== null && view.connected && !ended;
  const leavable = presentation.stage === 'idle' || presentation.stage === 'finished' || presentation.stage === 'closed';
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace((role === 'worker' ? '/worker/bookings' : '/client/bookings') as Href);
  };
  // RTC-07: like Messenger, a call you end or decline here closes its screen once the end is confirmed, so a
  // locked phone goes straight back to its lock screen. An unconfirmed end keeps the screen with Retry.
  const closedHere = useRef(false);
  const finishHere = () => { closedHere.current = true; finish(); };
  useEffect(() => {
    if (!ended || !closedHere.current || view.cleanupPending) return;
    const timer = setTimeout(() => { if (focused.current) goBack(); }, 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ended, view.cleanupPending]);
  // RTC-07: the live call timer.
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  /* eslint-disable react-hooks/set-state-in-effect -- the timer starts and stops with the live connection */
  useEffect(() => {
    if (!live) { setConnectedAt(null); return; }
    setConnectedAt(at => at ?? Date.now());
    setClock(Date.now());
    const tick = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [live]);
  /* eslint-enable react-hooks/set-state-in-effect */
  const run: Record<CallAction, () => void> = {
    start: () => void act('start'), accept: () => { callAlert.cancelIncoming(); void act('accept'); }, join: () => void act('rejoin'),
    decline: finishHere, cancel: finishHere, end: finishHere, retry_end: () => owner.current?.retryEnd(),
  };
  const controls = presentation.actions.map(action => {
    const control = action === 'start' && presentation.stage === 'finished' ? { ...CONTROL.start, label: 'Call again' } : CONTROL[action];
    return <RoundControl key={action} {...control} compact={live} disabled={view.busy && action !== 'end' && action !== 'cancel' && action !== 'decline' && action !== 'retry_end'} onPress={run[action]} />;
  });
  const ringing = presentation.stage === 'incoming' || presentation.stage === 'outgoing' || presentation.stage === 'connecting';
  const note = permissionNote ?? view.message ?? (view.call?.counterpart_away ? 'The other participant is away.' : null);
  return <View style={styles.root}>
    <StatusBar style="light" />
    {live ? <CallTracks room={room} counterpart={who} previewTop={insets.top + 76} facing={facing} />
      : <LinearGradient colors={LOBBY} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />}
    {live ? <LinearGradient colors={SCRIM_TOP} pointerEvents="none" style={[styles.scrimTop, { height: insets.top + 132 }]} /> : null}
    {live ? <LinearGradient colors={SCRIM_BOTTOM} pointerEvents="none" style={[styles.scrimBottom, { height: insets.bottom + 200 }]} /> : null}
    <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
      {leavable ? <Pressable accessibilityRole="button" accessibilityLabel="Navigate up" style={styles.iconButton} onPress={goBack}>
        <AppSymbol name={{ android: 'arrow_back', ios: 'chevron.left' }} size={24} tintColor={CALL.text} />
      </Pressable> : <View style={styles.iconSpacer} />}
      {/* Status stays live through call_state_changed, the ring deadline and foreground reads. */}
      {live ? <View style={styles.topCopy}>
        <Text numberOfLines={1} style={styles.topTitle}>{who}</Text>
        <Text accessibilityLiveRegion="polite" style={styles.topStatus}>{connectedAt === null ? presentation.status : formatCallDuration(clock - connectedAt)}</Text>
      </View> : <View style={styles.topCopy} />}
    </View>
    {!live ? <View style={styles.center}>
      <PulseAvatar pulsing={ringing} />
      <Text numberOfLines={2} style={styles.name}>{who}</Text>
      <Text accessibilityLiveRegion="polite" numberOfLines={2} style={styles.status}>{presentation.status}</Text>
      <View style={styles.privacyPill} accessible accessibilityLabel={PRIVACY}>
        <AppSymbol name={{ android: 'lock', ios: 'lock.fill' }} size={13} tintColor={CALL.muted} />
        <Text style={styles.privacyText}>Private to this booking · Not recorded</Text>
      </View>
    </View> : null}
    <View style={[styles.bottom, { paddingBottom: insets.bottom + (live ? 20 : 40) }]}>
      {note ? <Text accessibilityLiveRegion="polite" style={styles.message}>{note}</Text> : null}
      {live ? <View style={styles.dock}>
        <MediaToggles room={room} facing={facing} onFacing={setFacing} compact />
        {controls}
      </View> : <View style={styles.lobbyControls}>{controls}</View>}
    </View>
  </View>;
}

/** RTC-07: the counterpart's circle; while a call rings it sends out two soft rings, like Messenger. */
function PulseAvatar({ pulsing }: { pulsing: boolean }) {
  const [waves] = useState(() => [new Animated.Value(0), new Animated.Value(0)]);
  useEffect(() => {
    if (!pulsing) return;
    let stopped = false;
    const loops = waves.map(wave => Animated.loop(Animated.timing(wave, { toValue: 1, duration: 2000, easing: Easing.out(Easing.quad), useNativeDriver: true })));
    let second: ReturnType<typeof setTimeout> | undefined;
    void AccessibilityInfo.isReduceMotionEnabled().then(reduce => {
      if (stopped || reduce) return;
      loops[0].start();
      second = setTimeout(() => { if (!stopped) loops[1].start(); }, 1000);
    });
    return () => { stopped = true; clearTimeout(second); for (const loop of loops) loop.stop(); for (const wave of waves) wave.setValue(0); };
  }, [pulsing, waves]);
  return <View style={styles.avatarWrap}>
    {waves.map((wave, index) => <Animated.View key={index} pointerEvents="none" style={[styles.ring, {
      opacity: wave.interpolate({ inputRange: [0, 1], outputRange: [0.32, 0] }),
      transform: [{ scale: wave.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
    }]} />)}
    <LinearGradient colors={AVATAR} style={styles.avatarLarge}>
      <AppSymbol name={{ android: 'person', ios: 'person.fill' }} size={64} tintColor={CALL.text} />
    </LinearGradient>
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

/** A round call button: large and captioned before a call connects; icon-only inside the live dock (RTC-07). */
function RoundControl({ label, icon, tone, onPress, disabled = false, selected, compact = false }: {
  label: string; icon: { android: string; ios: string }; tone: 'danger' | 'accept' | 'neutral' | 'active';
  onPress: () => void; disabled?: boolean; selected?: boolean; compact?: boolean;
}) {
  const fill = tone === 'danger' ? CALL.danger : tone === 'accept' ? CALL.accept : tone === 'active' ? CALL.active : CALL.panel;
  return <View style={compact ? styles.controlCompact : styles.control}>
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [compact ? styles.controlButtonCompact : styles.controlButton,
        { backgroundColor: fill, opacity: disabled ? 0.4 : 1, transform: [{ scale: pressed ? 0.92 : 1 }] }]}>
      <AppSymbol name={icon as never} size={compact ? 24 : 30} tintColor={tone === 'active' ? CALL.onActive : CALL.text} />
    </Pressable>
    {compact ? null : <Text numberOfLines={2} style={styles.controlLabel}>{label}</Text>}
  </View>;
}

/**
 * Microphone and camera toggles over the existing published tracks (LiveKit mute/unmute; no new native API),
 * and RTC-02's Switch camera, which re-opens the camera track with the other facing.
 */
function MediaToggles({ room, facing = 'user', onFacing, compact = false }: { room: Room; facing?: CameraFacing; onFacing?: (next: CameraFacing) => void; compact?: boolean }) {
  // Reads the mutable LiveKit participant on every redraw (see CallTracks).
  'use no memo';
  const [, redraw] = useState(0);
  const [switching, setSwitching] = useState(false);
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
  const flip = () => {
    if (switching) return;
    const next: CameraFacing = facing === 'user' ? 'environment' : 'user';
    setSwitching(true);
    // RTC-06: mirror the preview for the camera really in use; after a failure, re-read it from the track.
    void switchLocalCamera(room, next).then(actual => onFacing?.(actual), () => onFacing?.(localCameraFacing(room) ?? facing))
      .finally(() => setSwitching(false));
  };
  return <>
    <RoundControl label={micOn ? 'Mute microphone' : 'Unmute microphone'} icon={micOn ? { android: 'mic', ios: 'mic.fill' } : { android: 'mic_off', ios: 'mic.slash.fill' }}
      tone={micOn ? 'neutral' : 'active'} selected={!micOn} compact={compact} onPress={() => toggle(local.setMicrophoneEnabled(!micOn))} />
    <RoundControl label={cameraOn ? 'Turn camera off' : 'Turn camera on'} icon={cameraOn ? { android: 'videocam', ios: 'video.fill' } : { android: 'videocam_off', ios: 'video.slash.fill' }}
      tone={cameraOn ? 'neutral' : 'active'} selected={!cameraOn} compact={compact} onPress={() => toggle(local.setCameraEnabled(!cameraOn).then(() => {
        // RTC-04: LiveKit re-opens the camera when it is turned back on; follow the camera it really opened.
        const now = cameraOn ? null : localCameraFacing(room);
        if (now) onFacing?.(now);
      }))} />
    <RoundControl label="Switch camera" icon={{ android: 'cameraswitch', ios: 'camera.rotate' }}
      tone="neutral" disabled={!cameraOn || switching} compact={compact} onPress={flip} />
  </>;
}

function CallTracks({ room, counterpart, previewTop, facing = 'user' }: { room: Room; counterpart: string; previewTop: number; facing?: CameraFacing }) {
  // LiveKit mutates room.remoteParticipants and publications in place; React
  // Compiler would cache the tiles on those unchanged references, so a counterpart
  // who joins after this device never appears. Re-read the room on every redraw.
  'use no memo';
  const [, redraw] = useState(0);
  const sdk = loadVideoRuntime();
  useLayoutEffect(() => {
    if (!sdk) return;
    const update = () => redraw(value => value + 1);
    const events = [sdk.client.RoomEvent.TrackSubscribed, sdk.client.RoomEvent.TrackUnsubscribed, sdk.client.RoomEvent.LocalTrackPublished, sdk.client.RoomEvent.TrackMuted, sdk.client.RoomEvent.TrackUnmuted, sdk.client.RoomEvent.ParticipantConnected, sdk.client.RoomEvent.ParticipantDisconnected];
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
        // RTC-06: a camera switch brings a new native track; remount the preview on it (RTC-04 saw it freeze on the old camera's last frame).
        ? <VideoTrack key={localCamera.track.mediaStreamTrack?.id} style={StyleSheet.absoluteFill} objectFit="cover" mirror={facing === 'user'} zOrder={1} trackRef={{ participant: room.localParticipant, publication: localCamera, source }} />
        : <View style={styles.previewOff}><Text style={styles.previewText}>Your camera is off</Text></View>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: CALL.canvas },
  scrimTop: { position: 'absolute', left: 0, right: 0, top: 0 },
  scrimBottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  topBar: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 4, paddingBottom: 8 },
  topCopy: { flex: 1, minWidth: 0 },
  topTitle: { ...FONT, color: CALL.text, fontSize: 18, fontWeight: '700' },
  topStatus: { ...FONT, color: CALL.muted, fontSize: 14, fontVariant: ['tabular-nums'] },
  iconButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  iconSpacer: { width: 48, height: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 120, gap: 10 },
  avatarWrap: { width: 132, height: 132, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  ring: { position: 'absolute', width: 132, height: 132, borderRadius: 66, backgroundColor: 'rgba(255,255,255,0.9)' },
  avatarLarge: { width: 132, height: 132, borderRadius: 66, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.28)' },
  avatar: { width: 112, height: 112, borderRadius: 56, backgroundColor: CALL.panel, alignItems: 'center', justifyContent: 'center' },
  name: { ...FONT, color: CALL.text, fontSize: 32, fontWeight: '700', textAlign: 'center', letterSpacing: -0.3 },
  status: { ...FONT, color: CALL.muted, fontSize: 17, textAlign: 'center' },
  privacyPill: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: CALL.faint },
  privacyText: { ...FONT, color: CALL.muted, fontSize: 12 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, gap: 14, paddingTop: 16, alignItems: 'center' },
  message: { ...FONT, color: CALL.text, fontSize: 14, textAlign: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.38)', overflow: 'hidden' },
  lobbyControls: { flexDirection: 'row', justifyContent: 'center', gap: 64 },
  dock: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 40, backgroundColor: CALL.dock,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)' },
  control: { alignItems: 'center', width: 96, gap: 10 },
  controlCompact: { alignItems: 'center' },
  controlButton: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  controlButtonCompact: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  controlLabel: { ...FONT, color: CALL.text, fontSize: 13, textAlign: 'center' },
  remotePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32, backgroundColor: '#0E1530' },
  preview: { position: 'absolute', right: 16, width: 112, height: 150, borderRadius: 16, overflow: 'hidden', backgroundColor: '#1C232B',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)', elevation: 8 },
  previewOff: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 8 },
  previewText: { ...FONT, color: CALL.muted, fontSize: 12, textAlign: 'center' },
});
