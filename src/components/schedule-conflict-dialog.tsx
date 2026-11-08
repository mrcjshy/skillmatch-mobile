import { AppButton } from '@/components/app-button';
import { AppDialog } from '@/components/app-dialog';
import { SkillMatchMascot } from '@/components/skillmatch-mascot';
import { SCHEDULE_CONFLICT_COPY, scheduleConflictMessage } from '@/lib/schedule-conflict';

type ScheduleConflictDialogProps = {
  visible: boolean;
  /** The booking in the way, once read; the general message shows until then. */
  booking: { job_title: string; job_scheduled_at: string | null } | null;
  onClose: () => void;
  onViewBookings: () => void;
};

/** SCH-01 (owner, 2026-11-06): Itik explains that a Job clashes with one of the Worker's bookings. */
export function ScheduleConflictDialog({ visible, booking, onClose, onViewBookings }: ScheduleConflictDialogProps) {
  return (
    <AppDialog
      visible={visible}
      onRequestClose={onClose}
      hero={<SkillMatchMascot expression="oops" size={96} active={visible} />}
      title={SCHEDULE_CONFLICT_COPY.title}
      message={scheduleConflictMessage(booking)}
      actions={
        <>
          <AppButton label={SCHEDULE_CONFLICT_COPY.ok} onPress={onClose} />
          <AppButton label={SCHEDULE_CONFLICT_COPY.viewBookings} variant="ghost" onPress={onViewBookings} />
        </>
      }
    />
  );
}
