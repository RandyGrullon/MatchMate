import { useEffect, useState, type ReactNode } from 'react';
import { Check, Ellipsis, Link2, MessageCircle, Search, Send, Ticket, Users, X } from 'lucide-react';
import { INVITE_MAX, inviteErrorText, inviteResultSummary, sendInvites } from '../../lib/data/invites';
import { getInviteCode, renewInviteCode } from '../../lib/data/leagues';
import { usePeople, type PersonHit } from '../../lib/data/people';
import { useTopic } from '../../lib/data/topics';
import type { League, LeagueKind } from '../../lib/types';
import { Avatar } from '../Avatar';
import { useFeedback } from '../feedback';
import { whatsappShareUrl } from '../match/format';
import { copyText } from '../share/actions';
import { Button, Empty, Input, LoadError, Sheet, Skeleton, cx } from '../ui';
import {
  canInviteTo,
  handleOf,
  inviteLink,
  inviteShareText,
  inviteTitle,
  peopleView,
  personLabel,
  personState,
  personStateText,
  selectedSummary,
  selectionAfterSend,
  sendLabel,
  sendTone,
  toggleSelected,
  type InviteLink,
  type PeopleView,
} from './logic';

export interface InviteSheetProps {
  league: League;
  lid: string;
  /** Dueño o admin de la liga (o superadmin). */
  isAdmin: boolean;
  /** La cuenta es miembro de la liga. */
  member: boolean;
  open: boolean;
  onClose: () => void;
  /** El admin creó el link de invitación desde la hoja (Admin › Liga lo muestra al momento). */
  onCode?: (code: string) => void;
}

/**
 * Invitar a la liga: arriba el buscador (nombre o @usuario); sin buscar, las personas que sigues. Se tocan las
 * tarjetas para elegir (quien ya está en la liga o ya tiene invitación no se puede) y «Enviar invitación» les manda
 * la invitación con un push (src/lib/data/invites.ts). Abajo, siempre, el link para mandar por WhatsApp o donde
 * sea: el admin, el de invitación con código (si la liga no tiene, lo crea ahí mismo); un miembro de una liga
 * pública, el de la liga.
 *
 * Solo sale si la cuenta puede invitar (`canInviteTo`: la misma regla de la portada). Se monta solo mientras está
 * abierta: la búsqueda y el código se piden al abrirla y lo elegido empieza de cero cada vez. Mientras está abierta
 * escucha la liga (`league:<id>`): si otro invita o alguien acepta, las marcas «Invitado» / «En la liga» cambian.
 */
export function InviteSheet({ league, lid, isAdmin, member, open, onClose, onCode }: InviteSheetProps) {
  if (!open || !canInviteTo(league, isAdmin, member)) return null;
  return <InviteSheetOpen league={league} lid={lid} isAdmin={isAdmin} onClose={onClose} onCode={onCode} />;
}

const NO_SELECTION: ReadonlyMap<string, PersonHit> = new Map();

function InviteSheetOpen({
  league,
  lid,
  isAdmin,
  onClose,
  onCode,
}: {
  league: League;
  lid: string;
  isAdmin: boolean;
  onClose: () => void;
  onCode?: (code: string) => void;
}) {
  const { toast } = useFeedback();
  const [input, setInput] = useState('');
  const people = usePeople(input, lid);
  // El tiempo real de la liga (invitaciones de otros, quien acepta o rechaza) mantiene al día las marcas.
  useTopic(`league:${lid}`, lid);
  const [selected, setSelected] = useState<ReadonlyMap<string, PersonHit>>(NO_SELECTION);
  const [sending, setSending] = useState(false);
  // El código de invitación (solo el admin): undefined mientras se pide, null si la liga no tiene.
  const [code, setCode] = useState<string | null | undefined>(undefined);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    getInviteCode(lid)
      .then((c) => alive && setCode(c))
      .catch(() => alive && setCode(null));
    return () => {
      alive = false;
    };
  }, [lid, isAdmin]);

  const origin = typeof location === 'undefined' ? '' : location.origin;
  const link = inviteLink({ lid, isAdmin, code, origin });
  const view = peopleView(input, people);

  function toggle(hit: PersonHit) {
    // Mientras se envía, lo elegido no cambia (al terminar salen los que quedaron invitados).
    if (sending) return;
    const next = toggleSelected(selected, hit);
    if (next === selected && !personState(hit)) toast(`Puedes invitar hasta ${INVITE_MAX} personas a la vez.`, 'error');
    setSelected(next);
  }

  async function send() {
    setSending(true);
    try {
      const res = await sendInvites(lid, [...selected.keys()]);
      // Si no salió ninguna, el aviso es de error; quedan elegidos los que no se pudieron invitar.
      toast(inviteResultSummary(res.results, league.kind), sendTone(res.results));
      setSelected((s) => selectionAfterSend(s, res.results));
    } catch (e) {
      console.warn('[invitar]', e);
      toast(inviteErrorText(e, league.kind), 'error');
    } finally {
      setSending(false);
    }
  }

  // La liga todavía no tiene link de invitación: el admin lo crea aquí mismo (como «Crear invitación» en Admin › Liga).
  async function createCode() {
    if (creating) return;
    setCreating(true);
    try {
      const next = await renewInviteCode(league);
      setCode(next);
      onCode?.(next);
      toast('Link de invitación listo');
    } catch (e) {
      console.warn('[invitar] código', e);
      toast('No se pudo crear el link. Prueba otra vez.', 'error');
    } finally {
      setCreating(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={inviteTitle(league.kind)}
      subtitle={league.name}
      footer={
        <div className="flex flex-col gap-3">
          {selected.size > 0 && (
            <SendBar people={[...selected.values()]} sending={sending} onSend={() => void send()} onClear={() => setSelected(NO_SELECTION)} />
          )}
          {/* Con el teclado abierto no cabe: se esconde (mm-kb-hide en index.css) y queda el botón de enviar. */}
          <div className="mm-kb-hide">
            <ShareRow link={link} leagueName={league.name} creating={creating} onCreate={() => void createCode()} />
          </div>
        </div>
      }
    >
      {/*
        Alta desde el principio: no cambia de tamaño con cada letra y, con el teclado abierto en el teléfono, el
        buscador queda arriba, a la vista.
      */}
      <div className="min-h-[55dvh] sm:min-h-80">
        <div className="sticky top-0 z-10 -mx-5 bg-surface px-5 pb-3">
          <label className="relative block">
            <span className="sr-only">Buscar personas</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input
              type="search"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Busca por nombre o @usuario"
              className="h-11 pr-11 pl-9"
              enterKeyHint="search"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={60}
            />
            {input && (
              <button
                type="button"
                onClick={() => setInput('')}
                aria-label="Borrar búsqueda"
                className="absolute top-1/2 right-0 flex size-11 -translate-y-1/2 items-center justify-center text-muted hover:text-fg"
              >
                <X className="size-4" />
              </button>
            )}
          </label>
        </div>

        <PeopleList
          view={view}
          query={input.trim()}
          people={people.data}
          settled={people.settled}
          error={people.error}
          selected={selected}
          onToggle={toggle}
          kind={league.kind}
        />
      </div>
    </Sheet>
  );
}

/** Lo de debajo del buscador según `peopleView`: las tarjetas, la espera, «nadie» o el error. */
export function PeopleList({
  view,
  query,
  people,
  settled = true,
  error = null,
  selected,
  onToggle,
  kind = 'liga',
}: {
  view: PeopleView;
  /** Lo escrito (para «No encontramos a nadie con…»). */
  query: string;
  people: readonly PersonHit[];
  /** false mientras espera a que deje de escribir (la lista de antes se ve más clara). */
  settled?: boolean;
  error?: Error | null;
  selected: ReadonlyMap<string, PersonHit>;
  onToggle: (hit: PersonHit) => void;
  /** Liga o torneo («En la liga» / «En el torneo»). */
  kind?: LeagueKind;
}) {
  const grid = (
    <ul className={cx('grid grid-cols-4 gap-2 sm:grid-cols-5', !settled && 'opacity-70 transition-opacity')} aria-busy={!settled}>
      {people.map((hit) => (
        <li key={hit.id}>
          <PersonTile hit={hit} selected={selected.has(hit.id)} onToggle={() => onToggle(hit)} kind={kind} />
        </li>
      ))}
    </ul>
  );
  switch (view) {
    case 'following':
      return (
        <section aria-labelledby="invitar-siguiendo">
          <h3 id="invitar-siguiendo" className="mb-2 text-sm font-semibold">
            Personas que sigues
          </h3>
          {grid}
        </section>
      );
    case 'results':
      return grid;
    case 'loading':
      return <PeopleSkeleton />;
    case 'no-following':
      return (
        <Empty icon={<Users className="size-8" />} title="Aún no sigues a nadie">
          Búscalos por su nombre o @usuario arriba.
        </Empty>
      );
    case 'short':
      return <p className="px-1 py-8 text-center text-sm text-muted">Escribe al menos 2 letras.</p>;
    case 'none':
      return <p className="px-1 py-8 text-center text-sm text-muted">No encontramos a nadie con «{query}»</p>;
    case 'error':
      return error ? <LoadError error={error} /> : null;
  }
}

/**
 * Una persona en la hoja: foto, nombre y @usuario. Tocar elige o suelta (anillo y marca del color de la liga, como
 * los deportes del selector). Quien ya está en la liga o ya tiene invitación sale con eso y no se puede elegir; si
 * pasó a estarlo mientras estaba elegida (otro la invitó, llegó el tiempo real), se puede soltar.
 */
export function PersonTile({ hit, selected, onToggle, kind = 'liga' }: { hit: PersonHit; selected: boolean; onToggle: () => void; kind?: LeagueKind }) {
  const state = personState(hit);
  const handle = handleOf(hit.username);
  const locked = !!state && !selected;
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={locked}
      aria-pressed={locked ? undefined : selected}
      aria-label={personLabel(hit, kind)}
      className={cx(
        'relative flex w-full flex-col items-center gap-1 rounded-2xl border px-1 pt-2.5 pb-2 text-center transition',
        selected ? 'border-accent bg-accent-soft/60 ring-2 ring-accent' : 'border-transparent',
        locked ? 'cursor-default' : 'hover:bg-surface-2 active:scale-[0.97]',
      )}
    >
      <Avatar name={hit.name || hit.username} className={cx('size-14 text-lg', state && 'opacity-50')} />
      <span className="line-clamp-1 w-full text-xs font-medium break-all">{hit.name || handle}</span>
      {state ? (
        <span className="w-full truncate text-[11px] font-medium text-accent">{personStateText(state, kind)}</span>
      ) : (
        handle && <span className="w-full truncate text-[11px] text-muted">{handle}</span>
      )}
      {selected && (
        <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-accent text-accent-fg" aria-hidden="true">
          <Check className="size-3.5" strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

/** Tarjetas de mentira mientras llega la lista. */
function PeopleSkeleton() {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-5" aria-busy="true">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex flex-col items-center gap-1.5 px-1 pt-2.5 pb-2">
          <Skeleton className="size-14 rounded-full" />
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-2.5 w-10" />
        </div>
      ))}
    </div>
  );
}

/** A quiénes va y el botón de enviar (fijo abajo mientras hay alguien elegido). */
export function SendBar({
  people,
  sending,
  onSend,
  onClear,
}: {
  people: readonly PersonHit[];
  sending: boolean;
  onSend: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm text-muted">{selectedSummary(people)}</p>
        <Button variant="ghost" size="sm" className="h-11 text-muted" onClick={onClear} disabled={sending}>
          Quitar
        </Button>
      </div>
      <Button variant="primary" className="h-12 w-full" loading={sending} icon={<Send className="size-4" />} onClick={onSend}>
        {sendLabel(people.length)}
      </Button>
    </div>
  );
}

const roundItem =
  'flex w-20 flex-col items-center gap-1.5 text-center text-xs leading-tight font-medium text-muted transition hover:text-fg active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50';
const roundIcon = 'flex size-12 items-center justify-center rounded-full';

function RoundButton({ label, icon, tone, onClick, disabled }: { label: string; icon: ReactNode; tone: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={roundItem}>
      <span className={cx(roundIcon, tone)}>{icon}</span>
      {label}
    </button>
  );
}

const canNativeShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

/**
 * El link para mandar por fuera de la app: copiarlo, WhatsApp y el menú del teléfono («Más», si el navegador lo
 * tiene). Si la liga todavía no tiene link de invitación (el admin), en vez de esos tres, un solo botón que lo crea.
 * Sirve también para otros links (el de anotar, src/components/scorers): `text` (lo que acompaña al link), `hint`
 * (la línea de arriba) y `createLabel` (el botón de crear).
 */
export function ShareRow({
  link,
  leagueName,
  onCreate,
  creating = false,
  text: shareText,
  hint = 'O manda el link por WhatsApp o donde quieras.',
  createLabel = 'Crear link de invitación',
}: {
  link: InviteLink;
  leagueName: string;
  /** Crear el link de invitación (solo cuando `link` es 'none'). */
  onCreate?: () => void;
  creating?: boolean;
  /** Lo que acompaña al link en WhatsApp y en «Más» (por defecto, «Únete a <liga> en MatchMate»). */
  text?: string;
  /** La línea de arriba de los botones (null: sin línea). */
  hint?: string | null;
  createLabel?: string;
}) {
  const { toast } = useFeedback();
  const [canShare] = useState(canNativeShare);
  const text = shareText ?? inviteShareText(leagueName);
  const url = link.kind === 'url' ? link.url : null;
  const waiting = link.kind === 'loading';

  if (link.kind === 'none') {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-center text-xs text-muted">Todavía no hay link de invitación. Créalo para mandarlo por WhatsApp o donde quieras.</p>
        <Button className="h-11 w-full" icon={<Ticket className="size-4" />} loading={creating} onClick={onCreate}>
          {createLabel}
        </Button>
      </div>
    );
  }

  async function copy() {
    if (!url) return;
    if (await copyText(url)) toast('Link copiado');
    else toast('No se pudo copiar el link', 'error');
  }

  async function more() {
    if (!url) return;
    try {
      await navigator.share({ title: `${leagueName} · MatchMate`, text, url });
    } catch {
      // cancelado
    }
  }

  const waIcon = <MessageCircle className="size-5" />;
  return (
    <div className="flex flex-col gap-2">
      {hint && <p className="text-center text-xs text-muted">{hint}</p>}
      <div className="flex justify-center gap-4">
        <RoundButton label="Copiar enlace" icon={<Link2 className="size-5" />} tone="bg-surface-2 text-fg" onClick={() => void copy()} disabled={waiting} />
        {url ? (
          <a href={whatsappShareUrl(`${text}: ${url}`)} target="_blank" rel="noreferrer" className={roundItem}>
            <span className={cx(roundIcon, 'bg-ok text-bg')}>{waIcon}</span>
            WhatsApp
          </a>
        ) : (
          <RoundButton label="WhatsApp" icon={waIcon} tone="bg-ok text-bg" onClick={() => undefined} disabled />
        )}
        {canShare && <RoundButton label="Más" icon={<Ellipsis className="size-5" />} tone="bg-surface-2 text-fg" onClick={() => void more()} disabled={waiting} />}
      </div>
    </div>
  );
}
