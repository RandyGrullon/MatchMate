import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ChevronDown, Search, UserPlus, Users, X } from 'lucide-react';
import {
  enterSwimmers,
  unenterSwimmer,
  useSwimmers,
  useSwimmersPrivate,
  type SwimEntry,
  type SwimEventItem,
  type SwimmerInfo,
  type SwimmerPrivate,
} from '../../../lib/data/swimming';
import { usePlayers } from '../../../lib/data';
import { useBusy } from '../../../components/busy';
import { useAction, useFeedback } from '../../../components/feedback';
import { Badge, Button, Card, Input, Modal, cx } from '../../../components/ui';
import { TuTag } from '../../../components/ranking/parts';
import { EmptyCard } from '../FieldChrome';
import { ClubTag, SeedField, TimeText, useSwim } from './bits';
import { canEnter, groupForMeet, groupLabel, raceDetail, raceName } from './logic';
import type { MeetData } from './MeetPage';

const bySeed = (a: SwimEntry, b: SwimEntry) => (a.seed ?? Infinity) - (b.seed ?? Infinity);

/**
 * Inscritos por prueba, con su tiempo de siembra. Inscriben: el admin (a cualquiera), el entrenador (a los de su
 * club) y quien nada con cuenta (a sí mismo). Antes de nadar se puede cambiar la siembra o sacar a alguien.
 */
export function EntriesPanel({ data }: { data: MeetData }) {
  const { isAdmin, coachOf, myPlayerId, base } = useSwim();
  const run = useAction();
  const { confirm } = useFeedback();
  const { lid, meet, events, entries, clubs, name } = data;
  const swimmers = useSwimmers(lid);
  const info = useMemo(() => new Map(swimmers.data.map((s) => [s.playerId, s] as const)), [swimmers.data]);
  const [open, setOpen] = useState<Set<string>>(() => new Set(events.length <= 3 ? events.map((e) => e.id) : []));
  const [entering, setEntering] = useState<SwimEventItem | null>(null);
  const [seedOf, setSeedOf] = useState<SwimEntry | null>(null);
  // La inscripción que se está sacando: la ruedita en su botón.
  const removing = useBusy();
  const closed = !!meet.finalizedAt;
  const canEnterAny = !closed && (isAdmin || coachOf.size > 0 || !!myPlayerId);
  const mayManage = (e: SwimEntry) => isAdmin || e.playerId === myPlayerId || (!!e.clubId && coachOf.has(e.clubId));

  if (!events.length) return <EmptyCard icon={<Users className="size-5" />} title="Todavía no hay pruebas" text="Primero se arma el programa." />;

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const remove = async (e: SwimEntry) => {
    if (!(await confirm({ title: `¿Sacar a ${name(e.playerId)} de la prueba?`, confirmText: 'Sacar', danger: true }))) return;
    await removing.run(e.id, () => run(() => unenterSwimmer(lid, meet.id, e.id), 'Listo'));
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="mx-1 text-meta text-muted">
        {entries.length === 1 ? '1 inscripción' : `${entries.length} inscripciones`} · {events.length} pruebas · NT = sin tiempo
      </p>
      {events.map((ev) => {
        const list = entries.filter((e) => e.swimEventId === ev.id).sort(bySeed);
        const isOpen = open.has(ev.id);
        const meIn = !!myPlayerId && list.some((e) => e.playerId === myPlayerId);
        return (
          <Card key={ev.id} className="overflow-hidden">
            <div className="flex min-h-row items-center gap-2 py-2 pr-3 pl-4">
              <button
                type="button"
                onClick={() => toggle(ev.id)}
                aria-expanded={isOpen}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-3.5 rounded-xl text-left focus-visible:outline-2 focus-visible:outline-accent"
              >
                <span className={cx('num grid size-10 shrink-0 place-items-center rounded-xl text-[17px] font-[650]', meIn ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-fg-2')}>
                  {ev.num}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-body font-semibold">{raceName(ev)}</span>
                    {meIn && <TuTag small />}
                  </span>
                  <span className="block truncate text-sm text-muted">
                    {raceDetail(ev)} · {list.length === 1 ? '1 inscrito' : `${list.length} inscritos`}
                  </span>
                </span>
                <ChevronDown aria-hidden="true" className={cx('size-5 shrink-0 text-faint transition', isOpen && 'rotate-180')} />
              </button>
              {canEnterAny && (
                <Button variant="soft" className="h-11 min-w-11 shrink-0 px-3" icon={<UserPlus className="size-[18px]" />} onClick={() => setEntering(ev)} aria-label={`Inscribir en la prueba ${ev.num}`}>
                  <span className="hidden sm:inline">Inscribir</span>
                </Button>
              )}
            </div>
            {isOpen && (
              <div className="border-t border-line">
                {!list.length && <p className="px-5 py-3.5 text-sm text-muted">Nadie inscrito todavía.</p>}
                {list.map((e) => {
                  const manage = !closed && mayManage(e) && e.resultAt == null && e.time == null;
                  const me = !!myPlayerId && e.playerId === myPlayerId;
                  return (
                    <div key={e.id} className={cx('mm-row relative flex min-h-row-pro items-center gap-2 py-2 pr-2 pl-5', me && 'mm-row-me bg-accent-soft')}>
                      <div className="min-w-0 flex-1">
                        <Link to={`${base}/j/${e.playerId}`} className="block truncate text-[15px] font-semibold hover:text-accent">
                          {name(e.playerId)}
                        </Link>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <ClubTag club={e.clubId ? clubs.get(e.clubId) : null} short />
                          {e.ageGroup && <span className="text-xs text-muted">{groupLabel(e.ageGroup)}</span>}
                          {e.heat != null && (
                            <span className="text-xs font-[550] text-fg-2">
                              Serie {e.heat} · carril {e.lane}
                            </span>
                          )}
                        </div>
                      </div>
                      {manage ? (
                        <button type="button" onClick={() => setSeedOf(e)} className="min-h-11 rounded-xl px-2.5 text-sm font-semibold hover:bg-surface-2" aria-label="Cambiar siembra">
                          <TimeText cs={e.seed} />
                        </button>
                      ) : (
                        <TimeText cs={e.seed} className="px-2.5 text-sm text-muted" />
                      )}
                      {manage && (
                        <Button
                          variant="ghost"
                          className="h-11 w-11 text-muted"
                          aria-label="Sacar de la prueba"
                          icon={<X className="size-4" />}
                          loading={removing.isBusy(e.id)}
                          disabled={removing.isBusy()}
                          onClick={() => remove(e)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        );
      })}
      {entering && <EnterModal data={data} ev={entering} info={info} onClose={() => setEntering(null)} />}
      <SeedModal data={data} entry={seedOf} onClose={() => setSeedOf(null)} />
    </div>
  );
}

/** Cambiar el tiempo de siembra de un inscrito. */
function SeedModal({ data, entry, onClose }: { data: MeetData; entry: SwimEntry | null; onClose: () => void }) {
  const run = useAction();
  const [seed, setSeed] = useState<number | null>(null);
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const key = entry?.id ?? '';
  const [loaded, setLoaded] = useState('');
  if (entry && loaded !== key) {
    setLoaded(key);
    setSeed(entry.seed);
    setBad(false);
  }
  return (
    <Modal
      open={!!entry}
      onClose={onClose}
      title={entry ? data.name(entry.playerId) : ''}
      footer={
        <>
          <Button variant="ghost" className="h-11" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            className="h-11"
            loading={busy}
            disabled={bad}
            onClick={async () => {
              if (!entry) return;
              setBusy(true);
              const ok = await run(() => enterSwimmers(data.lid, data.meet.id, entry.swimEventId, [{ playerId: entry.playerId, seed }]), 'Siembra guardada');
              setBusy(false);
              if (ok !== undefined) onClose();
            }}
          >
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm text-muted">Tiempo de siembra (vacío = NT). Ej.: 28.45 o 1:05.32</p>
        <SeedField
          key={key}
          value={seed}
          className="h-12 w-40 text-xl"
          onChange={(cs, invalid) => {
            setSeed(cs);
            setBad(invalid);
          }}
        />
      </div>
    </Modal>
  );
}

interface Candidate {
  playerId: string;
  name: string;
  info: SwimmerInfo | undefined;
  priv: SwimmerPrivate | undefined;
  group: string | null;
  ok: boolean;
}

/** Elegir nadadores para una prueba, cada uno con su tiempo de siembra. */
function EnterModal({ data, ev, info, onClose }: { data: MeetData; ev: SwimEventItem; info: Map<string, SwimmerInfo>; onClose: () => void }) {
  const { isAdmin, coachOf, myPlayerId } = useSwim();
  const run = useAction();
  const { lid, meet, entries, clubs } = data;
  const players = usePlayers(lid);
  const priv = useSwimmersPrivate(lid, isAdmin);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Map<string, number | null>>(new Map());
  const [bad, setBad] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const entered = useMemo(() => new Set(entries.filter((e) => e.swimEventId === ev.id).map((e) => e.playerId)), [entries, ev.id]);
  const privBy = useMemo(() => new Map(priv.data.map((p) => [p.playerId, p] as const)), [priv.data]);

  const candidates: Candidate[] = useMemo(() => {
    return players.data
      .filter((p) => !entered.has(p.id))
      .filter((p) => isAdmin || p.id === myPlayerId || (!!info.get(p.id)?.clubId && coachOf.has(info.get(p.id)!.clubId!)))
      .map((p) => {
        const i = info.get(p.id);
        const pr = privBy.get(p.id);
        const group = groupForMeet(meet.date, meet.ageGroups, { birthYear: pr?.birthYear, category: i?.category, categoryYear: i?.categoryYear });
        return { playerId: p.id, name: p.name, info: i, priv: pr, group, ok: canEnter(ev, { sex: pr?.sex ?? null, group }) };
      })
      .sort((a, b) => Number(b.ok) - Number(a.ok) || a.name.localeCompare(b.name));
  }, [players.data, entered, isAdmin, myPlayerId, info, coachOf, privBy, meet.date, meet.ageGroups, ev]);

  const needle = q.trim().toLowerCase();
  const shown = candidates.filter((c) => c.ok && (!needle || c.name.toLowerCase().includes(needle)));
  const hidden = candidates.filter((c) => !c.ok).length;

  const toggle = (id: string) =>
    setPicked((m) => {
      const n = new Map(m);
      if (n.has(id)) n.delete(id);
      else n.set(id, null);
      return n;
    });

  const save = async () => {
    setBusy(true);
    const n = await run(
      () => enterSwimmers(lid, meet.id, ev.id, [...picked].map(([playerId, seed]) => ({ playerId, seed }))),
      picked.size === 1 ? 'Inscrito' : 'Inscritos',
    );
    setBusy(false);
    if (n !== undefined) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Prueba ${ev.num} · ${raceName(ev)}`}
      footer={
        <>
          <Button variant="ghost" className="h-11" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" className="h-11" loading={busy} disabled={!picked.size || bad.size > 0} onClick={save}>
            Inscribir {picked.size ? `(${picked.size})` : ''}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">{raceDetail(ev)}. Marca a quien nada y escribe su tiempo de siembra (vacío = NT).</p>
        {candidates.length > 6 && (
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nadador" className="pl-9" aria-label="Buscar nadador" />
          </div>
        )}
        {!shown.length && <p className="py-4 text-center text-sm text-muted">No hay nadadores para inscribir en esta prueba.</p>}
        <div className="flex flex-col divide-y divide-line">
          {shown.map((c) => {
            const on = picked.has(c.playerId);
            return (
              <div key={c.playerId} className="flex items-center gap-3 py-2">
                <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <input type="checkbox" checked={on} onChange={() => toggle(c.playerId)} className="size-5 shrink-0 accent-[var(--accent)]" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="flex flex-wrap items-center gap-x-2">
                      <ClubTag club={c.info?.clubId ? clubs.get(c.info.clubId) : null} short />
                      {c.group && <span className="text-xs text-muted">{groupLabel(c.group)}</span>}
                      {c.playerId === myPlayerId && <Badge tone="accent">Tú</Badge>}
                    </span>
                  </span>
                </label>
                {on && (
                  <SeedField
                    value={picked.get(c.playerId) ?? null}
                    onChange={(cs, invalid) => {
                      setPicked((m) => new Map(m).set(c.playerId, cs));
                      setBad((s) => {
                        const n = new Set(s);
                        if (invalid) n.add(c.playerId);
                        else n.delete(c.playerId);
                        return n;
                      });
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
        {hidden > 0 && (
          <p className="text-xs text-muted">
            {hidden === 1 ? '1 nadador no cumple' : `${hidden} nadadores no cumplen`} el sexo o la categoría de la prueba
            {isAdmin ? ' (revisa su año de nacimiento en Admin › Nadadores).' : '.'}
          </p>
        )}
      </div>
    </Modal>
  );
}
