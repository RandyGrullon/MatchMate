import { useEffect, useMemo, useState } from 'react';
import { Plus, Shield, Timer, Trash2 } from 'lucide-react';
import { setMemberScorer, useLeagueMembers } from '../../../lib/data';
import { deleteClub, saveClub, saveSwimRules, useSwimmers, useSwimRules, type AgeScheme, type SwimClub } from '../../../lib/data/swimming';
import type { Member } from '../../../lib/types';
import { BusyIcon, useBusy } from '../../../components/busy';
import { useAction, useFeedback } from '../../../components/feedback';
import { leavesOnRemove, removeConfirm } from '../../../components/scorers/logic';
import { Button, Card, Field, Input, ListRow, Modal, RowIcon, SectionHeader, Select, cx } from '../../../components/ui';
import { EmptyCard, SectionAdd } from '../FieldChrome';
import { Segmented, useSwim } from './bits';
import { SCHEME_LABEL, pointsFor } from './logic';
import { parsePoints } from './MeetFormModal';

/**
 * Organizar › Clubes (rediseño «Calma y foco»; el título lo pone Organizar): los clubes como filas (los puntos del
 * encuentro son por club; tocar uno lo cambia o lo borra) con «+ Nuevo», quién cronometra (anotadores de la liga) y lo
 * que la liga pone por defecto a cada encuentro nuevo.
 */
export function ClubsAdmin() {
  const { lid, isAdmin, clubs } = useSwim();
  const members = useLeagueMembers(lid);
  const swimmers = useSwimmers(lid);
  const [editing, setEditing] = useState<SwimClub | 'new' | null>(null);
  const memberName = useMemo(() => new Map(members.data.map((m) => [m.uid, m.name] as const)), [members.data]);
  const count = (id: string) => swimmers.data.filter((s) => s.clubId === id).length;

  if (!isAdmin) return null;

  return (
    <div className="flex flex-col gap-[30px]">
      <section aria-labelledby="natacion-clubes">
        <SectionHeader id="natacion-clubes" title={clubs.data.length === 1 ? '1 club' : `${clubs.data.length} clubes`} action={clubs.data.length > 0 ? <SectionAdd onClick={() => setEditing('new')} /> : undefined} />
        {!clubs.data.length ? (
          <EmptyCard
            icon={<Shield className="size-5" />}
            title="Todavía no hay clubes"
            text="Los puntos y el medallero se cuentan por club. El entrenador de un club registra e inscribe a sus nadadores."
            action={
              <Button variant="primary" size="lg" icon={<Plus className="size-5" />} onClick={() => setEditing('new')}>
                Nuevo club
              </Button>
            }
          />
        ) : (
          <Card className="overflow-hidden">
            {clubs.data.map((c) => (
              <ListRow
                key={c.id}
                leading={
                  <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2">
                    <span className="size-4 rounded-full shadow-[inset_0_0_0_1px_var(--line)]" style={{ background: c.color ?? 'transparent' }} />
                  </span>
                }
                title={
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    <span className="truncate">{c.name}</span>
                    {c.short && <span className="shrink-0 text-xs font-medium text-muted">{c.short}</span>}
                  </span>
                }
                subtitle={`${count(c.id) === 1 ? '1 nadador' : `${count(c.id)} nadadores`}${c.coachId ? ` · Entrena: ${memberName.get(c.coachId) ?? '—'}` : ''}`}
                onClick={() => setEditing(c)}
                ariaLabel={`Cambiar ${c.name}`}
              />
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
  const { confirm } = useFeedback();
  // Borrar el club (antes, el botón de la fila): la ruedita en su botón.
  const removing = useBusy();
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
  const remove = async () => {
    if (!club) return;
    if (!(await confirm({ title: `¿Borrar ${club.name}?`, message: 'Sus nadadores quedan sin club (sus resultados no se borran).', confirmText: 'Borrar', danger: true }))) return;
    const ok = await removing.run(club.id, () => run(() => deleteClub(lid, club.id).then(() => true), 'Club borrado'));
    if (ok) onClose();
  };
  return (
    <Modal
      open={!!editing}
      onClose={onClose}
      title={club ? club.name : 'Nuevo club'}
      footer={
        <>
          {club && (
            <Button variant="ghost" className="mr-auto h-11 text-danger" icon={<Trash2 className="size-4" />} loading={removing.isBusy()} disabled={busy} onClick={() => void remove()}>
              Borrar
            </Button>
          )}
          <Button variant="ghost" className="h-11" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" className="h-11" loading={busy} disabled={!valid || removing.isBusy()} onClick={save}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nombre">
          <Input className="h-11" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Club Delfines" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sigla (opcional)" hint="Hasta 8 letras">
            <Input className="h-11" value={short} maxLength={8} onChange={(e) => setShort(e.target.value.toUpperCase())} placeholder="DEL" />
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
          <Select className="h-11" value={coach} onChange={(e) => setCoach(e.target.value)}>
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
    <section aria-labelledby="natacion-cronometristas">
      <SectionHeader id="natacion-cronometristas" title="Cronometristas" />
      <p className="mx-1 -mt-1 mb-3 text-meta text-muted">
        Toman los tiempos y publican las series (los admins ya pueden).{!isAdmin && ' Los nombra el dueño o un admin.'}
      </p>
      {!list.length ? (
        <p className="mx-1 text-sm text-muted">Todavía no hay miembros sin permisos en la liga.</p>
      ) : (
        <Card className="overflow-hidden">
          {list.map((m) => {
            const busy = saving.isBusy(m.uid);
            return (
              <label key={m.uid} className={cx('mm-row relative flex min-h-row-pro items-center gap-3.5 py-2 pr-5 pl-4', isAdmin && 'cursor-pointer')}>
                <RowIcon tone={m.scorer ? 'accent' : 'neutral'}>
                  <Timer className="size-5" />
                </RowIcon>
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{m.name}</span>
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
    <section aria-labelledby="natacion-reglas">
      <SectionHeader id="natacion-reglas" title="Para cada encuentro nuevo" />
      <Card className="flex flex-col gap-4 p-5">
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
              className="h-11"
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
          <Input className="h-11" value={points} inputMode="numeric" aria-invalid={!parsed} onChange={(e) => setPoints(e.target.value)} />
        </Field>
        <Field label="Categorías">
          <Select className="h-11" value={scheme} onChange={(e) => setScheme(e.target.value as AgeScheme)}>
            {(Object.keys(SCHEME_LABEL) as AgeScheme[]).map((s) => (
              <option key={s} value={s}>
                {SCHEME_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Button variant="primary" size="lg" loading={busy} disabled={!dirty || !parsed} onClick={save}>
          Guardar
        </Button>
      </Card>
    </section>
  );
}
