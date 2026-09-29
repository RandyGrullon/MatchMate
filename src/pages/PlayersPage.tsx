import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router';
import { BadgeCheck, ExternalLink, Link2, Plus, Search, ShieldCheck, Trash2, Unlink, UserRound } from 'lucide-react';
import { deletePlayer, linkAccountToPlayer, unlinkAccount, updatePlayer, useAllEntries, useEvents, useLeagueMembers, usePlayers } from '../lib/data';
import { useLeagueSeasons } from '../lib/data/seasons';
import { averageSourceLabel, averageSourceShort, handicapAverages, type SeasonAverage } from '../lib/bowlingSeason';
import { roleLabel, useLeagueCtx } from '../lib/league';
import { MIN_RANK_GAMES, playerStats, type PlayerStats } from '../lib/stats';
import { todayIn } from './sports/racket/logic/time';
import type { Entry, Member, Player } from '../lib/types';
import { useAction, useFeedback } from '../components/feedback';
import { playerUrl, shareLink } from '../components/share';
import { Avatar } from '../components/Avatar';
import { Badge, Button, Card, Empty, Field, Input, ListSkeleton, LoadError, Modal, Select, cx } from '../components/ui';
import { leagueSport } from '../sports/registry';
import { peopleWord } from '../components/league/logic';
import { AddPlayerModal } from '../components/players/AddPlayerModal';
import { SportStatFields } from '../components/players/SportStatFields';
import { saveSportStats, usePlayerAttrs } from '../components/players/data';
import { draftFromAttrs, emptyDraft, parseStats, statKind, statSummary, type StatDraft } from '../components/players/logic';
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

/** El promedio del handicap y de dónde sale: el número y, si no es el de la temporada, una marca («fijo», «anterior»…). */
function HandicapAverage({ value, className }: { value: SeasonAverage | undefined; className?: string }) {
  const short = value ? averageSourceShort(value.source) : null;
  return (
    <span className={cx('inline-flex items-center gap-1.5', className)} title={value ? averageSourceLabel(value.source) : undefined}>
      {short && <Badge>{short}</Badge>}
      <span className="tabular-nums">{value && value.source !== 'ninguno' ? value.average : '—'}</span>
    </span>
  );
}

/**
 * Admin: jugadores de la liga, su promedio (boliche) y la cuenta vinculada.
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
  const unlinked = members.data.filter((m) => !m.playerId);
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
  const names = useMemo(() => players.data.map((p) => p.name), [players.data]);

  const filtered = players.data.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));

  async function share(p: Player) {
    const copied = await shareLink(playerUrl(lid, p.id), `${p.name} · MatchMate`);
    if (copied) toast('Link copiado');
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{accounts ? `${peopleTitle} y sus cuentas` : 'Jugadores'}</h2>
          <p className="text-sm text-muted">
            {accounts
              ? `Si alguien se unió y ya estaba en la lista (quizá con otro nombre), toca su nombre y vincúlalo con su cuenta: así no sale dos veces.${addWhere ? ` Para agregar ${people[1]}, usa «${addWhere}».` : ''}`
              : bowling
                ? `Promedio del handicap: el de la temporada con al menos ${MIN_RANK_GAMES} juegos verificados; si no, el de la anterior, el fijo o el de su inscripción.`
                : 'Quiénes juegan y su cuenta. Sus resultados salen en Tabla y en su página.'}
          </p>
        </div>
        <Button variant={accounts ? 'secondary' : 'primary'} className="shrink-0" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
          <span className="hidden sm:inline">Agregar {people[0]}</span>
          <span className="sm:hidden">Agregar</span>
        </Button>
      </div>

      {players.data.length > 5 && (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input placeholder="Buscar jugador" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
      )}

      {players.error ? (
        <LoadError error={players.error} />
      ) : players.loading ? (
        <ListSkeleton rows={8} />
      ) : players.data.length === 0 ? (
        <Empty icon={<UserRound className="size-8" />} title={`Todavía no hay ${people[1]}`}>
          {accounts && addWhere
            ? `Agrégalos en «${addWhere}», o deja que cada miembro cree el suyo al unirse.`
            : 'Agrega a los jugadores de la liga, o deja que cada miembro cree el suyo al unirse.'}
        </Empty>
      ) : (
        <Card className="stagger divide-y divide-line overflow-hidden">
          {bowling && (
            <div className="hidden grid-cols-[1fr_6rem_5rem_5rem_5.5rem] gap-3 px-4 py-2 text-xs font-medium text-muted sm:grid">
              <span>Jugador</span>
              <span className="text-right">Promedio</span>
              <span className="text-right">Juegos</span>
              <span className="text-right">Mejor</span>
              <span />
            </div>
          )}
          {filtered.map((p, i) => {
            const s = stats.get(p.id) ?? noStats;
            const avg = handicap.get(p.id);
            const account = p.uid ? memberByUid.get(p.uid) : undefined;
            const summary = bowling ? null : statSummary(sport, attrs.data[p.id]);
            return (
              <div
                key={p.id}
                style={{ '--i': i } as CSSProperties}
                className={cx('flex items-center gap-3 px-4 py-2.5 transition hover:bg-surface-2/60', bowling && 'sm:grid sm:grid-cols-[1fr_6rem_5rem_5rem_5.5rem]')}
              >
                <button onClick={() => setEditing(p)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <Avatar name={p.name} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-medium">{p.name}</span>
                      {p.uid && (
                        <span title={account ? `Cuenta: ${account.name}` : 'Tiene cuenta'} className="shrink-0 text-ok">
                          {account && account.role !== 'member' ? <ShieldCheck className="size-4" /> : <BadgeCheck className="size-4" />}
                        </span>
                      )}
                    </div>
                    {(!p.uid || summary) && (
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        {!p.uid && <Badge>{p.isMinor ? 'Menor · sin cuenta' : 'Sin cuenta'}</Badge>}
                        {!p.uid && !p.isMinor && <PlayerClaimBadge playerId={p.id} />}
                        {summary && <span className="tabular-nums">{summary}</span>}
                      </div>
                    )}
                    {bowling && (
                      <div className="flex items-center gap-1.5 text-xs text-muted sm:hidden">
                        <span>Prom.</span>
                        <HandicapAverage value={avg} />
                        <span>· {s.games} juegos</span>
                      </div>
                    )}
                    {s.pending > 0 && (
                      <Badge tone="warn" className="mt-0.5">
                        {s.pending} sin foto
                      </Badge>
                    )}
                  </div>
                </button>
                {bowling && (
                  <>
                    <HandicapAverage value={avg} className="hidden justify-end text-right font-semibold sm:flex" />
                    <span className="hidden text-right text-muted tabular-nums sm:block">{s.games}</span>
                    <span className="hidden text-right text-muted tabular-nums sm:block">{s.high || '—'}</span>
                  </>
                )}
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="sm" title="Compartir link" aria-label="Compartir link" onClick={() => share(p)} icon={<Link2 className="size-4" />} />
                  <Link
                    to={`${base}/j/${p.id}`}
                    title="Ver su página"
                    aria-label="Ver su página"
                    className="inline-flex size-8 items-center justify-center rounded-xl text-fg hover:bg-surface-2"
                  >
                    <ExternalLink className="size-4" />
                  </Link>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">Nadie coincide con “{q}”.</p>}
        </Card>
      )}

      {unlinked.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-muted">Miembros sin jugador ({unlinked.length})</h3>
          <Card className="divide-y divide-line">
            {unlinked.map((u) => (
              <div key={u.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <Avatar name={u.name} className="size-8 text-xs" />
                <div className="min-w-0 flex-1 truncate font-medium">{u.name}</div>
                {u.role !== 'member' && <Badge tone="accent">{roleLabel(u.role)}</Badge>}
                <Badge>Se crea al abrir la liga</Badge>
              </div>
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
      />
    </div>
  );
}

/** Admin: editar un jugador (nombre, el número de su deporte) y su cuenta. Para agregar: AddPlayerModal. */
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
  const [busy, setBusy] = useState(false);

  // Se llena al abrir (o al cambiar de jugador); lo que llega en vivo después no pisa lo que se está escribiendo.
  useEffect(() => {
    if (!open) return;
    setName(player?.name ?? '');
    setDraft(draftFromAttrs(sport, attrs, player?.averageOverride ?? null));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, player?.id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!player) return;
    const parsed = parseStats(sport, draft);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    const before = parseStats(sport, draftFromAttrs(sport, attrs, player.averageOverride ?? null));
    setError(null);
    setBusy(true);
    await run(async () => {
      await updatePlayer(lid, player.id, bowling ? { name: name.trim(), averageOverride: parsed.stats.averageOverride } : { name: name.trim() });
      if (!bowling && !swimming) await saveSportStats(lid, sport, player.id, parsed.stats, before.ok ? before.stats : undefined);
    }, 'Jugador actualizado');
    setBusy(false);
    onClose();
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
    onClose();
    await run(() => deletePlayer(lid, player.id, player.uid), 'Jugador eliminado');
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Editar jugador"
      footer={
        <>
          {player && (
            <Button variant="ghost" className="mr-auto text-danger" icon={<Trash2 className="size-4" />} onClick={remove}>
              Eliminar
            </Button>
          )}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="player-form" loading={busy}>
            Guardar
          </Button>
        </>
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
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </form>
      {player && <AccountSection player={player} account={account} members={members} players={players} onDone={onClose} />}
    </Modal>
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
  onDone: () => void;
}) {
  const { lid } = useLeagueCtx();
  const run = useAction();
  const { confirm } = useFeedback();
  const [who, setWho] = useState('');
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
      onDone();
      await run(() => linkAccountToPlayer(lid, m, player.id), `${player.name} ahora es de ${m.name}`);
    }
    return (
      <div className="mt-4 flex flex-col gap-2 rounded-xl bg-surface-2 px-3 py-2.5">
        <p className="text-xs text-muted">
          Sin cuenta. Si es alguien que ya se unió a la liga (quizá con otro nombre), vincúlalo con su cuenta y sus juegos pasan a su perfil.
        </p>
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
            <Button size="sm" icon={<Link2 className="size-4" />} disabled={!who} onClick={link}>
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
    onDone();
    await run(() => unlinkAccount(lid, player.id, { uid: player.uid!, name: account?.name ?? player.name }), 'Cuenta desvinculada');
  }

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-xl border border-line p-3">
      <div className="flex items-center gap-2 text-sm">
        <BadgeCheck className="size-4 text-ok" />
        <span className="min-w-0 flex-1 truncate">{account?.name ?? 'Cuenta vinculada'}</span>
        {account && account.role !== 'member' && <Badge tone="accent">{roleLabel(account.role)}</Badge>}
      </div>
      <Button size="sm" className="self-start" icon={<Unlink className="size-4" />} onClick={unlink}>
        Desvincular
      </Button>
    </div>
  );
}
