/**
 * «•••» de un partido de raqueta para quien organiza (MatchAdmin.tsx de la web, con su misma lógica:
 * match/adminMenu.ts): W.O., aplazar, reprogramar (fecha, hora y cancha o mesa), quién jugó (suplente), corregir el
 * resultado, anular y borrar. Cada cosa en su hoja, con los mismos textos y avisos. «Transmitir en vivo» desde aquí,
 * todavía en la web (En vivo).
 */
import { useState } from 'react';
import { View } from 'react-native';
import { Ban, CalendarClock, CircleSlash, Pause, PencilLine, Trash2, UserRoundCog } from 'lucide-react-native';
import { deleteMatch, postponeMatch, rescheduleMatch, setMatchPlayers, setWalkover, voidMatch, type Match } from '@mm/lib/data/matches';
import { saveErrorMessage } from '@mm/lib/errorText';
import { useLeagueCtx } from '@mm/lib/league';
import type { Side } from '@mm/sports/types';
import { walkoverScore } from '@mm/pages/sports/racket/court/adapters';
import { matchAdminKeys, matchAdminText, playerOptions, type MatchAdminKey } from '@mm/pages/sports/racket/match/adminMenu';
import { isPointsMatch } from '@mm/pages/sports/racket/logic/results';
import { localParts, todayIn, zonedIso } from '@mm/pages/sports/racket/logic/time';
import { useNames } from '@mm/pages/sports/racket/names';
import { courtWords } from '@mm/pages/sports/racket/sport';
import { DateStepper } from '../DateStepper';
import { TimeStepper } from '../esports/fields';
import { PickField } from '../players/fields';
import { confirmAsync, toast } from '../feedback';
import { ChoiceRow, Field, Input, Segmented, Sheet, Txt } from '../ui';
import { MenuSheet, MoreButton, SaveFooter, useRacketPhone, type MenuItem } from './parts';

/** Lo que tarda en irse una hoja antes de abrir otra cosa encima (la pregunta del sistema, la hoja del resultado). */
const SHEET_CLOSE_MS = 400;

type Dialog = 'walkover' | 'postpone' | 'reschedule' | 'players';

const ICONS: Record<MatchAdminKey, MenuItem['icon']> = { wo: CircleSlash, aplazar: Pause, fecha: CalendarClock, quien: UserRoundCog, corregir: PencilLine, anular: Ban, borrar: Trash2 };

/** «•••» del partido y sus hojas. Sin nada que mostrar (quien no organiza), no sale. */
export function MatchAdmin({ match: m, onDeleted, onCorrect }: { match: Match; onDeleted: () => void; onCorrect?: () => void }) {
  const { lid, league, isAdmin } = useLeagueCtx();
  const { sport, ext } = useRacketPhone();
  const w = courtWords(ext);
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState<null | 'dialog' | 'void' | 'delete'>(null);
  const keys = matchAdminKeys(m, { isAdmin, points: isPointsMatch(m), canCorrect: !!onCorrect });
  if (!keys.length) return null;

  const act = async (fn: () => Promise<unknown>, ok: string, key: 'dialog' | 'void' | 'delete' = 'dialog') => {
    setBusy(key);
    try {
      await fn();
      toast(ok);
      setDialog(null);
      return true;
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
      return false;
    } finally {
      setBusy(null);
    }
  };
  const later = (fn: () => void) => {
    setMenu(false);
    setTimeout(fn, SHEET_CLOSE_MS);
  };
  const doVoid = () =>
    later(async () => {
      if (!(await confirmAsync({ title: '¿Anular el partido?', message: 'No cuenta para la tabla ni las estadísticas. Se puede deshacer corrigiendo el resultado.', confirmText: 'Anular', danger: true }))) return;
      await act(() => voidMatch(lid, m.id), 'Partido anulado', 'void');
    });
  const doDelete = () =>
    later(async () => {
      if (!(await confirmAsync({ title: '¿Borrar el partido?', message: 'Se borra con su resultado e historial. No se puede deshacer.', confirmText: 'Borrar', danger: true }))) return;
      if (await act(() => deleteMatch(lid, m.id), 'Partido borrado', 'delete')) onDeleted();
    });
  // La hoja de la opción se abre cuando el menú ya se fue (dos hojas a la vez no se ven en el iPhone).
  const open = (d: Dialog) => later(() => setDialog(d));
  const actions: Record<MatchAdminKey, () => void> = {
    wo: () => open('walkover'),
    aplazar: () => open('postpone'),
    fecha: () => open('reschedule'),
    quien: () => open('players'),
    corregir: () => later(() => onCorrect?.()),
    anular: doVoid,
    borrar: doDelete,
  };
  const items: MenuItem[] = keys.map((k) => ({
    key: k,
    icon: ICONS[k],
    ...matchAdminText(k, m, w.one),
    onPress: actions[k],
    danger: k === 'borrar',
    busy: (k === 'anular' && busy === 'void') || (k === 'borrar' && busy === 'delete'),
  }));
  const close = () => setDialog(null);
  const saving = busy === 'dialog';

  return (
    <>
      <MoreButton onPress={() => !busy && setMenu(true)} />
      <MenuSheet open={menu} onClose={() => setMenu(false)} title="Partido" items={items} />
      {dialog === 'walkover' && (
        <WalkoverSheet
          match={m}
          busy={saving}
          onClose={close}
          onSave={(absent, note) => void act(() => setWalkover(lid, m.id, absent, { score: absent === 0 ? undefined : walkoverScore(sport, m.rules, absent), note }), 'W.O. anotado')}
        />
      )}
      {dialog === 'postpone' && <PostponeSheet court={w.one} busy={saving} onClose={close} onSave={(note) => void act(() => postponeMatch(lid, m.id, note), 'Partido aplazado')} />}
      {dialog === 'reschedule' && (
        <RescheduleSheet match={m} words={w} tz={league.tz} busy={saving} onClose={close} onSave={(iso, court, note) => void act(() => rescheduleMatch(lid, m.id, iso, { court, note }), 'Partido reprogramado')} />
      )}
      {dialog === 'players' && (
        <PlayersSheet match={m} busy={saving} onClose={close} onSave={(side, ids) => void act(() => setMatchPlayers(lid, m.id, side, ids.map((playerId) => ({ playerId }))), 'Jugadores guardados')} />
      )}
    </>
  );
}

function WalkoverSheet({ match, busy, onClose, onSave }: { match: Match; busy: boolean; onClose: () => void; onSave: (absent: 0 | 1 | 2, note: string) => void }) {
  const [absent, setAbsent] = useState<0 | 1 | 2>(2);
  const [note, setNote] = useState('');
  return (
    <Sheet
      open
      onClose={onClose}
      title="W.O.: ¿quién no se presentó?"
      subtitle="El que vino gana 6-0 6-0; el que faltó suma 0"
      footer={<SaveFooter onClose={onClose} busy={busy} onSave={() => onSave(absent, note)} label="Anotar W.O." />}
    >
      <View accessibilityRole="radiogroup" accessibilityLabel="Quién no vino" style={{ gap: 8 }}>
        {([1, 2, 0] as const).map((a) => (
          <ChoiceRow key={a} title={a === 0 ? 'No vino ninguno de los dos' : `No vino ${match.sides[a - 1].label}`} selected={absent === a} onPress={() => setAbsent(a)} />
        ))}
      </View>
      <Field label="Nota (opcional)">
        <Input value={note} maxLength={300} onChangeText={setNote} placeholder="No llegaron a la hora" accessibilityLabel="Nota (opcional)" />
      </Field>
    </Sheet>
  );
}

function PostponeSheet({ court, busy, onClose, onSave }: { court: string; busy: boolean; onClose: () => void; onSave: (note: string) => void }) {
  const [note, setNote] = useState('');
  return (
    <Sheet open onClose={onClose} title="Aplazar el partido" footer={<SaveFooter onClose={onClose} busy={busy} onSave={() => onSave(note)} />}>
      <Field label="Motivo (opcional)" hint="Queda sin fecha hasta que lo reprogrames. Avísale a los jugadores el motivo.">
        <Input value={note} maxLength={300} onChangeText={setNote} placeholder={`Lluvia, no hay ${court}…`} accessibilityLabel="Motivo (opcional)" />
      </Field>
    </Sheet>
  );
}

function RescheduleSheet({
  match,
  words: w,
  tz,
  busy,
  onClose,
  onSave,
}: {
  match: Match;
  words: ReturnType<typeof courtWords>;
  tz?: string;
  busy: boolean;
  onClose: () => void;
  onSave: (iso: string, court: string, note: string) => void;
}) {
  // Se monta al abrirse: empieza con la fecha, la hora y la cancha del partido.
  const [start] = useState(() => localParts(match.scheduledAt, tz));
  const [date, setDate] = useState(start?.date ?? todayIn(tz));
  const [time, setTime] = useState(start?.time ?? '20:00');
  const [court, setCourt] = useState(match.court);
  const [note, setNote] = useState('');
  const iso = zonedIso(date, time, tz);
  return (
    <Sheet open onClose={onClose} title={`Fecha, hora y ${w.one}`} footer={<SaveFooter onClose={onClose} busy={busy} disabled={!iso} onSave={() => iso && onSave(iso, court.trim(), note)} />}>
      <Field label="Fecha">
        <DateStepper value={date} onChange={setDate} />
      </Field>
      <Field label="Hora">
        <TimeStepper value={time} onChange={setTime} label="Hora" />
      </Field>
      <Field label={w.One}>
        <Input value={court} maxLength={40} onChangeText={setCourt} placeholder={`${w.One} 2`} accessibilityLabel={w.One} />
      </Field>
      <Field label="Nota para los jugadores (opcional)">
        <Input value={note} maxLength={300} onChangeText={setNote} placeholder="Se pasó por lluvia" accessibilityLabel="Nota para los jugadores (opcional)" />
      </Field>
    </Sheet>
  );
}

/** Quién jugó en cada lado (el suplente también: la pareja suma y las estadísticas van a quien jugó). */
function PlayersSheet({ match, busy, onClose, onSave }: { match: Match; busy: boolean; onClose: () => void; onSave: (side: Side, ids: string[]) => void }) {
  const names = useNames();
  const { doubles } = useRacketPhone();
  const size = doubles ? 2 : 1;
  const [side, setSide] = useState<Side>(1);
  const [picked, setPicked] = useState<string[]>(() => match.sides[0].players.map((p) => p.playerId));
  const pickSide = (s: Side) => {
    setSide(s);
    setPicked(match.sides[s - 1].players.map((p) => p.playerId));
  };
  const s = match.sides[side - 1];
  const roster = s.teamId ? names.rosterOf(s.teamId) : [];
  const options = playerOptions(names.players, [...roster, ...picked]);
  return (
    <Sheet
      open
      onClose={onClose}
      title="Quién juega"
      subtitle={size === 2 ? 'Con suplente, la pareja suma igual' : undefined}
      footer={<SaveFooter onClose={onClose} busy={busy} disabled={!picked.length} onSave={() => onSave(side, picked)} />}
    >
      <Segmented<'1' | '2'>
        label="Lado"
        options={[
          { key: '1', label: match.sides[0].label },
          { key: '2', label: match.sides[1].label },
        ]}
        value={side === 1 ? '1' : '2'}
        onChange={(k) => pickSide(k === '1' ? 1 : 2)}
      />
      <Txt tone="muted" style={{ fontSize: 13 }}>
        Elige {size === 2 ? 'los dos que juegan' : 'quién juega'}. Las estadísticas van a quien jugó.
      </Txt>
      {[0, 1].slice(0, size).map((i) => (
        <Field key={i} label={size === 2 ? `Jugador ${i + 1}` : 'Jugador'}>
          <PickField<string>
            label={size === 2 ? `Jugador ${i + 1}` : 'Jugador'}
            value={picked[i] ?? ''}
            options={[
              { key: '', label: '(nadie)' },
              // Quien ya juega en el otro puesto no sale (en la web sale apagado).
              ...options.filter((p) => !(picked.includes(p.id) && picked[i] !== p.id)).map((p) => ({ key: p.id, label: `${p.name}${roster.includes(p.id) ? ' (de la pareja)' : ''}` })),
            ]}
            onChange={(id) => {
              const next = [...picked];
              next[i] = id;
              setPicked(next.filter(Boolean));
            }}
          />
        </Field>
      ))}
    </Sheet>
  );
}
