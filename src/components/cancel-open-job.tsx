import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { InlineStatus } from '@/components/inline-status';
import { CancellationSheet } from '@/components/cancellation-sheet';
import { supabase } from '@/lib/supabase';

/** N9 permits withdrawal of the owning active Client's still-open post only. */
export function CancelOpenJob({ jobId, clientId, isCurrent, onCancelled, onStatusChanged }: {
  jobId: string; clientId: string; isCurrent: () => boolean;
  onCancelled: () => void;
  onStatusChanged?: () => void;
}) {
  const mounted = useRef(false), running = useRef(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = () => {
    try { return mounted.current && isCurrent(); } catch { return false; }
  };
  async function withdraw() {
    if (!current() || running.current) return;
    running.current = true; setPending(true); setError(null);
    try {
      // Row ownership and open status are also enforced by existing RLS. A Worker
      // acceptance that wins the row lock makes this delete affect zero rows.
      const result = await supabase.from('job_postings').delete()
        .eq('id', jobId).eq('client_id', clientId).eq('status', 'open').select('id');
      if (!current()) return;
      if (result.error) throw result.error;
      if (result.data?.length === 1 && result.data[0].id === jobId) {
        setConfirmationOpen(false);
        onCancelled();
      }
      else {
        setError('This job could not be cancelled. Its status may have changed. Refresh to check it.');
        onStatusChanged?.();
      }
    } catch {
      if (current()) setError('Could not confirm cancellation. Refresh the job before trying again.');
    } finally {
      running.current = false;
      if (mounted.current) setPending(false);
    }
  }
  function confirm() {
    if (!current() || running.current) return;
    setError(null);
    setConfirmationOpen(true);
  }
  return <View>
    {error && !confirmationOpen ? <InlineStatus variant="error" message={error} /> : null}
    <AppButton label="Cancel" variant="destructive" loading={pending} onPress={confirm} />
    <CancellationSheet visible={confirmationOpen} title="Cancel this job?"
      description="Your posted job will be removed. You can post a new job later."
      keepLabel="Keep job" confirmLabel="Cancel job" busy={pending} error={error}
      onClose={() => { if (!running.current) setConfirmationOpen(false); }} onConfirm={withdraw} />
  </View>;
}
