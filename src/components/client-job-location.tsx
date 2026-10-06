import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { AppState, Modal, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { AppButton } from './app-button';
import { JobLocationPicker } from './job-location-picker';
import { WorkerAssignedJobLocation, nativeJobMapsLoaded } from './job-location-map';
import { readOpenJobLocation, saveOpenJobLocation } from '@/lib/client-job-location';
import { classifyMapAvailability, projectAssignedWorkerLocation, type AuthorizedJobLocation } from '@/lib/job-location';
import type { CanonicalJobLocation } from '@/lib/canonical-job-location';
import { NOTIFICATION_INSERTED, subscribeInvalidation, userNotificationsTopic } from '@/lib/realtime';
import { SkillMatchTheme } from '@/constants/theme';

const { colors, type, spacing } = SkillMatchTheme.ui;

/** Modal lifetime owns protected data. No cached location survives blur/background. */
export function ClientJobLocation({ jobId, clientId, onClose, dismissalLabel = 'Back to My Jobs', isOperationCurrent }: {
  jobId: string; clientId: string; onClose: () => void; dismissalLabel?: string; isOperationCurrent?: () => boolean;
}) {
  const generation = useRef(0);
  const saving = useRef(false);
  const focused = useRef(false);
  const [location, setLocation] = useState<AuthorizedJobLocation | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const parentCurrent = useCallback(() => {
    try { return isOperationCurrent === undefined || isOperationCurrent() === true; } catch { return false; }
  }, [isOperationCurrent]);
  const clear = useCallback(() => {
    generation.current += 1;
    setLocation(null);
    setEditing(false);
    setNote(null);
  }, []);
  const refresh = useCallback(async () => {
    clear();
    if (!focused.current || AppState.currentState !== 'active' || !parentCurrent()) return;
    const token = generation.current;
    setNote(null);
    try {
      const current = await readOpenJobLocation(jobId, clientId);
      if (token === generation.current && focused.current && parentCurrent()) setLocation(current);
    } catch (error) {
      if (token === generation.current && focused.current && parentCurrent()) setNote(error instanceof Error ? error.message : 'Location unavailable.');
    }
  }, [clear, jobId, clientId, parentCurrent]);
  useLayoutEffect(() => () => { focused.current = false; clear(); }, [clear, jobId, clientId, parentCurrent]);
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
  async function save(pair: CanonicalJobLocation, editorGeneration: number) {
    if (saving.current || !location || editorGeneration !== generation.current || !focused.current || AppState.currentState !== 'active' || !parentCurrent()) return;
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
      if (token === generation.current && parentCurrent()) setNote(error instanceof Error ? error.message : 'Save was not confirmed. Refresh before trying again.');
    } finally {
      saving.current = false;
      if (focused.current && parentCurrent()) {
        setBusy(false);
        if ((saved || token !== generation.current) && AppState.currentState === 'active') void refresh();
      }
    }
  }
  const visibleLocation = parentCurrent() ? location : null;
  const editorGeneration = generation.current;
  return <Modal visible onRequestClose={onClose}>
    {editing && visibleLocation ? <JobLocationPicker pin={visibleLocation.pin} initialAddress={visibleLocation.address ?? undefined}
      note={note} onNote={setNote} onCancel={() => setEditing(false)} onConfirm={(pair) => void save(pair, editorGeneration)} disabled={busy} /> :
      <ScrollView style={{ backgroundColor: colors.background }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg, backgroundColor: colors.background }}>
        <AppButton label={dismissalLabel} onPress={onClose} />
        <Text selectable style={{ ...type.sectionTitle, color: colors.textPrimary }}>Job location</Text>
        {visibleLocation ? <View>
          <WorkerAssignedJobLocation surface={projectAssignedWorkerLocation({ bookingStatus: 'confirmed', exact: visibleLocation, mapAvailable: classifyMapAvailability(nativeJobMapsLoaded()) })}
            mapsNote={null} allowNavigation={false} onOpenMaps={() => {}} />
          {!visibleLocation.pin ? <Text selectable style={{ ...type.body, color: colors.textPrimary }}>Legacy address: no saved pin. Select a location to establish a pin-derived address.</Text> : null}
          <AppButton label="Edit Location" onPress={() => { if (parentCurrent() && editorGeneration === generation.current) setEditing(true); }} disabled={busy} />
        </View> : <Text selectable style={{ ...type.body, color: colors.textPrimary }}>{busy ? 'Saving location…' : note ?? 'Loading location…'}</Text>}
        <AppButton label="Refresh Location" onPress={() => void refresh()} disabled={busy} />
        <Text selectable style={{ ...type.helper, color: colors.textSecondary }}>Location can be changed only while this Job remains open.</Text>
      </ScrollView>}
  </Modal>;
}
