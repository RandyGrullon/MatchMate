import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { BadgeCheck, ExternalLink, Link2, Merge, Plus, Search, ShieldCheck, Trash2, Unlink, UserRound } from 'lucide-react';
import { deletePlayer, linkAccountToPlayer, unlinkAccount, updatePlayer, useAllEntries, useEvents, useLeagueMembers, usePlayers } from '../lib/data';
import { setPlayerMinor, useGuardians } from '../lib/data/players';
import { useLeagueSeasons } from '../lib/data/seasons';
import { averageSourceLabel, averageSourceShort, handicapAverages, type SeasonAverage } from '../lib/bowlingSeason';
import { roleLabel, useLeagueCtx } from '../lib/league';
import { MIN_RANK_GAMES, playerStats, type PlayerStats } from '../lib/stats';
import { todayIn } from './sports/racket/logic/time';
import type { Entry, Member, Player } from '../lib/types';
import { useAction, useFeedback } from '../components/feedback';
import { useBusy } from '../components/busy';
import { playerUrl, shareLink } from '../components/share';
import { Avatar } from '../components/Avatar';
import { BusyIcon } from '../components/busy';
import { Button, Card, Field, Input, ListRow, ListSkeleton, LoadError, RowIcon, SectionHeader, Select, Sheet, cx } from '../components/ui';
import { leagueSport } from '../sports/registry';
import { peopleWord } from '../components/league/logic';
import { AddPlayerModal } from '../components/players/AddPlayerModal';
import { SportStatFields } from '../components/players/SportStatFields';
import { saveSportStats, usePlayerAttrs } from '../components/players/data';
import {
  draftFromAttrs,
  emptyDraft,
  emptyGuardian,
  guardianProblem,
  parseStats,
  statKind,
  statSummary,
  type GuardianDraft,
  type StatDraft,
} from '../components/players/logic';
import { GuardianFields, MinorCheck } from '../components/players/GuardianFields';
import { MergePlayerModal } from '../components/players/MergePlayerModal';
import { PlayerClaimBadge } from '../components/claims/PlayerClaimBadge';

export function useStatsByPlayer(entries: Entry[]) {
  return useMemo(() => {
    const groups = new Map<string, Entry[]>();
    for (const e of entries) groups.set(e.playerId, [...(groups.get(e.playerId) ?? []), e]);
    const map = new Map<string, PlayerStats>();
    groups.forEach((list, id) => map.set(id, playerStats(list)));
    return map;
  }, [entries]);
}

const noStats: PlayerStats = { games: 0, pins: 0, autoAverage: null, high: 0, highSeries: 0, pending: 0 };

/** El promedio del handicap (o «—» si todavía no tiene). */
const handicapValue = (value: SeasonAverage | undefined): number | null => (value && value.source !== 'ninguno' ? value.average : null);

/**
 * Debajo del nombre de un jugador: «prom. fijo · 12 juegos · mejor 245» (boliche: de dónde sale su promedio si no es el de la
 * temporada, cuántos juegos y el mejor), «Sin cuenta» o «Menor · sin cuenta», el número de su deporte y lo que falta
 * por aprobar («3 sin foto»).
 */
export function playerLine(o: {
  bowling: boolean;
  hasAccount: boolean;
  isMinor?: boolean;
  games: number;
  high: number;
  pending: number;
  source?: SeasonAverage['source'] | null;
  summary?: string | null;
}): string {
  const short = o.bowling && o.source ? averageSourceShort(o.source) : null;
  return [
    !o.hasAccount && (o.isMinor ? 'Menor · sin cuenta' : 'Sin cuenta'),
    short && `prom. ${short}`,
    o.bowling && `${o.games} ${o.games === 1 ? 'juego' : 'juegos'}`,
    o.bowling && o.high > 0 && `mejor ${o.high}`,
    o.summary,
    o.pending > 0 && `${o.pending} sin foto`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Organizar › Jugadores y miembros › Jugadores (rediseño «Calma y foco»): «Agregar jugador» (el único botón principal),
 * el buscador si son más de 5 y la lista (cada jugador en una fila: sus iniciales, su nombre con la marca de su cuenta,
 * «prom. fijo · 12 juegos · mejor 245» y, en el boliche, el promedio del handicap grande). Tocar a alguien abre su hoja:
 * nombre, el número de su deporte, menor y tutor, su cuenta (vincular o separar), compartir su link, ver su página,
 * juntarlo con otro y eliminarlo. Abajo, los miembros sin jugador.
 * `variant="accounts"`: el deporte agrega y edita a su gente en su propia pestaña (`addWhere`: Nadadores, Parejas y
 * niveles); aquí queda solo lo de las cuentas (vincular, separar, cambiar el nombre o borrar), dentro de Miembros.
 */
export default function PlayersPage({ variant = 'full', addWhere }: { variant?: 'full' | 'accounts'; addWhere?: string }) {
  const { lid, base, league } = useLeagueCtx();
  const accounts = variant === 'accounts';
  const people = peopleWord(league.sport);
  const peopleTitle = people[1].charAt(0).toUpperCase() + people[1].slice(1);
  // Promedio, juegos y mejor son del boliche; los otros deportes muestran sus números en Tabla y en cada jugador.
  const bowling = leagueSport(league) === 'bowling';
  const { toast } = useFeedback();
  const players = usePlayers(lid);
  const members = useLeagueMembers(lid);
  const memberByUid = useMemo(() => new Map(members.data.map((m) => [m.uid, m])), [members.data]);
  // Cuentas sin jugador (quien entró solo para anotar no juega: no sale para vincular).
  const unlinked = members.data.filter((m) => !m.playerId && !m.scorerOnly);
  const entries = useAllEntries(bowling ? lid : undefined);
  const stats = useStatsByPlayer(entries.data);
  // El promedio que toma una inscripción de hoy (el del handicap): la temporada, la anterior, el fijo o el de entrada.
  const events = useEvents(bowling ? lid : undefined);
  const seasons = useLeagueSeasons(bowling ? lid : undefined);
  const handicap = useMemo(
    () => handicapAverages(players.data, entries.data, new Map(events.data.map((e) => [e.id, e.date])), seasons.data, todayIn(league.tz)),
    [players.data, entries.data, events.data, seasons.data, league.tz],
  );
  const [q, setQ] = useState('');
  const sport = leagueSport(league);
  // El número del deporte de cada uno (nivel, Index, posición y dorsal): sale debajo del nombre.
  const attrs = usePlayerAttrs(bowling ? undefined : lid);
  // Por id: el modal muestra el jugador en vivo (si alguien se vincula mientras está abierto, se ve).
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = editingId ? (players.data.find((p) => p.id === editingId) ?? null) : null;
  const setEditing = (p: Player | null) => setEditingId(p?.id ?? null);
  const [adding, setAdding] = useState(false);
  // «Juntar con…» (se abre desde la ficha del jugador, que se cierra: uno de los dos se borra al juntar).
  const [mergingId, setMergingId] = useState<string | null>(null);
  const merging = mergingId ? (players.data.find((p) => p.id === mergingId) ?? null) : null;
  const names = useMemo(() => players.data.map((p) => p.name), [players.data]);
  // El link de qué jugador se está compartiendo (solo esa fila da vueltas).
  const sharing = useBusy();

  const filtered = players.data.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));

  function share(p: Player) {
    return sharing.run(p.id, async () => {
      const copied = await shareLink(playerUrl(lid, p.id), `${p.name} · MatchMate`);
      if (copied) toast('Link copiado');
    });
  }

  return (
    <div className="flex flex-col gap-3.5">
      {accounts && (
        <SectionHeader title={`${peopleTitle} y sus cuentas`} className="mb-0!" />
      )}
      {/* Una línea, no tres: lo demás se ve en la hoja de cada uno. */}
      <p className="mx-1 text-meta text-muted">
        {accounts
          ? `Toca a alguien para vincularlo con su cuenta.${addWhere ? ` Para agregar ${people[1]}, usa «${addWhere}».` : ''}`
          : bowling
            ? `El número es el promedio del handicap (con ${MIN_RANK_GAMES} juegos verificados en la temporada).`
            : 'Toca a alguien para cambiar su nombre o su cuenta.'}
      </p>
      <Button
        variant={accounts ? 'quiet' : 'primary'}
        size="lg"
        className="w-full"
        icon={<Plus className="size-5" strokeWidth={2.4} />}
        onClick={() => setAdding(true)}
      >
        Agregar {people[0]}
      </Button>

      {players.data.length > 5 && (
        <label className="relative block">
          <span className="sr-only">Buscar jugador</span>
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            placeholder="Buscar jugador"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="card-shadow h-12 w-full rounded-2xl bg-surface pr-4 pl-12 text-base text-fg placeholder:text-faint focus:outline-2 focus:outline-offset-1 focus:outline-accent"
          />
        </label>
      )}

      {players.error ? (
        <LoadError error={players.error} />
      ) : players.loading ? (
        <ListSkeleton rows={8} />
      ) : players.data.length === 0 ? (
        <Card className="flex flex-col items-center px-5 py-8 text-center">
          <span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
            <UserRound className="size-7" />
          </span>
          <h2 className="mt-4 text-section">Todavía no hay {people[1]}</h2>
          <p className="mt-1.5 max-w-sm text-meta text-muted">
            {accounts && addWhere ? `Agrégalos en «${addWhere}», o deja que cada miembro cree el suyo al unirse.` : 'Agrégalos o deja que cada miembro cree el suyo al unirse.'}
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {filtered.map((p) => {
            const s = stats.get(p.id) ?? noStats;
            const avg = handicap.get(p.id);
            const account = p.uid ? memberByUid.get(p.uid) : undefined;
            const summary = bowling ? null : statSummary(sport, attrs.data[p.id]);
            const value = handicapValue(avg);
            return (
              <ListRow
                key={p.id}
                dense
                onClick={() => setEditing(p)}
                ariaLabel={`Editar a ${p.name}`}
                leading={<Avatar name={p.name} className="size-9 text-sm" />}
                title={
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate">{p.name}</span>
                    {p.uid && (
                      <span title={account ? `Cuenta: ${account.name}` : 'Tiene cuenta'} className="shrink-0 text-accent">
                        {account && account.role !== 'member' ? <ShieldCheck aria-label="Admin" className="size-4" /> : <BadgeCheck aria-label="Con cuenta" className="size-4" />}
                      </span>
                    )}
                  </span>
                }
                subtitle={
                  <span className={cx(s.pending > 0 && '[&>b]:font-semibold [&>b]:text-warn')}>
                    {playerLine({
                      bowling,
                      hasAccount: !!p.uid,
                      isMinor: p.isMinor,
                      games: s.games,
                      high: s.high,
                      pending: 0,
                      source: avg?.source,
                      summary,
                    })}
                    {s.pending > 0 && (
                      <>
                        {' · '}
                        <b>{s.pending} sin foto</b>
                      </>
                    )}
                  </span>
                }
                value={bowling ? (value ?? <span className="text-faint">—</span>) : undefined}
                trailing={!p.uid && !p.isMinor ? <PlayerClaimBadge playerId={p.id} /> : undefined}
                chevron={!bowling}
              />
            );
          })}
          {filtered.length === 0 && <p className="px-5 py-6 text-center text-meta text-muted">Nadie coincide con «{q}».</p>}
        </Card>
      )}

      {unlinked.length > 0 && (
        <section aria-labelledby="sin-jugador" className="mt-3">
          <SectionHeader id="sin-jugador" title={`Miembros sin jugador (${unlinked.length})`} />
          <Card className="overflow-hidden">
            {unlinked.map((u) => (
              <ListRow
                key={u.id}
                dense
                leading={<Avatar name={u.name} className="size-9 text-sm" />}
                title={u.name}
                subtitle={[u.role !== 'member' && roleLabel(u.role), 'Su jugador se crea al abrir la liga'].filter(Boolean).join(' · ')}
              />
            ))}
          </Card>
        </section>
      )}

      <AddPlayerModal open={adding} onClose={() => setAdding(false)} existingNames={names} />
      <PlayerFormModal
        player={editing}
        account={editing?.uid ? (memberByUid.get(editing.uid) ?? null) : null}
        open={editing != null}
        stats={editing ? (stats.get(editing.id) ?? noStats) : noStats}
        handicap={editing ? handicap.get(editing.id) : undefined}
        attrs={editing ? attrs.data[editing.id] : undefined}
        members={members.data}
        players={players.data}
        onClose={() => setEditing(null)}
        sharing={!!editing && sharing.isBusy(editing.id)}
        onShare={() => editing && void share(editing)}
        pageUrl={editing ? `${base}/j/${editing.id}` : null}
        onMerge={() => {
          setMergingId(editingId);
          setEditing(null);
        }}
      />
      <MergePlayerModal open={merging != null} onClose={() => setMergingId(null)} player={merging} players={players.data} />
    </div>
  );
}

/**
 * La hoja de un jugador (Organizar): su nombre, el número de su deporte, menor y tutor, su cuenta (vincular o separar) y,
 * en filas, compartir su link, ver su página, juntarlo con otro y eliminarlo. «Guardar» abajo. Para agregar:
 * AddPlayerModal.
 */
function PlayerFormModal({
  open,
  player,
  account,
  stats,
  handicap,
  attrs,
  members,
  players,
  onClose,
  onMerge,
  onShare,
  sharing,
  pageUrl,
}: {
  open: boolean;
  player: Player | null;
  account: Member | null;
  stats: PlayerStats;
  handicap: SeasonAverage | undefined;
  attrs: unknown;
  members: Member[];
  players: Player[];
  onClose: () => void;
  /** «Juntar con…»: abre el modal para juntarlo con otro de la lista. */
  onMerge: () => void;
  /** «Compartir su link» (copia o comparte el link de su página). */
  onShare: () => void;
  sharing: boolean;
  /** Su página en la liga. */
  pageUrl: string | null;
}) {
  const { lid, league } = useLeagueCtx();
  const sport = leagueSport(league);
  const bowling = sport === 'bowling';
  const swimming = statKind(sport) === 'swimming';
  const run = useAction();
  const { confirm } = useFeedback();
  const [name, setName] = useState('');
  const [draft, setDraft] = useState<StatDraft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  // `<jugador>:guardar` o `<jugador>:eliminar`: la ruedita es del jugador que se está guardando o borrando.
  const busy = useBusy();
  // Al terminar se cierra, si sigue abierta en ese jugador (mientras esperaba se pudo cerrar y abrir otro).
  const shownId = useRef<string | null>(null);
  useEffect(() => {
    shownId.current = open ? (player?.id ?? null) : null;
  });
  const closeIf = (id: string) => {
    if (shownId.current === id || shownId.current === null) onClose();
  };
  // Liga con menores (menos natación, que lo hace en Nadadores): marcar o desmarcar a un jugador sin cuenta como menor,
  // con su tutor y el permiso (set_player_minor). Los datos del tutor solo los leen los admins y no se guardan.
  const minorsOk = !!league.hasMinors && !swimming && !!player && !player.uid;
  const guardians = useGuardians(lid, open && minorsOk);
  const saved = player ? guardians.data[player.id] : undefined;
  const [isMinor, setIsMinor] = useState(false);
  const [guardian, setGuardian] = useState<GuardianDraft>(emptyGuardian);

  // Se llena al abrir (o al cambiar de jugador); lo que llega en vivo después no pisa lo que se está escribiendo.
  useEffect(() => {
    if (!open) return;
    setName(player?.name ?? '');
    setDraft(draftFromAttrs(sport, attrs, player?.averageOverride ?? null));
    setError(null);
    setIsMinor(!!player?.isMinor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, player?.id]);

  // El tutor guardado llega aparte (solo admins): se pone cuando llega.
  useEffect(() => {
    if (!open) return;
    setGuardian(
      saved ? { guardianName: saved.guardianName ?? '', guardianPhone: saved.guardianPhone ?? '', consent: !!saved.consentAt } : emptyGuardian,
    );
  }, [open, player?.id, saved?.guardianName, saved?.guardianPhone, saved?.consentAt]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!player) return;
    const parsed = parseStats(sport, draft);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    const minorChanged =
      minorsOk &&
      (isMinor !== !!player.isMinor ||
        (isMinor &&
          (guardian.guardianName.trim() !== (saved?.guardianName ?? '') ||
            guardian.guardianPhone.replace(/[\s().-]/g, '') !== (saved?.guardianPhone ?? '') ||
            guardian.consent !== !!saved?.consentAt)));
    const problem = minorChanged && isMinor ? guardianProblem(guardian) : null;
    if (problem) {
      setError(problem);
      return;
    }
    const before = parseStats(sport, draftFromAttrs(sport, attrs, player.averageOverride ?? null));
    setError(null);
    await busy.run(`${player.id}:guardar`, async () => {
      await run(async () => {
        await updatePlayer(lid, player.id, bowling ? { name: name.trim(), averageOverride: parsed.stats.averageOverride } : { name: name.trim() });
        if (!bowling && !swimming) await saveSportStats(lid, sport, player.id, parsed.stats, before.ok ? before.stats : undefined);
        if (minorChanged) await setPlayerMinor(lid, player.id, isMinor ? guardian : null);
      }, 'Jugador actualizado');
      closeIf(player.id);
    });
  }

  async function remove() {
    if (!player) return;
    const ok = await confirm({
      title: `¿Eliminar a ${player.name}?`,
      message: bowling
        ? `Se borran también sus ${stats.games + stats.pending} juegos en torneos y prácticas. No se puede deshacer.`
        : 'Se borran también sus resultados en esta liga. No se puede deshacer.',
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    // Se cierra al terminar: mientras, «Eliminar» da vueltas.
    await busy.run(`${player.id}:eliminar`, async () => {
      await run(() => deletePlayer(lid, player.id, player.uid), 'Jugador eliminado');
      closeIf(player.id);
    });
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={player?.name || 'Editar jugador'}
      subtitle={handicap && handicap.source !== 'ninguno' ? `Promedio del handicap: ${handicap.average} (${averageSourceLabel(handicap.source).toLowerCase()})` : undefined}
      footer={
        <Button
          variant="primary"
          size="xl"
          type="submit"
          form="player-form"
          className="w-full"
          loading={!!player && busy.isBusy(`${player.id}:guardar`)}
          disabled={busy.isBusy()}
        >
          Guardar
        </Button>
      }
    >
      <form id="player-form" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nombre">
          <Input required autoFocus maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellido" />
        </Field>
        {!swimming && (
          <SportStatFields
            sport={sport}
            draft={draft}
            onChange={setDraft}
            averageHint={`Cuenta mientras no tenga ${MIN_RANK_GAMES} juegos verificados en la temporada (ni en la anterior); después manda el de sus juegos.${
              handicap && handicap.source !== 'ninguno' ? ` Hoy su handicap usa ${handicap.average} (${averageSourceLabel(handicap.source).toLowerCase()}).` : ''
            }`}
          />
        )}
        {minorsOk && <MinorCheck checked={isMinor} onChange={setIsMinor} />}
        {minorsOk && isMinor && <GuardianFields value={guardian} onChange={setGuardian} />}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </form>
      {player && <AccountSection player={player} account={account} members={members} players={players} onDone={closeIf} />}
      {player && (
        <div className="-mx-5 mt-5 border-t border-line">
          <ListRow
            dense
            onClick={onShare}
            leading={
              <RowIcon>
                <BusyIcon busy={sharing} icon={<Link2 className="size-[19px]" />} className="size-[19px]" />
              </RowIcon>
            }
            title="Compartir su link"
            subtitle="Su página con sus números"
          />
          {pageUrl && (
            <ListRow
              dense
              to={pageUrl}
              leading={
                <RowIcon>
                  <ExternalLink className="size-[19px]" />
                </RowIcon>
              }
              title="Ver su página"
            />
          )}
          {players.length > 1 && (
            <ListRow
              dense
              onClick={onMerge}
              leading={
                <RowIcon>
                  <Merge className="size-[19px]" />
                </RowIcon>
              }
              title="Juntar con…"
              subtitle="Si está dos veces en la lista: queda uno solo, con todo"
            />
          )}
          <ListRow
            dense
            onClick={() => void remove()}
            ariaLabel={`Eliminar a ${player.name}`}
            leading={
              <RowIcon className="bg-danger-soft! text-danger!">
                <BusyIcon busy={busy.isBusy(`${player.id}:eliminar`)} icon={<Trash2 className="size-[19px]" />} className="size-[19px]" />
              </RowIcon>
            }
            title={<span className="text-danger">Eliminar</span>}
            subtitle="Se borran también sus resultados"
            chevron={false}
          />
        </div>
      )}
    </Sheet>
  );
}

/**
 * Cuenta del jugador. Cada cuenta juega con su propio jugador (se crea al unirse); un jugador sin cuenta
 * (lo agregó el admin o vino de un torneo importado) se puede unir con la cuenta de quien es, y una cuenta
 * mal vinculada se separa. Los roles se cambian en Miembros.
 */
function AccountSection({
  player,
  account,
  members,
  players,
  onDone,
}: {
  player: Player;
  account: Member | null;
  members: Member[];
  players: Player[];
  /** Terminó (con el id del jugador): se cierra la ficha. */
  onDone: (playerId: string) => void;
}) {
  const { lid } = useLeagueCtx();
  const run = useAction();
  const { confirm } = useFeedback();
  const [who, setWho] = useState('');
  // `<jugador>:vincular` o `<jugador>:desvincular` (la ficha puede pasar a otro jugador mientras espera).
  const busy = useBusy();
  const nameOf = (id: string | null) => players.find((p) => p.id === id)?.name ?? null;

  if (!player.uid) {
    const candidates = members.filter((m) => m.playerId !== player.id);
    async function link() {
      const picked = candidates.find((c) => c.id === who);
      if (!picked) return;
      const ok = await confirm({
        title: 'Vincular con la cuenta',
        message: `${player.name} pasa a ser el jugador de ${picked.name}: sus juegos cuentan en su perfil.${
          picked.playerId
            ? ` De su jugador de ahora (${nameOf(picked.playerId) ?? picked.name}), lo pendiente (envíos por aprobar, "voy") pasa a ${player.name}; si nunca jugó un evento se borra, y si jugó se queda en la lista sin cuenta.`
            : ''
        }`,
        confirmText: 'Vincular',
      });
      if (!ok) return;
      // La cuenta como está ahora (pudo cambiar mientras se confirmaba); el resto se decide con el servidor.
      const m = members.find((c) => c.id === picked.id) ?? picked;
      await busy.run(`${player.id}:vincular`, async () => {
        await run(() => linkAccountToPlayer(lid, m, player.id), `${player.name} ahora es de ${m.name}`);
        onDone(player.id);
      });
    }
    return (
      <div className="mt-5 flex flex-col gap-2.5 rounded-2xl bg-surface-2 p-4">
        <p className="text-body font-semibold">Sin cuenta</p>
        <p className="-mt-1.5 text-sm text-muted">Si ya se unió (quizá con otro nombre), vincúlalo con su cuenta: sus juegos pasan a su perfil.</p>
        {candidates.length > 0 && (
          <div className="flex gap-2">
            <Select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Cuenta" className="min-w-0 flex-1">
              <option value="">— Elegir cuenta —</option>
              {candidates.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.playerId && nameOf(m.playerId) && nameOf(m.playerId) !== m.name ? ` (hoy: ${nameOf(m.playerId)})` : ''}
                </option>
              ))}
            </Select>
            <Button variant="primary" icon={<Link2 className="size-4" />} loading={busy.isBusy(`${player.id}:vincular`)} disabled={!who || busy.isBusy()} onClick={link}>
              Vincular
            </Button>
          </div>
        )}
      </div>
    );
  }

  async function unlink() {
    const ok = await confirm({
      title: 'Desvincular cuenta',
      message: `${account?.name ?? 'La cuenta'} deja de estar vinculada a ${player.name} y pasa a jugar con un jugador nuevo, con su cuenta. ${player.name} y sus juegos se quedan en la lista sin cuenta.`,
      confirmText: 'Desvincular',
      danger: true,
    });
    if (!ok) return;
    await busy.run(`${player.id}:desvincular`, async () => {
      await run(() => unlinkAccount(lid, player.id, { uid: player.uid!, name: account?.name ?? player.name }), 'Cuenta desvinculada');
      onDone(player.id);
    });
  }

  return (
    <div className="mt-5 flex items-center gap-3 rounded-2xl bg-surface-2 py-3 pr-3 pl-4">
      <BadgeCheck aria-hidden="true" className="size-5 shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-semibold">{account?.name ?? 'Cuenta vinculada'}</p>
        <p className="text-sm text-muted">{account && account.role !== 'member' ? `${roleLabel(account.role)} · con cuenta` : 'Con cuenta'}</p>
      </div>
      <Button variant="quiet" className="h-11 shrink-0 bg-surface!" icon={<Unlink className="size-4" />} loading={busy.isBusy(`${player.id}:desvincular`)} disabled={busy.isBusy()} onClick={unlink}>
        Desvincular
      </Button>
    </div>
  );
}
