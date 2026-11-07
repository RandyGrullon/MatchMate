/**
 * El «•••» de un partido de equipos en la app (MatchMenu, RescheduleSheet, WalkoverSheet y DisputeCard de
 * MatchAdminPanel.tsx de la web, con su lógica: matchView.ts y schedule.ts): para los admins y anotadores con la liga
 * en vivo activada, «Transmitir en vivo»; para el admin, el anotador de mesa, reprogramar, aplazar, W.O. (con el
 * marcador del deporte), poner o corregir el resultado, decidir un reclamo, lo del deporte (corregir el acta del fútbol),
 * anular y, al final y en rojo, borrar. Cada cosa abre su hoja o pregunta antes.
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Ban, CalendarClock, ClipboardPen, Gavel, MoreHorizontal, PauseCircle, Radio, Trash2, UserCheck, UserX, type LucideIcon } from 'lucide-react-native';
import { deleteMatch, postponeMatch, rescheduleMatch, resolveDispute, setWalkover, voidMatch, type Match, type MatchScore } from '@mm/lib/data/matches';
import { streamFor, useLeagueStreams } from '@mm/lib/data/streams';
import { useNow } from '@mm/lib/useNow';
import { canStartStream } from '@mm/components/live/logic';
import { dayKey } from '@mm/components/match/format';
import type { ResultParser } from '@mm/components/match/parsers';
import { localTime, matchClashes, zonedIso } from '@mm/pages/sports/team/schedule';
import { DELETE_ASK, POSTPONE_ASK, VOID_ASK, adminMenuEntries, resultHint, walkoverRows, type AdminMenuKey } from '@mm/pages/sports/team/matchView';
import type { TeamLeague } from '@mm/pages/sports/team/useTeamLeague';
import { todayIn } from '@mm/pages/sports/team/view';
import { DateStepper } from '../DateStepper';
import { TimeStepper } from '../esports/fields';
import { MenuRow } from '../esports/inputs';
import { StartStreamSheet } from '../live/StartStreamSheet';
import { ResultSheet } from '../match/ResultParts';
import { confirmAsync } from '../feedback';
import { Badge, Button, Card, Field, Input, Sheet, Txt } from '../ui';
import { act } from './admin/parts';
import { OfficialSheet } from './admin/Officials';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** Una opción de «•••» que trae la pantalla (corregir el acta del fútbol). */
export interface MatchMenuItem {
  key: string;
  icon: LucideIcon;
  label: string;
  hint?: string;
  onPress: () => void;
}

type SheetKey = 'menu' | 'vivo' | 'anotador' | 'reprogramar' | 'wo' | 'corregir' | 'resolver';

const ICONS: Record<AdminMenuKey, LucideIcon> = {
  anotador: UserCheck,
  reprogramar: CalendarClock,
  aplazar: PauseCircle,
  wo: UserX,
  resolver: Gavel,
  corregir: ClipboardPen,
  anular: Ban,
  borrar: Trash2,
};

/** El botón «•••» de arriba del partido con su hoja; sin nada que mostrar, no sale. */
export function MatchMenu({
  tl,
  match: m,
  title,
  parser,
  placeholder,
  walkoverScore,
  minutes = 90,
  onDeleted,
  extraAdmin = [],
}: {
  tl: TeamLeague;
  match: Match;
  /** El título de la hoja («Tigres vs. Leones»). */
  title: string;
  /** Lector de «solo resultado» del deporte (78-72, 2-1). */
  parser: ResultParser;
  placeholder: string;
  /** Marcador del W.O. del deporte (20-0, 3-0) según quién no vino (0 = ninguno). */
  walkoverScore: (absent: 0 | 1 | 2) => MatchScore;
  minutes?: number;
  onDeleted?: () => void;
  extraAdmin?: readonly MatchMenuItem[];
}) {
  const c = useColors();
  const [sheet, setSheet] = useState<SheetKey | null>(null);
  const [busy, setBusy] = useState<'aplazar' | 'anular' | 'borrar' | null>(null);
  const streams = useLeagueStreams(tl.lid).data;
  const canLive = canStartStream(tl) && !streamFor(streams, { matchId: m.id });
  const official = tl.officialOf(m.id);
  const name = (side: 1 | 2) => tl.teamOf(m.sides[side - 1].teamId)?.name ?? m.sides[side - 1].label;
  const names: [string, string] = [name(1), name(2)];

  async function run(key: 'aplazar' | 'anular' | 'borrar', ask: Parameters<typeof confirmAsync>[0], fn: () => Promise<unknown>, ok: string) {
    setSheet(null);
    if (!(await confirmAsync(ask))) return false;
    setBusy(key);
    const done = await act(async () => {
      await fn();
      return true;
    }, ok);
    setBusy(null);
    return !!done;
  }
  const pick: Record<AdminMenuKey, () => void> = {
    anotador: () => setSheet('anotador'),
    reprogramar: () => setSheet('reprogramar'),
    aplazar: () => void run('aplazar', POSTPONE_ASK, () => postponeMatch(tl.lid, m.id), 'Partido aplazado'),
    wo: () => setSheet('wo'),
    resolver: () => setSheet('resolver'),
    corregir: () => setSheet('corregir'),
    anular: () => void run('anular', VOID_ASK, () => voidMatch(tl.lid, m.id), 'Partido anulado'),
    borrar: () =>
      void run('borrar', DELETE_ASK, () => deleteMatch(tl.lid, m.id), 'Partido borrado').then((ok) => {
        if (ok) onDeleted?.();
      }),
  };
  const admin = tl.isAdmin;
  const entries = admin ? adminMenuEntries(m, { official: official ? official.name || 'Designado' : null, first: names[0] }) : [];
  // Lo del deporte para el admin (corregir el acta) va antes de anular y borrar.
  const head = entries.filter((e) => e.key !== 'anular' && e.key !== 'borrar');
  const tail = entries.filter((e) => e.key === 'anular' || e.key === 'borrar');
  const hasItems = canLive || entries.length > 0;

  const row = (e: (typeof entries)[number]) => {
    const I = ICONS[e.key];
    const waiting = busy === e.key;
    return (
      <MenuRow
        key={e.key}
        icon={waiting ? <ActivityIndicator size="small" color={e.danger ? c.danger : c.fg2} /> : <I size={20} color={e.danger ? c.danger : c.fg2} />}
        label={e.label}
        hint={e.hint}
        danger={e.danger}
        disabled={!!busy}
        onPress={pick[e.key]}
      />
    );
  };

  return (
    <>
      {hasItems && (
        <Pressable accessibilityRole="button" accessibilityLabel="Más opciones" hitSlop={6} onPress={() => setSheet('menu')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <MoreHorizontal size={22} color={c.fg} />
        </Pressable>
      )}
      <Sheet open={sheet === 'menu'} onClose={() => setSheet(null)} title={title}>
        {canLive && <MenuRow icon={<Radio size={20} color={c.fg2} />} label="Transmitir en vivo" hint="Pon el link de YouTube, Twitch, Facebook…" onPress={() => setSheet('vivo')} />}
        {head.map(row)}
        {admin &&
          extraAdmin.map((it) => (
            <MenuRow
              key={it.key}
              icon={<it.icon size={20} color={c.fg2} />}
              label={it.label}
              hint={it.hint}
              onPress={() => {
                setSheet(null);
                it.onPress();
              }}
            />
          ))}
        {tail.map(row)}
      </Sheet>
      {(canLive || sheet === 'vivo') && <StartStreamSheet lid={tl.lid} matchId={m.id} defaultTitle={title} open={sheet === 'vivo'} onClose={() => setSheet(null)} />}
      {admin && (
        <>
          <OfficialSheet tl={tl} match={m} open={sheet === 'anotador'} onClose={() => setSheet(null)} />
          {sheet === 'reprogramar' && <RescheduleSheet tl={tl} match={m} minutes={minutes} onClose={() => setSheet(null)} />}
          <WalkoverSheet
            open={sheet === 'wo'}
            onClose={() => setSheet(null)}
            names={names}
            onPick={(absent) => act(() => setWalkover(tl.lid, m.id, absent, { score: walkoverScore(absent) }), 'W.O. anotado')}
          />
          {(sheet === 'corregir' || sheet === 'resolver') && (
            <ResultSheet open onClose={() => setSheet(null)} lid={tl.lid} match={m} parser={parser} placeholder={placeholder} mode={sheet === 'resolver' ? 'resolve' : 'correct'} hint={resultHint(names)} />
          )}
        </>
      )}
    </>
  );
}

/** Reprogramar (o poner fecha): fecha, hora y cancha en la zona de la liga, con el aviso si choca con otro partido. */
function RescheduleSheet({ tl, match: m, minutes, onClose }: { tl: TeamLeague; match: Match; minutes: number; onClose: () => void }) {
  const now = useNow().getTime();
  const [date, setDate] = useState(() => dayKey(m.scheduledAt, tl.tz) ?? todayIn(tl.tz, now));
  const [time, setTime] = useState(() => (m.scheduledAt ? localTime(m.scheduledAt, tl.tz) : '19:00'));
  const [court, setCourt] = useState(m.court);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time);
  const teams = m.sides.map((s) => s.teamId).filter((x): x is string => !!x);
  const clashes = valid ? matchClashes({ id: m.id, date, time, court: court.trim() || null, teams }, tl.matches.data, minutes, tl.tz) : [];
  async function save() {
    setBusy(true);
    const ok = await act(async () => {
      await rescheduleMatch(tl.lid, m.id, zonedIso(date, time, tl.tz), { court: court.trim().slice(0, 40), note });
      return true;
    }, 'Partido reprogramado');
    setBusy(false);
    if (ok) onClose();
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title={m.scheduledAt ? 'Reprogramar' : 'Poner fecha'}
      footer={
        <Button variant="primary" size="lg" full loading={busy} disabled={!valid} onPress={() => void save()}>
          Guardar
        </Button>
      }
    >
      <Field label="Fecha">
        <DateStepper value={date} onChange={setDate} />
      </Field>
      <Field label="Hora">
        <TimeStepper value={time} onChange={setTime} label="Hora" />
      </Field>
      <Field label="Cancha">
        <Input value={court} maxLength={40} onChangeText={setCourt} accessibilityLabel="Cancha" />
      </Field>
      <Field label="Aviso (opcional)">
        <Input value={note} maxLength={200} onChangeText={setNote} placeholder="Se cambió por la lluvia" accessibilityLabel="Aviso (opcional)" />
      </Field>
      {clashes.length > 0 && (
        <View style={{ alignSelf: 'flex-start' }}>
          <Badge tone="warn">Choca con otro partido a esa hora</Badge>
        </View>
      )}
    </Sheet>
  );
}

/** ¿Quién no se presentó? Pierde por forfeit (0 puntos en la tabla); la ruedita en el que se tocó. */
function WalkoverSheet({ open, onClose, names, onPick }: { open: boolean; onClose: () => void; names: [string, string]; onPick: (absent: 0 | 1 | 2) => Promise<unknown> }) {
  const c = useColors();
  const [busy, setBusy] = useState<0 | 1 | 2 | null>(null);
  async function pick(absent: 0 | 1 | 2) {
    if (busy !== null) return;
    setBusy(absent);
    await onPick(absent);
    setBusy(null);
    onClose();
  }
  return (
    <Sheet open={open} onClose={onClose} title="¿Quién no se presentó?" subtitle="Pierde por forfeit (0 puntos en la tabla)">
      {walkoverRows(names).map((r) => (
        <Pressable
          key={r.absent}
          accessibilityRole="button"
          disabled={busy !== null}
          onPress={() => void pick(r.absent)}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, borderRadius: 16, paddingHorizontal: 8, paddingVertical: 8, backgroundColor: pressed ? c.surface2 : 'transparent', opacity: busy !== null && busy !== r.absent ? 0.7 : 1 })}
        >
          <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface2 }}>
            {busy === r.absent ? <ActivityIndicator size="small" color={c.fg2} /> : <UserX size={20} color={c.fg2} />}
          </View>
          <Txt variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
            {r.label}
          </Txt>
        </Pressable>
      ))}
    </Sheet>
  );
}

/**
 * Un resultado en disputa, para el admin: «En disputa» en rojo con lo que dijo el rival, «Dejar lo anotado» (confirma
 * lo que se propuso) y «Decidir el reclamo» (pone el marcador que vale). Para los demás no sale.
 */
export function DisputeCard({ tl, match: m, parser, placeholder }: { tl: TeamLeague; match: Match; parser: ResultParser; placeholder: string }) {
  const c = useColors();
  const [deciding, setDeciding] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!tl.isAdmin || m.status !== 'disputed') return null;
  const names: [string, string] = [tl.teamOf(m.sides[0].teamId)?.name ?? m.sides[0].label, tl.teamOf(m.sides[1].teamId)?.name ?? m.sides[1].label];
  async function keep() {
    setBusy(true);
    await act(() => resolveDispute(tl.lid, m.id, {}), 'Queda lo anotado');
    setBusy(false);
  }
  return (
    <Card style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Gavel size={16} color={c.danger} />
        <Txt tone="danger" style={{ fontSize: 14, fontFamily: font.bold }}>
          En disputa
        </Txt>
      </View>
      <Txt>{m.disputeNote ? `«${m.disputeNote}»` : 'El rival dice que el resultado no es así.'}</Txt>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          <Button size="lg" full loading={busy} onPress={() => void keep()}>
            Dejar lo anotado
          </Button>
        </View>
        <View style={{ flex: 1 }}>
          <Button variant="primary" size="lg" full disabled={busy} onPress={() => setDeciding(true)}>
            Decidir el reclamo
          </Button>
        </View>
      </View>
      {deciding && <ResultSheet open onClose={() => setDeciding(false)} lid={tl.lid} match={m} parser={parser} placeholder={placeholder} mode="resolve" hint={resultHint(names)} />}
    </Card>
  );
}
