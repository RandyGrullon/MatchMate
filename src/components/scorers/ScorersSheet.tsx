import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Baby, Link2, Link2Off, RefreshCw, Search, Send, Ticket, UserMinus, UserPlus, Users, X } from 'lucide-react';
import { cancelInvite } from '../../lib/data/invites';
import { useLeagueMembers } from '../../lib/data/members';
import { usePeople, type PersonHit } from '../../lib/data/people';
import {
  createScorerLink,
  inviteScorers,
  linkFor,
  revokeScorerLink,
  rotateScorerLink,
  scorerErrorText,
  scorerLinkUrl,
  setScorer,
  useScorerAccess,
  type ScorerAccess,
  type ScorerInvite,
  type ScorerLink,
  type ScorerTarget,
} from '../../lib/data/scorers';
import { useTopic } from '../../lib/data/topics';
import type { Live } from '../../lib/data/client';
import { useLeagueCtx } from '../../lib/league';
import type { League, Member } from '../../lib/types';
import { Avatar } from '../Avatar';
import { useFeedback } from '../feedback';
import { ShareRow } from '../invite/InviteSheet';
import { handleOf, peopleView } from '../invite/logic';
import { Badge, Button, Input, ListSkeleton, LoadError, Segmented, Sheet, Skeleton, cx } from '../ui';
import {
  adminCount,
  adminsLine,
  emptyScorersText,
  inviteConfirm,
  inviteScorerText,
  LINK_WARNING,
  linkStateText,
  madeText,
  makeConfirm,
  MINORS_NO_LINK,
  MINORS_WARNING,
  nobodyFoundText,
  personAction,
  pickableEmptyText,
  pickableMembers,
  playsHere,
  removeConfirm,
  scorerReach,
  scorerReachText,
  scorerRows,
  scorerShareText,
  usernameHintText,
  type ScorerRow,
} from './logic';

export type ScorersTab = 'liga' | 'usuario' | 'link';

export interface ScorersSheetProps {
  /** El torneo desde el que se abre (el texto de los avisos y a dónde llevan). */
  target: ScorerTarget;
  /** Los jugadores que juegan este torneo (marca «Juega»). Sin lista (no se sabe), nadie sale con «Juega». */
  participants?: readonly string[];
  open: boolean;
  onClose: () => void;
  /** La pestaña con que abre (por defecto «De la liga»). */
  initialTab?: ScorersTab;
}

/**
 * La hoja «Anotadores» de un torneo (docs/anotadores.md §8.2), solo para el dueño o un admin: arriba quién anota hoy
 * (con «Quitar», o «Retirar» la invitación pendiente); abajo, tres formas de sumar a alguien:
 * - «De la liga»: los miembros, con buscador; los que juegan este torneo salen con «Juega»; «Hacer anotador» y listo;
 * - «Por @usuario»: la búsqueda de personas; a quien ya es de la liga se le da el permiso directo y a quien no, una
 *   invitación de anotador (le llega «Ana te invitó a anotar en …»);
 * - «Link»: el link para anotar de este torneo (se crea, se copia, se manda por WhatsApp, se cambia o se quita).
 *
 * El permiso es de la liga: la primera línea dice hasta dónde llega. Se monta solo mientras está abierta y escucha la
 * liga (`league:<id>`): si alguien entra con el link o acepta, la lista cambia sola.
 */
export default function ScorersSheet(props: ScorersSheetProps) {
  const { isAdmin } = useLeagueCtx();
  if (!props.open || !isAdmin) return null;
  return <ScorersSheetOpen {...props} />;
}

type Busy = string | null;

function ScorersSheetOpen({ target, participants, onClose, initialTab = 'liga' }: ScorersSheetProps) {
  const { lid, league } = useLeagueCtx();
  const { toast, confirm } = useFeedback();
  // Quien entra con el link, acepta o sale: el tiempo real de la liga ('scorers', 'invites') mantiene la lista.
  useTopic(`league:${lid}`, lid);
  const members = useLeagueMembers(lid);
  const access = useScorerAccess(lid);
  const [tab, setTab] = useState<ScorersTab>(initialTab);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const players = useMemo(() => (participants ? new Set(participants) : null), [participants]);
  const kind = league.kind;
  const rows = scorerRows(members.data, access.data.invites, players);
  const admins = adminCount(members.data);
  const reach = scorerReach(league);

  /** Una escritura a la vez: el botón que la hizo gira; si falla, el error en palabras. */
  async function act(key: string, fn: () => Promise<unknown>, ok?: string): Promise<void> {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
      if (ok) toast(ok);
    } catch (e) {
      console.warn('[anotadores]', e);
      toast(scorerErrorText(e, kind), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function make(m: Pick<Member, 'leagueId' | 'uid' | 'name'>, plays: boolean) {
    if (busy) return;
    const ask = makeConfirm(m.name, plays, league);
    if (ask && !(await confirm(ask))) return;
    await act(`m:${m.uid}`, () => setScorer(m, true, target), madeText(m.name));
  }

  async function remove(m: Member) {
    if (busy) return;
    const ask = removeConfirm(m, kind);
    if (!(await confirm(ask))) return;
    await act(`m:${m.uid}`, () => setScorer(m, false, target), ask.done);
  }

  const retire = (inv: Pick<ScorerInvite, 'id'>) => act(`i:${inv.id}`, () => cancelInvite(inv.id, lid), 'Invitación retirada');

  async function invite(hit: PersonHit) {
    if (busy) return;
    const name = hit.name || handleOf(hit.username) || 'Esa persona';
    const ask = inviteConfirm(name, league);
    if (ask && !(await confirm(ask))) return;
    setBusy(`u:${hit.id}`);
    try {
      const res = await inviteScorers(lid, [hit.id], target);
      const status = res.results[0]?.status ?? 'unavailable';
      toast(inviteScorerText(status, name, kind), status === 'sent' ? 'ok' : 'error');
    } catch (e) {
      console.warn('[anotadores] invitar', e);
      toast(scorerErrorText(e, kind), 'error');
    } finally {
      setBusy(null);
    }
  }

  const createLink = () => act('link', () => createScorerLink(lid, target), 'Link para anotar listo');

  async function rotateLink(link: ScorerLink) {
    if (busy) return;
    const ok = await confirm({
      title: '¿Cambiar el link para anotar?',
      message: 'El link de antes deja de servir. Quien ya entró sigue anotando.',
      confirmText: 'Cambiar link',
    });
    if (ok) await act('link', () => rotateScorerLink(lid, link), 'Link cambiado');
  }

  async function revokeLink(link: ScorerLink) {
    if (busy) return;
    const ok = await confirm({
      title: '¿Quitar el link para anotar?',
      message: 'Deja de servir. Quien ya entró sigue anotando; lo quitas de «Anotan ahora».',
      confirmText: 'Quitar link',
      danger: true,
    });
    if (ok) await act('link:quitar', () => revokeScorerLink(lid, link), 'Link quitado');
  }

  return (
    <Sheet open onClose={onClose} title="Anotadores" subtitle={target.title || league.name}>
      <ScorersBody
        league={league}
        lid={lid}
        target={target}
        rows={rows}
        admins={admins}
        members={members}
        access={access}
        players={players}
        tab={tab}
        onTab={setTab}
        query={query}
        onQuery={setQuery}
        busy={busy}
        reachText={scorerReachText(reach)}
        onMake={(m, plays) => void make(m, plays)}
        onRemove={(m) => void remove(m)}
        onRetire={(inv) => void retire(inv)}
        onInvite={(hit) => void invite(hit)}
        onCreateLink={() => void createLink()}
        onRotateLink={(k) => void rotateLink(k)}
        onRevokeLink={(k) => void revokeLink(k)}
      />
    </Sheet>
  );
}

export interface ScorersBodyProps {
  league: League;
  lid: string;
  target: ScorerTarget;
  rows: readonly ScorerRow[];
  admins: number;
  members: Live<Member[]>;
  access: Live<ScorerAccess>;
  players: ReadonlySet<string> | null;
  tab: ScorersTab;
  onTab: (t: ScorersTab) => void;
  query: string;
  onQuery: (q: string) => void;
  busy: Busy;
  reachText: string;
  onMake: (m: Pick<Member, 'leagueId' | 'uid' | 'name'>, plays: boolean) => void;
  onRemove: (m: Member) => void;
  onRetire: (inv: Pick<ScorerInvite, 'id'>) => void;
  onInvite: (hit: PersonHit) => void;
  onCreateLink: () => void;
  onRotateLink: (link: ScorerLink) => void;
  onRevokeLink: (link: ScorerLink) => void;
}

const TABS: { key: ScorersTab; label: string; icon: ReactNode }[] = [
  { key: 'liga', label: 'De la liga', icon: <Users className="size-4 max-[389px]:hidden" /> },
  { key: 'usuario', label: 'Por @usuario', icon: <Search className="size-4 max-[389px]:hidden" /> },
  { key: 'link', label: 'Link', icon: <Link2 className="size-4 max-[389px]:hidden" /> },
];

/** Lo de adentro de la hoja (sin datos propios: se dibuja igual en las pruebas). */
export function ScorersBody(p: ScorersBodyProps) {
  const { league, rows, admins, members, busy } = p;
  // En un torneo sin liga, «De la liga» es «Del torneo».
  const tabs = league.kind === 'torneo' ? TABS.map((t) => (t.key === 'liga' ? { ...t, label: 'Del torneo' } : t)) : TABS;
  return (
    // Alta desde el principio: no cambia de tamaño con cada letra del buscador.
    <div className="flex min-h-[55dvh] flex-col gap-4 sm:min-h-80">
      <div className="mm-kb-hide flex flex-col gap-2">
        <p className="text-sm text-muted">{p.reachText}</p>
        {league.hasMinors && (
          <p className="flex items-start gap-2 text-[13px] text-muted">
            <Baby className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
            {MINORS_WARNING}
          </p>
        )}
      </div>

      <section aria-labelledby="anotan-ahora" className="mm-kb-hide flex flex-col gap-2">
        <h3 id="anotan-ahora" className="text-body font-[650]">
          Anotan ahora
        </h3>
        {members.error && !members.data.length ? (
          <LoadError error={members.error} />
        ) : members.loading && !members.data.length ? (
          <ListSkeleton rows={2} />
        ) : rows.length ? (
          <ul className="overflow-hidden rounded-2xl bg-surface-2">
            {rows.map((r) => (
              <PersonRow
                key={r.key}
                name={r.name}
                sub={r.kind === 'invite' ? handleOf(r.username) : null}
                marks={<RowMarks row={r} />}
                action={
                  r.kind === 'member' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-11 text-danger!"
                      icon={<UserMinus className="size-4" />}
                      loading={busy === `m:${r.member.uid}`}
                      disabled={!!busy}
                      aria-label={`Quitarle el permiso de anotar a ${r.name}`}
                      onClick={() => p.onRemove(r.member)}
                    >
                      Quitar
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-11"
                      icon={<X className="size-4" />}
                      loading={busy === `i:${r.invite.id}`}
                      disabled={!!busy}
                      aria-label={`Retirar la invitación a ${r.name}`}
                      onClick={() => p.onRetire(r.invite)}
                    >
                      Retirar
                    </Button>
                  )
                }
              />
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl bg-surface-2 px-4 py-4 text-center text-sm text-muted">{emptyScorersText(league.kind, !!league.hasMinors)}</p>
        )}
        {admins > 0 && <p className="text-xs text-muted">{adminsLine(admins)}</p>}
      </section>

      {/* De la liga · Por @usuario · Link: un segmentado de 3. */}
      <Segmented<ScorersTab> label="Cómo sumar a alguien" full options={tabs} value={p.tab} onChange={p.onTab} />

      <div key={p.tab} className="animate-fade-up">
        {p.tab === 'liga' ? <FromLeague {...p} /> : p.tab === 'usuario' ? <ByUsername {...p} /> : <LinkPanel {...p} />}
      </div>
    </div>
  );
}

function RowMarks({ row }: { row: ScorerRow }) {
  if (row.kind === 'invite') return <Badge tone="warn">Invitado</Badge>;
  return (
    <>
      {row.plays && <Badge tone="ok">Juega</Badge>}
      {row.scorerOnly && <Badge>Solo anota</Badge>}
    </>
  );
}

/** Una persona en una lista de la hoja: foto, nombre, marcas y su botón. */
function PersonRow({ name, sub, marks, action }: { name: string; sub?: string | null; marks?: ReactNode; action: ReactNode }) {
  return (
    <li className="mm-row relative flex min-h-row-pro items-center gap-3 py-2 pr-2.5 pl-4">
      <Avatar name={name} className="size-9 text-sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold tracking-[-0.01em]">{name}</p>
        <div className="flex flex-wrap items-center gap-1 empty:hidden">
          {sub && <span className="truncate text-xs text-muted">{sub}</span>}
          {marks}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">{action}</div>
    </li>
  );
}

function SearchBox({ value, onChange, label, placeholder }: { value: string; onChange: (v: string) => void; label: string; placeholder: string }) {
  return (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 pr-11 pl-9"
        enterKeyHint="search"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={60}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Borrar búsqueda"
          className="absolute top-1/2 right-0 flex size-11 -translate-y-1/2 items-center justify-center text-muted hover:text-fg"
        >
          <X className="size-4" />
        </button>
      )}
    </label>
  );
}

/** «De la liga»: los miembros que todavía no anotan, con buscador por nombre. */
function FromLeague({ league, members, players, query, onQuery, busy, onMake }: ScorersBodyProps) {
  const list = pickableMembers(members.data, query, players);
  return (
    <div className="flex flex-col gap-3">
      <SearchBox value={query} onChange={onQuery} label={league.kind === 'torneo' ? 'Buscar en el torneo' : 'Buscar en la liga'} placeholder="Busca por nombre" />
      {members.error && !members.data.length ? (
        <LoadError error={members.error} />
      ) : members.loading && !members.data.length ? (
        <ListSkeleton rows={3} />
      ) : list.length ? (
        <ul className="overflow-hidden rounded-2xl bg-surface-2">
          {list.map(({ member: m, plays }) => (
            <PersonRow
              key={m.uid}
              name={m.name}
              marks={plays ? <Badge tone="ok">Juega</Badge> : null}
              action={
                <Button variant="soft" size="sm" className="h-11 rounded-full!" icon={<UserPlus className="size-4" />} loading={busy === `m:${m.uid}`} disabled={!!busy} onClick={() => onMake(m, plays)}>
                  Hacer anotador
                </Button>
              }
            />
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center text-sm text-muted">{pickableEmptyText(members.data, query, !!league.hasMinors)}</p>
      )}
    </div>
  );
}

/** «Por @usuario»: la búsqueda de personas; a cada una, el botón que le toca (personAction). */
function ByUsername({ lid, league, members, access, players, busy, onMake, onInvite, onRetire }: ScorersBodyProps) {
  const [input, setInput] = useState('');
  const people = usePeople(input, lid);
  const view = peopleView(input, people);
  const byUid = useMemo(() => new Map(members.data.map((m) => [m.uid, m] as const)), [members.data]);
  const inviteOf = useMemo(() => new Map(access.data.invites.map((i) => [i.user.id, i] as const)), [access.data.invites]);

  const list = (
    <ul className={cx('overflow-hidden rounded-2xl bg-surface-2', !people.settled && 'opacity-70 transition-opacity')} aria-busy={!people.settled}>
      {people.data.map((hit) => (
        <HitRow
          key={hit.id}
          hit={hit}
          lid={lid}
          member={byUid.get(hit.id) ?? null}
          invite={inviteOf.get(hit.id) ?? null}
          players={players}
          busy={busy}
          onMake={onMake}
          onInvite={onInvite}
          onRetire={onRetire}
        />
      ))}
    </ul>
  );

  let body: ReactNode;
  switch (view) {
    case 'following':
      body = (
        <section aria-labelledby="anotar-siguiendo" className="flex flex-col gap-2">
          <h3 id="anotar-siguiendo" className="text-sm font-semibold">
            Personas que sigues
          </h3>
          {list}
        </section>
      );
      break;
    case 'results':
      body = list;
      break;
    case 'loading':
      body = <ListSkeleton rows={3} />;
      break;
    case 'no-following':
      body = <p className="py-6 text-center text-sm text-muted">{usernameHintText(!!league.hasMinors)}</p>;
      break;
    case 'short':
      body = <p className="py-6 text-center text-sm text-muted">Escribe al menos 2 letras.</p>;
      break;
    case 'none':
      body = <p className="py-6 text-center text-sm text-muted">{nobodyFoundText(input, !!league.hasMinors)}</p>;
      break;
    case 'error':
      body = people.error ? <LoadError error={people.error} /> : null;
      break;
  }

  return (
    <div className="flex flex-col gap-3">
      <SearchBox value={input} onChange={setInput} label="Buscar personas" placeholder="Busca por nombre o @usuario" />
      {body}
    </div>
  );
}

function HitRow({
  hit,
  lid,
  member,
  invite,
  players,
  busy,
  onMake,
  onInvite,
  onRetire,
}: {
  hit: PersonHit;
  lid: string;
  member: Member | null;
  invite: ScorerInvite | null;
  players: ReadonlySet<string> | null;
  busy: Busy;
  onMake: ScorersBodyProps['onMake'];
  onInvite: ScorersBodyProps['onInvite'];
  onRetire: ScorersBodyProps['onRetire'];
}) {
  const action = personAction(hit, member, invite);
  const name = hit.name || handleOf(hit.username) || 'Sin nombre';
  const plays = !!member && playsHere(member, players);
  let button: ReactNode;
  switch (action) {
    case 'scorer':
      button = (
        <Button size="sm" className="h-11" disabled>
          Ya anota
        </Button>
      );
      break;
    case 'admin':
      button = (
        <Button size="sm" className="h-11" disabled>
          Admin
        </Button>
      );
      break;
    case 'member':
      button = (
        <Button
          variant="soft"
          size="sm"
          className="h-11 rounded-full!"
          icon={<UserPlus className="size-4" />}
          loading={busy === `m:${hit.id}`}
          disabled={!!busy}
          onClick={() => onMake(member ?? { leagueId: lid, uid: hit.id, name }, plays)}
        >
          Hacer anotador
        </Button>
      );
      break;
    case 'invited':
      button = (
        <>
          <Badge tone="warn">Invitado</Badge>
          <Button
            size="sm"
            variant="ghost"
            className="h-11"
            loading={busy === `i:${invite!.id}`}
            disabled={!!busy}
            aria-label={`Retirar la invitación a ${name}`}
            onClick={() => onRetire(invite!)}
          >
            Retirar
          </Button>
        </>
      );
      break;
    default:
      button = (
        <Button size="sm" variant="primary" className="h-11 rounded-full!" icon={<Send className="size-4" />} loading={busy === `u:${hit.id}`} disabled={!!busy} onClick={() => onInvite(hit)}>
          Invitar a anotar
        </Button>
      );
  }
  return (
    <PersonRow
      name={name}
      sub={hit.name ? handleOf(hit.username) : null}
      marks={plays ? <Badge tone="ok">Juega</Badge> : null}
      action={button}
    />
  );
}

/** «Link»: el link para anotar de este torneo (crear, compartir, cambiar, quitar). En una liga con menores, no hay. */
function LinkPanel({ league, target, access, busy, onCreateLink, onRotateLink, onRevokeLink }: ScorersBodyProps) {
  if (league.hasMinors) return <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">{MINORS_NO_LINK}</p>;
  if (access.error && !access.data.links.length) return <LoadError error={access.error} />;
  if (access.loading && !access.data.links.length) return <Skeleton className="h-32 w-full rounded-2xl" />;
  const link = linkFor(access.data.links, target);
  const title = target.title || league.name;

  if (link?.status === 'ok') {
    const origin = typeof location === 'undefined' ? '' : location.origin;
    const url = scorerLinkUrl(origin, link.code);
    return (
      <div className="flex flex-col gap-3">
        <ShareRow
          link={{ kind: 'url', url }}
          leagueName={title}
          text={scorerShareText(title)}
          hint="Manda el link para anotar por WhatsApp o donde quieras."
        />
        <p className="truncate text-center font-mono text-xs text-muted">{url.replace(/^https?:\/\//, '')}</p>
        <p className="text-center text-xs text-muted">{linkStateText(link, league.tz)}</p>
        <p className="flex items-start gap-2 rounded-2xl bg-warn-soft px-4 py-3 text-[13px] text-warn">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {LINK_WARNING}
        </p>
        <div className="flex gap-2">
          <Button size="sm" className="h-11 flex-1" icon={<RefreshCw className="size-4" />} loading={busy === 'link'} disabled={!!busy} onClick={() => onRotateLink(link)}>
            Cambiar link
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-11 flex-1 text-danger!"
            icon={<Link2Off className="size-4" />}
            loading={busy === 'link:quitar'}
            disabled={!!busy}
            onClick={() => onRevokeLink(link)}
          >
            Quitar link
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-center text-sm text-muted">{linkStateText(link, league.tz)}</p>
      <p className="text-center text-xs text-muted">
        Quien entre con el link queda como anotador de {league.kind === 'torneo' ? 'este torneo' : 'la liga'}, sin jugador. Vence a los 7 días y sirve 20
        veces.
      </p>
      <Button variant="primary" size="xl" className="mt-2 w-full" icon={<Ticket className="size-5" />} loading={busy === 'link'} disabled={!!busy} onClick={onCreateLink}>
        Crear link para anotar
      </Button>
    </div>
  );
}
