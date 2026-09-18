import { LegalDocumentScreen } from '@/components/legal-document-screen';
import { PRIVACY_DOCUMENT } from '@/lib/legal-documents';

export default function PrivacyScreen() {
  return <LegalDocumentScreen document={PRIVACY_DOCUMENT} />;
}
