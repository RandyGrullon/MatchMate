import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { ArrowRight, Trophy, X } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { createEsportsTournament, esportsErrorText } from '../../lib/data/esports';
import { useNow } from '../../lib/useNow';
import { sportMeta } from '../../sports/registry';
import { GAMES, isGameId, type GameId } from '../../sports/esports';
import { EsportsTint } from '../../components/esports/bits';
import { BusyIcon, useBusy } from '../../components/busy';
import { useFeedback } from '../../components/feedback';
import { StepBar } from '../../components/create/CreateWizard';
import { CreateStyles } from '../../components/create/styles';
import { sportTint } from '../../components/home/SportTint';
import { useIsPro } from '../../components/mode';
import { SignInCard } from '../../components/screens/ScreenBits';
import { AppShell } from '../../components/Shell';
import { Loading, MODAL_OPENED, cx, keyboardInset } from '../../components/ui';
import { DEFAULT_TZ, todayIn } from '../sports/racket/logic/time';
import { CREATE_STEP, STEPS, emptyForm, stepErrors, summary, tournamentInput, withMode, type StepKey, type TournamentForm } from './create/logic';
import { EntryStep, FormatStep, GameStep, InviteStep, NameStep } from './create/steps';

/** El tamaño del teclado del teléfono (0 sin teclado): el pie con el botón queda encima de él. */
function useKeyboard(): number {
  const [kb, setKb] = useState(0);
  useEffect(() => {
    const vv = typeof window === 'undefined' ? null : window.visualViewport;
    if (!vv) return;
    const sync = () => setKb(keyboardInset(window.innerHeight, vv));
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
    };
  }, []);
  return kb;
}

/**
 * «Crear torneo» de esports (`/esports/:game/nuevo-torneo`, §12.7): a pantalla completa como el asistente de crear liga
 * (barra de pasos, un solo botón abajo que queda encima del teclado). Juego y modo · Inscripción · Formato · Nombre y
 * fecha · Invitar. `?liga=<lid>` lo crea dentro de esa liga de esports. Sin cuenta, la tarjeta para entrar.
 */
export default function CreateTournamentPage() {
  const { game } = useParams();
  const { user, loading } = useAuth();
  if (!isGameId(game)) return <Navigate to="/esports" replace />;
  if (loading) return <Loading />;
  if (!user) {
    const next = encodeURIComponent(`/esports/${game}/nuevo-torneo${typeof location !== 'undefined' ? location.search : ''}`);
    return (
      <AppShell>
        <EsportsTint>
          <div className="px-2 pt-6">
            <SignInCard icon={<Trophy />} title={`Crea un torneo de ${GAMES[game].name}`} text="Con tu cuenta armas el cuadro, apruebas inscripciones y anotas resultados." next={next} />
          </div>
        </EsportsTint>
      </AppShell>
    );
  }
  return <Wizard game={game} />;
}

function Wizard({ game }: { game: GameId }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const leagueId = params.get('liga');
  const pro = useIsPro();
  const now = useNow().getTime();
  const { toast, confirm } = useFeedback();
  const tz = DEFAULT_TZ;
  const [form, setForm] = useState<TournamentForm>(() => emptyForm(game, todayIn(tz)));
  const [index, setIndex] = useState(0);
  const [tried, setTried] = useState<Set<StepKey>>(() => new Set());
  const [created, setCreated] = useState<{ leagueId: string; eventId: string; inviteCode: string | null } | null>(null);
  const busy = useBusy<'crear'>();
  const ref = useRef<HTMLDialogElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const kb = useKeyboard();
  const tint = sportTint('esports');
  const step = STEPS[index].key;
  const errors = useMemo(() => stepErrors(step, form, { tz, now }), [step, form, tz, now]);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) {
      d.showModal();
      window.dispatchEvent(new Event(MODAL_OPENED));
    }
  }, []);
  useLayoutEffect(() => {
    const d = ref.current;
    return () => {
      if (d?.open) d.close();
    };
  }, []);
  useEffect(() => {
    scroller.current?.scrollTo?.({ top: 0 });
    if (index > 0) title.current?.focus({ preventScroll: true });
  }, [index]);

  const set = <K extends keyof TournamentForm>(k: K, v: TournamentForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const goTo = (to: string) => navigate(to, { replace: true });
  /** El torneo creado: un torneo suelto es su liga; dentro de una liga de esports, su página. */
  const createdPath = (c: { leagueId: string; eventId: string }) => (leagueId ? `/l/${c.leagueId}/e/${c.eventId}` : `/l/${c.leagueId}`);

  async function close() {
    if (busy.isBusy('crear')) return;
    if (created) return goTo(createdPath(created));
    if (form.name.trim() || index > 0) {
      const ok = await confirm({ title: '¿Salir sin crear el torneo?', message: 'Lo que llenaste se pierde.', confirmText: 'Salir' });
      if (!ok) return;
    }
    if (leagueId) goTo(`/l/${leagueId}`);
    else goTo(`/esports/${game}`);
  }

  const create = () =>
    busy.run('crear', async () => {
      try {
        const out = await createEsportsTournament(tournamentInput(form, tz), leagueId ?? undefined);
        toast('Torneo creado');
        setCreated(out);
        setIndex(STEPS.length - 1);
      } catch (e) {
        toast(esportsErrorText(e, game, 'torneo'), 'error');
      }
    });

  function next(e?: FormEvent) {
    e?.preventDefault();
    if (step === 'invitar') return created && goTo(createdPath(created));
    setTried((s) => new Set(s).add(step));
    if (errors.length || busy.isBusy()) return;
    if (step === CREATE_STEP) return void create();
    setIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }

  const label = step === 'invitar' ? 'Ir al torneo' : step === CREATE_STEP ? 'Crear torneo' : 'Siguiente';
  // Lo del cupo y del formato se ve al momento; el nombre y la fecha, al intentar seguir (empiezan vacíos).
  const showErrors = errors.length > 0 && (step === 'inscripcion' || step === 'formato' || tried.has(step));
  const venueHint = sportMeta('esports')?.venueHint ?? 'Online, cibercafé o centro gamer';

  return (
    <EsportsTint>
      <dialog
        ref={ref}
        aria-labelledby="tz-titulo"
        onCancel={(e) => {
          if (e.target !== e.currentTarget) return;
          e.preventDefault();
          void close();
        }}
        className={cx(
          'mm-create overflow-hidden overscroll-none bg-bg p-0 text-fg',
          tint.className,
          'm-0 h-dvh max-h-none w-full max-w-none',
          'sm:m-auto sm:h-[min(52rem,calc(100dvh-3rem))] sm:w-[calc(100%-1.5rem)] sm:max-w-lg sm:rounded-3xl sm:border sm:border-line sm:shadow-2xl',
        )}
      >
        <CreateStyles />
        {tint.css && (
          <style href={tint.className} precedence="default">
            {tint.css}
          </style>
        )}
        <div className="flex h-full flex-col pt-[env(safe-area-inset-top)]" style={kb ? { paddingBottom: kb } : undefined}>
          <header className="grid h-[54px] shrink-0 grid-cols-[60px_1fr_60px] items-center px-4">
            <button
              type="button"
              onClick={() => void close()}
              disabled={busy.isBusy('crear')}
              aria-label={created ? 'Cerrar e ir al torneo' : 'Cerrar'}
              className="grid size-11 place-items-center rounded-full bg-surface-2 text-fg-2 transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
            >
              <X aria-hidden="true" className="size-[22px]" />
            </button>
            <h2 id="tz-titulo" className="truncate text-center text-[17px] font-[650] tracking-[-0.01em]">
              Crear torneo
            </h2>
            <span className="num pr-1.5 text-right text-sm font-[550] tracking-normal text-muted">
              <span className="sr-only">Paso </span>
              {`${index + 1} de ${STEPS.length}`}
            </span>
          </header>
          <StepBar labels={STEPS.map((s) => s.label)} index={index} />

          <div ref={scroller} className="modal-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6">
            <form id="tz-form" onSubmit={next} noValidate>
              {step === 'juego' && <GameStep form={form} onMode={(m) => setForm((f) => withMode(f, m))} />}
              {step === 'inscripcion' && <EntryStep form={form} set={set} pro={pro} titleRef={title} />}
              {step === 'formato' && (
                <>
                  <FormatStep form={form} onChange={setForm} pro={pro} titleRef={title} />
                  <p aria-live="polite" className="mt-[22px] rounded-2xl bg-accent-soft px-4 py-3.5 text-[15px] text-fg-2">
                    {summary(form)}
                  </p>
                </>
              )}
              {step === 'nombre' && <NameStep form={form} set={set} venueHint={venueHint} titleRef={title} />}
              {step === 'invitar' && created && <InviteStep lid={created.leagueId} name={form.name.trim()} inviteCode={created.inviteCode} titleRef={title} />}
              {showErrors && (
                <ul role="alert" className="mt-5 flex flex-col gap-1 rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">
                  {errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
            </form>
          </div>

          <footer className="shrink-0 px-6 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <button
              type="submit"
              form="tz-form"
              disabled={busy.isBusy('crear') || (showErrors && step !== 'invitar')}
              aria-busy={busy.isBusy('crear') || undefined}
              className="flex h-btn w-full items-center justify-center gap-2.5 rounded-btn bg-accent px-6 text-[17px] font-semibold tracking-[-0.01em] whitespace-nowrap text-accent-fg transition select-none active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
            >
              {label}
              <BusyIcon busy={busy.isBusy('crear')} icon={step === 'invitar' || step === CREATE_STEP ? null : <ArrowRight aria-hidden="true" className="size-5" />} className="size-5" />
            </button>
            {index > 0 && step !== 'invitar' && (
              <button
                type="button"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={busy.isBusy('crear')}
                className="mt-1.5 flex h-11 w-full items-center justify-center text-meta font-[550] text-accent transition active:opacity-70 disabled:opacity-50"
              >
                Atrás
              </button>
            )}
          </footer>
        </div>
      </dialog>
    </EsportsTint>
  );
}
