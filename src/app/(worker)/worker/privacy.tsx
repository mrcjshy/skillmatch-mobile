import { Stack } from 'expo-router';

import { LegalDocumentScreen } from '@/components/legal-document-screen';
import { PRIVACY_DOCUMENT } from '@/lib/legal-documents';

export default function WorkerPrivacy() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <LegalDocumentScreen document={PRIVACY_DOCUMENT} />
    </>
  );
}
