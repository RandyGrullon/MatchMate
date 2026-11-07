/**
 * La hoja «Anotadores» (ScorersSheet de la web, con su misma lógica: src/components/scorers/logic.ts y los datos de
 * src/lib/data/scorers.ts), solo para el dueño o un admin: arriba quién anota hoy («Anotan ahora», con «Quitar», o
 * «Retirar» la invitación pendiente); abajo, tres formas de sumar a alguien:
 * - «De la liga»: los miembros, con buscador; «Hacer anotador» y listo;
 * - «Por @usuario»: la búsqueda de personas; a quien ya es de la liga se le da el permiso directo y a quien no, una
 *   invitación de anotador;
 * - «Link»: el link para anotar (se crea, se copia, se manda por WhatsApp, se cambia o se quita).
 *
 * El permiso es de la liga: la primera línea dice hasta dónde llega. Se monta solo mientras está abierta y escucha la
 * liga (`league:<id>`): si alguien entra con el link o acepta, la lista cambia sola. No necesita LeagueScope: con la
 * liga basta (el permiso sale de la membresía de la cuenta, como en LeagueScope).
 */
import { useState, type ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { AlertTriangle, Baby, Link2Off, RefreshCw, Send, Ticket, UserMinus, UserPlus, X } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { cancelInvite } from '@mm/lib/data/invites';
import { useLeagueMembers, useMembership } from '@mm/lib/data/members';
import { usePeople, type PersonHit } from '@mm/lib/data/people';
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
} from '@mm/lib/data/scorers';
import { useTopic } from '@mm/lib/data/topics';
import type { Live } from '@mm/lib/data/client';
import { leagueCtxOf } from '@mm/lib/league';
import { shareOrigin } from '@mm/lib/origin';
import type { League, Member } from '@mm/lib/types';
import { handleOf, peopleView } from '@mm/components/invite/logic';
import {
  adminCount,
  adminsLine,
  emptyScorersText,
  hitName,
  inviteConfirm,
  inviteeName,
  inviteScorerText,
  LINK_SHARE_HINT,
  LINK_WARNING,
  linkCreateText,
  linkStateText,
  madeText,
  makeConfirm,
  memberSearchLabel,
  MINORS_NO_LINK,
  MINORS_WARNING,
  nobodyFoundText,
  personAction,
  pickableEmptyText,
  pickableMembers,
  playsHere,
  removeConfirm,
  REVOKE_LINK_CONFIRM,
  ROTATE_LINK_CONFIRM,
  SCORER_DONE,
  scorerReach,
  scorerReachText,
  scorerRows,
  scorerShareText,
  scorerTabs,
  SHORT_QUERY_TEXT,
  usernameHintText,
  type ScorerRow,
  type ScorersTab,
} from '@mm/components/scorers/logic';
import { confirmAsync, toast } from '@/components/feedback';
import { Badge, Button, Divider, LoadError, Segmented, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { ListBox, ListLoading, NoteBox, PersonRow, PillButton, SearchBox, ShareLinkRow } from './parts';

export interface ScorersSheetProps {
  /** La liga (o el torneo sin liga). */
  league: League;
  open: boolean;
  onClose: () => void;
  /** El torneo desde el que se abre (el texto de los avisos y a dónde llevan). Sin él, la liga (como Organizar). */
  target?: ScorerTarget;
  /** Los jugadores que juegan este torneo (marca «Juega»). Sin lista (no se sabe), nadie sale con «Juega». */
  participants?: readonly string[];
  /** La pestaña con que abre (por defecto «De la liga»). */
  initialTab?: ScorersTab;
}

/** La hoja «Anotadores». Solo se abre para el dueño, un admin o el superadmin (como en la web). */
export function ScorersSheet(props: ScorersSheetProps) {
  const auth = useAuth();
  const membership = useMembership(props.league.id, auth.user?.uid);
  const { isAdmin } = leagueCtxOf(props.league.id, props.league, membership.data ?? null, auth.isSuper);
  if (!props.open || !isAdmin) return null;
  return <ScorersSheetOpen {...props} />;
}

type Busy = string | null;

function ScorersSheetOpen({ league, target: given, participants, onClose, initialTab = 'liga' }: ScorersSheetProps) {
  const lid = league.id;
  const kind = league.kind;
  // Desde Organizar: la liga (Hub.tsx de la web abre la hoja así).
  const target: ScorerTarget = given ?? { scope: 'liga', refId: null, title: league.name };
  // Quien entra con el link, acepta o sale: el tiempo real de la liga ('scorers', 'invites') mantiene la lista.
  useTopic(`league:${lid}`, lid);
  const members = useLeagueMembers(lid);
  const access = useScorerAccess(lid);
  const [tab, setTab] = useState<ScorersTab>(initialTab);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const players = participants ? new Set(participants) : null;
  const rows = scorerRows(members.data, access.data.invites, players);
  const admins = adminCount(members.data);
  // Alta desde el principio: no cambia de tamaño con cada letra del buscador (min-h-[55dvh] de la web).
  const { height } = useWindowDimensions();

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
    if (ask && !(await confirmAsync(ask))) return;
    await act(`m:${m.uid}`, () => setScorer(m, true, target), madeText(m.name));
  }

  async function remove(m: Member) {
    if (busy) return;
    const ask = removeConfirm(m, kind);
    if (!(await confirmAsync(ask))) return;
    await act(`m:${m.uid}`, () => setScorer(m, false, target), ask.done);
  }

  const retire = (inv: Pick<ScorerInvite, 'id'>) => act(`i:${inv.id}`, () => cancelInvite(inv.id, lid), SCORER_DONE.retired);

  async function invite(hit: PersonHit) {
    if (busy) return;
    const name = inviteeName(hit);
    const ask = inviteConfirm(name, league);
    if (ask && !(await confirmAsync(ask))) return;
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

  const createLink = () => act('link', () => createScorerLink(lid, target), SCORER_DONE.linkReady);

  async function rotateLink(link: ScorerLink) {
    if (busy) return;
    if (await confirmAsync(ROTATE_LINK_CONFIRM)) await act('link', () => rotateScorerLink(lid, link), SCORER_DONE.linkChanged);
  }

  async function revokeLink(link: ScorerLink) {
    if (busy) return;
    if (await confirmAsync(REVOKE_LINK_CONFIRM)) await act('link:quitar', () => revokeScorerLink(lid, link), SCORER_DONE.linkRemoved);
  }

  const body: BodyProps = {
    league,
    lid,
    target,
    members,
    access,
    players,
    busy,
    query,
    onQuery: setQuery,
    onMake: (m, plays) => void make(m, plays),
    onInvite: (hit) => void invite(hit),
    onRetire: (inv) => void retire(inv),
    onCreateLink: () => void createLink(),
    onRotateLink: (k) => void rotateLink(k),
    onRevokeLink: (k) => void revokeLink(k),
  };

  return (
    <Sheet open onClose={onClose} title="Anotadores" subtitle={target.title || league.name}>
      <View style={{ minHeight: Math.round(height * 0.55), gap: 16 }}>
        <View style={{ gap: 8 }}>
          <Txt variant="meta" tone="muted">
            {scorerReachText(scorerReach(league))}
          </Txt>
          {league.hasMinors && <MinorsLine />}
        </View>

        <View style={{ gap: 8 }}>
          <Txt variant="bodyStrong" accessibilityRole="header">
            Anotan ahora
          </Txt>
          {members.error && !members.data.length ? (
            <LoadError error={members.error} />
          ) : members.loading && !members.data.length ? (
            <ListLoading />
          ) : rows.length ? (
            <ListBox>
              {rows.map((r, i) => (
                <View key={r.key}>
                  {i > 0 && <Divider inset={64} />}
                  <PersonRow name={r.name} sub={r.kind === 'invite' ? handleOf(r.username) : null} marks={<RowMarks row={r} />} action={<NowAction row={r} busy={busy} onRemove={(m) => void remove(m)} onRetire={body.onRetire} />} />
                </View>
              ))}
            </ListBox>
          ) : (
            <NoteBox center>{emptyScorersText(kind, !!league.hasMinors)}</NoteBox>
          )}
          {admins > 0 && (
            <Txt variant="small" tone="muted">
              {adminsLine(admins)}
            </Txt>
          )}
        </View>

        {/* De la liga · Por @usuario · Link: un segmentado de 3. */}
        <Segmented<ScorersTab> label="Cómo sumar a alguien" options={scorerTabs(kind)} value={tab} onChange={setTab} />

        {tab === 'liga' ? <FromLeague {...body} /> : tab === 'usuario' ? <ByUsername {...body} /> : <LinkPanel {...body} />}
      </View>
    </Sheet>
  );
}

function MinorsLine() {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
      <Baby size={16} color={c.accent} style={{ marginTop: 2 }} />
      <Txt variant="meta" tone="muted" style={{ flex: 1, fontSize: 13 }}>
        {MINORS_WARNING}
      </Txt>
    </View>
  );
}

function RowMarks({ row }: { row: ScorerRow }) {
  if (row.kind === 'invite') return <Badge tone="warn">Invitado</Badge>;
  if (!row.plays && !row.scorerOnly) return null;
  return (
    <>
      {row.plays && <Badge tone="ok">Juega</Badge>}
      {row.scorerOnly && <Badge tone="muted">Solo anota</Badge>}
    </>
  );
}

/** El botón de cada fila de «Anotan ahora»: «Quitar» (rojo) a un anotador o «Retirar» la invitación pendiente. */
function NowAction({ row: r, busy, onRemove, onRetire }: { row: ScorerRow; busy: Busy; onRemove: (m: Member) => void; onRetire: (inv: ScorerInvite) => void }) {
  if (r.kind === 'member') {
    return (
      <PillButton
        variant="ghost"
        danger
        icon={(color) => <UserMinus size={16} color={color} />}
        loading={busy === `m:${r.member.uid}`}
        disabled={!!busy}
        accessibilityLabel={`Quitarle el permiso de anotar a ${r.name}`}
        onPress={() => onRemove(r.member)}
      >
        Quitar
      </PillButton>
    );
  }
  return (
    <PillButton
      variant="ghost"
      icon={(color) => <X size={16} color={color} />}
      loading={busy === `i:${r.invite.id}`}
      disabled={!!busy}
      accessibilityLabel={`Retirar la invitación a ${r.name}`}
      onPress={() => onRetire(r.invite)}
    >
      Retirar
    </PillButton>
  );
}

interface BodyProps {
  league: League;
  lid: string;
  target: ScorerTarget;
  members: Live<Member[]>;
  access: Live<ScorerAccess>;
  players: ReadonlySet<string> | null;
  busy: Busy;
  query: string;
  onQuery: (q: string) => void;
  onMake: (m: Pick<Member, 'leagueId' | 'uid' | 'name'>, plays: boolean) => void;
  onInvite: (hit: PersonHit) => void;
  onRetire: (inv: Pick<ScorerInvite, 'id'>) => void;
  onCreateLink: () => void;
  onRotateLink: (link: ScorerLink) => void;
  onRevokeLink: (link: ScorerLink) => void;
}

const makeIcon = (color: string) => <UserPlus size={16} color={color} />;

/** Lo que dice una lista vacía o la espera, centrado. */
function Hint({ children }: { children: ReactNode }) {
  return (
    <Txt variant="meta" tone="muted" style={{ textAlign: 'center', paddingVertical: 20 }}>
      {children}
    </Txt>
  );
}

/** «De la liga»: los miembros que todavía no anotan, con buscador por nombre. */
function FromLeague({ league, members, players, query, onQuery, busy, onMake }: BodyProps) {
  const list = pickableMembers(members.data, query, players);
  return (
    <View style={{ gap: 12 }}>
      <SearchBox value={query} onChange={onQuery} label={memberSearchLabel(league.kind)} placeholder="Busca por nombre" />
      {members.error && !members.data.length ? (
        <LoadError error={members.error} />
      ) : members.loading && !members.data.length ? (
        <ListLoading />
      ) : list.length ? (
        <ListBox>
          {list.map(({ member: m, plays }, i) => (
            <View key={m.uid}>
              {i > 0 && <Divider inset={64} />}
              <PersonRow
                name={m.name}
                marks={plays ? <Badge tone="ok">Juega</Badge> : null}
                action={
                  <PillButton variant="soft" icon={makeIcon} loading={busy === `m:${m.uid}`} disabled={!!busy} onPress={() => onMake(m, plays)}>
                    Hacer anotador
                  </PillButton>
                }
              />
            </View>
          ))}
        </ListBox>
      ) : (
        <Hint>{pickableEmptyText(members.data, query, !!league.hasMinors)}</Hint>
      )}
    </View>
  );
}

/** «Por @usuario»: la búsqueda de personas; a cada una, el botón que le toca (personAction). */
function ByUsername({ lid, league, members, access, players, busy, onMake, onInvite, onRetire }: BodyProps) {
  const [input, setInput] = useState('');
  const people = usePeople(input, lid);
  const view = peopleView(input, people);
  const byUid = new Map(members.data.map((m) => [m.uid, m] as const));
  const inviteOf = new Map(access.data.invites.map((i) => [i.user.id, i] as const));

  const list = (
    <ListBox dim={!people.settled}>
      {people.data.map((hit, i) => (
        <View key={hit.id}>
          {i > 0 && <Divider inset={64} />}
          <HitRow
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
        </View>
      ))}
    </ListBox>
  );

  let body: ReactNode;
  switch (view) {
    case 'following':
      body = (
        <View style={{ gap: 8 }}>
          <Txt variant="meta" accessibilityRole="header" style={{ fontFamily: font.semibold }}>
            Personas que sigues
          </Txt>
          {list}
        </View>
      );
      break;
    case 'results':
      body = list;
      break;
    case 'loading':
      body = <ListLoading />;
      break;
    case 'no-following':
      body = <Hint>{usernameHintText(!!league.hasMinors)}</Hint>;
      break;
    case 'short':
      body = <Hint>{SHORT_QUERY_TEXT}</Hint>;
      break;
    case 'none':
      body = <Hint>{nobodyFoundText(input, !!league.hasMinors)}</Hint>;
      break;
    case 'error':
      body = people.error ? <LoadError error={people.error} /> : null;
      break;
  }

  return (
    <View style={{ gap: 12 }}>
      <SearchBox value={input} onChange={setInput} label="Buscar personas" placeholder="Busca por nombre o @usuario" />
      {body}
    </View>
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
  onMake: BodyProps['onMake'];
  onInvite: BodyProps['onInvite'];
  onRetire: BodyProps['onRetire'];
}) {
  const action = personAction(hit, member, invite);
  const name = hitName(hit);
  const plays = !!member && playsHere(member, players);
  let button: ReactNode;
  switch (action) {
    case 'scorer':
      button = (
        <PillButton variant="quiet" disabled>
          Ya anota
        </PillButton>
      );
      break;
    case 'admin':
      button = (
        <PillButton variant="quiet" disabled>
          Admin
        </PillButton>
      );
      break;
    case 'member':
      button = (
        <PillButton variant="soft" icon={makeIcon} loading={busy === `m:${hit.id}`} disabled={!!busy} onPress={() => onMake(member ?? { leagueId: lid, uid: hit.id, name }, plays)}>
          Hacer anotador
        </PillButton>
      );
      break;
    case 'invited':
      button = (
        <>
          <Badge tone="warn">Invitado</Badge>
          <PillButton variant="ghost" loading={busy === `i:${invite!.id}`} disabled={!!busy} accessibilityLabel={`Retirar la invitación a ${name}`} onPress={() => onRetire(invite!)}>
            Retirar
          </PillButton>
        </>
      );
      break;
    default:
      button = (
        <PillButton variant="primary" icon={(color) => <Send size={16} color={color} />} loading={busy === `u:${hit.id}`} disabled={!!busy} onPress={() => onInvite(hit)}>
          Invitar a anotar
        </PillButton>
      );
  }
  return <PersonRow name={name} sub={hit.name ? handleOf(hit.username) : null} marks={plays ? <Badge tone="ok">Juega</Badge> : null} action={button} />;
}

/** «Link»: el link para anotar de este torneo (crear, compartir, cambiar, quitar). En una liga con menores, no hay. */
function LinkPanel({ league, target, access, busy, onCreateLink, onRotateLink, onRevokeLink }: BodyProps) {
  const c = useColors();
  if (league.hasMinors) return <NoteBox>{MINORS_NO_LINK}</NoteBox>;
  if (access.error && !access.data.links.length) return <LoadError error={access.error} />;
  if (access.loading && !access.data.links.length) return <ListLoading />;
  const link = linkFor(access.data.links, target);
  const title = target.title || league.name;

  if (link?.status === 'ok') {
    // Con el dominio de la app (no el de la vista previa): es el link que abre la app en el teléfono de quien lo recibe.
    const url = scorerLinkUrl(shareOrigin(null), link.code);
    return (
      <View style={{ gap: 12 }}>
        <ShareLinkRow url={url} title={title} text={scorerShareText(title)} hint={LINK_SHARE_HINT} />
        <Txt selectable numberOfLines={1} variant="small" tone="muted" style={{ textAlign: 'center', fontFamily: font.medium, fontVariant: ['tabular-nums'] }}>
          {url.replace(/^https?:\/\//, '')}
        </Txt>
        <Txt variant="small" tone="muted" style={{ textAlign: 'center' }}>
          {linkStateText(link, league.tz)}
        </Txt>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: c.warnSoft }}>
          <AlertTriangle size={16} color={c.warn} style={{ marginTop: 2 }} />
          <Txt variant="meta" tone="warn" style={{ flex: 1, fontSize: 13 }}>
            {LINK_WARNING}
          </Txt>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <PillButton flex variant="quiet" icon={(color) => <RefreshCw size={16} color={color} />} loading={busy === 'link'} disabled={!!busy} onPress={() => onRotateLink(link)}>
            Cambiar link
          </PillButton>
          <PillButton flex variant="ghost" danger icon={(color) => <Link2Off size={16} color={color} />} loading={busy === 'link:quitar'} disabled={!!busy} onPress={() => onRevokeLink(link)}>
            Quitar link
          </PillButton>
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      <Txt variant="meta" tone="muted" style={{ textAlign: 'center' }}>
        {linkStateText(link, league.tz)}
      </Txt>
      <Txt variant="small" tone="muted" style={{ textAlign: 'center' }}>
        {linkCreateText(league.kind)}
      </Txt>
      <View style={{ marginTop: 8 }}>
        <Button variant="primary" size="xl" full icon={<Ticket size={20} color={c.accentFg} />} loading={busy === 'link'} disabled={!!busy} onPress={onCreateLink}>
          Crear link para anotar
        </Button>
      </View>
    </View>
  );
}
