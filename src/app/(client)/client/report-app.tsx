import { Stack } from 'expo-router';

import ReportForm from '@/components/report-form';
import { COPY } from '@/lib/reports';

export default function ClientReportApp() {
  return (
    <>
      <Stack.Screen options={{ title: COPY.appIssueTitle }} />
      <ReportForm variant="app_issue" />
    </>
  );
}
