/**
 * Un renglón del texto legal en la app (LegalRich, Fill, ContactEmail y Bullets de src/pages/legal/LegalDoc.tsx de la
 * web, con el mismo texto: src/pages/legal/texts.ts): lo que falta llenar se ve marcado, el correo abre la app de correo
 * y los links llevan a la otra pantalla legal (con su sección).
 */
import { Fragment } from 'react';
import { Linking, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { LEGAL_CONTACT, isPlaceholder } from '@mm/lib/legal';
import type { LegalInline, LegalText } from '@mm/pages/legal/texts';
import { Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { openLegal } from './links';

/** Un dato que falta llenar (se ve marcado; la consola › Legal los lista). */
function Fill({ text }: { text: string }) {
  const c = useColors();
  if (!isPlaceholder(text)) return <>{text}</>;
  return <Text style={{ backgroundColor: c.warnSoft, color: c.warn }}>{text}</Text>;
}

/** El correo de contacto: abre la app de correo (marcado si todavía falta llenarlo). */
export function ContactEmail() {
  const c = useColors();
  const email = LEGAL_CONTACT.email;
  if (isPlaceholder(email)) return <Fill text={email} />;
  return (
    <Text accessibilityRole="link" onPress={() => void Linking.openURL(`mailto:${email}`).catch(() => undefined)} style={{ color: c.accent, fontFamily: font.medium, textDecorationLine: 'underline' }}>
      {email}
    </Text>
  );
}

function Part({ part }: { part: LegalInline }) {
  const c = useColors();
  if (typeof part === 'string') return <>{part}</>;
  if ('fill' in part) return <Fill text={part.fill} />;
  if ('email' in part) return <ContactEmail />;
  if ('bold' in part) return <Text style={{ fontFamily: font.bold }}>{part.bold}</Text>;
  return (
    <Text accessibilityRole="link" onPress={() => openLegal(part.link, part.hash)} style={{ color: c.accent, fontFamily: font.medium, textDecorationLine: 'underline' }}>
      {part.text}
    </Text>
  );
}

/** Los pedazos de un renglón, para ir dentro de un texto (Txt). */
export function LegalParts({ text }: { text: LegalText }) {
  if (typeof text === 'string') return <>{text}</>;
  return (
    <>
      {text.map((part, i) => (
        <Fragment key={i}>
          <Part part={part} />
        </Fragment>
      ))}
    </>
  );
}

/** El texto de las secciones (15.5 con interlineado amplio, como la web). */
export const LEGAL_BODY: TextStyle = { fontSize: 15.5, lineHeight: 25 };

/** Un renglón como párrafo. */
export function LegalParagraph({ text, style }: { text: LegalText; style?: StyleProp<TextStyle> }) {
  return (
    <Txt style={[LEGAL_BODY, style]}>
      <LegalParts text={text} />
    </Txt>
  );
}

/** Lista con viñetas del texto legal. */
export function LegalBullets({ items, style }: { items: readonly LegalText[]; style?: StyleProp<TextStyle> }) {
  const c = useColors();
  return (
    <View accessibilityRole="list" style={{ gap: 6 }}>
      {items.map((it, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 8, paddingLeft: 4 }}>
          <Txt aria-hidden style={[LEGAL_BODY, style, { color: c.muted }]}>
            •
          </Txt>
          <View style={{ flex: 1, minWidth: 0 }}>
            <LegalParagraph text={it} style={style} />
          </View>
        </View>
      ))}
    </View>
  );
}
