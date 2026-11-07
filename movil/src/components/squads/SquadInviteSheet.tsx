/**
 * «Invitar al equipo» (el capitán; SquadInviteSheet de la web, con su misma lógica: src/components/invite/logic.ts y
 * squads/logic.ts): arriba el buscador (nombre o @usuario; sin buscar, las personas que sigues) con «Ya está» para los
 * miembros e «Invitado» para quien ya tiene invitación; se tocan las tarjetas y «Enviar invitación» les manda la
 * invitación (`inviteToSquad`; el aviso dice cómo le fue a cada uno). Debajo, las invitaciones que esperan respuesta con
 * «Retirar», y el link de siempre: el QR (`/equipos/unirse/<código>`), el código grande, «Compartir link» y «Copiar
 * código» (como la invitación de una liga en la app) y «Código nuevo». Se monta solo mientras está abierta.
 */
import { useState } from 'react';
import { Pressable, Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Check, Copy, RefreshCw, Search, Send, Share2, Users, X } from 'lucide-react-native';
import { usePeople, type PersonHit } from '@mm/lib/data/people';
import { cancelSquadInvite, inviteToSquad, renewSquadCode, squadErrorText, squadJoinUrl, useSquadCode, useSquadPendingInvites, type SquadLite, type SquadPendingInvite } from '@mm/lib/data/squads';
import { shareOrigin } from '@mm/lib/origin';
import { useNow } from '@mm/lib/useNow';
import { handleOf, peopleView, personLabel, personState, personStateText, selectedSummary, selectionAfterSend, sendLabel, sendTone, toggleSelected, type PeopleView } from '@mm/components/invite/logic';
import { pendingInviteLine, squadAsk, squadInviteErrorText, squadInviteSummary, squadRoom, squadShareText } from '@mm/components/squads/logic';
import { QrCode } from '../invite/QrCode';
import { Avatar } from '../social/Avatar';
import { confirmAsync, toast } from '../feedback';
import { Badge, Button, Empty, Input, LoadError, Sheet, Txt } from '../ui';
import { LogoSpinner } from '../Logo';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

const NO_SELECTION: ReadonlyMap<string, PersonHit> = new Map();

export function SquadInviteSheet({ open, onClose, squad, code }: { open: boolean; onClose: () => void; squad: SquadLite; code?: string | null }) {
  if (!open) return null;
  return <InviteSheetOpen squad={squad} known={code ?? null} onClose={onClose} />;
}

function InviteSheetOpen({ squad, known, onClose }: { squad: SquadLite; known: string | null; onClose: () => void }) {
  const c = useColors();
  const [input, setInput] = useState('');
  const people = usePeople(input, null, squad.id);
  const [selected, setSelected] = useState<ReadonlyMap<string, PersonHit>>(NO_SELECTION);
  const [sending, setSending] = useState(false);
  const room = squadRoom(squad.members);
  const view = peopleView(input, people);

  function toggle(hit: PersonHit) {
    // Mientras se envía, lo elegido no cambia (al terminar salen los que quedaron invitados).
    if (sending) return;
    const next = toggleSelected(selected, hit, room);
    if (next === selected && !personState(hit)) toast(room === 1 ? 'Al equipo le cabe 1 persona más.' : `Al equipo le caben ${room} personas más.`, 'error');
    setSelected(next);
  }

  async function send() {
    setSending(true);
    try {
      const res = await inviteToSquad(squad.id, [...selected.keys()]);
      // Si no salió ninguna, el aviso es de error; quedan elegidos los que no se pudieron invitar.
      toast(squadInviteSummary(res.results), sendTone(res.results));
      setSelected((s) => selectionAfterSend(s, res.results));
    } catch (e) {
      console.warn('[equipo] invitar', e);
      toast(squadErrorText(e), 'error');
    } finally {
      setSending(false);
    }
  }

  const chosen = [...selected.values()];
  return (
    <Sheet
      open
      onClose={onClose}
      title="Invitar al equipo"
      subtitle={squad.name}
      footer={
        chosen.length > 0 ? (
          <View style={{ gap: 4, paddingTop: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Txt variant="meta" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
                {selectedSummary(chosen)}
              </Txt>
              <Button variant="ghost" disabled={sending} onPress={() => setSelected(NO_SELECTION)}>
                Quitar
              </Button>
            </View>
            <Button variant="primary" size="lg" full loading={sending} icon={<Send size={16} color={c.accentFg} />} onPress={send}>
              {sendLabel(chosen.length)}
            </Button>
          </View>
        ) : undefined
      }
    >
      <View style={{ gap: 28 }}>
        {room > 0 ? (
          <View accessibilityLabel="Buscar personas para invitar" style={{ gap: 12, minHeight: 280 }}>
            <PeopleSearch value={input} onChange={setInput} />
            <PeopleList view={view} query={input.trim()} people={people.data} settled={people.settled} error={people.error} selected={selected} onToggle={toggle} />
          </View>
        ) : (
          <View style={{ borderRadius: 16, backgroundColor: c.surface2, paddingHorizontal: 16, paddingVertical: 12 }}>
            <Txt variant="meta" tone="muted" style={{ textAlign: 'center' }}>{`El equipo ya tiene ${squad.members} miembros. Para sumar a alguien, primero tiene que salir otro.`}</Txt>
          </View>
        )}
        <PendingInvites squadId={squad.id} />
        <CodeAndLink squad={squad} known={known} />
      </View>
    </Sheet>
  );
}

/** El buscador de personas (nombre o @usuario). */
function PeopleSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Search size={16} color={c.muted} style={{ position: 'absolute', left: 14, zIndex: 1 }} />
      <Input
        accessibilityLabel="Buscar personas"
        value={value}
        onChangeText={onChange}
        placeholder="Busca por nombre o @usuario"
        returnKeyType="search"
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={60}
        style={{ flex: 1, height: 48, paddingLeft: 38, paddingRight: 44 }}
      />
      {!!value && (
        <Pressable accessibilityRole="button" accessibilityLabel="Borrar búsqueda" onPress={() => onChange('')} style={{ position: 'absolute', right: 0, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <X size={16} color={c.muted} />
        </Pressable>
      )}
    </View>
  );
}

/** Lo de debajo del buscador según `peopleView`: las tarjetas, la espera, «nadie» o el error. */
function PeopleList({
  view,
  query,
  people,
  settled,
  error,
  selected,
  onToggle,
}: {
  view: PeopleView;
  query: string;
  people: readonly PersonHit[];
  settled: boolean;
  error: Error | null;
  selected: ReadonlyMap<string, PersonHit>;
  onToggle: (hit: PersonHit) => void;
}) {
  const c = useColors();
  const grid = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', opacity: settled ? 1 : 0.7 }}>
      {people.map((hit) => (
        <View key={hit.id} style={{ width: '25%', padding: 4 }}>
          <PersonTile hit={hit} selected={selected.has(hit.id)} onToggle={() => onToggle(hit)} />
        </View>
      ))}
    </View>
  );
  switch (view) {
    case 'following':
      return (
        <View style={{ gap: 8 }}>
          <Txt variant="bodyStrong" accessibilityRole="header">
            Personas que sigues
          </Txt>
          {grid}
        </View>
      );
    case 'results':
      return grid;
    case 'loading':
      return (
        <View style={{ paddingVertical: 32, alignItems: 'center' }}>
          <LogoSpinner size={36} label="Buscando personas" />
        </View>
      );
    case 'no-following':
      return <Empty icon={<Users size={28} color={c.accent} />} title="Aún no sigues a nadie" text="Búscalos por su nombre o @usuario arriba." />;
    case 'short':
      return (
        <Txt variant="meta" tone="muted" style={{ textAlign: 'center', paddingVertical: 32 }}>
          Escribe al menos 2 letras.
        </Txt>
      );
    case 'none':
      return (
        <Txt variant="meta" tone="muted" style={{ textAlign: 'center', paddingVertical: 32 }}>
          {`No encontramos a nadie con «${query}»`}
        </Txt>
      );
    case 'error':
      return error ? <LoadError error={error} /> : null;
  }
}

/**
 * Una persona en la hoja: foto, nombre y @usuario. Tocar elige o suelta (contorno y marca del color de la app). Quien
 * ya está en el equipo o ya tiene invitación sale con eso y no se puede elegir (si ya estaba elegida, se puede soltar).
 */
function PersonTile({ hit, selected, onToggle }: { hit: PersonHit; selected: boolean; onToggle: () => void }) {
  const c = useColors();
  const state = personState(hit);
  const handle = handleOf(hit.username);
  const locked = !!state && !selected;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={personLabel(hit, 'squad')}
      accessibilityState={{ selected: locked ? undefined : selected, disabled: locked }}
      disabled={locked}
      onPress={onToggle}
      style={({ pressed }) => ({
        alignItems: 'center',
        gap: 4,
        borderRadius: 16,
        paddingTop: 10,
        paddingBottom: 8,
        paddingHorizontal: 2,
        borderWidth: selected ? 2 : 0,
        borderColor: c.accent,
        backgroundColor: selected ? c.accentSoft : pressed && !locked ? c.surface2 : 'transparent',
      })}
    >
      <View style={{ opacity: state ? 0.5 : 1 }}>
        <Avatar name={hit.name || hit.username} photo={hit.avatar} size={56} />
      </View>
      <Txt numberOfLines={1} style={{ fontSize: 12, fontFamily: font.medium, alignSelf: 'stretch', textAlign: 'center' }}>
        {hit.name || handle}
      </Txt>
      {state ? (
        <Txt numberOfLines={1} tone="accent" style={{ fontSize: 11, fontFamily: font.medium }}>
          {personStateText(state, 'squad')}
        </Txt>
      ) : (
        !!handle && (
          <Txt numberOfLines={1} tone="muted" style={{ fontSize: 11 }}>
            {handle}
          </Txt>
        )
      )}
      {selected && (
        <View style={{ position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Check size={14} color={c.accentFg} strokeWidth={3} />
        </View>
      )}
    </Pressable>
  );
}

/** Las invitaciones que esperan respuesta, con «Retirar» (sin ninguna, nada). */
function PendingInvites({ squadId }: { squadId: string }) {
  const pending = useSquadPendingInvites(squadId, true);
  const now = useNow().getTime();
  const [busy, setBusy] = useState<string | null>(null);
  if (!pending.data.length) return null;

  async function cancel(inv: SquadPendingInvite) {
    setBusy(inv.id);
    try {
      await cancelSquadInvite(squadId, inv.id);
      toast('Invitación retirada');
    } catch (e) {
      console.error(e);
      toast(squadInviteErrorText(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Txt variant="bodyStrong" accessibilityRole="header">
          Esperan respuesta
        </Txt>
        <Badge tone="accent">{pending.data.length}</Badge>
      </View>
      {pending.data.map((inv) => {
        const line = pendingInviteLine(inv, now);
        return (
          <View key={inv.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}>
            <Avatar name={inv.user.name} photo={inv.user.avatar} size={40} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="bodyStrong" numberOfLines={1}>
                {inv.user.name || handleOf(inv.user.username) || 'Sin nombre'}
              </Txt>
              {!!line && (
                <Txt variant="small" tone="muted" numberOfLines={1}>
                  {line}
                </Txt>
              )}
            </View>
            <Button accessibilityLabel={`Retirar la invitación a ${inv.user.name || 'esa persona'}`} loading={busy === inv.id} disabled={busy !== null} onPress={() => cancel(inv)}>
              Retirar
            </Button>
          </View>
        );
      })}
    </View>
  );
}

/** El link para quien no está en la app: el QR, el código grande, compartir o copiar y «Código nuevo». */
function CodeAndLink({ squad, known }: { squad: SquadLite; known: string | null }) {
  const c = useColors();
  const read = useSquadCode(squad.id, true);
  const [renewed, setRenewed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const current = renewed ?? read.data ?? known;
  // Con el dominio de la app: es el link que abre la app en el teléfono de quien lo recibe.
  const url = current ? squadJoinUrl(shareOrigin(null), current) : null;

  async function renew() {
    if (!(await confirmAsync(squadAsk.renewCode()))) return;
    setBusy(true);
    try {
      setRenewed(await renewSquadCode(squad.id));
      toast('Código nuevo listo');
    } catch (e) {
      console.error(e);
      toast(squadErrorText(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ alignItems: 'center', gap: 20, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 24 }}>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Txt variant="bodyStrong" accessibilityRole="header">
          O con el link
        </Txt>
        <Txt variant="meta" tone="muted" style={{ textAlign: 'center', maxWidth: 320 }}>
          Quien entre con el link, el QR o el código se suma al equipo.
        </Txt>
      </View>
      {current && url ? (
        <>
          <View style={{ borderRadius: 24, backgroundColor: '#ffffff', padding: 8 }}>
            <QrCode value={url} size={176} />
          </View>
          <View style={{ alignItems: 'center' }}>
            <Txt tone="muted" style={{ fontSize: 12, fontFamily: font.medium }}>
              Código del equipo
            </Txt>
            <Txt selectable accessibilityLabel={`Código ${current.split('').join(' ')}`} style={{ fontSize: 28, lineHeight: 34, fontFamily: font.bold, letterSpacing: 4 }}>
              {current}
            </Txt>
          </View>
        </>
      ) : read.loading ? (
        <LogoSpinner size={36} label="Cargando el código" />
      ) : (
        <Txt variant="meta" tone="muted">
          No se pudo leer el código. Cierra y vuelve a abrir.
        </Txt>
      )}
      <View style={{ alignSelf: 'stretch', gap: 8 }}>
        <Txt variant="meta" tone="muted" style={{ textAlign: 'center' }}>
          Manda el link por WhatsApp o donde quieras.
        </Txt>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button
              full
              disabled={!url}
              icon={<Share2 size={18} color={c.fg} />}
              onPress={async () => {
                if (!url) return;
                try {
                  await Share.share({ message: `${squadShareText(squad)}\n${url}`, url });
                } catch {
                  toast('No se pudo compartir.', 'error');
                }
              }}
            >
              Compartir link
            </Button>
          </View>
          <View style={{ flex: 1 }}>
            <Button
              full
              disabled={!current}
              icon={<Copy size={18} color={c.fg} />}
              onPress={async () => {
                if (!current) return;
                await Clipboard.setStringAsync(current);
                toast('Código copiado');
              }}
            >
              Copiar código
            </Button>
          </View>
        </View>
      </View>
      <Button full loading={busy} disabled={!current} icon={<RefreshCw size={16} color={c.fg} />} onPress={renew}>
        Código nuevo
      </Button>
    </View>
  );
}
