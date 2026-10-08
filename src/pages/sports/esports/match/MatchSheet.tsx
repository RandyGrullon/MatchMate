import { useMemo, useRef, useState } from 'react';
import { CalendarClock, Camera, Gavel, Pencil, Plus, Trophy, Undo2, UserX, X, XCircle } from 'lucide-react';
import { useAuth } from '../../../../lib/auth';
import {
  adminCorrectResult,
  finishMatch,
  hasResult,
  isOpen,
  rescheduleMatch,
  resolveDispute,
  setWalkover,
  useMatch,
  voidMatch,
  type Match,
} from '../../../../lib/data/matches';
import { addMatchProof, esportsErrorText, useEntries, type EsportsEntry } from '../../../../lib/data/esports';
import { useLeagueCtx } from '../../../../lib/league';
import { usePhoto } from '../../../../lib/photos';
import {
  GAMES,
  buildSeriesScore,
  parseSeriesScore,
  seriesWinner,
  validateGame,
  validateSeries,
  walkoverScore,
  type GameRecord,
  type SeriesRules,
} from '../../../../sports/esports';
import { TeamLogo } from '../../../../components/esports/bits';
import { useBusy } from '../../../../components/busy';
import { useFeedback } from '../../../../components/feedback';
import { EventMenu, MoreButton, type MenuItem } from '../../../../components/event/EventHeader';
import { ConfirmResultBanner, sideName, statusInfo, whenText } from '../../../../components/match';
import { MatchStatus } from '../../../../components/match/MatchCard';
import { useIsPro } from '../../../../components/mode';
import { Button, Card, Empty, Field, Input, LoadError, PageSkeleton, Sheet, Skeleton, cx } from '../../../../components/ui';
import { BackBar, HideShellBar } from '../../racket/frame';
import { localParts, zonedIso } from '../../racket/logic/time';
import { ProofStrip } from '../br/BrGamesList';
import { canAddGame, entryBySideTeam, resultSummary, rulesFromMatch, sideOfTeams } from '../logic';
import { Initials, useMyTeams } from '../parts';
import { GameRow, cleanGame, emptyGame, gameWord } from './GameRow';

type EditMode = 'finish' | 'correct' | 'resolve';

/**
 * La hoja del partido de una serie de esports (§12.8), abierta con `?partido=<id>`: «‹ Torneo» arriba (con «•••» para
 * quien organiza en Pro), la fase y la hora, los dos lados con su siembra y la serie («Al mejor de 3», «2-1» y el detalle
 * mapa por mapa), confirmar o reclamar (el capitán rival), y **anotar** mapa por mapa o juego por juego con la regla del
 * juego: el capitán de un lado, el admin o un anotador, mientras la serie siga abierta. El error del motor sale en vivo
 * debajo de cada mapa; hasta 3 capturas de la pantalla final; «Enviar resultado» (o «Guardar resultado» si lo anota el
 * admin: queda confirmado) con el resumen («Gana Tigres 2-1»). Quien organiza: corregir, W.O., cambiar la hora, anular
 * y decidir un reclamo («Dejar el propuesto» o «Corregir»).
 */
export function MatchSheet({ matchId, onBack, backLabel, shellBar }: { matchId: string; onBack: () => void; backLabel: string; shellBar?: boolean }) {
  const { lid, isAdmin, member, league } = useLeagueCtx();
  const pro = useIsPro();
  const q = useMatch(lid, matchId);
  const m = q.data;
  const entries = useEntries(m?.eventId ?? undefined);
  const myTeams = useMyTeams(entries.data);
  const [edit, setEdit] = useState<EditMode | null>(null);
  const [sheet, setSheet] = useState<null | 'menu' | 'wo' | 'hora'>(null);
  const busy = useBusy<'dejar' | 'anular'>();
  const { toast, confirm } = useFeedback();
  const entryOf = useMemo(() => entryBySideTeam(entries.data), [entries.data]);

  if (q.error) return <LoadError error={q.error} />;
  if (q.loading && !m) return <PageSkeleton />;
  if (!m) {
    return (
      <div className="flex flex-col px-2">
        {shellBar && <HideShellBar />}
        <BackBar label={backLabel} onBack={onBack} />
        <Empty title="Esta serie ya no existe">
          <button type="button" className="min-h-11 text-accent" onClick={onBack}>
            Volver
          </button>
        </Empty>
      </div>
    );
  }
  const rules = rulesFromMatch(m.rules, m.format);
  if (!rules) {
    return (
      <div className="flex flex-col px-2">
        {shellBar && <HideShellBar />}
        <BackBar label={backLabel} onBack={onBack} />
        <Empty title="No se pudo leer la serie">Actualiza la app e intenta de nuevo.</Empty>
      </div>
    );
  }

  const organizer = isAdmin && pro;
  const mySide = sideOfTeams(m, myTeams.act);
  const known = m.sides.every((s) => !!s.teamId);
  const canScore = isOpen(m) && known && (isAdmin || !!member?.scorer || mySide !== null);
  const names: [string, string] = [sideName(m.sides[0]), sideName(m.sides[1])];
  const heading = m.stage || 'Serie';
  const when = whenText(m.scheduledAt, league.tz, true);
  const status = statusInfo(m);
  const mode: EditMode | null = edit ?? (canScore ? 'finish' : null);
  const entryFor = (n: 1 | 2) => {
    const team = m.sides[n - 1].teamId;
    const id = team ? entryOf.get(team) : undefined;
    return id ? (entries.data.find((e) => e.id === id) ?? null) : null;
  };

  const keepProposed = () =>
    busy.run('dejar', async () => {
      try {
        await resolveDispute(lid, m.id, { note: 'Queda el resultado propuesto' });
        toast('Reclamo resuelto: queda el propuesto');
      } catch (e) {
        toast(esportsErrorText(e, rules.game), 'error');
      }
    });
  const doVoid = async () => {
    setSheet(null);
    if (!(await confirm({ title: '¿Anular esta serie?', message: 'No cuenta para la tabla ni para el cuadro.', confirmText: 'Anular', danger: true }))) return;
    await busy.run('anular', async () => {
      try {
        await voidMatch(lid, m.id);
        toast('Serie anulada');
      } catch (e) {
        toast(esportsErrorText(e, rules.game), 'error');
      }
    });
  };

  const correct = () => {
    setSheet(null);
    setEdit('correct');
  };
  const menu: MenuItem[] = organizer
    ? [
        ...(hasResult(m) ? [{ key: 'corregir', icon: Pencil, label: 'Corregir resultado', hint: 'Queda confirmado', onClick: correct }] : []),
        ...(isOpen(m) && known ? [{ key: 'wo', icon: UserX, label: 'W.O.', hint: 'Quién no vino', onClick: () => setSheet('wo') }] : []),
        ...(isOpen(m) || m.status === 'postponed' ? [{ key: 'hora', icon: CalendarClock, label: 'Cambiar hora', onClick: () => setSheet('hora') }] : []),
        ...(m.status !== 'void' ? [{ key: 'anular', icon: XCircle, label: 'Anular la serie', onClick: () => void doVoid(), danger: true, busy: busy.isBusy('anular') }] : []),
      ]
    : [];

  return (
    <div className="flex flex-col px-2">
      {shellBar && <HideShellBar />}
      <BackBar label={backLabel} onBack={onBack} right={menu.length > 0 && <MoreButton onClick={() => setSheet('menu')} />} />
      <h1 className={pro ? 'mt-0.5 text-title-pro' : 'mt-1 text-title'}>{heading}</h1>
      <p className={cx('flex min-w-0 flex-wrap items-center gap-x-1.5 text-meta text-muted', pro ? 'mt-1' : 'mt-1.5')}>
        <MatchStatus label={status.label} tone={status.tone} live={status.live} className="text-meta" />
        <span aria-hidden="true">·</span>
        <span>{`Al mejor de ${rules.bestOf}`}</span>
        {when && (
          <>
            <span aria-hidden="true">·</span>
            <span>{when}</span>
          </>
        )}
      </p>

      <SeriesBoard match={m} rules={rules} names={names} mySide={mySide} entryFor={entryFor} className="mt-[22px]" />

      <ConfirmResultBanner lid={lid} match={m} mySide={mySide} isAdmin={isAdmin} className="mt-3.5" />

      {organizer && m.status === 'disputed' && edit !== 'resolve' && (
        <Card className="mt-3.5 px-[18px] pt-4 pb-[18px]">
          <p className="inline-flex items-center gap-2 text-sm font-[650] text-danger">
            <Gavel aria-hidden="true" className="size-4" />
            En disputa
          </p>
          <p className="mt-2 text-body">{m.disputeNote ? `«${m.disputeNote}»` : 'El rival dice que el resultado no es así.'}</p>
          <div className="mt-4 flex gap-2.5">
            <Button variant="quiet" size="lg" className="flex-1" icon={<Undo2 className="size-4" />} loading={busy.isBusy('dejar')} onClick={() => void keepProposed()}>
              Dejar el propuesto
            </Button>
            <Button variant="soft" size="lg" className="flex-1" onClick={() => setEdit('resolve')}>
              Corregir
            </Button>
          </div>
        </Card>
      )}

      {mode && (
        <SeriesEditor
          key={`${m.id}:${mode}`}
          match={m}
          rules={rules}
          names={names}
          mode={mode}
          admin={isAdmin}
          eventId={m.eventId}
          onCancel={edit ? () => setEdit(null) : undefined}
          onDone={() => setEdit(null)}
          pro={pro}
          className="mt-[26px]"
        />
      )}

      {!mode && !hasResult(m) && !known && m.status !== 'void' && (
        <p className="mt-[22px] rounded-2xl bg-surface-2 px-4 py-3.5 text-sm text-muted">Esta serie se juega cuando se sepan los dos lados.</p>
      )}

      {(parseSeriesScore(m.score)?.proof?.length ?? 0) > 0 && <ProofStrip ids={parseSeriesScore(m.score)!.proof!} className="mt-[26px]" />}

      <EventMenu open={sheet === 'menu'} onClose={() => setSheet(null)} title={heading} items={menu} />
      <WalkoverSheet open={sheet === 'wo'} onClose={() => setSheet(null)} match={m} rules={rules} names={names} />
      <RescheduleSheet open={sheet === 'hora'} onClose={() => setSheet(null)} match={m} tz={league.tz} game={rules.game} />
    </div>
  );
}

/**
 * Los dos lados con la serie en grande (mapas o juegos ganados), el ganador con copa y el mío en acento suave; debajo,
 * mapa por mapa («Ascent 13-9»).
 */
function SeriesBoard({
  match: m,
  rules,
  names,
  mySide,
  entryFor,
  className,
}: {
  match: Match;
  rules: SeriesRules;
  names: readonly [string, string];
  mySide: 1 | 2 | null;
  entryFor: (n: 1 | 2) => EsportsEntry | null;
  className?: string;
}) {
  const score = parseSeriesScore(m.score);
  const meta = GAMES[rules.game];
  const word = meta.mapsWord === 'mapas' ? 'Mapa' : 'Juego';
  const mapName = (id: string | undefined) => (id ? (meta.maps.find((x) => x.id === id)?.name ?? id) : null);
  return (
    <Card className={cx('px-[18px] pt-3 pb-4', className)}>
      {m.sides.map((s, i) => {
        const won = m.winner === s.side;
        const absent = m.status === 'walkover' && (m.walkoverSide === s.side || m.walkoverSide === 0);
        const entry = entryFor(s.side);
        return (
          <div key={s.side} className={cx('-mx-2.5 flex min-h-14 items-center gap-3 rounded-2xl px-2.5', i > 0 && 'mt-0.5', mySide === s.side && 'bg-accent-soft')}>
            {entry?.kind === 'team' ? <TeamLogo path={null} name={entry.name} tag={entry.tag} className="size-10" /> : <Initials name={names[i]} />}
            <span className="min-w-0 flex-1">
              <span className={cx('block truncate text-[17px]', won ? 'font-bold' : m.winner ? 'font-medium text-muted' : 'font-semibold')}>{names[i]}</span>
              {(s.seed != null || absent) && (
                <span className="block text-[13px] text-muted">{[s.seed != null ? `Siembra ${s.seed}` : null, absent ? 'No vino' : null].filter(Boolean).join(' · ')}</span>
              )}
            </span>
            {won && <Trophy className="size-5 shrink-0 text-gold" aria-label="Ganó" />}
            <span className={cx('num w-9 shrink-0 text-right text-[30px] leading-none', won ? 'font-bold' : 'font-medium text-faint')}>{score ? score.sides[i] : '–'}</span>
          </div>
        );
      })}
      {score && !score.wo && score.games.length > 0 && (
        <ol className="mt-2 flex flex-col border-t border-line pt-2">
          {score.games.map((g, i) => (
            <li key={i} className="flex min-h-9 items-center gap-2 text-[14px]">
              <span className="w-16 shrink-0 text-muted">{`${word} ${i + 1}`}</span>
              <span className="min-w-0 flex-1 truncate text-fg-2">{mapName(g.map) ?? ''}</span>
              <span className="num shrink-0 font-semibold">
                {typeof g.a === 'number' && typeof g.b === 'number' ? `${g.a}-${g.b}` : g.w ? `Gana ${names[g.w - 1]}` : ''}
                {g.ot ? ' (prórroga)' : ''}
                {typeof g.pa === 'number' && typeof g.pb === 'number' ? ` (${g.pa}-${g.pb} pen.)` : ''}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/**
 * Anotar la serie: un bloque por mapa o juego (se agregan de a uno hasta que alguien gana), las capturas y el botón con
 * el resumen. `finish`: lo anota el capitán (falta que confirme el rival) o el admin/anotador (queda confirmado);
 * `correct`: el admin corrige; `resolve`: el admin decide un reclamo con otro marcador.
 */
function SeriesEditor({
  match: m,
  rules,
  names,
  mode,
  admin,
  eventId,
  onCancel,
  onDone,
  pro,
  className,
}: {
  match: Match;
  rules: SeriesRules;
  names: [string, string];
  mode: EditMode;
  admin: boolean;
  eventId: string | null;
  onCancel?: () => void;
  onDone: () => void;
  pro: boolean;
  className?: string;
}) {
  const { lid } = useLeagueCtx();
  const { toast } = useFeedback();
  const uid = useAuth().user?.uid ?? null;
  const prev = mode === 'finish' ? null : parseSeriesScore(m.score);
  const [games, setGames] = useState<GameRecord[]>(() => (prev?.games.length ? prev.games.map((g) => ({ ...g })) : [emptyGame(rules)]));
  const [touched, setTouched] = useState<Set<number>>(() => new Set(prev?.games.map((_, i) => i) ?? []));
  const [proof, setProof] = useState<string[]>(() => [...(prev?.proof ?? [])]);
  const [tried, setTried] = useState(false);
  const busy = useBusy<'enviar' | 'foto'>();
  const file = useRef<HTMLInputElement>(null);
  const word = gameWord(rules);

  const clean = games.map(cleanGame);
  const errors = clean.map((g, i) => (touched.has(i) || tried ? validateGame(rules, g, i) : null));
  const seriesErrors = tried ? validateSeries(rules, clean, { final: true }) : [];
  const summary = resultSummary(rules, clean, names);
  const addable = canAddGame(rules, clean) && clean.every((g, i) => !validateGame(rules, g, i));

  const change = (i: number, g: GameRecord) => {
    setGames((list) => list.map((x, j) => (j === i ? g : x)));
    setTouched((s) => new Set(s).add(i));
  };

  const pickPhoto = async (f: File | undefined) => {
    if (!f || proof.length >= 3) return;
    await busy.run('foto', async () => {
      try {
        const id = await addMatchProof(lid, eventId ?? m.eventId ?? '', f);
        setProof((p) => [...p, id].slice(0, 3));
      } catch (e) {
        toast(esportsErrorText(e, rules.game), 'error');
      } finally {
        if (file.current) file.current.value = '';
      }
    });
  };

  const submit = () =>
    busy.run('enviar', async () => {
      setTried(true);
      if (validateSeries(rules, clean, { final: true }).length) return;
      const score = buildSeriesScore(rules, clean, proof);
      const winner = seriesWinner(rules, clean) ?? null;
      try {
        if (mode === 'correct') {
          await adminCorrectResult(lid, m.id, { score, winner, note: 'Corregido por el organizador' });
          toast('Resultado corregido');
        } else if (mode === 'resolve') {
          await resolveDispute(lid, m.id, { score, winner, note: 'Corregido por el organizador' });
          toast('Reclamo resuelto con el marcador nuevo');
        } else {
          const out = await finishMatch(lid, m.id, { score, winner });
          if (!out) toast('Guardado: se envía cuando vuelva la señal');
          else if (out.reason === 'stale') toast('Otro teléfono anotó primero: revisa el resultado.', 'error');
          else toast(out.status === 'confirmed' ? 'Resultado guardado' : 'Resultado enviado: falta que el rival lo confirme');
        }
        onDone();
      } catch (e) {
        toast(esportsErrorText(e, rules.game), 'error');
      }
    });

  const label = mode === 'finish' ? (admin ? 'Guardar resultado' : 'Enviar resultado') : 'Guardar el marcador';
  const title = mode === 'finish' ? 'Anotar resultado' : mode === 'correct' ? 'Corregir resultado' : 'Decidir el reclamo';

  return (
    <section aria-labelledby="esp-anotar" className={cx('flex flex-col gap-3', className)}>
      <div className="mx-1 flex items-baseline justify-between gap-3">
        <h2 id="esp-anotar" className="text-section">
          {title}
        </h2>
        {onCancel && (
          <button type="button" onClick={onCancel} className="inline-flex min-h-11 -my-3 items-center gap-1 text-meta font-[550] text-accent">
            <X aria-hidden="true" className="size-4" />
            Cancelar
          </button>
        )}
      </div>
      {mode === 'finish' && !admin && uid && (
        <p className="mx-1 -mt-1 text-[13.5px] text-muted">{`${word} por ${word.toLowerCase()}, con la regla de ${GAMES[rules.game].name}. El rival lo confirma.`}</p>
      )}
      {games.map((g, i) => (
        <GameRow
          key={i}
          rules={rules}
          index={i}
          game={g}
          names={names}
          onChange={(x) => change(i, x)}
          onRemove={i > 0 && i === games.length - 1 ? () => setGames((list) => list.slice(0, -1)) : undefined}
          error={errors[i]}
        />
      ))}
      {addable && (
        <Button variant="quiet" size="lg" className="w-full" icon={<Plus className="size-5" />} onClick={() => setGames((list) => [...list, emptyGame(rules)])}>
          {`Agregar ${word.toLowerCase()} ${games.length + 1}`}
        </Button>
      )}

      <div className="flex flex-col gap-2">
        <p className="mx-1 text-sm font-[650] text-fg-2">Foto de la pantalla final (opcional, hasta 3)</p>
        <div className="flex flex-wrap gap-2.5">
          {proof.map((id) => (
            <ProofThumb key={id} id={id} onRemove={() => setProof((p) => p.filter((x) => x !== id))} />
          ))}
          {proof.length < 3 && (
            <button
              type="button"
              onClick={() => file.current?.click()}
              disabled={busy.isBusy('foto')}
              aria-busy={busy.isBusy('foto') || undefined}
              className="grid size-20 place-items-center rounded-2xl border-2 border-dashed border-line text-accent transition active:scale-95 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-accent"
              aria-label="Agregar una captura"
            >
              {busy.isBusy('foto') ? <Skeleton className="size-8 rounded-full" /> : <Camera aria-hidden="true" className="size-7" />}
            </button>
          )}
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => void pickPhoto(e.target.files?.[0])} />
        </div>
      </div>

      {seriesErrors.length > 0 && (
        <ul role="alert" className="mx-1 flex flex-col gap-1 text-[13.5px] font-medium text-danger">
          {seriesErrors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <p aria-live="polite" className={cx('mx-1 mt-1 text-center text-[15px] font-semibold', summary.done ? 'text-fg' : 'text-muted')}>
        {summary.text}
      </p>
      <Button variant="primary" size={pro ? 'lg' : 'xl'} className="w-full" loading={busy.isBusy('enviar')} disabled={busy.isBusy('foto')} onClick={() => void submit()}>
        {label}
      </Button>
    </section>
  );
}

function ProofThumb({ id, onRemove }: { id: string; onRemove: () => void }) {
  const { lid } = useLeagueCtx();
  const photo = usePhoto(lid, id);
  return (
    <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-surface-2">
      {photo.data ? <img src={photo.data.url} alt="Captura" className="size-full object-cover" /> : <Skeleton className="size-full" />}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Quitar la captura"
        className="absolute top-0 right-0 grid size-11 place-items-start justify-end p-1.5 text-white focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span className="grid size-6 place-items-center rounded-full bg-black/60">
          <X aria-hidden="true" className="size-4" />
        </span>
      </button>
    </div>
  );
}

/** W.O.: quién no vino (o ninguno). El marcador lo arma el motor (`walkoverScore`). */
function WalkoverSheet({ open, onClose, match: m, rules, names }: { open: boolean; onClose: () => void; match: Match; rules: SeriesRules; names: readonly [string, string] }) {
  const { lid } = useLeagueCtx();
  const { toast } = useFeedback();
  const [absent, setAbsent] = useState<0 | 1 | 2 | null>(null);
  const busy = useBusy<'wo'>();
  const save = () =>
    busy.run('wo', async () => {
      if (absent === null) return;
      try {
        await setWalkover(lid, m.id, absent, { score: walkoverScore(rules, absent) });
        toast('W.O. guardado');
        onClose();
      } catch (e) {
        toast(esportsErrorText(e, rules.game), 'error');
      }
    });
  const options: { key: 0 | 1 | 2; label: string }[] = [
    { key: 1, label: `No vino ${names[0]}` },
    { key: 2, label: `No vino ${names[1]}` },
    { key: 0, label: 'No vino ninguno' },
  ];
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="W.O."
      subtitle="Gana el que se presentó"
      footer={
        <Button variant="primary" size="lg" className="w-full" disabled={absent === null} loading={busy.isBusy('wo')} onClick={() => void save()}>
          Guardar W.O.
        </Button>
      }
    >
      <div role="radiogroup" aria-label="Quién no vino" className="flex flex-col gap-2 pb-1">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={absent === o.key}
            onClick={() => setAbsent(o.key)}
            className={cx(
              'flex min-h-12 w-full items-center rounded-2xl px-4 text-left text-[15px] font-semibold transition active:scale-[0.99]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              absent === o.key ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-fg',
            )}
          >
            <span className="min-w-0 truncate">{o.label}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/** Cambiar la hora de la serie (en la zona de la liga). */
function RescheduleSheet({ open, onClose, match: m, tz, game }: { open: boolean; onClose: () => void; match: Match; tz?: string; game: SeriesRules['game'] }) {
  const { lid } = useLeagueCtx();
  const { toast } = useFeedback();
  const start = localParts(m.scheduledAt, tz) ?? localParts(new Date().toISOString(), tz)!;
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time);
  const busy = useBusy<'hora'>();
  const iso = zonedIso(date, time, tz);
  const save = () =>
    busy.run('hora', async () => {
      if (!iso) return;
      try {
        await rescheduleMatch(lid, m.id, iso);
        toast('Hora cambiada');
        onClose();
      } catch (e) {
        toast(esportsErrorText(e, game), 'error');
      }
    });
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Cambiar hora"
      footer={
        <Button variant="primary" size="lg" className="w-full" disabled={!iso} loading={busy.isBusy('hora')} onClick={() => void save()}>
          Guardar
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3 pb-1">
        <Field label="Día">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11" />
        </Field>
        <Field label="Hora">
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-11" />
        </Field>
      </div>
    </Sheet>
  );
}
