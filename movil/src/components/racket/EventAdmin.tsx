/**
 * «•••» de los eventos de raqueta para quien organiza, en Lite (NightPage, LeaguePage y TourneyPage de la web): la
 * noche (compartir la tabla, ajustes, jugadores, inscripción, terminar o volver a abrir, anotadores y borrar), la liga
 * de parejas (borrar) y el torneo (inscripción, anotadores y borrar). Armar las rondas, el calendario, los grupos y el
 * cuadro son de Pro en la web: la app (Lite) muestra el mismo aviso y lo abre en la web (ProNotice). El Excel y
 * «Rehacer el calendario» (Pro), en la web.
 */
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { ClipboardList, ClipboardPen, Lock, LockOpen, MessageCircle, Settings2, Share2, Trash2, Users } from 'lucide-react-native';
import { deleteEvent } from '@mm/lib/data/events';
import { updateRacketEvent, type RacketEvent } from '@mm/lib/data/racket';
import { saveErrorMessage } from '@mm/lib/errorText';
import { formatDateLong } from '@mm/lib/format';
import { useLeagueCtx } from '@mm/lib/league';
import { shareOrigin } from '@mm/lib/origin';
import type { StandingRow } from '@mm/sports/types';
import { whatsappShareUrl } from '@mm/components/match/format';
import { useLevels } from '@mm/pages/sports/racket/levels';
import { NIGHT_MAX_PLAYERS, nightConfigJson, nightShareText, type NightConfig, type NightRound } from '@mm/pages/sports/racket/logic/night';
import type { SignupSettings } from '@mm/pages/sports/racket/logic/signup';
import { tourneyConfigJson, type TourneyConfig } from '@mm/pages/sports/racket/logic/tourney';
import { entrantPlayers, useNames } from '@mm/pages/sports/racket/names';
import { useRacket } from '@mm/pages/sports/racket/sport';
import { ScorersSheet } from '../scorers/ScorersSheet';
import { confirmAsync, toast } from '../feedback';
import { Button, Sheet, Txt } from '../ui';
import { NightFields, NightPlayers, SignupSettingsSheet } from './NightForm';
import { EventMenu, SaveFooter, type MenuItem } from './parts';
import { useColors } from '@/theme/theme';

/** Borrar el evento: pregunta, vuelve a la liga y lo borra (como la web). */
export function useDeleteEvent(event: RacketEvent, o: { title: string; message: string; ok: string }) {
  const { lid } = useLeagueCtx();
  return async () => {
    if (!(await confirmAsync({ title: `¿Borrar ${o.title}?`, message: o.message, confirmText: 'Borrar', danger: true }))) return;
    router.navigate({ pathname: '/l/[lid]', params: { lid } });
    try {
      await deleteEvent(lid, event.id);
      toast(o.ok);
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    }
  };
}

/** Guarda la configuración del evento (se reemplaza entera) y avisa. true si salió bien. */
async function saveEventConfig(lid: string, eventId: string, config: Record<string, unknown>, ok: string): Promise<boolean> {
  try {
    await updateRacketEvent(lid, eventId, { config });
    toast(ok);
    return true;
  } catch (e) {
    toast(saveErrorMessage(e), 'error');
    return false;
  }
}

// ---------- Liga de parejas ----------

export function LeagueMenu({ event, title }: { event: RacketEvent; title: string }) {
  const { isAdmin } = useLeagueCtx();
  const remove = useDeleteEvent(event, { title, message: 'Se borran sus partidos y resultados. No se puede deshacer.', ok: 'Liga borrada' });
  const items: MenuItem[] = isAdmin ? [{ key: 'borrar', icon: Trash2, label: 'Borrar la liga', onPress: () => void remove(), danger: true }] : [];
  return <EventMenu title={title} items={items} />;
}

// ---------- Noche ----------

type NightSheet = 'compartir' | 'ajustes' | 'jugadores' | 'inscripcion' | 'anotadores';

export function NightMenu({ event, title, cfg, rounds, table, finished }: { event: RacketEvent; title: string; cfg: NightConfig; rounds: readonly NightRound[]; table: readonly StandingRow[]; finished: boolean }) {
  const { lid, league, isAdmin } = useLeagueCtx();
  const names = useNames();
  const [sheet, setSheet] = useState<NightSheet | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const current = rounds.at(-1) ?? null;
  // Como la base: la noche empezó al publicar una ronda o al cerrarse (ya nadie se apunta ni sube de la espera).
  const started = !!current || cfg.round > 0 || cfg.closed;
  const remove = useDeleteEvent(event, { title, message: 'Se borran sus rondas y resultados. No se puede deshacer.', ok: 'Noche borrada' });

  const save = async (next: NightConfig, ok: string, key: string) => {
    setBusy(key);
    const done = await saveEventConfig(lid, event.id, nightConfigJson(next), ok);
    setBusy(null);
    if (done) setSheet(null);
    return done;
  };
  const closeNight = async (closed: boolean) => {
    if (closed && !(await confirmAsync({ title: '¿Terminar la noche?', message: 'Queda la tabla final. Se puede volver a abrir.', confirmText: 'Terminar la noche' }))) return;
    await save({ ...cfg, closed }, closed ? 'Noche terminada' : 'Noche abierta otra vez', closed ? 'cerrar' : 'abrir');
  };

  const share = nightShareText({
    title,
    date: formatDateLong(event.date),
    rows: table,
    nameOf: names.nameOf,
    points: cfg.points,
    final: finished,
    url: `${shareOrigin(null)}/l/${lid}/e/${event.id}?ver=tabla`,
  });

  const items: MenuItem[] = [
    { key: 'compartir', icon: Share2, label: 'Compartir la tabla', hint: 'Por WhatsApp o copiada', onPress: () => setSheet('compartir') },
    ...(isAdmin
      ? [
          { key: 'ajustes', icon: Settings2, label: 'Ajustes de la noche', hint: 'Canchas, puntos, rondas y descansos', onPress: () => setSheet('ajustes') },
          { key: 'jugadores', icon: Users, label: 'Jugadores', hint: 'Quién llega tarde o se va', onPress: () => setSheet('jugadores') },
          ...(!started ? [{ key: 'inscripcion', icon: ClipboardList, label: 'Inscripción', hint: 'Me apunto, cupo y lista de espera', onPress: () => setSheet('inscripcion') }] : []),
          ...(cfg.closed
            ? [{ key: 'abrir', icon: LockOpen, label: 'Volver a abrir la noche', onPress: () => void closeNight(false), busy: busy === 'abrir' }]
            : current
              ? [{ key: 'cerrar', icon: Lock, label: 'Terminar la noche', hint: 'Queda la tabla final', onPress: () => void closeNight(true), busy: busy === 'cerrar' }]
              : []),
          { key: 'anotadores', icon: ClipboardPen, label: 'Anotadores', hint: 'Quién anota esta noche', onPress: () => setSheet('anotadores') },
          { key: 'borrar', icon: Trash2, label: 'Borrar la noche', onPress: () => void remove(), danger: true },
        ]
      : []),
  ];

  return (
    <EventMenu title={title} items={items}>
      {sheet === 'compartir' && <ShareSheet title={title} text={share} onClose={() => setSheet(null)} />}
      {sheet === 'ajustes' && <NightSettingsSheet cfg={cfg} busy={busy === 'ajustes'} onClose={() => setSheet(null)} onSave={(c) => void save(c, 'Guardado', 'ajustes')} />}
      {sheet === 'jugadores' && <NightPlayersSheet cfg={cfg} busy={busy === 'jugadores'} onClose={() => setSheet(null)} onSave={(c) => void save(c, 'Jugadores guardados', 'jugadores')} />}
      {sheet === 'inscripcion' && (
        <SignupSettingsSheet
          value={cfg.signup ?? null}
          busy={busy === 'inscripcion'}
          unit={['jugador', 'jugadores']}
          defaultCap={Math.max(4, cfg.courts.length * 4)}
          maxCap={NIGHT_MAX_PLAYERS}
          tz={league.tz}
          onClose={() => setSheet(null)}
          onSave={(s: SignupSettings | null) => void save(s ? { ...cfg, signup: s } : cfg, s?.open ? 'Inscripción abierta' : 'Inscripción cerrada', 'inscripcion')}
        />
      )}
      <ScorersSheet
        league={league}
        open={sheet === 'anotadores'}
        onClose={() => setSheet(null)}
        target={{ scope: 'evento', refId: event.id, title: event.name || (league.kind === 'torneo' ? league.name : title) }}
        participants={cfg.players}
      />
    </EventMenu>
  );
}

/** La tabla en texto: por WhatsApp o copiada (la hoja «Compartir la tabla»). */
function ShareSheet({ title, text, onClose }: { title: string; text: string; onClose: () => void }) {
  const c = useColors();
  const [copying, setCopying] = useState(false);
  const copy = async () => {
    setCopying(true);
    try {
      await Clipboard.setStringAsync(text);
      toast('Tabla copiada');
    } catch {
      toast('No se pudo copiar', 'error');
    } finally {
      setCopying(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title="Compartir la tabla" subtitle={title}>
      <View style={{ borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: c.surface2 }}>
        <Txt style={{ fontSize: 14, lineHeight: 20 }}>{text}</Txt>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button variant="primary" size="lg" full icon={<MessageCircle size={20} color={c.accentFg} />} onPress={() => void Linking.openURL(whatsappShareUrl(text))}>
            WhatsApp
          </Button>
        </View>
        <View style={{ flex: 1 }}>
          <Button size="lg" full loading={copying} onPress={() => void copy()}>
            Copiar la tabla
          </Button>
        </View>
      </View>
    </Sheet>
  );
}

/** «Ajustes de la noche»: canchas, puntos, rondas y descansos (valen desde la ronda que sigue). Se monta al abrirse. */
function NightSettingsSheet({ cfg, busy, onClose, onSave }: { cfg: NightConfig; busy: boolean; onClose: () => void; onSave: (c: NightConfig) => void }) {
  const [draft, setDraft] = useState(cfg);
  const changedPlan = draft.courts.length !== cfg.courts.length || draft.rounds !== cfg.rounds;
  return (
    <Sheet
      open
      onClose={onClose}
      title="Ajustes de la noche"
      subtitle="Valen desde la ronda que sigue"
      footer={
        <SaveFooter
          onClose={onClose}
          busy={busy}
          onSave={() => onSave(changedPlan ? { ...draft, courts: draft.courts.map((x, i) => x.trim() || `Cancha ${i + 1}`), plan: undefined, planPlayers: undefined, planFrom: undefined } : draft)}
        />
      }
    >
      <NightFields value={draft} onChange={setDraft} />
    </Sheet>
  );
}

/** «Jugadores de la noche» (valen desde la ronda que sigue). Se monta al abrirse. */
function NightPlayersSheet({ cfg, busy, onClose, onSave }: { cfg: NightConfig; busy: boolean; onClose: () => void; onSave: (c: NightConfig) => void }) {
  const { levels } = useLevels();
  const [players, setPlayers] = useState(cfg.players);
  // La versión de la lista que se abrió: si alguien se apunta mientras tanto, la base no lo pierde al guardar.
  const [rev] = useState(cfg.signup?.rev ?? 0);
  return (
    <Sheet
      open
      onClose={onClose}
      title="Jugadores de la noche"
      subtitle="Los cambios valen desde la ronda que sigue"
      footer={
        <SaveFooter
          onClose={onClose}
          busy={busy}
          disabled={players.length < 4 && !cfg.signup}
          onSave={() => {
            const lv = { ...cfg.levels };
            for (const p of players) if (levels[p] != null) lv[p] = levels[p];
            onSave({ ...cfg, players, levels: lv, ...(cfg.signup ? { signup: { ...cfg.signup, rev } } : {}) });
          }}
        />
      }
    >
      <NightPlayers value={players} onChange={setPlayers} levels={levels} />
    </Sheet>
  );
}

// ---------- Torneo ----------

type TourneySheet = 'inscripcion' | 'anotadores';

export function TourneyMenu({ event, title, cfg, started }: { event: RacketEvent; title: string; cfg: TourneyConfig; started: boolean }) {
  const { lid, league, isAdmin } = useLeagueCtx();
  const names = useNames();
  const [sheet, setSheet] = useState<TourneySheet | null>(null);
  const [busy, setBusy] = useState(false);
  const remove = useDeleteEvent(event, { title, message: 'Se borran sus partidos y resultados. No se puede deshacer.', ok: 'Torneo borrado' });
  const n = cfg.categories.length;
  const { side } = useRacket();
  const items: MenuItem[] = isAdmin
    ? [
        ...(!started && n > 0 ? [{ key: 'inscripcion', icon: ClipboardList, label: 'Inscripción', hint: 'Me apunto por categoría', onPress: () => setSheet('inscripcion') }] : []),
        { key: 'anotadores', icon: ClipboardPen, label: 'Anotadores', hint: 'Quién anota este torneo', onPress: () => setSheet('anotadores') },
        { key: 'borrar', icon: Trash2, label: 'Borrar el torneo', onPress: () => void remove(), danger: true },
      ]
    : [];
  const saveSignup = async (s: SignupSettings | null) => {
    setBusy(true);
    const ok = s?.open ? 'Inscripción abierta' : 'Inscripción cerrada';
    let done = true;
    if (s) done = await saveEventConfig(lid, event.id, tourneyConfigJson({ ...cfg, signup: s }), ok);
    else toast(ok);
    setBusy(false);
    if (done) setSheet(null);
  };
  return (
    <EventMenu title={title} items={items}>
      {sheet === 'inscripcion' && <SignupSettingsSheet value={cfg.signup ?? null} busy={busy} unit={side} perCategory defaultCap={8} tz={league.tz} onClose={() => setSheet(null)} onSave={(s) => void saveSignup(s)} />}
      <ScorersSheet
        league={league}
        open={sheet === 'anotadores'}
        onClose={() => setSheet(null)}
        target={{ scope: 'evento', refId: event.id, title: event.name || (league.kind === 'torneo' ? league.name : title) }}
        participants={cfg.categories.flatMap((c) => entrantPlayers(c.pairs, names))}
      />
    </EventMenu>
  );
}
