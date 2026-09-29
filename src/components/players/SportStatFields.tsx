import { MIN_RANK_GAMES } from '../../lib/stats';
import { Field, Input, Select } from '../ui';
import { MAX_INDEX } from '../../sports/golf/course';
import { racketScale, statKind, teamPositions, type StatDraft } from './logic';

/**
 * Los números del deporte al agregar o editar a alguien: promedio fijo (boliche: el del handicap mientras no tenga
 * el mínimo de juegos en la temporada ni en la anterior), nivel (raqueta), Index (golf), posición y dorsal (equipos).
 * Controlado: `draft` es lo escrito; se lee con `parseStats`. `averageHint`: lo que dice debajo del promedio (al
 * editar, con el que usa hoy su handicap).
 */
export function SportStatFields({
  sport,
  draft,
  onChange,
  averageHint,
}: {
  sport: string;
  draft: StatDraft;
  onChange: (next: StatDraft) => void;
  averageHint?: string;
}) {
  const kind = statKind(sport);
  const set = (k: keyof StatDraft) => (e: { target: { value: string } }) => onChange({ ...draft, [k]: e.target.value });

  if (kind === 'bowling') {
    return (
      <Field
        label="Promedio fijo (opcional)"
        hint={averageHint ?? `Cuenta para el handicap mientras no tenga ${MIN_RANK_GAMES} juegos verificados en la temporada; después manda el de sus juegos. Sin él, empieza en 0.`}
      >
        <Input type="number" inputMode="numeric" min={0} max={300} value={draft.average} onChange={set('average')} placeholder="Automático" />
      </Field>
    );
  }

  if (kind === 'racket') {
    const scale = racketScale(sport);
    return (
      <Field label={`${scale.label} (opcional)`} hint={scale.hint}>
        <Input inputMode="decimal" value={draft.level} onChange={set('level')} placeholder={scale.placeholder} aria-label={scale.label} />
      </Field>
    );
  }

  if (kind === 'golf') {
    return (
      <Field
        label="Handicap Index (opcional)"
        hint={`De +10 a ${MAX_INDEX} (no oficial). Un «plus» se escribe con +, por ejemplo +1.2. Sirve para el handicap de juego de cada ronda.`}
      >
        <Input inputMode="decimal" value={draft.index} onChange={set('index')} placeholder="Ej. 18.4" aria-label="Handicap Index" />
      </Field>
    );
  }

  if (kind === 'team') {
    const positions = teamPositions(sport);
    const options = draft.position && !positions.includes(draft.position) ? [...positions, draft.position] : positions;
    return (
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <Field label="Posición preferida">
          <Select value={draft.position} onChange={set('position')} aria-label="Posición preferida">
            <option value="">— Cualquiera —</option>
            {options.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Dorsal">
          <Input type="number" inputMode="numeric" min={0} max={99} value={draft.jersey} onChange={set('jersey')} placeholder="Ej. 10" aria-label="Dorsal preferido" />
        </Field>
        <p className="col-span-2 -mt-1 text-xs text-muted">Opcional. Sirve de guía al armar las plantillas de los equipos.</p>
      </div>
    );
  }

  return null;
}
