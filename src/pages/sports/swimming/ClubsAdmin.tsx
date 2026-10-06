import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Shield, Timer, Trash2, Waves } from 'lucide-react';
import { setMemberScorer, useLeagueMembers } from '../../../lib/data';
import { deleteClub, saveClub, saveSwimRules, useSwimmers, useSwimRules, type AgeScheme, type SwimClub } from '../../../lib/data/swimming';
import type { Member } from '../../../lib/types';
import { BusyIcon, useBusy } from '../../../components/busy';
import { useAction, useFeedback } from '../../../components/feedback';
import { leavesOnRemove, removeConfirm } from '../../../components/scorers/logic';
import { Button, Card, Empty, Field, Input, Modal, Select, cx } from '../../../components/ui';
import { Segmented, useSwim } from './bits';
import { SCHEME_LABEL, pointsFor } from './logic';
import { parsePoints } from './MeetFormModal';

/**
 * Admin › Clubes: los clubes (los puntos del encuentro son por club) con su entrenador, quién cronometra
 * (anotadores de la liga) y lo que la liga pone por defecto a cada encuentro nuevo.
 */
export function ClubsAdmin() {
  const { lid, isAdmin, clubs } = useSwim();
  const run = useAction();
  const { confirm } = useFeedback();
  const members = useLeagueMembers(lid);
  const swimmers = useSwimmers(lid);
  // El club que se está borrando: la ruedita en su botón.
  const removing = useBusy();
  const [editing, setEditing] = useState<SwimClub | 'new' | null>(null);
  const memberName = useMemo(() => new Map(members.data.map((m) => [m.uid, m.name] as const)), [members.data]);
  const count = (id: string) => swimmers.data.filter((s) => s.clubId === id).length;

  if (!isAdmin) return null;

  const remove = async (c: SwimClub) => {
    if (!(await confirm({ title: `¿Borrar ${c.name}?`, message: 'Sus nadadores quedan sin club (sus resultados no se borran).', confirmText: 'Borrar', danger: true }))) return;
    await removing.run(c.id, () => run(() => deleteClub(lid, c.id), 'Club borrado'));
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Shield className="size-5 text-accent" />
          <h2 className="min-w-0 flex-1 text-lg font-semibold">Clubes</h2>
          <Button variant="primary" size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            Nuevo club
          </Button>
        </div>
        {!clubs.data.length ? (
          <Empty icon={<Shield className="size-8" />} title="Todavía no hay clubes">
            Los puntos y el medallero de cada encuentro se cuentan por club. El entrenador de un club registra e inscribe a sus nadadores.
          </Empty>
        ) : (
          <Card className="divide-y divide-line overflow-hidden">
            {clubs.data.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <span className="size-4 shrink-0 rounded-full border border-line" style={{ background: c.color ?? 'transparent' }} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {c.name}
                    {c.short && <span className="ml-1.5 text-xs text-muted">{c.short}</span>}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {count(c.id) === 1 ? '1 nadador' : `${count(c.id)} nadadores`}
                    {c.coachId ? ` · Entrena: ${memberName.get(c.coachId) ?? '—'}` : ''}
                  </p>
                </div>
                <Button size="sm" variant="ghost" aria-label="Cambiar" icon={<Pencil className="size-4" />} onClick={() => setEditing(c)} />
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Borrar"
                  className="text-danger"
                  icon={<Trash2 className="size-4" />}
                  loading={removing.isBusy(c.id)}
                  disabled={removing.isBusy()}
                  onClick={() => remove(c)}
                />
              </div>
            ))}
          </Card>
        )}
      </section>

      <TimersSection />
      <RulesSection />
      <ClubFormModal editing={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function ClubFormModal({ editing, onClose }: { editing: SwimClub | 'new' | null; onClose: () => void }) {
  const { lid } = useSwim();
  const run = useAction();
  const members = useLeagueMembers(lid);
  const club = editing && editing !== 'new' ? editing : null;
  const [name, setName] = useState('');
  const [short, setShort] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [coach, setCoach] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!editing) return;
    setName(club?.name ?? '');
    setShort(club?.short ?? '');
    setColor(club?.color ?? null);
    setCoach(club?.coachId ?? '');
  }, [editing, club]);
  const valid = name.trim().length > 0 && name.trim().length <= 60 && short.trim().length <= 8;
  const save = async () => {
    setBusy(true);
    const ok = await run(() => saveClub(lid, { id: club?.id, name, short, color, coachId: coach || null }), club ? 'Club guardado' : 'Club creado');
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Modal
      open={!!editing}
      onClose={onClose}
      title={club ? club.name : 'Nuevo club'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={busy} disabled={!valid} onClick={save}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nombre">
          <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Club Delfines" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sigla (opcional)" hint="Hasta 8 letras">
            <Input value={short} maxLength={8} onChange={(e) => setShort(e.target.value.toUpperCase())} placeholder="DEL" />
          </Field>
          <Field label="Color">
            <div className="flex h-10 items-center gap-2">
              <input
                type="color"
                value={color ?? '#3b82f6'}
                onChange={(e) => setColor(e.target.value)}
                className="h-10 w-14 cursor-pointer rounded-xl border border-line bg-surface"
                aria-label="Color del club"
              />
              {color && (
                <Button size="sm" variant="ghost" onClick={() => setColor(null)}>
                  Sin color
                </Button>
              )}
            </div>
          </Field>
        </div>
        <Field label="Entrenador (opcional)" hint="Un miembro de la liga: registra e inscribe a los nadadores de este club.">
          <Select value={coach} onChange={(e) => setCoach(e.target.value)}>
            <option value="">Sin entrenador</option>
            {members.data.map((m) => (
              <option key={m.uid} value={m.uid}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

/** Cronometristas: miembros que toman tiempos y publican series (anotadores). Los nombra el dueño o un admin. */
function TimersSection() {
  const { lid, isAdmin, league } = useSwim();
  const run = useAction();
  const { confirm } = useFeedback();
  const members = useLeagueMembers(lid);
  // Quién se está guardando: la ruedita encima de su casilla (la casilla sigue ahí y no pierde el foco).
  const saving = useBusy();
  const list = members.data.filter((m) => m.role === 'member');

  // Quitárselo a quien entró solo para anotar (sin nadador) lo saca de la liga: se pregunta antes (docs/anotadores.md D5).
  async function toggle(m: Member, on: boolean) {
    const ask = !on && leavesOnRemove(m) ? removeConfirm(m, league.kind) : null;
    if (ask && !(await confirm(ask))) return;
    await saving.run(m.uid, () => run(() => setMemberScorer(m, on), on ? 'Ahora cronometra' : (ask?.done ?? 'Ya no cronometra')));
  }
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Timer className="size-5 text-accent" />
        <h2 className="text-lg font-semibold">Cronometristas</h2>
      </div>
      <p className="text-sm text-muted">
        Toman los tiempos en el teléfono y publican las series. Los admins ya pueden.{!isAdmin && ' Los nombra el dueño o un admin.'}
      </p>
      {!list.length ? (
        <p className="text-sm text-muted">Todavía no hay miembros sin permisos en la liga.</p>
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {list.map((m) => {
            const busy = saving.isBusy(m.uid);
            return (
              <label key={m.uid} className={cx('flex min-h-12 items-center gap-3 px-4 py-2', isAdmin && 'cursor-pointer')}>
                <span className="min-w-0 flex-1 truncate font-medium">{m.name}</span>
                <span className="relative inline-flex size-5 shrink-0">
                  <input
                    type="checkbox"
                    className={cx('size-5 accent-[var(--accent)]', busy && 'opacity-0')}
                    checked={!!m.scorer}
                    disabled={!isAdmin || saving.isBusy()}
                    aria-busy={busy || undefined}
                    onChange={(e) => void toggle(m, e.target.checked)}
                    aria-label={`${m.name} cronometra`}
                  />
                  {busy && <BusyIcon busy className="pointer-events-none absolute inset-0 size-5 text-muted" />}
                </span>
              </label>
            );
          })}
        </Card>
      )}
    </section>
  );
}

/** Lo que la liga pone por defecto a cada encuentro nuevo. */
function RulesSection() {
  const { lid } = useSwim();
  const run = useAction();
  const rules = useSwimRules(lid);
  const [pool, setPool] = useState<25 | 50>(25);
  const [lanes, setLanes] = useState(6);
  const [points, setPoints] = useState('');
  const [scheme, setScheme] = useState<AgeScheme>('cccan');
  const [busy, setBusy] = useState(false);
  const r = rules.data;
  useEffect(() => {
    setPool(r.pool);
    setLanes(r.lanes);
    setPoints(r.points.join('-'));
    setScheme(r.ageGroups);
  }, [r]);
  const parsed = parsePoints(points);
  const dirty = pool !== r.pool || lanes !== r.lanes || points !== r.points.join('-') || scheme !== r.ageGroups;
  const save = async () => {
    if (!parsed) return;
    setBusy(true);
    await run(() => saveSwimRules(lid, r.raw, { pool, lanes, points: parsed, ageGroups: scheme }), 'Guardado');
    setBusy(false);
  };
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Waves className="size-5 text-accent" />
        <h2 className="text-lg font-semibold">Para cada encuentro nuevo</h2>
      </div>
      <Card className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Piscina">
            <Segmented
              label="Piscina"
              value={pool}
              onChange={setPool}
              options={[
                { value: 25, label: '25 m' },
                { value: 50, label: '50 m' },
              ]}
            />
          </Field>
          <Field label="Carriles">
            <Select
              value={lanes}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (points === pointsFor(lanes).join('-')) setPoints(pointsFor(n).join('-'));
                setLanes(n);
              }}
            >
              {Array.from({ length: 8 }, (_, k) => k + 3).map((n) => (
                <option key={n} value={n}>
                  {n} carriles
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Puntos por puesto">
          <Input value={points} inputMode="numeric" aria-invalid={!parsed} onChange={(e) => setPoints(e.target.value)} />
        </Field>
        <Field label="Categorías">
          <Select value={scheme} onChange={(e) => setScheme(e.target.value as AgeScheme)}>
            {(Object.keys(SCHEME_LABEL) as AgeScheme[]).map((s) => (
              <option key={s} value={s}>
                {SCHEME_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex justify-end">
          <Button variant="primary" loading={busy} disabled={!dirty || !parsed} onClick={save}>
            Guardar
          </Button>
        </div>
      </Card>
    </section>
  );
}
