import { ScrollText } from 'lucide-react';
import { LegalDoc, legalSections, type LegalSection } from './LegalDoc';
import { TERMS_TEXT } from './texts';

/**
 * Términos de uso (BORRADOR para revisar con un abogado de República Dominicana): el texto está en texts.ts (lo comparte
 * la app del teléfono). Si cambian, se sube TERMS_VERSION en src/lib/legal.ts (con lo que cambió) y la misma fecha en
 * private.legal_versions().
 */
export const TERMS_SECTIONS: LegalSection[] = legalSections(TERMS_TEXT.sections);

export default function TermsPage() {
  return (
    <LegalDoc
      doc="terminos"
      icon={<ScrollText className="size-6" />}
      lead={TERMS_TEXT.lead}
      sections={TERMS_SECTIONS}
    />
  );
}
