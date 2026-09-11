import { Stack, useLocalSearchParams } from 'expo-router';

import MyReportDetails from '@/components/my-report-details';
import { COPY } from '@/lib/reports';

export default function ClientMyReportDetails() {
  const { reportId } = useLocalSearchParams<{ reportId?: string | string[] }>();
  return (
    <>
      <Stack.Screen options={{ title: COPY.reportDetailsTitle }} />
      <MyReportDetails reportId={typeof reportId === 'string' ? reportId : null} />
    </>
  );
}
