import { useEffect, useRef, useState } from 'react';
import { Alert, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { InlineStatus } from '@/components/inline-status';
import { supabase } from '@/lib/supabase';

/** N9 permits withdrawal of the owning active Client's still-open post only. */
export function CancelOpenJob({ jobId, clientId, isCurrent, onCancelled, onStatusChanged }: {
  jobId: string; clientId: string; isCurrent: () => boolean;
  onCancelled: () => void;
  onStatusChanged?: () => void;
}) {
  const mounted = useRef(false), running = useRef(false);
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
      if (result.data?.length === 1 && result.data[0].id === jobId) onCancelled();
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
    Alert.alert('Cancel this job?', 'This removes your posted job before a Worker accepts it. You can post a new job later.', [
      { text: 'Keep job', style: 'cancel' },
      { text: 'Cancel', style: 'destructive', onPress: () => void withdraw() },
    ]);
  }
  return <View>
    {error ? <InlineStatus variant="error" message={error} /> : null}
    <AppButton label="Cancel" variant="destructive" loading={pending} onPress={confirm} />
  </View>;
}
