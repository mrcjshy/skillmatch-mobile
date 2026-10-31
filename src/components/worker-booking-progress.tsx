import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppButton } from '@/components/app-button';
import { SwipeConfirmation } from '@/components/swipe-confirmation';
import { useUiTheme } from '@/components/refinement-theme';
import { confirmWorkerProgress, workerProgressPresentation, type WorkerProgress } from '@/lib/worker-booking-progress';

type Props = { bookingId: string; progress: WorkerProgress | null; paymentStatus: string | null; onChanged: () => Promise<void>; isCurrent: () => boolean; actionVisible?: boolean; frameStyle?: StyleProp<ViewStyle> };
export default function WorkerBookingProgress({ bookingId, progress, paymentStatus, onChanged, isCurrent, actionVisible = true, frameStyle }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const flight = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const view = workerProgressPresentation('confirmed', progress, paymentStatus);
  async function confirm() {
    if (flight.current || !mounted.current || !isCurrent() || !view.action || needsRefresh) return;
    flight.current = true; setBusy(true); setMessage(null);
    try {
      await confirmWorkerProgress(bookingId, view.action);
    } catch {
      if (mounted.current) setMessage('Confirmation was not verified. Refresh the booking before another attempt.');
    }
    // A failed transport can still have committed: re-read, never advance locally or retry the write.
    if (mounted.current && isCurrent()) {
      setNeedsRefresh(true);
      try { await onChanged(); } catch { /* Keep action disabled until a fresh verified detail mounts. */ }
    }
    if (mounted.current) { setBusy(false); setNeedsRefresh(true); }
  }
  return <WorkerProgressView progress={progress} paymentStatus={paymentStatus} busy={busy} actionVisible={actionVisible} frameStyle={frameStyle}
    disabled={needsRefresh} message={message} onConfirm={() => { void confirm(); }} onRefresh={() => { void onChanged().catch(() => {}); }} />;
}

/** Pure presentation; milestones are already authorized server evidence, never local form state. */
export function WorkerProgressView({ progress, paymentStatus, busy = false, disabled = false, actionVisible = true, message = null, onConfirm, onRefresh, frameStyle }: {
  progress: WorkerProgress | null; paymentStatus: string | null; busy?: boolean; disabled?: boolean;
  /** False while the details sheet is collapsed; an in-flight confirmation stays visible. */
  actionVisible?: boolean; message?: string | null; onConfirm: () => void; onRefresh: () => void; frameStyle?: StyleProp<ViewStyle>;
}) {
  const ui = useUiTheme();
  const view = workerProgressPresentation('confirmed', progress, paymentStatus);
  const uiStyles = StyleSheet.create({
    frame: { gap: ui.spacing.sm },
    title: { ...ui.type.label, color: ui.colors.accent },
    message: { ...ui.type.helper, color: ui.colors.textSecondary },
    error: { ...ui.type.helper, color: ui.colors.error },
  });
  const showAction = view.action !== null && (actionVisible || busy);
  const showRefresh = (!progress || disabled) && !busy;
  // Nothing to show means no frame at all: an empty dock would stick under the collapsed sheet.
  if (view.action && !showAction && !message && !showRefresh) return null;
  return <View style={[uiStyles.frame, frameStyle]}>
    {/* A readable milestone is already the sheet header's chip; only the unreadable state names itself. */}
    {progress ? null : <Text accessibilityRole="header" style={uiStyles.title}>{view.label}</Text>}
    {!view.action ? <Text style={uiStyles.message}>{view.message}</Text> : null}
    {view.action && showAction ? <SwipeConfirmation key={view.action} label={busy ? 'Confirming…' : view.actionLabel}
      confirmationTitle={view.action === 'arrive' ? 'Confirm arrival?' : 'Confirm the work is finished?'}
      confirmationMessage={view.action === 'arrive' ? 'Confirm only if you have physically arrived at this job site.' : 'This records service completion only. It does not confirm payment or finally complete the booking.'}
      disabled={busy || disabled} resetKey={view.action} onConfirm={onConfirm} /> : null}
    {message ? <Text accessibilityRole="alert" style={uiStyles.error}>{message}</Text> : null}
    {showRefresh ? <AppButton variant="secondary" label="Refresh booking progress" onPress={onRefresh} /> : null}
  </View>;
}
