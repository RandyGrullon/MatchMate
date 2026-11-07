/**
 * Una pantalla de texto legal en la app (LegalDoc, TermsPage y PrivacyPage de la web, con el mismo texto:
 * src/pages/legal/texts.ts): «‹ Volver», el ícono y el título, la versión y desde cuándo rige, el texto de arriba, el
 * índice «Contenido» (tocar una sección baja a ella) y las secciones con su número; abajo, cómo escribirnos y las dos
 * páginas. `section` (el ancla de la web: `/privacidad#fotos` es `?seccion=fotos`) baja a esa sección al abrir. Se lee
 * sin cuenta y con las puertas de la cuenta abiertas (Gates.tsx la deja pasar). El aviso de borrador (falta la revisión
 * de un abogado) solo lo ve el superadmin.
 */
import { useRef, type ComponentRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FilePenLine, ScrollText, ShieldCheck } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { LEGAL_DOCS, LEGAL_DRAFT, type LegalDocKey } from '@mm/lib/legal';
import { LEGAL_DRAFT_NOTE, LEGAL_QUESTIONS, LEGAL_TEXTS, LEGAL_TOC_TITLE, legalVersionLine, type LegalBlock } from '@mm/pages/legal/texts';
import { BackBar, Card, Divider, ListRow, RowIcon, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { LEGAL_BODY, LegalBullets, LegalParagraph, LegalParts } from './LegalText';
import { openLegal } from './links';

const ICONS = { terminos: ScrollText, privacidad: ShieldCheck } as const;

/** Lo que queda arriba de una sección al bajar a ella. */
const SECTION_GAP = 12;

function Block({ block }: { block: LegalBlock }) {
  if ('sub' in block) {
    return (
      <Txt accessibilityRole="header" style={[LEGAL_BODY, { fontFamily: font.semibold, marginTop: 8 }]}>
        {block.sub}
      </Txt>
    );
  }
  if ('list' in block) return <LegalBullets items={block.list} />;
  return <LegalParagraph text={block.p} />;
}

export function LegalDocScreen({ doc, section }: { doc: LegalDocKey; section?: string | null }) {
  const c = useColors();
  const { isSuper } = useAuth();
  const text = LEGAL_TEXTS[doc];
  const Icon = ICONS[doc];
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  // Dónde empieza cada sección en lo que se desliza; la del link se busca una sola vez, al dibujarse.
  const spots = useRef(new Map<string, number>());
  const pending = useRef(section ?? null);

  const goTo = (id: string, animated = true) => {
    const y = spots.current.get(id);
    if (y != null) scroll.current?.scrollTo({ y: Math.max(0, y - SECTION_GAP), animated });
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView ref={scroll} contentContainerStyle={styles.content}>
        {/* «‹ Volver» a la pantalla de antes (Entrar, Configuración, la pregunta de los términos…); sin ella, a Hoy. */}
        <BackBar label="Volver" fallback="/" />
        <View style={{ gap: 6 }}>
          <View style={[styles.icon, { backgroundColor: c.accentSoft }]}>
            <Icon size={24} color={c.accent} />
          </View>
          <Txt variant="title" accessibilityRole="header" style={{ marginTop: 10 }}>
            {LEGAL_DOCS[doc].title}
          </Txt>
          <Txt variant="meta" tone="muted">
            {legalVersionLine(doc)}
          </Txt>
          {LEGAL_DRAFT && isSuper && (
            <View accessibilityRole="summary" style={[styles.draft, { backgroundColor: c.warnSoft }]}>
              <FilePenLine size={20} color={c.warn} />
              <Txt variant="meta" style={{ flex: 1, color: c.warn }}>
                <LegalParts text={LEGAL_DRAFT_NOTE} />
              </Txt>
            </View>
          )}
          <Txt tone="fg2" style={{ marginTop: 10 }}>
            {text.lead}
          </Txt>
        </View>

        <Card padded={false} style={styles.toc}>
          <Txt style={{ fontSize: 14, lineHeight: 19, fontFamily: font.semibold, color: c.fg2, marginBottom: 4 }}>{LEGAL_TOC_TITLE}</Txt>
          {text.sections.map((s, i) => (
            <Pressable key={s.id} accessibilityRole="link" onPress={() => goTo(s.id)} style={styles.tocRow}>
              <Txt variant="meta" tone="faint" style={{ width: 24, fontVariant: ['tabular-nums'] }}>
                {`${i + 1}.`}
              </Txt>
              <Txt variant="meta" tone="accent" style={{ flex: 1, fontFamily: font.medium }}>
                {s.title}
              </Txt>
            </Pressable>
          ))}
        </Card>

        {text.sections.map((s, i) => (
          <View
            key={s.id}
            style={styles.section}
            onLayout={(e) => {
              spots.current.set(s.id, e.nativeEvent.layout.y);
              // El link pedía esta sección: se baja a ella apenas se sabe dónde está.
              if (pending.current === s.id) {
                pending.current = null;
                goTo(s.id, false);
              }
            }}
          >
            <Txt variant="section" accessibilityRole="header" style={{ marginHorizontal: 4 }}>
              {`${i + 1}. ${s.title}`}
            </Txt>
            <View style={{ gap: 10, marginHorizontal: 4 }}>
              {s.blocks.map((b, j) => (
                <Block key={j} block={b} />
              ))}
            </View>
          </View>
        ))}

        <View style={{ gap: 12, marginTop: 14 }}>
          <Txt variant="meta" tone="muted" style={{ marginHorizontal: 4 }}>
            <LegalParts text={LEGAL_QUESTIONS} />
          </Txt>
          <Card padded={false}>
            <ListRow
              icon={
                <RowIcon>
                  <ShieldCheck size={20} color={c.accent} />
                </RowIcon>
              }
              title={LEGAL_DOCS.privacidad.title}
              onPress={() => openLegal('privacidad')}
            />
            <Divider inset={68} />
            <ListRow
              icon={
                <RowIcon>
                  <ScrollText size={20} color={c.accent} />
                </RowIcon>
              }
              title={LEGAL_DOCS.terminos.title}
              onPress={() => openLegal('terminos')}
            />
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40, gap: 16 },
  icon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  draft: { flexDirection: 'row', gap: 12, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, marginTop: 10 },
  toc: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, marginTop: 8 },
  tocRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  section: { gap: 12, marginTop: 14 },
});
