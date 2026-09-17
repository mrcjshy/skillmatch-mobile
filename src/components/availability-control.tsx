import { AppSegment } from '@/components/app-segment';
import {
  AVAILABILITY_OPTIONS,
  type AvailabilityStatus,
} from '@/providers/worker-profile-provider';

type AvailabilityControlProps = {
  value: AvailabilityStatus;
  onChange: (value: AvailabilityStatus) => void;
  disabled?: boolean;
  accentColor?: string;
};

export function AvailabilityControl({
  value,
  onChange,
  disabled = false,
}: AvailabilityControlProps) {
  return (
    <AppSegment
      options={AVAILABILITY_OPTIONS}
      value={value}
      onChange={onChange}
      disabled={disabled}
      accessibilityLabel="Availability"
    />
  );
}
