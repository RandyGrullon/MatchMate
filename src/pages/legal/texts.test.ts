import { describe, expect, it } from 'vitest';
import { LEGAL_CONTACT, LEGAL_DOCS, legalDate } from '../../lib/legal';
import { LEGAL_DRAFT_NOTE, LEGAL_QUESTIONS, LEGAL_TEXTS, PRIVACY_TEXT, TERMS_TEXT, legalSectionIds, legalVersionLine, plainLegalText, type LegalText } from './texts';

const all = (t: typeof TERMS_TEXT) =>
  t.sections
    .flatMap((s) => s.blocks.flatMap((b): LegalText[] => ('p' in b ? [b.p] : 'list' in b ? [...b.list] : [b.sub])))
    .map(plainLegalText)
    .join('\n');

describe('el texto legal compartido (texts.ts)', () => {
  it('cada documento con su lead, sus secciones con id único y las anclas que usan otras pantallas', () => {
    for (const doc of [TERMS_TEXT, PRIVACY_TEXT]) {
      expect(doc.lead.length).toBeGreaterThan(20);
      const ids = doc.sections.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const s of doc.sections) expect(s.blocks.length).toBeGreaterThan(0);
    }
    expect(LEGAL_TEXTS.terminos).toBe(TERMS_TEXT);
    expect(LEGAL_TEXTS.privacidad).toBe(PRIVACY_TEXT);
    for (const id of ['fotos', 'menores', 'tiempo', 'derechos', 'avisos', 'reportes']) expect(legalSectionIds('privacidad')).toContain(id);
  });

  it('las leyes, el plan gratis de Google y lo que falta llenar (sin inventarlo)', () => {
    const privacy = all(PRIVACY_TEXT);
    for (const law of ['Ley 172-13', 'Ley 136-03', 'Ley 53-07', 'artículo 70']) expect(privacy).toContain(law);
    expect(privacy).toContain('Gemini');
    expect(privacy).toContain(LEGAL_CONTACT.responsible);
    expect(privacy).toContain(LEGAL_CONTACT.email);
    const terms = all(TERMS_TEXT);
    expect(terms).toContain('mayores de 18 años');
    expect(terms).toContain('Ley 358-05');
    expect(terms).toContain(LEGAL_CONTACT.taxId);
  });

  it('los links de un documento al otro van a secciones que existen', () => {
    const ids = { terminos: legalSectionIds('terminos'), privacidad: legalSectionIds('privacidad') };
    for (const doc of [TERMS_TEXT, PRIVACY_TEXT])
      for (const s of doc.sections)
        for (const b of s.blocks) {
          const lines: LegalText[] = 'p' in b ? [b.p] : 'list' in b ? [...b.list] : [];
          for (const line of lines)
            if (typeof line !== 'string')
              for (const part of line)
                if (typeof part !== 'string' && 'link' in part && part.hash) expect(ids[part.link]).toContain(part.hash.slice(1));
        }
  });

  it('lo de alrededor: la versión, las preguntas con el correo y el aviso de borrador', () => {
    expect(legalVersionLine('terminos')).toBe(`Versión ${legalDate(LEGAL_DOCS.terminos.version)} · vigente desde ${legalDate(LEGAL_DOCS.terminos.effective)}`);
    expect(plainLegalText(LEGAL_QUESTIONS)).toBe(`¿Preguntas? Escríbenos a ${LEGAL_CONTACT.email}.`);
    expect(plainLegalText(LEGAL_DRAFT_NOTE)).toMatch(/^Borrador\. Pendiente: revisión por un abogado dominicano\./);
    expect(plainLegalText([{ bold: 'Supabase' }, ': la base', { link: 'terminos', text: ' y más' }, { fill: '[Dato]' }])).toBe('Supabase: la base y más[Dato]');
  });
});
