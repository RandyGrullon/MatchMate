import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { BellOff, Flag, Megaphone, Send, X } from 'lucide-react-native';
import { asBackendError } from '@mm/lib/db/errors';
import { ANNOUNCE_DAILY_LIMIT, ANNOUNCE_MAX, announceToLeague, useAnnounceReach, useLeagueAnnouncements, type LeagueAnnouncement } from '@mm/lib/data/leagues';
import { REPORT_KIND_THIS } from '@mm/lib/data/reports';
import { saveErrorMessage } from '@mm/lib/errorText';
import { useLeagueCtx } from '@mm/lib/league';
import { relativeTime } from '@mm/lib/notifications';
import { useNow } from '@mm/lib/useNow';
import { announceTemplates, noticesLeft, reachLine, readClosedNotices, recentNotices, saveClosedNotices } from '@mm/components/league/logic';
import { confirmAsync, toast } from '@/components/feedback';
import { ReportSheet } from '@/components/social/ContentMenu';
import { Button, Card, Input, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/**
 * Arriba en el inicio de la liga (LeagueNotices de la web): el aviso del admin de los últimos 2 días («Se suspende por
 * lluvia»), para quien no tiene las notificaciones activadas. Cada quien lo puede cerrar; quien no es admin lo puede
 * reportar.
 */
export function LeagueNotices() {
  const c = useColors();
  const { lid, isAdmin } = useLeagueCtx();
  const list = useLeagueAnnouncements(lid, 5);
  const now = useNow();
  const [closed, setClosed] = useState(() => readClosedNotices(lid));
  const [reporting, setReporting] = useState<string | null>(null);
  const shown = useMemo(() => recentNotices(list.data, now.getTime(), closed), [list.data, now, closed]);
  if (!shown.length) return null;

  const close = (id: string) => {
    const next = new Set(closed).add(id);
    setClosed(next);
    saveClosedNotices(lid, next);
  };

  return (
    <View accessibilityLabel="Avisos de la liga" style={{ gap: 8 }}>
      {shown.map((a) => (
        <View key={a.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 16, borderWidth: 1, borderColor: `${c.warn}4d`, backgroundColor: c.warnSoft, paddingHorizontal: 16, paddingVertical: 12 }}>
          <Megaphone size={20} color={c.warn} style={{ marginTop: 2 }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt style={{ fontSize: 12, fontFamily: font.semibold, color: c.warn }}>{`Aviso${a.authorName ? ` de ${a.authorName}` : ''} · ${relativeTime(Date.parse(a.sentAt), now.getTime())}`}</Txt>
            <Txt style={{ fontSize: 14 }}>{a.body}</Txt>
          </View>
          {!isAdmin && (
            <Pressable accessibilityRole="button" accessibilityLabel={`Reportar ${REPORT_KIND_THIS.announcement}`} hitSlop={8} onPress={() => setReporting(a.id)} style={{ padding: 4 }}>
              <Flag size={16} color={c.muted} />
            </Pressable>
          )}
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar el aviso" hitSlop={8} onPress={() => close(a.id)} style={{ padding: 4 }}>
            <X size={16} color={c.muted} />
          </Pressable>
        </View>
      ))}
      {reporting && <ReportSheet kind="announcement" targetId={reporting} onClose={() => setReporting(null)} />}
    </View>
  );
}

/**
 * Avisar a toda la liga (AnnouncePanel de la web, Organizar › Avisar): «Se suspende por lluvia». Llega como
 * notificación a los miembros que las activaron y sale 2 días arriba en el inicio de la liga. Hasta 3 por día (la base
 * lo cuida).
 */
export function AnnouncePanel() {
  const c = useColors();
  const { lid, league, member } = useLeagueCtx();
  const reach = useAnnounceReach(lid);
  const history = useLeagueAnnouncements(lid, 10);
  const now = useNow();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const box = useRef<ComponentRef<typeof TextInput>>(null);
  const r = reach.data;
  const left = noticesLeft(r);
  const out = left === 0;
  const body = text.trim();
  const all = league.kind === 'torneo' ? 'todo el torneo' : 'toda la liga';
  const home = league.kind === 'torneo' ? 'el inicio del torneo' : 'el inicio de la liga';
  const reachText = r ? reachLine(r.reach, member ? r.members - 1 : r.members) : '';

  function applyTemplate(t: string) {
    setText(t);
    box.current?.focus();
  }

  async function send() {
    if (!body || sending || out) return;
    const ok = await confirmAsync({ title: `¿Avisar a ${all}?`, message: `${body}\n\n${reachText} No se puede borrar después.`.trim(), confirmText: 'Enviar aviso' });
    if (!ok) return;
    setSending(true);
    try {
      const n = await announceToLeague(lid, body);
      setText('');
      toast(n ? `Aviso enviado a ${n} ${n === 1 ? 'miembro' : 'miembros'}` : `Aviso publicado en ${home}`);
    } catch (e) {
      console.error(e);
      toast(asBackendError(e)?.kind === 'rate_limited' ? `Ya se mandaron los ${r?.dailyLimit ?? ANNOUNCE_DAILY_LIMIT} avisos de hoy. Mañana puedes mandar más.` : saveErrorMessage(e), 'error');
    } finally {
      setSending(false);
    }
  }

  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Megaphone size={20} color={c.accent} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="bodyStrong">{`Avisar a ${all}`}</Txt>
          <Txt tone="muted" style={{ fontSize: 14 }}>
            Llega como notificación al teléfono y sale 2 días arriba en el inicio. Para lo urgente: lluvia, apagón, cambio de lugar u hora.
          </Txt>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel="Avisos listos" contentContainerStyle={{ gap: 6 }}>
        {announceTemplates(league.sport).map((t) => (
          <Pressable
            key={t}
            accessibilityRole="button"
            disabled={out}
            onPress={() => applyTemplate(t)}
            style={{ borderRadius: 999, backgroundColor: c.surface2, paddingHorizontal: 12, paddingVertical: 6, opacity: out ? 0.5 : 1 }}
          >
            <Txt tone="muted" style={{ fontSize: 14, fontFamily: font.medium }}>
              {t.replace(/[:.]\s*$/, '')}
            </Txt>
          </Pressable>
        ))}
      </ScrollView>

      <View style={{ gap: 4 }}>
        <Input
          ref={box}
          multiline
          numberOfLines={3}
          maxLength={ANNOUNCE_MAX}
          value={text}
          editable={!out}
          onChangeText={(t) => setText(t.slice(0, ANNOUNCE_MAX))}
          placeholder="Hoy se suspende por lluvia. Nos vemos el martes."
          accessibilityLabel="Texto del aviso"
          style={{ minHeight: 92, textAlignVertical: 'top', paddingTop: 12 }}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <Txt tone="muted" style={{ fontSize: 12, flex: 1 }}>
            {reachText || ' '}
          </Txt>
          <Txt tone={text.length >= ANNOUNCE_MAX ? 'warn' : 'muted'} style={{ fontSize: 12 }}>{`${text.length}/${ANNOUNCE_MAX}`}</Txt>
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Txt tone={out ? 'warn' : 'muted'} style={{ fontSize: 12, flexShrink: 1 }}>
          {left == null ? '' : out ? 'Ya se mandaron los avisos de hoy. Mañana puedes mandar más.' : `Te ${left === 1 ? 'queda' : 'quedan'} ${left} de ${r!.dailyLimit} avisos hoy.`}
        </Txt>
        <Button variant="primary" icon={<Send size={16} color={c.accentFg} />} loading={sending} disabled={!body || out} onPress={() => void send()}>
          Enviar aviso
        </Button>
      </View>

      {history.data.length > 0 && <AnnounceHistory list={history.data} now={now.getTime()} />}
    </Card>
  );
}

/** Los avisos que se mandaron: qué, quién, cuándo y a cuántos les llegó (se abre al tocar, como el <details> de la web). */
function AnnounceHistory({ list, now }: { list: LeagueAnnouncement[]; now: number }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: 12, gap: 8 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((v) => !v)} hitSlop={6}>
        <Txt tone="accent" style={{ fontSize: 14, fontFamily: font.medium }}>{`Últimos avisos enviados (${list.length})`}</Txt>
      </Pressable>
      {open &&
        list.map((a, i) => (
          <View key={a.id} style={[{ gap: 2, paddingVertical: 8 }, i ? { borderTopWidth: 1, borderTopColor: c.line } : null]}>
            <Txt style={{ fontSize: 14 }}>{a.body}</Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
              <Txt tone="muted" style={{ fontSize: 12 }}>
                {`${a.authorName || 'Admin'} · ${relativeTime(Date.parse(a.sentAt), now)} ·`}
              </Txt>
              {a.recipients ? (
                <Txt tone="muted" style={{ fontSize: 12 }}>{` llegó a ${a.recipients} ${a.recipients === 1 ? 'miembro' : 'miembros'}`}</Txt>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <BellOff size={12} color={c.muted} />
                  <Txt tone="muted" style={{ fontSize: 12 }}>
                    solo en el inicio
                  </Txt>
                </View>
              )}
            </View>
          </View>
        ))}
    </View>
  );
}
