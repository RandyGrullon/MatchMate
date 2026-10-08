import { useEffect, useMemo, useState } from 'react';
import { Search, ShieldCheck, Users } from 'lucide-react';
import {
  registerSwimmer,
  updateSwimmer,
  useSwimmers,
  useSwimmersPrivate,
  type Sex,
  type SwimmerInfo,
  type SwimmerPrivate,
} from '../../../lib/data/swimming';
import type { Player } from '../../../lib/types';
import { PillSelect, Initials } from '../../../components/ranking/parts';
import { useAction } from '../../../components/feedback';
import { Badge, Button, Card, Field, Input, ListRow, ListSkeleton, LoadError, Modal, SectionHeader, Select } from '../../../components/ui';
import { EmptyCard, SectionAdd } from '../FieldChrome';
import { Segmented, clubMap, useNames, useSwim } from './bits';
import { groupLabel, leagueYear, minorAgeProblem } from './logic';

const SEX_LABEL: Record<Sex, string> = { F: 'Femenino', M: 'Masculino', X: 'Otro' };

interface Editing {
  player: Player;
  info: SwimmerInfo | undefined;
  priv: SwimmerPrivate | undefined;
}

/**
 * Organizar › Nadadores (rediseño «Calma y foco»; el título lo pone Organizar): buscar y filtrar por club, «+ Registrar»
 * nadadores sin cuenta (los menores, con el permiso de su padre, madre o tutor) y cada nadador como fila (tocarla lo
 * cambia: club, año de nacimiento y sexo). El año y el sexo solo los ven los admins; los demás, la categoría.
 */
export function SwimmersAdmin() {
  const { lid, isAdmin, clubs } = useSwim();
  const { players } = useNames(lid);
  const swimmers = useSwimmers(lid);
  const priv = useSwimmersPrivate(lid, isAdmin);
  const [q, setQ] = useState('');
  const [club, setClub] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const infoBy = useMemo(() => new Map(swimmers.data.map((s) => [s.playerId, s] as const)), [swimmers.data]);
  const privBy = useMemo(() => new Map(priv.data.map((p) => [p.playerId, p] as const)), [priv.data]);
  const byClub = useMemo(() => clubMap(clubs.data), [clubs.data]);
  const needle = q.trim().toLowerCase();
  const list = players.data
    .filter((p) => !needle || p.name.toLowerCase().includes(needle))
    .filter((p) => !club || (club === '-' ? !infoBy.get(p.id)?.clubId : infoBy.get(p.id)?.clubId === club));

  if (!isAdmin) return null;
  const error = players.error ?? swimmers.error ?? priv.error;
  if (error) return <LoadError error={error} />;

  return (
    <div className="flex flex-col gap-[26px]">
      <div className="flex flex-col gap-2.5">
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nadador" className="h-11 rounded-2xl pl-10" aria-label="Buscar nadador" />
        </div>
        {clubs.data.length > 0 && (
          <PillSelect
            label="Club"
            className="max-w-full self-start"
            options={[{ key: '', label: 'Todos los clubes' }, ...clubs.data.map((c) => ({ key: c.id, label: c.name })), { key: '-', label: 'Sin club' }]}
            value={club}
            onChange={setClub}
          />
        )}
      </div>

      <section aria-labelledby="natacion-nadadores">
        <SectionHeader
          id="natacion-nadadores"
          title={players.loading ? 'Nadadores' : list.length === 1 ? '1 nadador' : `${list.length} nadadores`}
          action={<SectionAdd label="Registrar" onClick={() => setAdding(true)} />}
        />
        {players.loading ? (
          <ListSkeleton rows={5} />
        ) : !list.length ? (
          <EmptyCard
            icon={<Users className="size-5" />}
            title={players.data.length ? 'Nadie con ese filtro' : 'Todavía no hay nadadores'}
            text={players.data.length ? undefined : 'Registra a los nadadores de cada club para inscribirlos en los encuentros.'}
          />
        ) : (
          <Card className="overflow-hidden">
            {list.map((p) => {
              const info = infoBy.get(p.id);
              const pr = privBy.get(p.id);
              const clubOf = info?.clubId ? byClub.get(info.clubId) : null;
              return (
                <ListRow
                  key={p.id}
                  dense
                  onClick={() => setEditing({ player: p, info, priv: pr })}
                  ariaLabel={`Cambiar a ${p.name}`}
                  leading={<Initials name={p.name} />}
                  title={p.name}
                  subtitle={[clubOf?.name ?? 'Sin club', pr?.birthYear ? String(pr.birthYear) : null, pr?.sex ? SEX_LABEL[pr.sex] : null].filter(Boolean).join(' · ')}
                  trailing={
                    <span className="flex flex-col items-end gap-1">
                      {info?.category && <Badge>{groupLabel(info.category)}</Badge>}
                      {p.isMinor ? (
                        <Badge tone={pr?.consentAt ? 'accent' : 'danger'}>{pr?.consentAt ? 'Menor' : 'Menor sin permiso'}</Badge>
                      ) : p.uid ? (
                        <Badge tone="ok">Con cuenta</Badge>
                      ) : null}
                    </span>
                  }
                />
              );
            })}
          </Card>
        )}
        <p className="mx-1 mt-2.5 flex items-start gap-2 text-[12.5px] leading-[1.4] text-muted">
          <ShieldCheck aria-hidden="true" className="mt-px size-4 shrink-0 text-ok" />
          El año y el sexo solo los ven los admins; los demás ven la categoría. Los menores no tienen cuenta.
        </p>
      </section>

      <SwimmerFormModal open={adding} onClose={() => setAdding(false)} />
      <SwimmerFormModal open={!!editing} onClose={() => setEditing(null)} editing={editing} />
    </div>
  );
}

/**
 * Registrar o cambiar un nadador. `fixedClub`: el entrenador registra solo en su club (y después no ve el año
 * ni el sexo: solo los admins).
 */
export function SwimmerFormModal({ open, onClose, editing, fixedClub }: { open: boolean; onClose: () => void; editing?: Editing | null; fixedClub?: string }) {
  const { lid, league, clubs } = useSwim();
  const run = useAction();
  const minorsOk = !!league.hasMinors;
  const [name, setName] = useState('');
  const [isMinor, setIsMinor] = useState(false);
  const [year, setYear] = useState('');
  const [sex, setSex] = useState<Sex | ''>('');
  const [club, setClub] = useState('');
  const [guardian, setGuardian] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editing?.player.name ?? '');
    setIsMinor(editing ? !!editing.player.isMinor : minorsOk);
    setYear(editing?.priv?.birthYear ? String(editing.priv.birthYear) : '');
    setSex(editing?.priv?.sex ?? '');
    setClub(fixedClub ?? editing?.info?.clubId ?? '');
    setGuardian(editing?.priv?.guardianName ?? '');
    setConsent(!!editing?.priv?.consentAt);
  }, [open, editing, fixedClub, minorsOk]);

  // El año de hoy en la zona de la liga: la base cuenta la edad igual.
  const thisYear = leagueYear(league.tz);
  const birthYear = year ? Number(year) : null;
  const badYear = birthYear != null && (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > thisYear);
  // Con año de menor tiene que ser menor (sin cuenta); si no, la base lo rechaza.
  const ageProblem = badYear
    ? null
    : minorAgeProblem({ birthYear, year: thisYear, isMinor, editing: !!editing, hasAccount: !!editing?.player.uid, minorsOk });
  const valid =
    name.trim().length > 0 &&
    name.trim().length <= 60 &&
    !badYear &&
    !ageProblem &&
    (!isMinor || (birthYear != null && !!sex && consent)) &&
    (!fixedClub || club === fixedClub);

  const save = async () => {
    setBusy(true);
    const ok = await run(async () => {
      if (!editing) {
        await registerSwimmer(lid, {
          name,
          clubId: club || null,
          isMinor,
          birthYear,
          sex: sex || null,
          consent: isMinor && consent,
          guardianName: guardian || null,
        });
      } else {
        const p = editing.priv;
        await updateSwimmer(lid, editing.player.id, {
          ...(name.trim() !== editing.player.name ? { name } : {}),
          ...((club || null) !== (editing.info?.clubId ?? null) ? { clubId: club || null } : {}),
          ...(birthYear !== (p?.birthYear ?? null) ? { birthYear } : {}),
          ...((sex || null) !== (p?.sex ?? null) ? { sex: sex || null } : {}),
          ...((guardian.trim() || null) !== (p?.guardianName ?? null) ? { guardianName: guardian || null } : {}),
          ...(consent && !p?.consentAt ? { consent: true } : {}),
        });
      }
      return true;
    }, editing ? 'Nadador guardado' : 'Nadador registrado');
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? editing.player.name : 'Registrar nadador'}
      footer={
        <>
          <Button variant="ghost" className="h-11" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" className="h-11" loading={busy} disabled={!valid} onClick={save}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nombre">
          <Input className="h-11" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellido" autoFocus={!editing} />
        </Field>
        {!editing && (
          <label className="flex min-h-11 items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
              checked={isMinor}
              disabled={!minorsOk}
              onChange={(e) => setIsMinor(e.target.checked)}
            />
            <span className="text-sm">
              Es menor de 18 años (sin cuenta)
              {!minorsOk && <span className="block text-xs text-muted">Para registrar menores, activa «Liga con menores» en Organizar › Ajustes (la liga queda privada).</span>}
            </span>
          </label>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Año de nacimiento" hint={isMinor ? 'Obligatorio' : 'Para su categoría'}>
            <Input className="h-11" value={year} inputMode="numeric" maxLength={4} placeholder="2015" aria-invalid={badYear} onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Field label="Club">
            <Select className="h-11" value={club} disabled={!!fixedClub} onChange={(e) => setClub(e.target.value)}>
              <option value="">Sin club</option>
              {clubs.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {ageProblem && (
          <p role="alert" className="text-xs text-warn">
            {ageProblem}
          </p>
        )}
        <Field label={isMinor ? 'Sexo (obligatorio)' : 'Sexo'}>
          <Segmented
            label="Sexo"
            value={sex}
            onChange={setSex}
            options={(['F', 'M', 'X'] as Sex[]).map((s) => ({ value: s, label: SEX_LABEL[s] }))}
          />
        </Field>
        {(isMinor || editing?.player.isMinor) && (
          <>
            <Field label="Padre, madre o tutor (opcional)">
              <Input className="h-11" value={guardian} maxLength={60} onChange={(e) => setGuardian(e.target.value)} />
            </Field>
            <label className="flex min-h-11 items-start gap-3 rounded-xl bg-surface-2 p-3">
              <input
                type="checkbox"
                className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
                checked={consent}
                disabled={!!editing?.priv?.consentAt}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span className="text-sm">
                Su padre, madre o tutor dio permiso para registrarlo en la app.
                <span className="block text-xs text-muted">Queda anotado quién lo registró y cuándo. Solo se guardan el nombre, el año de nacimiento y el sexo.</span>
              </span>
            </label>
          </>
        )}
      </div>
    </Modal>
  );
}
