import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ChevronLeft, ChevronRight, Shield } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { createSquad, squadErrorText, squadPath, squadProblem, suggestTag, updateSquad } from '../../lib/data/squads';
import { useActiveSport } from '../../lib/sportContext';
import { useIsPro } from '../../lib/useMode';
import { sportMeta } from '../../sports/registry';
import { useSportStatus } from '../../sports/status';
import type { SportId } from '../../sports/types';
import { useFeedback } from '../../components/feedback';
import { SignInCard } from '../../components/screens/ScreenBits';
import { defaultSquadSport } from '../../components/squads/logic';
import { SquadTint } from '../../components/squads/SquadBits';
import { Button, Sheet, cx } from '../../components/ui';
import { SportIcon } from '../sports/SportBits';
import { SportPicker } from '../sports/SportPicker';
import { SquadFields, emptySquadForm, type SquadForm } from './SquadFields';

/** Lo que dice la hoja del formulario: el problema (solo si ya escribió algo) y si se puede crear. */
export function createGate(form: Pick<SquadForm, 'name' | 'tag'> & Partial<Pick<SquadForm, 'description' | 'city'>>, busy = false): { problem: string | null; shown: string | null; canCreate: boolean } {
  const problem = squadProblem(form);
  // Con todo vacío no se regaña: el botón apagado ya lo dice.
  const shown = problem && (form.name.trim() || form.tag.trim()) ? problem : null;
  return { problem, shown, canCreate: !problem && !busy };
}

/**
 * «Crear equipo» (Equipos › «Crear equipo», Crear o unirme › «Un equipo»): primero el deporte (todos los abiertos;
 * Esports lleva a crear el equipo en Esports, que tiene los suyos) y después nombre, tag (sale solo del nombre hasta que
 * escribes el tuyo), ciudad, color, descripción y «Busca jugadores». Al crear, a la página del equipo con la hoja de
 * invitar abierta (el link, el QR y compartir). `sport`: el deporte ya elegido (salta el primer paso).
 */
export function CreateSquadSheet({
  open,
  onClose,
  sport,
  onEsports,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  sport?: string | null;
  /** Tocó Esports: a crear el equipo en Esports. */
  onEsports: () => void;
  /** Para probarla (o llenar algo de entrada). */
  initial?: Partial<SquadForm>;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Crear equipo">
      {open && <CreateSquadBody wanted={sport ?? null} onEsports={onEsports} initial={initial} />}
    </Sheet>
  );
}

function CreateSquadBody({ wanted, onEsports, initial }: { wanted: string | null; onEsports: () => void; initial?: Partial<SquadForm> }) {
  const auth = useAuth();
  const pro = useIsPro();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useFeedback();
  const sports = useSportStatus(auth.isSuper);
  const active = useActiveSport();
  const startSport = defaultSquadSport(sports.creatable, wanted, active);
  const [picked, setPicked] = useState<string | null>(null);
  const sport = picked ?? startSport;
  const [step, setStep] = useState<'deporte' | 'datos'>(() => (wanted && wanted === startSport ? 'datos' : 'deporte'));
  const [form, setForm] = useState<SquadForm>(() => {
    const f = { ...emptySquadForm(), ...initial };
    return { ...f, tag: f.tag || suggestTag(f.name) };
  });
  const [tagTyped, setTagTyped] = useState(!!initial?.tag);
  const [busy, setBusy] = useState(false);

  if (!auth.user) {
    return (
      <SignInCard
        className="mb-2"
        icon={<Shield />}
        title="Entra para crear tu equipo"
        text="Arma tu equipo, invita a los tuyos con un link y búscale liga."
        next={encodeURIComponent(location.pathname + location.search)}
      />
    );
  }

  if (!sport) {
    return <p className="pb-4 text-center text-meta text-muted">Ahora mismo no se pueden crear equipos. Vuelve a intentarlo más tarde.</p>;
  }

  if (step === 'deporte') {
    return (
      <div className="flex flex-col gap-4 pb-1">
        <SportPicker
          groups={sports.choices}
          status={sports.status}
          value={sport as SportId}
          onChange={(id) => {
            if (id === 'esports') return onEsports();
            setPicked(id);
          }}
        />
        <Button variant="primary" size={pro ? 'lg' : 'xl'} className="w-full" icon={<ChevronRight className="size-5" />} onClick={() => setStep('datos')}>
          Seguir
        </Button>
      </div>
    );
  }

  const gate = createGate(form, busy);
  const meta = sportMeta(sport);
  const change = (patch: Partial<SquadForm>) =>
    setForm((f) => {
      const next = { ...f, ...patch };
      if (patch.name !== undefined && !tagTyped) next.tag = suggestTag(patch.name);
      return next;
    });

  async function create() {
    if (!gate.canCreate || !sport) return;
    setBusy(true);
    try {
      const name = form.name.trim();
      const r = await createSquad({ sport, name, tag: form.tag, description: form.description, city: form.city || null, color: form.color });
      if (form.recruiting) {
        try {
          await updateSquad(r.squadId, { recruiting: true });
        } catch (e) {
          console.warn('[equipo] busca jugadores', e);
        }
      }
      toast(`Listo: ${name} quedó creado`);
      navigate(`${squadPath(r.squadId)}?invitar=1`, { state: { inviteCode: r.inviteCode } });
    } catch (e) {
      console.error(e);
      toast(squadErrorText(e), 'error');
      setBusy(false);
    }
  }

  return (
    <SquadTint color={form.color} sport={sport}>
      <form
        className="flex flex-col gap-4 pb-1"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <button
          type="button"
          onClick={() => setStep('deporte')}
          className={cx(
            'flex min-h-11 items-center gap-2.5 self-start rounded-xl bg-surface-2 py-1.5 pr-3 pl-2 text-meta font-semibold transition active:scale-[0.98]',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          )}
          aria-label={`Deporte: ${meta?.label ?? sport}. Cambiar`}
        >
          <ChevronLeft aria-hidden="true" className="size-4 text-muted" />
          <SportIcon sport={sport} className="size-4 text-accent" />
          {meta?.label ?? sport}
          <span className="font-normal text-muted">· Cambiar</span>
        </button>
        <SquadFields
          form={form}
          sport={sport}
          onChange={change}
          onTagTyped={() => setTagTyped(true)}
        />
        {gate.shown && (
          <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
            {gate.shown}
          </p>
        )}
        <Button type="submit" variant="primary" size={pro ? 'lg' : 'xl'} className="mt-1 w-full" loading={busy} disabled={!gate.canCreate} icon={<Shield className="size-5" />}>
          Crear equipo
        </Button>
      </form>
    </SquadTint>
  );
}
