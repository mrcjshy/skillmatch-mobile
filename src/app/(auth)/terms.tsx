import { LegalDocumentScreen } from '@/components/legal-document-screen';
import { TERMS_DOCUMENT } from '@/lib/legal-documents';

export default function TermsScreen() {
  return <LegalDocumentScreen document={TERMS_DOCUMENT} />;
}
