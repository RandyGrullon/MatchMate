import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ListPlus, UserPlus, Waves } from 'lucide-react';
import { useLeagueCtx } from '../../lib/league';
import { leagueSport } from '../../sports/registry';
import { useAction, useFeedback } from '../feedback';
import { Button, Field, Input, Modal, Textarea, cx } from '../ui';
import { addManyMinors, addManyPlayers, addPlayerWithStats } from './data';
import { ConsentCheck, GuardianFields, MinorCheck } from './GuardianFields';
import {
  MAX_MANY,
  emptyDraft,
  emptyGuardian,
  guardianProblem,
  parseManyMinors,
  parseManyNames,
  parseStats,
  statKind,
  type GuardianDraft,
  type StatDraft,
} from './logic';
import { SportStatFields } from './SportStatFields';

type Mode = 'uno' | 'varios';

/** Qué pide cada deporte, en palabras («con su nivel»). */
export function statWord(sport: string): string {
  switch (statKind(sport)) {
    case 'bowling':
      return 'su promedio';
    case 'racket':
      return 'su nivel';
    case 'golf':
      return 'su Index';
    case 'team':
      return 'su posición y dorsal';
    default:
      return '';
  }
}

/**
 * Admin: agrega a gente sin cuenta (los que no vienen siempre, los invitados, los que no usan la app) con el
 * número de su deporte, o varios a la vez (un nombre por línea). Si después se crean una cuenta, pueden
 * reclamar su jugador y el admin lo aprueba. En natación los nadadores se anotan en su pestaña.
 * En una liga con menores pregunta «Es menor de edad» (marcado de entrada): el menor va con el nombre de su padre,
 * madre o tutor, su teléfono (opcional) y el permiso; en «Varios», «Nombre, tutor, teléfono» por línea.
 */
export function AddPlayerModal({ open, onClose, existingNames }: { open: boolean; onClose: () => void; existingNames: readonly string[] }) {
  const { lid, base, league } = useLeagueCtx();
  const sport = leagueSport(league);
  const kind = statKind(sport);
  const run = useAction();
  const { toast } = useFeedback();
  const [mode, setMode] = useState<Mode>('uno');
  const [name, setName] = useState('');
  const [draft, setDraft] = useState<StatDraft>(emptyDraft);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Liga con menores: de entrada se registra como menor (se desmarca para un adulto, p. ej. el entrenador).
  const minorsOk = !!league.hasMinors;
  const [isMinor, setIsMinor] = useState(minorsOk);
  const [guardian, setGuardian] = useState<GuardianDraft>(emptyGuardian);
  const [manyMinors, setManyMinors] = useState(minorsOk);
  const [manyConsent, setManyConsent] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode('uno');
    setName('');
    setDraft(emptyDraft);
    setText('');
    setError(null);
    setIsMinor(minorsOk);
    setGuardian(emptyGuardian);
    setManyMinors(minorsOk);
    setManyConsent(false);
  }, [open, minorsOk]);

  const minorOne = minorsOk && isMinor;
  const minorMode = minorsOk && manyMinors;
  const many = useMemo(() => parseManyNames(text, existingNames), [text, existingNames]);
  const minors = useMemo(() => (minorMode ? parseManyMinors(text, existingNames) : null), [minorMode, text, existingNames]);
  const count = minors ? minors.rows.length : many.names.length;
  const tooMany = count > MAX_MANY;
  const minorsBlocked = !!minors && (minors.noGuardian.length > 0 || minors.badPhone.length > 0 || !manyConsent);
  const word = statWord(sport);

  async function submitOne(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const parsed = parseStats(sport, draft);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    const problem = minorOne ? guardianProblem(guardian) : null;
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setBusy(true);
    const minor = minorOne ? { guardianName: guardian.guardianName, guardianPhone: guardian.guardianPhone, consent: guardian.consent } : null;
    const r = await run(() => addPlayerWithStats(lid, sport, name, parsed.stats, minor));
    setBusy(false);
    if (!r) return;
    if (r.statsSaved) toast(`${name.trim()} agregado`);
    else toast(`${name.trim()} se agregó, pero no se guardó ${word}. Tócalo en la lista para ponerlo.`, 'error');
    onClose();
  }

  async function submitMany(e: FormEvent) {
    e.preventDefault();
    if (busy || !count || tooMany || minorsBlocked) return;
    setBusy(true);
    const r = await run(() => (minors ? addManyMinors(lid, minors.rows, manyConsent) : addManyPlayers(lid, many.names)));
    setBusy(false);
    if (!r) return;
    if (r.failed.length) toast(`Se agregaron ${r.added}. No se pudo con: ${r.failed.join(', ')}.`, 'error');
    else toast(r.added === 1 ? '1 jugador agregado' : `${r.added} jugadores agregados`);
    onClose();
  }

  if (kind === 'swimming') {
    return (
      <Modal open={open} onClose={onClose} title="Agregar nadador" footer={<Button onClick={onClose}>Cerrar</Button>}>
        <div className="flex flex-col gap-3 text-sm">
          <p>
            Los nadadores se anotan en <b>Nadadores</b>: ahí va su año de nacimiento, su sexo y su club, y los menores con el nombre de su tutor
            (los menores no tienen cuenta).
          </p>
          <Link
            to={`${base}/admin?tab=nadadores`}
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-xl bg-accent px-4 font-medium text-accent-fg"
          >
            <Waves className="size-4" />
            Ir a Nadadores
          </Link>
        </div>
      </Modal>
    );
  }

  const existing = minors ? minors.existing : many.existing;
  const repeated = minors ? minors.repeated : many.repeated;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Agregar jugador"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            type="submit"
            form={mode === 'uno' ? 'add-player-one' : 'add-player-many'}
            loading={busy}
            disabled={mode === 'varios' && (count === 0 || tooMany || minorsBlocked)}
          >
            {mode === 'uno' ? 'Agregar' : count > 1 ? `Agregar ${count}` : 'Agregar'}
          </Button>
        </>
      }
    >
      <div role="tablist" aria-label="Cómo agregar" className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
        {(
          [
            ['uno', 'Uno', <UserPlus key="i" className="size-4" />],
            ['varios', 'Varios', <ListPlus key="i" className="size-4" />],
          ] as const
        ).map(([k, label, icon]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={mode === k}
            onClick={() => setMode(k)}
            className={cx(
              'flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition',
              mode === k ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {mode === 'uno' ? (
        <form id="add-player-one" onSubmit={submitOne} className="flex flex-col gap-4">
          <Field label="Nombre">
            <Input required autoFocus maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellido" />
          </Field>
          <SportStatFields sport={sport} draft={draft} onChange={setDraft} />
          {minorsOk && <MinorCheck checked={isMinor} onChange={setIsMinor} />}
          {minorOne && <GuardianFields value={guardian} onChange={setGuardian} />}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <p className="text-xs text-muted">
            {minorOne
              ? 'Queda sin cuenta. Un menor no se puede reclamar: sus resultados quedan en la liga.'
              : 'Queda sin cuenta. Si después se crea una, puede reclamar este jugador desde la liga y tú lo apruebas: sus juegos pasan a su perfil.'}
          </p>
        </form>
      ) : (
        <form id="add-player-many" onSubmit={submitMany} className="flex flex-col gap-3">
          {minorsOk && (
            <MinorCheck checked={manyMinors} onChange={setManyMinors} label="Son menores de edad" hint="Cada uno con el nombre de su padre, madre o tutor." />
          )}
          {minorMode ? (
            <Field label="Un menor por línea: nombre, tutor y teléfono" hint="El teléfono del tutor es opcional. Sirve pegar de una hoja de cálculo.">
              <Textarea
                rows={8}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={'Ana Pérez, María Pérez, 809 555 1234\nLuis Gómez, Carlos Gómez'}
                aria-label="Menores con su tutor"
              />
            </Field>
          ) : (
            <Field label="Un nombre por línea" hint={word ? `Después toca a cada uno en la lista para ponerle ${word}.` : undefined}>
              <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Ana Pérez\nLuis Gómez\nCarla Núñez'} aria-label="Nombres" />
            </Field>
          )}
          <p className={cx('text-xs', tooMany ? 'text-danger' : 'text-muted')} aria-live="polite">
            {tooMany
              ? `Son ${count}: agrega hasta ${MAX_MANY} a la vez.`
              : count === 0
                ? 'Escribe o pega la lista.'
                : `Se agrega${count === 1 ? '' : 'n'} ${count}.`}
            {existing.length > 0 && ` Ya están en la liga (no se repiten): ${existing.join(', ')}.`}
            {repeated > 0 && ` ${repeated} repetido${repeated === 1 ? '' : 's'} en la lista.`}
          </p>
          {minors && minors.noGuardian.length > 0 && (
            <p role="alert" className="text-xs text-danger">
              Falta el tutor de: {minors.noGuardian.join(', ')}.
            </p>
          )}
          {minors && minors.badPhone.length > 0 && (
            <p role="alert" className="text-xs text-danger">
              Revisa el teléfono del tutor de: {minors.badPhone.join(', ')} (solo números).
            </p>
          )}
          {minorMode && (
            <ConsentCheck
              checked={manyConsent}
              onChange={setManyConsent}
              label="Los tutores dieron permiso"
              hint="El padre, madre o tutor de cada uno aceptó que lo registres en la app. Queda anotado quién los registró y cuándo."
            />
          )}
        </form>
      )}
    </Modal>
  );
}
