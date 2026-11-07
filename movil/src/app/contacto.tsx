import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { ChevronDown, Copy, Mail, Send } from 'lucide-react-native';
import { displayName, useAuth } from '@mm/lib/auth';
import { CONTACT_EMAIL, CONTACT_FAQ, CONTACT_MAX, CONTACT_REASONS, contactMailto, contactMessageHint, contactReady, emailParts, type ContactReason } from '@mm/pages/contactText';
import { toast } from '@/components/feedback';
import { LegalParts } from '@/components/legal/LegalText';
import { PickField } from '@/components/players/fields';
import { BackBar, Button, Card, Divider, Field, Input, RowIcon, Screen, SectionHeader, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

const REASONS = CONTACT_REASONS.map((r) => ({ key: r, label: r }));

/**
 * Contáctanos (`/contacto`, ContactPage de la web, con lo mismo: src/pages/contactText.ts): el título, el correo de
 * MatchMate en filas (escribir y copiar), el formulario que arma el correo y abre la app de correo (no hay servidor:
 * nada se manda ni se guarda desde aquí) y las preguntas frecuentes. Con cuenta se llega desde Configuración
 * («‹ Configuración») y el nombre y el correo ya están puestos.
 */
export default function ContactScreen() {
  const c = useColors();
  const auth = useAuth();
  const myName = auth.user ? displayName(auth) : '';
  const myEmail = auth.user?.email ?? '';
  const [name, setName] = useState(myName);
  const [email, setEmail] = useState(myEmail);
  const [reason, setReason] = useState<ContactReason>(CONTACT_REASONS[0]);
  const [message, setMessage] = useState('');
  const [copying, setCopying] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  // La sesión puede llegar después de abrir la pantalla: el nombre y el correo se llenan si siguen vacíos.
  const [seen, setSeen] = useState({ name: myName, email: myEmail });
  if (seen.name !== myName || seen.email !== myEmail) {
    setSeen({ name: myName, email: myEmail });
    if (myName && !name) setName(myName);
    if (myEmail && !email) setEmail(myEmail);
  }
  const ready = contactReady({ name, message });
  const [user, domain] = emailParts(CONTACT_EMAIL);

  async function copy() {
    setCopying(true);
    try {
      await Clipboard.setStringAsync(CONTACT_EMAIL);
      toast('Correo copiado');
    } catch {
      toast('No se pudo copiar. Mantén el dedo sobre el correo para copiarlo.', 'error');
    } finally {
      setCopying(false);
    }
  }

  function write() {
    if (!ready) return;
    void Linking.openURL(contactMailto({ name, email, reason, message })).catch(() => undefined);
  }

  return (
    <Screen>
      {auth.user ? <BackBar label="Configuración" fallback="/cuenta" /> : <BackBar label="Atrás" fallback="/" />}
      <View style={{ gap: 6 }}>
        <Txt variant="title" accessibilityRole="header">
          Contáctanos
        </Txt>
        <Txt variant="meta" tone="muted">
          ¿Una duda, algo que no funciona o una idea? Te respondemos.
        </Txt>
      </View>

      <Card padded={false}>
        {/* Toda la fila (ícono, «Nuestro correo» y la dirección) abre el correo: un blanco cómodo para el dedo. */}
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Nuestro correo: ${CONTACT_EMAIL}`}
          onPress={() => void Linking.openURL(`mailto:${CONTACT_EMAIL}`).catch(() => undefined)}
          style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surface2 : 'transparent' }]}
        >
          <RowIcon>
            <Mail size={20} color={c.accent} />
          </RowIcon>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt tone="muted" style={{ fontSize: 14 }}>
              Nuestro correo
            </Txt>
            {/* Completo (en un teléfono angosto pasa al otro renglón antes de la @, no a mitad de «gmail.com»). */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <Txt variant="bodyStrong" tone="accent">
                {user}
              </Txt>
              <Txt variant="bodyStrong" tone="accent">
                {domain}
              </Txt>
            </View>
          </View>
        </Pressable>
        <Divider inset={68} />
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy: copying, disabled: copying }}
          disabled={copying}
          onPress={() => void copy()}
          style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surface2 : 'transparent', opacity: copying ? 0.8 : 1 }]}
        >
          <RowIcon>{copying ? <ActivityIndicator size="small" color={c.accent} /> : <Copy size={20} color={c.accent} />}</RowIcon>
          <Txt variant="bodyStrong" style={{ flex: 1 }}>
            Copiar correo
          </Txt>
        </Pressable>
      </Card>

      <SectionHeader title="Escríbenos desde aquí" />
      <Card style={{ gap: 20 }}>
        <Field label="Nombre">
          <Input accessibilityLabel="Nombre" maxLength={60} autoComplete="name" value={name} onChangeText={setName} />
        </Field>
        <Field label="Tu correo (opcional)" hint="Para responderte, si no escribes desde ese mismo correo.">
          <Input
            accessibilityLabel="Tu correo (opcional)"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={120}
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
          />
        </Field>
        <Field label="Motivo">
          <PickField label="Motivo" options={REASONS} value={reason} onChange={setReason} />
        </Field>
        <Field label="Mensaje" hint={contactMessageHint(message.length)}>
          <Input
            accessibilityLabel="Mensaje"
            multiline
            maxLength={CONTACT_MAX}
            value={message}
            onChangeText={setMessage}
            placeholder="Cuéntanos"
            style={{ height: 140, paddingTop: 14, textAlignVertical: 'top' }}
          />
        </Field>
        <View style={{ gap: 8 }}>
          <Button variant="primary" size="xl" full disabled={!ready} icon={<Send size={20} color={c.accentFg} />} onPress={write}>
            Escribir el correo
          </Button>
          <Txt tone="muted" style={{ fontSize: 13, textAlign: 'center' }}>
            Se abre tu app de correo con el mensaje listo.
          </Txt>
        </View>
      </Card>

      <SectionHeader title="Preguntas frecuentes" />
      <Card padded={false}>
        {CONTACT_FAQ.map((f, i) => {
          const expanded = open === f.q;
          return (
            <View key={f.q}>
              {i > 0 && <Divider inset={20} />}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={() => setOpen(expanded ? null : f.q)}
                style={({ pressed }) => [styles.faq, { backgroundColor: pressed ? c.surface2 : 'transparent' }]}
              >
                <Txt variant="bodyStrong" style={{ flex: 1 }}>
                  {f.q}
                </Txt>
                <ChevronDown size={20} color={c.faint} style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }} />
              </Pressable>
              {expanded && (
                <Txt variant="meta" tone="fg2" style={styles.answer}>
                  <LegalParts text={f.a} />
                </Txt>
              )}
            </View>
          );
        })}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingLeft: 20, paddingRight: 18, paddingVertical: 10 },
  faq: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingLeft: 20, paddingRight: 18, paddingVertical: 12 },
  answer: { paddingLeft: 20, paddingRight: 18, paddingBottom: 16, fontFamily: font.regular },
});
