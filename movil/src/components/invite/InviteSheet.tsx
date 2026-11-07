/**
 * «Invitar personas» (InviteSheet de la web, con su misma lógica: src/components/invite/logic.ts y
 * src/lib/data/invites.ts): arriba el buscador (nombre o @usuario); sin buscar, las personas que sigues. Se tocan las
 * tarjetas para elegir (quien ya está en la liga o ya tiene invitación no se puede) y «Enviar invitación» les manda la
 * invitación con un aviso. Abajo, siempre, el link para mandar por WhatsApp o donde sea: el admin, el de invitación con
 * código (si la liga no tiene, lo crea ahí mismo); un miembro de una liga pública, el de la liga.
 *
 * Solo sale si la cuenta puede invitar (`canInviteTo`). Se monta solo mientras está abierta: la búsqueda y el código se
 * piden al abrirla y lo elegido empieza de cero cada vez. Mientras está abierta escucha la liga (`league:<id>`): si
 * otro invita o alguien acepta, las marcas «Invitado» / «En la liga» cambian. Con el teclado abierto, el link se esconde
 * (no cabe) y queda el botón de enviar.
 */
import { useEffect, useState } from 'react';
import { Keyboard, View } from 'react-native';
import { Ticket } from 'lucide-react-native';
import { INVITE_MAX, inviteErrorText, inviteResultSummary, sendInvites } from '@mm/lib/data/invites';
import { getInviteCode, renewInviteCode } from '@mm/lib/data/leagues';
import { usePeople, type PersonHit } from '@mm/lib/data/people';
import { useTopic } from '@mm/lib/data/topics';
import { shareOrigin } from '@mm/lib/origin';
import type { League } from '@mm/lib/types';
import {
  CREATE_LINK_LABEL,
  NO_LINK_TEXT,
  LINK_ERROR_TEXT,
  LINK_READY_TEXT,
  SHARE_LINK_HINT,
  canInviteTo,
  inviteLink,
  inviteMaxText,
  inviteShareText,
  inviteTitle,
  peopleView,
  personState,
  selectionAfterSend,
  sendTone,
  toggleSelected,
  type InviteLink,
} from '@mm/components/invite/logic';
import { toast } from '../feedback';
import { LogoSpinner } from '../Logo';
import { ShareLinkRow } from '../scorers/parts';
import { Button, Sheet, Txt } from '../ui';
import { useColors } from '@/theme/theme';
import { PeopleList, PeopleSearch, SendBar } from './People';

export interface InviteSheetProps {
  league: League;
  lid: string;
  /** Dueño o admin de la liga (o superadmin). */
  isAdmin: boolean;
  /** La cuenta es miembro de la liga. */
  member: boolean;
  open: boolean;
  onClose: () => void;
  /** El admin creó el link de invitación desde la hoja (Ajustes lo muestra al momento). */
  onCode?: (code: string) => void;
}

export function InviteSheet({ league, lid, isAdmin, member, open, onClose, onCode }: InviteSheetProps) {
  if (!open || !canInviteTo(league, isAdmin, member)) return null;
  return <InviteSheetOpen league={league} lid={lid} isAdmin={isAdmin} onClose={onClose} onCode={onCode} />;
}

const NO_SELECTION: ReadonlyMap<string, PersonHit> = new Map();

/** El teclado está abierto (para esconder el link, que no cabe). */
function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return open;
}

function InviteSheetOpen({ league, lid, isAdmin, onClose, onCode }: { league: League; lid: string; isAdmin: boolean; onClose: () => void; onCode?: (code: string) => void }) {
  const [input, setInput] = useState('');
  const people = usePeople(input, lid);
  // El tiempo real de la liga (invitaciones de otros, quien acepta o rechaza) mantiene al día las marcas.
  useTopic(`league:${lid}`, lid);
  const [selected, setSelected] = useState<ReadonlyMap<string, PersonHit>>(NO_SELECTION);
  const [sending, setSending] = useState(false);
  // El código de invitación (solo el admin): undefined mientras se pide, null si la liga no tiene.
  const [code, setCode] = useState<string | null | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const keyboard = useKeyboardOpen();

  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    getInviteCode(lid)
      .then((v) => alive && setCode(v))
      .catch(() => alive && setCode(null));
    return () => {
      alive = false;
    };
  }, [lid, isAdmin]);

  // Con el dominio de la app (no el de la vista previa): es el link que abre la app en el teléfono de quien lo recibe.
  const link = inviteLink({ lid, isAdmin, code, origin: shareOrigin(null) });
  const view = peopleView(input, people);

  function toggle(hit: PersonHit) {
    // Mientras se envía, lo elegido no cambia (al terminar salen los que quedaron invitados).
    if (sending) return;
    const next = toggleSelected(selected, hit);
    if (next === selected && !personState(hit)) toast(inviteMaxText(INVITE_MAX), 'error');
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

  // La liga todavía no tiene link de invitación: el admin lo crea aquí mismo (como «Crear invitación» en Ajustes).
  async function createCode() {
    if (creating) return;
    setCreating(true);
    try {
      const next = await renewInviteCode(league);
      setCode(next);
      onCode?.(next);
      toast(LINK_READY_TEXT);
    } catch (e) {
      console.warn('[invitar] código', e);
      toast(LINK_ERROR_TEXT, 'error');
    } finally {
      setCreating(false);
    }
  }

  const chosen = [...selected.values()];
  return (
    <Sheet
      open
      onClose={onClose}
      title={inviteTitle(league.kind)}
      subtitle={league.name}
      footer={
        <View style={{ gap: 12, paddingTop: 8 }}>
          {chosen.length > 0 && <SendBar people={chosen} sending={sending} onSend={() => void send()} onClear={() => setSelected(NO_SELECTION)} />}
          {!keyboard && <ShareRow link={link} leagueName={league.name} creating={creating} onCreate={() => void createCode()} />}
        </View>
      }
    >
      {/* Alta desde el principio: no cambia de tamaño con cada letra. */}
      <View accessibilityLabel="Buscar personas para invitar" style={{ gap: 12, minHeight: 320 }}>
        <PeopleSearch value={input} onChange={setInput} />
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
      </View>
    </Sheet>
  );
}

/**
 * El link para mandar por fuera de la app (ShareRow de la web): copiarlo, WhatsApp y la hoja de compartir del teléfono
 * («Más»). Si la liga todavía no tiene link (el admin), un solo botón que lo crea; mientras se pide, la espera.
 */
function ShareRow({ link, leagueName, creating, onCreate }: { link: InviteLink; leagueName: string; creating: boolean; onCreate: () => void }) {
  const c = useColors();
  if (link.kind === 'none') {
    return (
      <View style={{ gap: 8 }}>
        <Txt variant="small" tone="muted" style={{ textAlign: 'center' }}>
          {NO_LINK_TEXT}
        </Txt>
        <Button full loading={creating} icon={<Ticket size={16} color={c.fg} />} onPress={onCreate}>
          {CREATE_LINK_LABEL}
        </Button>
      </View>
    );
  }
  if (link.kind === 'loading') {
    return (
      <View style={{ gap: 8, alignItems: 'center' }}>
        <Txt variant="small" tone="muted" style={{ textAlign: 'center' }}>
          {SHARE_LINK_HINT}
        </Txt>
        <LogoSpinner size={28} label="Preparando el link" />
      </View>
    );
  }
  return <ShareLinkRow url={link.url} title={leagueName} text={inviteShareText(leagueName)} hint={SHARE_LINK_HINT} />;
}
