import { Stack } from 'expo-router';

import MyReportsList from '@/components/my-reports-list';
import { COPY } from '@/lib/reports';

export default function WorkerMyReports() {
  return (
    <>
      <Stack.Screen options={{ title: COPY.myReportsTitle }} />
      <MyReportsList role="worker" />
    </>
  );
}
