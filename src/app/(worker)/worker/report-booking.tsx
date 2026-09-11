import { Stack, useLocalSearchParams } from 'expo-router';

import ReportForm from '@/components/report-form';
import { COPY } from '@/lib/reports';

export default function WorkerReportBooking() {
  const { bookingId } = useLocalSearchParams<{ bookingId?: string | string[] }>();
  return (
    <>
      <Stack.Screen options={{ title: COPY.bookingTitle }} />
      <ReportForm variant="booking" bookingId={typeof bookingId === 'string' ? bookingId : null} />
    </>
  );
}
