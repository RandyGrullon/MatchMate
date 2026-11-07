/**
 * Lo del admin en los jugadores de una ronda de golf (AddPlayersModal, GroupsModal y AdminCardModal de GolfPlayers.tsx
 * de la web, con su misma lógica: groups.ts): inscribir a varios con una salida, armar los grupos (y por dónde sale cada
 * uno con salida simultánea) y, en la tarjeta de un jugador, la salida y el Index, quitar la firma, descalificar o
 * sacarlo. Cada hoja se monta abierta: empieza con lo que hay.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Check, Shuffle } from 'lucide-react-native';
import { isValidIndex } from '@mm/sports/golf/course';
import { addGolfPlayers, registerGolf, setGolfDq, setGolfGroups, signGolfCard, unregisterGolf, useGolfIndexes, type GolfCardDoc, type GolfRoundFull } from '@mm/lib/data/golf';
import { useLeagueCtx } from '@mm/lib/league';
import type { Player } from '@mm/lib/types';
import { autoDraft, groupsDraft, groupsPayload, groupsState, playersToAdd, type GroupsDraft } from '@mm/pages/sports/golf/groups';
import { cardHoles, hcpText, indexInput, indexText, parseIndex } from '@mm/pages/sports/golf/logic';
import { confirmAsync } from '@/components/feedback';
import { Button, Field, Input, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { Stepper, TeePicker, golfAction, hcpLine } from './parts';

/** Admin: inscribe a varios jugadores de la liga con una salida (el Index sale del perfil de cada uno). */
export function AddPlayersSheet({ onClose, round, cards, players }: { onClose: () => void; round: GolfRoundFull; cards: readonly GolfCardDoc[]; players: readonly Player[] }) {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const indexes = useGolfIndexes(lid);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [tee, setTee] = useState(round.course.tees[0]?.id ?? '');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const free = playersToAdd(players, cards, q);

  async function save() {
    setBusy(true);
    const n = await golfAction(() => addGolfPlayers(lid, round.eventId, [...picked].map((playerId) => ({ playerId, teeId: tee }))));
    setBusy(false);
    if (n !== undefined) onClose();
  }

  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Inscribir jugadores"
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button onPress={onClose} style={{ flex: 1 }}>
            Cancelar
          </Button>
          <Button variant="primary" loading={busy} disabled={!picked.size} onPress={() => void save()} style={{ flex: 1.4 }}>
            {`Inscribir ${picked.size || ''}`.trim()}
          </Button>
        </View>
      }
    >
      <Field label="Salida para todos (cada quien la puede cambiar antes de anotar)">
        <TeePicker round={round} value={tee} onChange={setTee} />
      </Field>
      <Input value={q} onChangeText={setQ} placeholder="Buscar jugador" accessibilityLabel="Buscar jugador" autoCorrect={false} />
      {!free.length && (
        <Txt tone="muted" style={{ fontSize: 14 }}>
          No quedan jugadores por inscribir.
        </Txt>
      )}
      <View style={{ gap: 4 }}>
        {free.map((p) => {
          const on = picked.has(p.id);
          return (
            <Pressable
              key={p.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() => toggle(p.id)}
              style={[styles.pick, { backgroundColor: on ? c.accentSoft : 'transparent' }]}
            >
              <View style={[styles.box, { backgroundColor: on ? c.accent : c.surface, borderWidth: on ? 0 : 1.5, borderColor: c.faint }]}>
                {on && <Check size={16} color={c.accentFg} strokeWidth={3} />}
              </View>
              <Txt numberOfLines={1} style={{ flex: 1 }}>
                {p.name}
              </Txt>
              <Txt tone="muted" style={{ fontSize: 12 }}>{`Index ${indexText(indexes.data[p.id]?.index ?? null)}`}</Txt>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

/** Admin: grupo de cada jugador (hasta 4) y, con salida simultánea, el hoyo por el que sale cada grupo. */
export function GroupsSheet({ onClose, round, cards, nameOf }: { onClose: () => void; round: GolfRoundFull; cards: readonly GolfCardDoc[]; nameOf: (pid: string) => string }) {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const [draft, setDraft] = useState<GroupsDraft>(() => groupsDraft(cards));
  const [busy, setBusy] = useState(false);
  const holeNumbers = cards[0] ? cardHoles(round, cards[0].teeId).map((h) => h.number) : [];
  const first = holeNumbers[0] ?? 1;
  const { maxGroup, used, tooBig } = groupsState(cards.length, draft.groupOf);
  const groupOptions: (number | null)[] = [null, ...Array.from({ length: maxGroup + 1 }, (_, i) => i + 1)];

  async function save() {
    setBusy(true);
    const ok = await golfAction(async () => {
      await setGolfGroups(lid, round.eventId, groupsPayload(cards, draft, round.shotgun, first));
      return true;
    }, 'Grupos guardados');
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Armar grupos"
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button onPress={onClose} style={{ flex: 1 }}>
            Cancelar
          </Button>
          <Button variant="primary" loading={busy} disabled={tooBig} onPress={() => void save()} style={{ flex: 1.4 }}>
            Guardar grupos
          </Button>
        </View>
      }
    >
      <Button
        full
        icon={<Shuffle size={18} color={c.fg} />}
        onPress={() => {
          const auto = autoDraft(cards, holeNumbers, round.shotgun);
          setDraft({ groupOf: auto.groupOf, startOf: auto.startOf ?? draft.startOf });
        }}
      >
        Repartir de a 4 por handicap
      </Button>
      {tooBig && (
        <Txt tone="danger" style={{ fontSize: 14 }}>
          Un grupo tiene más de 4 jugadores.
        </Txt>
      )}
      <View style={{ gap: 6 }}>
        {[...cards]
          .sort((a, b) => nameOf(a.playerId).localeCompare(nameOf(b.playerId)))
          .map((x) => (
            <View key={x.id} style={styles.line}>
              <Txt numberOfLines={1} style={{ flex: 1, fontSize: 14 }}>
                {nameOf(x.playerId)}
                <Txt tone="muted" style={{ fontSize: 12 }}>{`  hcp ${hcpText(x.playingHcp)}`}</Txt>
              </Txt>
              <Stepper
                label={`Grupo de ${nameOf(x.playerId)}`}
                options={groupOptions}
                value={draft.groupOf[x.id] ?? null}
                text={(g) => (g == null ? 'Sin grupo' : `Grupo ${g}`)}
                onChange={(g) => setDraft({ ...draft, groupOf: { ...draft.groupOf, [x.id]: g } })}
              />
            </View>
          ))}
      </View>
      {round.shotgun && used.length > 0 && (
        <View style={[styles.starts, { borderTopColor: c.line }]}>
          <Txt variant="bodyStrong" style={{ fontSize: 14 }}>
            Hoyo de salida de cada grupo
          </Txt>
          {used.map((g) => (
            <View key={g} style={styles.line}>
              <Txt style={{ flex: 1, fontSize: 14 }}>{`Grupo ${g}`}</Txt>
              <Stepper
                label={`Hoyo de salida del grupo ${g}`}
                options={holeNumbers}
                value={draft.startOf[g] ?? first}
                text={(h) => `Hoyo ${h}`}
                onChange={(h) => setDraft({ ...draft, startOf: { ...draft.startOf, [g]: h } })}
              />
            </View>
          ))}
        </View>
      )}
    </Sheet>
  );
}

type AdminBusy = 'guardar' | 'firma' | 'dq' | 'sacar';

/** Admin sobre la tarjeta de un jugador: salida e Index, abrir la firma, descalificar o sacarlo. */
export function AdminCardSheet({ card, onClose, round, name }: { card: GolfCardDoc; onClose: () => void; round: GolfRoundFull; name: string }) {
  const { lid } = useLeagueCtx();
  const [tee, setTee] = useState(card.teeId);
  const [text, setText] = useState(indexInput(card.hcpIndex));
  // Una acción a la vez (todas cierran la hoja): la ruedita en la que se tocó.
  const [busy, setBusy] = useState<AdminBusy | null>(null);
  const index = parseIndex(text);
  const bad = index != null && !isValidIndex(index);
  const closed = round.closed;
  const line = !bad ? hcpLine(round, tee, index) : null;

  async function act(kind: AdminBusy, fn: () => Promise<unknown>, ok: string) {
    setBusy(kind);
    await golfAction(fn, ok);
    setBusy(null);
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title={name}>
      <Field label="Salida (tees)">
        <TeePicker round={round} value={tee} onChange={setTee} disabled={closed} />
      </Field>
      <Field label="Index congelado de esta ronda" hint="Cambiarlo aquí no toca el Index de su perfil." error={bad}>
        <Input keyboardType="numbers-and-punctuation" value={text} onChangeText={setText} editable={!closed} invalid={bad} />
      </Field>
      {!!line && (
        <Txt tone="muted" style={{ fontSize: 12 }}>
          {line}
        </Txt>
      )}
      <Button
        variant="primary"
        full
        loading={busy === 'guardar'}
        disabled={closed || bad || !!busy}
        onPress={() => void act('guardar', () => registerGolf(lid, round.eventId, { playerId: card.playerId, teeId: tee, index }), 'Tarjeta cambiada')}
      >
        Guardar salida e Index
      </Button>
      {!closed && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 4 }}>
          {card.signed && (
            <Button loading={busy === 'firma'} disabled={!!busy} onPress={() => void act('firma', () => signGolfCard(lid, round.eventId, card.id, false), 'Tarjeta abierta')}>
              Quitar la firma
            </Button>
          )}
          <Button
            loading={busy === 'dq'}
            disabled={!!busy}
            onPress={() => void act('dq', () => setGolfDq(lid, round.eventId, card.id, !card.dq), card.dq ? 'Ya no está descalificado' : 'Descalificado')}
          >
            {card.dq ? 'Quitar descalificación' : 'Descalificar'}
          </Button>
          <Button
            variant="danger"
            loading={busy === 'sacar'}
            disabled={!!busy}
            onPress={async () => {
              if (await confirmAsync({ title: `¿Sacar a ${name} de la ronda?`, message: 'Se borra su tarjeta con lo anotado.', confirmText: 'Sacar', danger: true })) {
                await act('sacar', () => unregisterGolf(lid, round.eventId, card.id), 'Jugador sacado');
              }
            }}
          >
            Sacar de la ronda
          </Button>
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  pick: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  box: { width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  starts: { gap: 6, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
});

