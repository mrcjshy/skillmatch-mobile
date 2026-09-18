import { Stack } from 'expo-router';

import { LegalDocumentScreen } from '@/components/legal-document-screen';
import { TERMS_DOCUMENT } from '@/lib/legal-documents';

export default function WorkerTerms() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <LegalDocumentScreen document={TERMS_DOCUMENT} />
    </>
  );
}
