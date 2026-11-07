import { ShieldCheck } from 'lucide-react';
import { LegalDoc, legalSections, type LegalSection } from './LegalDoc';
import { PRIVACY_TEXT } from './texts';

/**
 * Política de privacidad (BORRADOR para revisar con un abogado dominicano): el texto está en texts.ts (lo comparte la app
 * del teléfono) y dice qué guarda la app de verdad. Si cambia lo que se guarda, se cambia allí, se sube PRIVACY_VERSION
 * en src/lib/legal.ts (con lo que cambió) y la misma fecha en private.legal_versions().
 */
export const PRIVACY_SECTIONS: LegalSection[] = legalSections(PRIVACY_TEXT.sections);

export default function PrivacyPage() {
  return (
    <LegalDoc
      doc="privacidad"
      icon={<ShieldCheck className="size-6" />}
      lead={PRIVACY_TEXT.lead}
      sections={PRIVACY_SECTIONS}
    />
  );
}
