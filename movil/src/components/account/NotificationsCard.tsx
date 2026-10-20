/**
 * Yo › Notificaciones, como Configuración › Notificaciones de la web (src/components/NotificationsOptIn.tsx): la
 * primera fila dice cómo están en este teléfono (con «Activar» si se puede) y debajo va un interruptor por cada cosa
 * que te avisamos (profiles.push_prefs, para todos los teléfonos de la cuenta).
 */
import { useEffect, useState } from 'react';
import { AppState, Linking, Switch, View } from 'react-native';
import { Bell, BellOff, CalendarClock, ClipboardCheck, Heart, Trophy, type LucideIcon } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { PUSH_CATEGORIES, PUSH_SHORT_HINTS, setPushPref, type PushCategory, type PushPrefs } from '@mm/lib/data/pushPrefs';
import { saveErrorMessage } from '@mm/lib/errorText';
import { enableNotifications, notifyState, subscribePush, type NotifyState } from '@mm/lib/push';
import { refreshNotifyState } from '@/platform/notifications';
import { toast } from '../feedback';
import { Button, Card, Divider, ListRow, RowIcon, SectionHeader, Txt } from '../ui';
import { useColors } from '@/theme/theme';

const ICONS: Record<PushCategory, LucideIcon> = { resultados: ClipboardCheck, social: Heart, recordatorios: CalendarClock, liga: Trophy };

export function NotificationsCard() {
  const c = useColors();
  const { user, profile } = useAuth();
  const [state, setState] = useState<NotifyState>(notifyState());
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Partial<PushPrefs>>({});

  // Al volver de los ajustes del teléfono, el permiso puede haber cambiado.
  useEffect(() => {
    const check = () => void refreshNotifyState().then(setState);
    check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => sub.remove();
  }, []);

  if (!user) return null;
  const uid = user.uid;

  async function enable() {
    setBusy(true);
    try {
      const next = await enableNotifications(uid);
      setState(next.state);
      if (next.state === 'granted') toast('Notificaciones activadas');
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  const saved = profile?.pushPrefs;
  const prefs = saved ? { ...saved, ...pending } : null;

  async function toggle(key: PushCategory) {
    if (!prefs || pending[key] !== undefined) return;
    setPending((p) => ({ ...p, [key]: !prefs[key] }));
    try {
      await setPushPref(uid, key, !prefs[key]);
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setPending((p) => {
        const next = { ...p };
        delete next[key];
        return next;
      });
    }
  }

  const status =
    state === 'granted'
      ? 'Activadas'
      : state === 'denied'
        ? 'Bloqueadas: actívalas en los ajustes del teléfono'
        : state === 'unsupported'
          ? 'Solo en la app del teléfono'
          : 'Todavía no están activadas';

  return (
    <>
      <SectionHeader title="Notificaciones" />
      <Card padded={false}>
        <ListRow
          icon={<RowIcon>{state === 'granted' ? <Bell size={20} color={c.accent} /> : <BellOff size={20} color={c.muted} />}</RowIcon>}
          title="En este teléfono"
          subtitle={status}
          chevron={false}
          onPress={state === 'denied' ? () => Linking.openSettings() : state === 'granted' ? () => subscribePush(uid).catch(() => false) : undefined}
          right={
            state === 'default' ? (
              <Button size="md" variant="primary" loading={busy} onPress={enable}>
                Activar
              </Button>
            ) : null
          }
        />
        {prefs &&
          PUSH_CATEGORIES.map((cat) => {
            const Icon = ICONS[cat.key] ?? Bell;
            const on = prefs[cat.key];
            return (
              <View key={cat.key}>
                <Divider inset={68} />
                <ListRow
                  icon={
                    <RowIcon>
                      <Icon size={20} color={c.accent} />
                    </RowIcon>
                  }
                  title={cat.label}
                  subtitle={PUSH_SHORT_HINTS[cat.key] ?? cat.hint}
                  chevron={false}
                  accessibilityLabel={`${cat.label}: ${on ? 'activado' : 'apagado'}`}
                  onPress={() => toggle(cat.key)}
                  right={
                    <Switch
                      value={on}
                      onValueChange={() => void toggle(cat.key)}
                      disabled={pending[cat.key] !== undefined}
                      trackColor={{ true: c.accent, false: c.surface2 }}
                      thumbColor="#ffffff"
                    />
                  }
                />
              </View>
            );
          })}
      </Card>
      {prefs && (
        <Txt variant="meta" tone="muted" style={{ paddingHorizontal: 4 }}>
          Qué te avisamos, en todos tus teléfonos. Lo que espera tu respuesta llega siempre.
        </Txt>
      )}
    </>
  );
}
