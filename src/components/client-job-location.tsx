import { useCallback, useRef, useState } from 'react';
import { AppState, Modal, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { AppButton } from './app-button';
import { JobLocationPicker } from './job-location-picker';
import { WorkerAssignedJobLocation, nativeJobMapsLoaded } from './job-location-map';
import { readOpenJobLocation, saveOpenJobLocation } from '@/lib/client-job-location';
import { classifyMapAvailability, projectAssignedWorkerLocation, type AuthorizedJobLocation } from '@/lib/job-location';
import type { CanonicalJobLocation } from '@/lib/canonical-job-location';
import { NOTIFICATION_INSERTED, subscribeInvalidation, userNotificationsTopic } from '@/lib/realtime';

/** Modal lifetime owns protected data. No cached location survives blur/background. */
export function ClientJobLocation({ jobId, clientId, onClose }: { jobId: string; clientId: string; onClose: () => void }) {
  const generation = useRef(0);
  const saving = useRef(false);
  const focused = useRef(false);
  const [location, setLocation] = useState<AuthorizedJobLocation | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const clear = useCallback(() => {
    generation.current += 1;
    setLocation(null);
    setEditing(false);
  }, []);
  const refresh = useCallback(async () => {
    clear();
    const token = generation.current;
    setNote(null);
    try {
      const current = await readOpenJobLocation(jobId, clientId);
      if (token === generation.current) setLocation(current);
    } catch (error) {
      if (token === generation.current) setNote(error instanceof Error ? error.message : 'Location unavailable.');
    }
  }, [clear, jobId, clientId]);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    if (AppState.currentState === 'active') void refresh();
    const listener = AppState.addEventListener('change', (state) => {
      clear();
      if (state === 'active' && !saving.current) void refresh();
    });
    // Acceptance already emits an own-user notification. Treat it only as a
    // reason to reread; never consume its payload as Job authority.
    const unsubscribe = subscribeInvalidation({
      topic: userNotificationsTopic(clientId), events: [NOTIFICATION_INSERTED],
      onUnavailable: clear,
      onInvalidate: () => { clear(); if (AppState.currentState === 'active' && !saving.current) void refresh(); },
    });
    return () => { focused.current = false; clear(); listener.remove(); unsubscribe(); };
  }, [clear, refresh, clientId]));
  async function save(pair: CanonicalJobLocation) {
    if (saving.current || !location) return;
    saving.current = true;
    setBusy(true);
    setEditing(false);
    clear();
    const token = generation.current;
    let saved = false;
    try {
      await saveOpenJobLocation(jobId, pair);
      saved = true;
    } catch (error) {
      if (token === generation.current) setNote(error instanceof Error ? error.message : 'Save was not confirmed. Refresh before trying again.');
    } finally {
      saving.current = false;
      if (focused.current) {
        setBusy(false);
        if ((saved || token !== generation.current) && AppState.currentState === 'active') void refresh();
      }
    }
  }
  return <Modal visible onRequestClose={onClose}>
    {editing && location ? <JobLocationPicker pin={location.pin} initialAddress={location.address ?? undefined}
      note={note} onNote={setNote} onCancel={() => setEditing(false)} onConfirm={(pair) => void save(pair)} disabled={busy} /> :
      <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
        <AppButton label="Back to My Jobs" onPress={onClose} />
        <Text>Job location</Text>
        {location ? <View>
          <WorkerAssignedJobLocation surface={projectAssignedWorkerLocation({ bookingStatus: 'confirmed', exact: location, mapAvailable: classifyMapAvailability(nativeJobMapsLoaded()) })}
            mapsNote={null} allowNavigation={false} onOpenMaps={() => {}} />
          {!location.pin ? <Text>Legacy address: no saved pin. Select a location to establish a pin-derived address.</Text> : null}
          <AppButton label="Edit Location" onPress={() => setEditing(true)} disabled={busy} />
        </View> : <Text>{busy ? 'Saving location…' : note ?? 'Loading location…'}</Text>}
        <AppButton label="Refresh Location" onPress={() => void refresh()} disabled={busy} />
        <Text>Location can be changed only while this Job remains open.</Text>
      </ScrollView>}
  </Modal>;
}
