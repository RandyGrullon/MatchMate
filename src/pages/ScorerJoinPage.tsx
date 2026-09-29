import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { CalendarClock, ClipboardPen, Globe, Link2Off, Lock, LogIn, Trophy, UserPlus } from 'lucide-react';
import { useAuth } from '../lib/auth';
import {
  getScorerLinkPreview,
  isScorerRateLimited,
  joinAsScorer,
  normalizeScorerCode,
  scorerJoinErrorText,
  type ScorerJoinResult,
  type ScorerLinkInfo,
  type ScorerLinkPreview,
} from '../lib/data/scorers';
import { sportMeta } from '../sports/registry';
import { BackLink } from '../components/BackLink';
import { LeagueLogo } from '../components/home/LeagueCard';
import { AppShell } from '../components/Shell';
import { SportSplash } from '../components/splash/SportSplash';
import { useFeedback } from '../components/feedback';
import { SportTheme } from '../components/league/SportTheme';
import {
  autoEnterStep,
  deadLinkText,
  expiryDay,
  hasScorerIntent,
  joinedScorerText,
  rememberScorerIntent,
  scorerJoinNext,
  scorerReach,
  scorerReachForYou,
  takeScorerIntent,
} from '../components/scorers/logic';
import { Badge, Button, Card, Empty, Loading, LoadError } from '../components/ui';
import { SportBadge } from './sports/SportBits';

/**
 * El link para anotar (/anotar/<código>, docs/anotadores.md §8.3): a qué torneo lleva (nombre, deporte y logo, también
 * sin cuenta) y «Entrar para anotar». Sin sesión manda a crear la cuenta o a entrar y vuelve aquí con `?entrar=1`,
 * que entra solo (una vez) si en este teléfono se tocó ese botón (la marca de rememberScorerIntent; sin ella, se ve la
 * tarjeta: un link con ?entrar=1 que llega de otro lado no mete a nadie en una liga). Quien ya puede anotar (dueño,
 * admin o anotador) va directo al torneo. Entrar deja la cuenta en la liga como anotadora sin jugador (también en una
 * liga privada) y lleva al torneo.
 */
export default function ScorerJoinPage() {
  const { code: raw = '' } = useParams();
  const code = normalizeScorerCode(raw);
  const [params, setParams] = useSearchParams();
  const auth = useAuth();
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const uid = auth.user?.uid ?? null;
  const [preview, setPreview] = useState<ScorerLinkPreview | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  // ?entrar=1 se mira una sola vez, aunque la pantalla se vuelva a dibujar (y con la carga mientras entra).
  const autoEntered = useRef(false);
  const [autoBusy, setAutoBusy] = useState(false);
  const wantsEnter = params.get('entrar') === '1';

  useEffect(() => {
    if (auth.loading) return;
    let alive = true;
    setPreview(undefined);
    setError(null);
    getScorerLinkPreview(code)
      .then((p) => alive && setPreview(p))
      .catch((e: unknown) => {
        console.warn('[anotar]', e);
        if (alive) setError(e instanceof Error ? e : new Error(String(e)));
      });
    return () => {
      alive = false;
    };
  }, [code, uid, auth.loading, attempt]);

  async function enter(info: ScorerLinkInfo) {
    if (busy) return;
    setBusy(true);
    try {
      const out = await enterWithLink(code, info, joinAsScorer);
      if (out.kind === 'go') {
        if (out.toast) toast(out.toast);
        navigate(out.path, { replace: true });
      } else if (out.kind === 'dead') {
        // El link dejó de servir mientras mirabas (o no sirve para esta cuenta).
        setPreview(out.preview);
      } else {
        toast(out.message, 'error');
      }
    } finally {
      setBusy(false);
    }
  }

  const info = preview && preview.status === 'ok' ? preview : null;
  const returning = !!uid && wantsEnter && !!info && !autoEntered.current;
  // Mientras decide (antes del efecto): la carga, no la tarjeta, si va a entrar solo.
  const autoEntering = returning && autoEnterStep(info, hasScorerIntent(code)) === 'enter';

  // Volvió de entrar o de crear la cuenta (?entrar=1): entra solo si tocó el botón en este teléfono; si no, se quita
  // ?entrar=1 y queda la tarjeta con «Entrar para anotar». La marca sirve una vez.
  useEffect(() => {
    if (!returning || !info || autoEntered.current) return;
    autoEntered.current = true;
    const step = autoEnterStep(info, takeScorerIntent(code));
    if (step === 'skip') return; // ya anota: <Navigate> lo lleva al torneo
    setParams(
      (p) => {
        p.delete('entrar');
        return p;
      },
      { replace: true },
    );
    if (step !== 'enter') return;
    setAutoBusy(true);
    void enter(info).finally(() => setAutoBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando llega el link con ?entrar=1
  }, [returning, info]);

  if (auth.loading || (preview === undefined && !error)) return <Loading />;

  if (error && preview === undefined) {
    return (
      <AppShell>
        <BackLink fallback="/" className="-ml-1.5 mb-3" />
        <LoadError error={error} onRetry={() => setAttempt((n) => n + 1)} />
      </AppShell>
    );
  }

  return (
    <ScorerJoinView
      code={code}
      preview={preview ?? null}
      signedIn={!!uid}
      entering={autoEntering || autoBusy}
      busy={busy}
      onEnter={(x) => void enter(x)}
    />
  );
}

/** Qué sigue después de «Entrar para anotar»: ir al torneo (con el aviso), el vacío del link, o el error en palabras. */
export type ScorerJoinOutcome =
  | { kind: 'go'; path: string; toast: string | null }
  | { kind: 'dead'; preview: Exclude<ScorerLinkPreview, ScorerLinkInfo> }
  | { kind: 'error'; message: string };

/**
 * «Entrar para anotar» (a mano o solo al volver de /login): llama a `join` (joinAsScorer) una vez y dice qué sigue:
 * ir al torneo (joined, upgraded o already), el vacío del link que ya no sirve, que no sirve para esta cuenta o que
 * hubo muchos intentos, o el error en palabras (la tarjeta sigue ahí para intentarlo otra vez).
 */
export async function enterWithLink(
  code: string,
  info: Pick<ScorerLinkInfo, 'title'>,
  join: (code: string) => Promise<ScorerJoinResult>,
): Promise<ScorerJoinOutcome> {
  try {
    const r = await join(code);
    if (!r) return { kind: 'dead', preview: null };
    if (r.status === 'joined' || r.status === 'upgraded' || r.status === 'already') {
      return { kind: 'go', path: r.path, toast: joinedScorerText(r.status, r.title || info.title) };
    }
    return { kind: 'dead', preview: { status: r.status } };
  } catch (e) {
    console.warn('[anotar] entrar', e);
    if (isScorerRateLimited(e)) return { kind: 'dead', preview: { status: 'rate_limited' } };
    return { kind: 'error', message: scorerJoinErrorText(e) };
  }
}

/**
 * Lo que se ve según el link (sin datos propios: se dibuja igual en las pruebas): el link que no sirve (o que no
 * sirve para esta cuenta), directo al torneo si ya anota, la carga mientras entra solo, o la tarjeta con «Entrar para
 * anotar» (sin sesión, crear la cuenta o entrar, volviendo aquí con ?entrar=1 y la marca de que tocó el botón).
 */
export function ScorerJoinView({
  code,
  preview,
  signedIn,
  entering = false,
  busy = false,
  onEnter,
}: {
  code: string;
  preview: ScorerLinkPreview;
  signedIn: boolean;
  /** Entrando solo (volvió de /login con ?entrar=1). */
  entering?: boolean;
  busy?: boolean;
  onEnter: (info: ScorerLinkInfo) => void;
}) {
  const info = preview && preview.status === 'ok' ? preview : null;

  if (!info) {
    const dead = deadLinkText(preview ? (preview.status as Exclude<NonNullable<ScorerLinkPreview>['status'], 'ok'>) : null);
    return (
      <AppShell>
        <BackLink fallback="/" className="-ml-1.5 mb-3" />
        <Empty icon={<Link2Off className="size-8" />} title={dead.title}>
          {dead.body}
          <div className="mt-4">
            <Link to="/ligas" className="font-medium text-accent">
              Ver ligas
            </Link>
          </div>
        </Empty>
      </AppShell>
    );
  }

  // Ya anota (dueño, admin o anotador): directo al torneo.
  if (signedIn && info.canScore) return <Navigate to={info.path} replace />;
  if (entering) return <Loading label="Entrando para anotar…" />;

  const meta = sportMeta(info.sport);
  const torneo = info.kind === 'torneo';
  const reach = scorerReachForYou(scorerReach({ id: info.leagueId, kind: info.kind, sport: info.sport }));
  const day = expiryDay(info.expiresAt);
  const next = scorerJoinNext(code);

  return (
    <AppShell>
      <BackLink fallback="/" className="-ml-1.5 mb-3" />
      <SportTheme sport={info.sport}>
        <Card className="mx-auto flex max-w-md flex-col items-center gap-4 p-6 text-center">
          {/* El logo de la liga si tiene (se ve también sin cuenta); si no, la escena del deporte. */}
          <LeagueLogo path={info.logoPath} className="size-24 rounded-3xl">
            {meta ? (
              <SportSplash scene={meta.scene} word={false} width={176} label={`Animación de ${meta.lower}`} />
            ) : (
              <div className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                <ClipboardPen className="size-7" />
              </div>
            )}
          </LeagueLogo>
          <div className="flex flex-col items-center gap-1.5">
            <p className="text-sm text-muted">Te invitaron a anotar</p>
            <h1 className="text-xl font-bold tracking-tight break-words">{info.name}</h1>
            {info.title && info.title !== info.name && <p className="text-sm font-medium break-words">en {info.title}</p>}
            <div className="flex flex-wrap justify-center gap-1.5">
              {info.sport && <SportBadge sport={info.sport} />}
              <Badge tone="neutral">
                {torneo ? <Trophy className="size-3" /> : info.visibility === 'public' ? <Globe className="size-3" /> : <Lock className="size-3" />}
                {torneo ? 'Torneo' : info.visibility === 'public' ? 'Liga pública' : 'Liga privada'}
              </Badge>
            </div>
          </div>

          <ul className="flex w-full flex-col gap-2.5 border-t border-line pt-4 text-left text-sm">
            <li className="flex items-start gap-2.5">
              <ClipboardPen className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
              <span>Anotas los resultados. No te inscribe como jugador.</span>
            </li>
            {reach && (
              <li className="flex items-start gap-2.5">
                <Trophy className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
                <span>{reach}</span>
              </li>
            )}
            {day && (
              <li className="flex items-start gap-2.5 text-muted">
                <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>El link vence el {day}</span>
              </li>
            )}
          </ul>

          {signedIn ? (
            <Button variant="primary" className="h-11 w-full" loading={busy} onClick={() => onEnter(info)} icon={<ClipboardPen className="size-4" />}>
              Entrar para anotar
            </Button>
          ) : (
            <div className="flex w-full flex-col gap-2">
              <Link
                to={`/login?modo=registro&next=${next}`}
                onClick={() => rememberScorerIntent(code)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg"
              >
                <UserPlus className="size-4" /> Crear cuenta y entrar a anotar
              </Link>
              <Link
                to={`/login?next=${next}`}
                onClick={() => rememberScorerIntent(code)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line px-4 text-sm font-medium hover:bg-surface-2"
              >
                <LogIn className="size-4" /> Ya tengo cuenta
              </Link>
            </div>
          )}
        </Card>
      </SportTheme>
    </AppShell>
  );
}
