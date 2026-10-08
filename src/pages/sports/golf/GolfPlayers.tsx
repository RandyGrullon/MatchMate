import { useEffect, useMemo, useState } from 'react';
import { Shuffle, Signature, UserPlus, Users } from 'lucide-react';
import {
  addGolfPlayers,
  pendingGolfSign,
  registerGolf,
  setGolfDq,
  setGolfGroups,
  setGolfIndex,
  signGolfCard,
  unregisterGolf,
  useGolfIndexes,
  type GolfCardDoc,
  type GolfRoundFull,
} from '../../../lib/data/golf';
import { useLeagueCtx } from '../../../lib/league';
import type { Player } from '../../../lib/types';
import { BusyIcon, useBusy } from '../../../components/busy';
import { useAction, useFeedback } from '../../../components/feedback';
import { useIsPro } from '../../../components/mode';
import { TuTag } from '../../../components/ranking/parts';
import { Badge, Button, Card, Field, Input, ListRow, Modal, SectionHeader, Select, cx } from '../../../components/ui';
import { EmptyCard, ProLine } from '../FieldChrome';
import { MAX_INDEX, MIN_INDEX, isValidIndex } from '../../../sports/golf/course';
import { HcpExplain } from './bits';
import { cardHoles, hcpText, holesDone, indexText, isComplete } from './logic';

/** Index escrito a mano ('12.4', '12,4', '+1.2' = plus) → número; '' = sin Index; NaN = no sirve. */
export function parseIndex(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  const plus = t.startsWith('+');
  const n = Number(plus ? t.slice(1) : t);
  if (!Number.isFinite(n)) return Number.NaN;
  return plus ? -n : n;
}

export const indexInput = (v: number | null | undefined) => (v == null ? '' : v < 0 ? `+${Math.abs(v)}` : String(v));

/**
 * Jugadores de la ronda (rediseño «Calma y foco»): inscribirme (con salida e Index) o mi tarjeta arriba, y los grupos
 * como filas («Grupo 1 · sale por el hoyo 1»). Para el admin, en Pro: inscribir a otros, armar grupos y tocar una fila
 * para cambiar la salida, descalificar o sacar (en Lite, «Esto es de Pro · Usar Pro»).
 */
export function GolfPlayers({
  round,
  cards,
  players,
  onSign,
}: {
  round: GolfRoundFull;
  cards: GolfCardDoc[];
  players: Player[];
  onSign: (card: GolfCardDoc) => void;
}) {
  const { isAdmin, myPlayerId } = useLeagueCtx();
  const pro = useIsPro();
  const [adding, setAdding] = useState(false);
  const [grouping, setGrouping] = useState(false);
  const [editing, setEditing] = useState<GolfCardDoc | null>(null);
  const nameOf = (pid: string) => players.find((p) => p.id === pid)?.name ?? '(jugador borrado)';
  const myCard = myPlayerId ? (cards.find((c) => c.playerId === myPlayerId) ?? null) : null;
  const open = !round.closed;
  // Las herramientas del admin son de Pro (en Lite, solo mirar).
  const manage = isAdmin && pro;

  const groups = useMemo(() => {
    const m = new Map<number | null, GolfCardDoc[]>();
    for (const c of cards) m.set(c.groupNo, [...(m.get(c.groupNo) ?? []), c]);
    return [...m.entries()].sort(([a], [b]) => (a == null ? 1 : b == null ? -1 : a - b));
  }, [cards]);

  const teeName = (id: string) => round.course.tees.find((t) => t.id === id)?.name ?? id;
  const statusOf = (c: GolfCardDoc) =>
    c.dq ? (
      <Badge tone="danger">Descalificado</Badge>
    ) : c.signed ? (
      <Badge tone="ok">Firmada</Badge>
    ) : holesDone(c) ? (
      <Badge>{isComplete(c) ? 'Sin firmar' : `${holesDone(c)} hoyos`}</Badge>
    ) : null;

  return (
    <div className="flex flex-col gap-[26px]">
      {open && myPlayerId && !myCard && <RegisterCard round={round} playerId={myPlayerId} />}
      {myCard && <MyCard round={round} card={myCard} onSign={onSign} />}

      {isAdmin && open && !pro && <ProLine text="Inscribir y armar grupos" />}
      {manage && open && (
        <div className="grid grid-cols-2 gap-2.5">
          <Button variant="quiet" size="lg" icon={<UserPlus className="size-5" />} onClick={() => setAdding(true)}>
            Inscribir
          </Button>
          <Button variant="quiet" size="lg" icon={<Users className="size-5" />} onClick={() => setGrouping(true)} disabled={!cards.length}>
            Armar grupos
          </Button>
        </div>
      )}

      {!cards.length ? (
        <EmptyCard
          icon={<Users className="size-5" />}
          title="Nadie inscrito todavía"
          text={isAdmin ? 'Inscribe a los jugadores o comparte la ronda para que cada quien se inscriba.' : 'Inscríbete arriba con tu salida y tu Index.'}
        />
      ) : (
        groups.map(([g, list]) => (
          <section key={String(g)} aria-label={g == null ? 'Sin grupo' : `Grupo ${g}`}>
            <SectionHeader
              title={g == null ? 'Sin grupo' : `Grupo ${g}`}
              action={g != null ? <span className="text-sm text-muted">sale por el hoyo {list[0].startHole}</span> : undefined}
            />
            <Card className="overflow-hidden">
              {[...list]
                .sort((a, b) => nameOf(a.playerId).localeCompare(nameOf(b.playerId)))
                .map((c) => {
                  const me = c.playerId === myPlayerId;
                  return (
                    <ListRow
                      key={c.id}
                      dense
                      me={me}
                      onClick={manage ? () => setEditing(c) : undefined}
                      ariaLabel={manage ? `Cambiar la tarjeta de ${nameOf(c.playerId)}` : undefined}
                      chevron={false}
                      title={
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate">{nameOf(c.playerId)}</span>
                          {me && <TuTag small />}
                        </span>
                      }
                      subtitle={`${teeName(c.teeId)} · Index ${indexText(c.hcpIndex)} · Hcp ${hcpText(c.playingHcp)}`}
                      trailing={statusOf(c)}
                    />
                  );
                })}
            </Card>
          </section>
        ))
      )}

      <AddPlayersModal open={adding} onClose={() => setAdding(false)} round={round} cards={cards} players={players} />
      <GroupsModal open={grouping} onClose={() => setGrouping(false)} round={round} cards={cards} nameOf={nameOf} />
      <AdminCardModal card={editing} onClose={() => setEditing(null)} round={round} name={editing ? nameOf(editing.playerId) : ''} />
    </div>
  );
}

/** `busy`: mientras guarda, la ruedita queda donde va la flecha y no se puede tocar. */
function TeeSelect({ round, value, onChange, disabled, busy = false }: { round: GolfRoundFull; value: string; onChange: (v: string) => void; disabled?: boolean; busy?: boolean }) {
  return (
    <span className="relative block">
      <Select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled || busy} aria-busy={busy || undefined} className={cx('h-11', busy && 'appearance-none')}>
        {round.course.tees.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} · {t.rating} / {t.slope} · par {t.par}
          </option>
        ))}
      </Select>
      {busy && <BusyIcon busy className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" />}
    </span>
  );
}

/** Inscribirme: salida e Index (el del perfil, que se puede cambiar). El Index queda congelado en la tarjeta. */
function RegisterCard({ round, playerId }: { round: GolfRoundFull; playerId: string }) {
  const { lid } = useLeagueCtx();
  const run = useAction();
  const indexes = useGolfIndexes(lid);
  const saved = indexes.data[playerId]?.index ?? null;
  const [tee, setTee] = useState(round.course.tees[0]?.id ?? '');
  const [text, setText] = useState(indexInput(saved));
  const [busy, setBusy] = useState(false);
  useEffect(() => setText(indexInput(saved)), [saved]);
  const index = parseIndex(text);
  const bad = index != null && !isValidIndex(index);

  async function go() {
    if (bad || busy) return;
    setBusy(true);
    await run(async () => {
      await registerGolf(lid, round.eventId, { teeId: tee, index });
      if (index !== saved) await setGolfIndex(lid, playerId, index);
    }, 'Inscrito en la ronda');
    setBusy(false);
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <p className="text-card-title-pro">Inscríbete en la ronda</p>
        <p className="mt-1 text-meta text-muted">Tu salida y tu Index: con eso sale tu handicap de juego.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Salida (tees)">
          <TeeSelect round={round} value={tee} onChange={setTee} />
        </Field>
        <Field label="Handicap Index (no oficial)" hint="El de FEDOGOLF o GHIN. Plus: +1.2. Vacío = sin Index.">
          <Input inputMode="decimal" className="h-11" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ej.: 14.2" aria-invalid={bad} />
        </Field>
      </div>
      {bad ? (
        <p className="text-xs text-danger">
          El Index va de +{Math.abs(MIN_INDEX)} a {MAX_INDEX}.
        </p>
      ) : (
        <HcpExplain round={round} teeId={tee} index={index} />
      )}
      <Button variant="primary" size="xl" icon={<UserPlus className="size-5" />} onClick={go} loading={busy} disabled={bad || !tee}>
        Inscribirme
      </Button>
    </Card>
  );
}

/** Mi tarjeta en la ronda: salida, handicap, cambiar la salida antes de anotar, salirme y firmar. */
function MyCard({ round, card, onSign }: { round: GolfRoundFull; card: GolfCardDoc; onSign: (card: GolfCardDoc) => void }) {
  const { lid } = useLeagueCtx();
  const run = useAction();
  const { confirm } = useFeedback();
  const busy = useBusy<'salida' | 'salir'>();
  // Anotó algo alguna vez (aunque después vació la tarjeta): el servidor ya no deja cambiar salida ni Index.
  const started = holesDone(card) > 0 || !!card.scoredAt;
  const signing = !card.signed && pendingGolfSign(lid, card.id);
  const locked = round.closed || card.signed || started;
  const tee = round.course.tees.find((t) => t.id === card.teeId);
  return (
    <Card className="flex flex-col gap-3.5 p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-card-title-pro">Mi tarjeta</p>
        {card.signed ? (
          <Badge tone="ok">Firmada</Badge>
        ) : signing ? (
          <Badge tone="ok">Firmada · por enviar</Badge>
        ) : isComplete(card) ? (
          <Badge tone="warn">Falta firmar</Badge>
        ) : (
          <Badge>{holesDone(card)} hoyos</Badge>
        )}
      </div>
      {locked ? (
        // Ya anotó (o está firmada o cerrada): la salida se ve, no se cambia.
        <p className="text-meta">
          <span className="text-muted">Salida: </span>
          <b className="font-semibold">{tee ? `${tee.name} · ${tee.rating} / ${tee.slope} · par ${tee.par}` : card.teeId}</b>
          {!round.closed && !card.signed && <span className="mt-0.5 block text-xs text-muted">Ya anotaste: la salida no cambia (pídeselo al admin).</span>}
        </p>
      ) : (
        <Field label="Salida (tees)">
          <TeeSelect
            round={round}
            value={card.teeId}
            disabled={busy.isBusy()}
            busy={busy.isBusy('salida')}
            onChange={(teeId) => void busy.run('salida', () => run(() => registerGolf(lid, round.eventId, { teeId }), 'Salida cambiada'))}
          />
        </Field>
      )}
      <HcpExplain round={round} teeId={card.teeId} index={card.hcpIndex} />
      <div className="flex flex-wrap items-center gap-2 empty:hidden">
        {!card.signed && !signing && isComplete(card) && !round.closed && (
          <Button variant="primary" size="lg" className="flex-1" icon={<Signature className="size-5" />} onClick={() => onSign(card)}>
            Revisar y firmar
          </Button>
        )}
        {!locked && (
          <Button
            variant="quiet"
            className="h-11"
            loading={busy.isBusy('salir')}
            disabled={busy.isBusy()}
            onClick={async () => {
              if (await confirm({ title: '¿Salirte de la ronda?', confirmText: 'Salirme', danger: true }))
                await busy.run('salir', () => run(() => unregisterGolf(lid, round.eventId, card.id), 'Saliste de la ronda'));
            }}
          >
            Salirme
          </Button>
        )}
      </div>
    </Card>
  );
}

/** Admin: inscribe a varios jugadores de la liga con una salida (el Index sale del perfil de cada uno). */
export function AddPlayersModal({ open, onClose, round, cards, players }: { open: boolean; onClose: () => void; round: GolfRoundFull; cards: GolfCardDoc[]; players: Player[] }) {
  const { lid } = useLeagueCtx();
  const run = useAction();
  const indexes = useGolfIndexes(open ? lid : undefined);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [tee, setTee] = useState(round.course.tees[0]?.id ?? '');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setPicked(new Set());
      setQ('');
    }
  }, [open]);
  const inside = new Set(cards.map((c) => c.playerId));
  const free = players.filter((p) => !inside.has(p.id) && p.name.toLowerCase().includes(q.trim().toLowerCase()));

  async function save() {
    setBusy(true);
    const n = await run(() => addGolfPlayers(lid, round.eventId, [...picked].map((playerId) => ({ playerId, teeId: tee }))));
    setBusy(false);
    if (n !== undefined) onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Inscribir jugadores"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={save} loading={busy} disabled={!picked.size}>
            Inscribir {picked.size || ''}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Salida para todos (cada quien la puede cambiar antes de anotar)">
          <TeeSelect round={round} value={tee} onChange={setTee} />
        </Field>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar jugador" />
        {!free.length && <p className="text-sm text-muted">No quedan jugadores por inscribir.</p>}
        <ul className="flex flex-col gap-1">
          {free.map((p) => {
            const on = picked.has(p.id);
            return (
              <li key={p.id}>
                <label className={cx('flex items-center gap-3 rounded-xl px-3 py-2.5', on ? 'bg-accent-soft' : 'hover:bg-surface-2')}>
                  <input
                    type="checkbox"
                    className="size-5 accent-[var(--accent)]"
                    checked={on}
                    onChange={() => {
                      const next = new Set(picked);
                      if (on) next.delete(p.id);
                      else next.add(p.id);
                      setPicked(next);
                    }}
                  />
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="text-xs text-muted">Index {indexText(indexes.data[p.id]?.index ?? null)}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}

/** Reparte en grupos de hasta 4 por handicap de juego (los de handicap parecido juntos). */
export function autoGroups<T extends { id: string; playingHcp: number }>(cards: readonly T[]): Map<string, number> {
  const sorted = [...cards].sort((a, b) => a.playingHcp - b.playingHcp);
  const count = Math.ceil(sorted.length / 4);
  const out = new Map<string, number>();
  // Tamaños parejos: con 10 jugadores, 4 + 3 + 3 (no 4 + 4 + 2).
  let k = 0;
  for (let g = 0; g < count; g++) {
    const size = Math.floor(sorted.length / count) + (g < sorted.length % count ? 1 : 0);
    for (let i = 0; i < size; i++) out.set(sorted[k++].id, g + 1);
  }
  return out;
}

/** Admin: grupo de cada jugador (hasta 4) y, con salida simultánea, el hoyo por el que sale cada grupo. */
export function GroupsModal({ open, onClose, round, cards, nameOf }: { open: boolean; onClose: () => void; round: GolfRoundFull; cards: GolfCardDoc[]; nameOf: (pid: string) => string }) {
  const { lid } = useLeagueCtx();
  const run = useAction();
  const [groupOf, setGroupOf] = useState<Record<string, number | null>>({});
  const [startOf, setStartOf] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const holeNumbers = cards[0] ? cardHoles(round, cards[0].teeId).map((h) => h.number) : [];
  const first = holeNumbers[0] ?? 1;

  useEffect(() => {
    if (!open) return;
    setGroupOf(Object.fromEntries(cards.map((c) => [c.id, c.groupNo])));
    const starts: Record<number, number> = {};
    for (const c of cards) if (c.groupNo != null) starts[c.groupNo] = c.startHole;
    setStartOf(starts);
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const maxGroup = Math.max(1, Math.ceil(cards.length / 2), ...Object.values(groupOf).map((g) => g ?? 0));
  const sizes = new Map<number, number>();
  for (const g of Object.values(groupOf)) if (g != null) sizes.set(g, (sizes.get(g) ?? 0) + 1);
  const tooBig = [...sizes.values()].some((n) => n > 4);
  const used = [...sizes.keys()].sort((a, b) => a - b);

  async function save() {
    setBusy(true);
    const ok = await run(async () => {
      await setGolfGroups(
        lid,
        round.eventId,
        cards.map((c) => ({ cardId: c.id, groupNo: groupOf[c.id] ?? null, startHole: groupOf[c.id] != null && round.shotgun ? (startOf[groupOf[c.id]!] ?? first) : null })),
      );
      return true;
    }, 'Grupos guardados');
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Armar grupos"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={save} loading={busy} disabled={tooBig}>
            Guardar grupos
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Button
          icon={<Shuffle className="size-4" />}
          onClick={() => {
            const auto = autoGroups(cards);
            setGroupOf(Object.fromEntries(cards.map((c) => [c.id, auto.get(c.id) ?? null])));
            if (round.shotgun) {
              const starts: Record<number, number> = {};
              [...new Set(auto.values())].forEach((g, i) => (starts[g] = holeNumbers[(i * 2) % Math.max(1, holeNumbers.length)] ?? first));
              setStartOf(starts);
            }
          }}
        >
          Repartir de a 4 por handicap
        </Button>
        {tooBig && <p className="text-sm text-danger">Un grupo tiene más de 4 jugadores.</p>}
        <ul className="flex flex-col gap-1.5">
          {[...cards]
            .sort((a, b) => nameOf(a.playerId).localeCompare(nameOf(b.playerId)))
            .map((c) => (
              <li key={c.id} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-sm">
                  {nameOf(c.playerId)} <span className="text-xs text-muted">hcp {hcpText(c.playingHcp)}</span>
                </span>
                <Select
                  className="w-36"
                  value={groupOf[c.id] ?? ''}
                  onChange={(e) => setGroupOf({ ...groupOf, [c.id]: e.target.value ? Number(e.target.value) : null })}
                  aria-label={`Grupo de ${nameOf(c.playerId)}`}
                >
                  <option value="">Sin grupo</option>
                  {Array.from({ length: maxGroup + 1 }, (_, i) => i + 1).map((g) => (
                    <option key={g} value={g}>
                      Grupo {g}
                    </option>
                  ))}
                </Select>
              </li>
            ))}
        </ul>
        {round.shotgun && used.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            <p className="text-sm font-medium">Hoyo de salida de cada grupo</p>
            {used.map((g) => (
              <div key={g} className="flex items-center gap-3">
                <span className="flex-1 text-sm">Grupo {g}</span>
                <Select className="w-28" value={startOf[g] ?? first} onChange={(e) => setStartOf({ ...startOf, [g]: Number(e.target.value) })}>
                  {holeNumbers.map((h) => (
                    <option key={h} value={h}>
                      Hoyo {h}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Admin sobre la tarjeta de un jugador: salida e Index, abrir la firma, descalificar o sacarlo. */
export function AdminCardModal({ card, onClose, round, name }: { card: GolfCardDoc | null; onClose: () => void; round: GolfRoundFull; name: string }) {
  const { lid } = useLeagueCtx();
  const run = useAction();
  const { confirm } = useFeedback();
  // Una acción a la vez (todas cierran la ventana): la ruedita en la que se tocó.
  const busy = useBusy<'guardar' | 'firma' | 'dq' | 'sacar'>();
  const [tee, setTee] = useState('');
  const [text, setText] = useState('');
  useEffect(() => {
    if (card) {
      setTee(card.teeId);
      setText(indexInput(card.hcpIndex));
    }
  }, [card]);
  const index = parseIndex(text);
  const bad = index != null && !isValidIndex(index);
  if (!card) return null;
  const closed = round.closed;
  return (
    <Modal open={!!card} onClose={onClose} title={name}>
      <div className="flex flex-col gap-3">
        <Field label="Salida (tees)">
          <TeeSelect round={round} value={tee} onChange={setTee} disabled={closed} />
        </Field>
        <Field label="Index congelado de esta ronda" hint="Cambiarlo aquí no toca el Index de su perfil.">
          <Input inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} disabled={closed} aria-invalid={bad} />
        </Field>
        {!bad && <HcpExplain round={round} teeId={tee} index={index} />}
        <Button
          variant="primary"
          loading={busy.isBusy('guardar')}
          disabled={closed || bad || busy.isBusy()}
          onClick={() => busy.run('guardar', () => run(() => registerGolf(lid, round.eventId, { playerId: card.playerId, teeId: tee, index }), 'Tarjeta cambiada').then(onClose))}
        >
          Guardar salida e Index
        </Button>
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          {card.signed && !closed && (
            <Button
              loading={busy.isBusy('firma')}
              disabled={busy.isBusy()}
              onClick={() => busy.run('firma', () => run(() => signGolfCard(lid, round.eventId, card.id, false), 'Tarjeta abierta').then(onClose))}
            >
              Quitar la firma
            </Button>
          )}
          {!closed && (
            <Button
              loading={busy.isBusy('dq')}
              disabled={busy.isBusy()}
              onClick={() => busy.run('dq', () => run(() => setGolfDq(lid, round.eventId, card.id, !card.dq), card.dq ? 'Ya no está descalificado' : 'Descalificado').then(onClose))}
            >
              {card.dq ? 'Quitar descalificación' : 'Descalificar'}
            </Button>
          )}
          {!closed && (
            <Button
              variant="danger"
              loading={busy.isBusy('sacar')}
              disabled={busy.isBusy()}
              onClick={async () => {
                if (await confirm({ title: `¿Sacar a ${name} de la ronda?`, message: 'Se borra su tarjeta con lo anotado.', confirmText: 'Sacar', danger: true }))
                  await busy.run('sacar', () => run(() => unregisterGolf(lid, round.eventId, card.id), 'Jugador sacado').then(onClose));
              }}
            >
              Sacar de la ronda
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
