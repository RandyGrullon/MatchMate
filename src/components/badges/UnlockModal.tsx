import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Award, ChevronLeft, ChevronRight, Eye, Lock, Share2, X } from 'lucide-react';
import { Insignia, UnlockInsignia, tierDot } from '../../badges/visual';
import { displayName, useAuth } from '../../lib/auth';
import { markBadgesSeen, markLeagueBadgesSeen, setBadgeHidden, useBadgeStats, useProfileBadges, type BadgeAward, type LeagueBadgeAward } from '../../lib/data/badges';
import { useBusy } from '../busy';
import { useAction } from '../feedback';
import { ShareImageModal } from '../share/ShareImageModal';
import { shareFrame } from '../share/ShareButton';
import { shareFileName } from '../share/actions';
import { badgeShare } from '../share/badge';
import type { CardFrame, ShareCard } from '../share/cards';
import { Button, cx } from '../ui';
import { leagueShareInputOf, levelLine, myBadgesPath, shareInputOf, unlockPlan, yearRecap, type UnlockItem, type UnlockPlan, type YearRecapModel } from './logic';

/** Botón de solo ícono de 44 px (flechas y cerrar). */
const ICON_BUTTON =
  'inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-fg transition hover:bg-surface-2 active:scale-95 focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40';

/** Cuántas del historial se dibujan en el aviso (las demás: «y 20 más»). */
const HISTORY_SHOWN = 12;

/** ¿Es una automática privada por defecto que todavía no se mostró? */
const isPrivate = (it: UnlockItem, shown?: ReadonlySet<string>) => it.kind === 'app' && it.view.award.hidden && !shown?.has(it.id);

/**
 * Lo de adentro del aviso al ganar (§6.4), sin la base: una insignia a la vez con su animación (hasta 5, con flechas
 * y puntos; después «y 3 más»), o la lista del historial («Te dimos 12 insignias por tu historial»). Las del creador
 * dicen «Liga Los Pinos te dio una insignia»; las privadas por defecto preguntan «Solo tú la ves. ¿La muestras en tu
 * perfil?».
 */
export function UnlockContent({
  plan,
  index,
  onIndex,
  shown,
  onShow,
  onKeepPrivate,
  showing,
  recap,
}: {
  plan: UnlockPlan;
  index: number;
  onIndex: (i: number) => void;
  /** El resumen del año, si la que se muestra es `year_recap` (7 de enero). */
  recap?: YearRecapModel | null;
  /** Ids que ya se contestaron desde aquí (la pregunta de las privadas ya no sale). */
  shown?: ReadonlySet<string>;
  onShow?: (it: UnlockItem) => void;
  onKeepPrivate?: (it: UnlockItem) => void;
  /** Id de la que se está mostrando en el perfil (gira «Mostrar»). */
  showing?: string | null;
}) {
  const it = plan.items[Math.min(index, plan.items.length - 1)];
  if (!it) {
    const list = plan.history;
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex size-16 items-center justify-center rounded-2xl bg-accent-soft text-accent" aria-hidden="true">
          <Award className="size-8" />
        </span>
        <h2 id="insignia-titulo" className="text-xl font-bold tracking-tight">
          {`Te dimos ${list.length} ${list.length === 1 ? 'insignia' : 'insignias'} por tu historial`}
        </h2>
        <p className="text-sm text-muted">Lo que ya habías jugado también cuenta. ¡Míralas en tu perfil!</p>
        <ul className="grid grid-cols-4 gap-2" aria-label="Insignias del historial">
          {list.slice(0, HISTORY_SHOWN).map((h) => (
            <li key={h.award.id} className="flex flex-col items-center gap-1">
              <Insignia badge={h.look} size={40} label={h.label} />
              <span className="line-clamp-2 text-[11px] leading-tight text-muted">{h.name}</span>
            </li>
          ))}
        </ul>
        {list.length > HISTORY_SHOWN && <p className="text-sm text-muted">{`y ${list.length - HISTORY_SHOWN} más`}</p>}
      </div>
    );
  }
  const many = plan.items.length > 1;
  const v = it.view;
  const title = it.kind === 'liga' ? `${it.view.leagueName} te dio una insignia` : '¡Te ganaste una insignia!';
  const line = it.kind === 'liga' ? it.view.givenBy : levelLine(it.view);
  const where = it.kind === 'app' ? it.view.leagueName : null;
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <h2 id="insignia-titulo" className="text-lg font-bold tracking-tight break-words">
        {title}
      </h2>
      <div className="flex w-full items-center justify-between gap-1">
        {many ? (
          <button type="button" className={ICON_BUTTON} aria-label="Anterior" disabled={index <= 0} onClick={() => onIndex(index - 1)}>
            <ChevronLeft className="size-5" aria-hidden="true" />
          </button>
        ) : (
          <span className="size-11" />
        )}
        {/* 220 px, o lo que quede entre las dos flechas (44 + 44 y los huecos): a 360 px no se sale del aviso. */}
        <UnlockInsignia key={it.id} badge={v.look} px={220} label={v.label} className="h-auto max-w-[calc(100%-6rem)] min-w-0 shrink" />
        {many ? (
          <button type="button" className={ICON_BUTTON} aria-label="Siguiente" disabled={index >= plan.items.length - 1} onClick={() => onIndex(index + 1)}>
            <ChevronRight className="size-5" aria-hidden="true" />
          </button>
        ) : (
          <span className="size-11" />
        )}
      </div>
      <div className="flex flex-col items-center gap-1">
        <p className="text-2xl leading-tight font-bold tracking-tight break-words">{v.name}</p>
        <p className="flex flex-wrap items-center justify-center gap-1.5 text-sm font-semibold">
          <span className="size-2.5 rounded-full" style={{ background: tierDot(v.look.tier) }} aria-hidden="true" />
          {line}
          {where && <span className="font-normal text-muted">{`· ${where}`}</span>}
        </p>
      </div>
      {v.description && <p className="text-sm text-muted">{v.description}</p>}
      {recap && it.kind === 'app' && it.view.award.key === 'year_recap' && <YearRecapCard recap={recap} />}
      {it.kind === 'liga' && it.view.award.note && <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm italic">{`«${it.view.award.note}»`}</p>}
      {isPrivate(it, shown) && (
        <div className="flex w-full flex-col gap-2 rounded-xl bg-surface-2 p-3 text-sm">
          <p className="flex items-center justify-center gap-1.5 font-medium">
            <Lock className="size-4" aria-hidden="true" /> Solo tú la ves. ¿La muestras en tu perfil?
          </p>
          <div className="flex justify-center gap-2">
            <Button className="h-11" disabled={showing === it.id} onClick={() => onKeepPrivate?.(it)}>
              Dejarla privada
            </Button>
            <Button
              className="h-11"
              variant="primary"
              icon={<Eye className="size-4" />}
              loading={showing === it.id}
              aria-busy={showing === it.id || undefined}
              onClick={() => onShow?.(it)}
            >
              Mostrar
            </Button>
          </div>
        </div>
      )}
      {many && (
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {plan.items.map((x, i) => (
            <span key={x.id} className={cx('size-2 rounded-full transition', i === index ? 'bg-accent' : 'bg-line')} />
          ))}
        </div>
      )}
      {many && <p className="sr-only">{`Insignia ${index + 1} de ${plan.items.length}`}</p>}
      {(plan.more > 0 || plan.history.length > 0) && (
        <p className="text-sm text-muted">
          {[plan.more > 0 ? `y ${plan.more} más` : null, plan.history.length ? `${plan.history.length} por tu historial` : null].filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  );
}

/** El resumen del año (§6.4): días, deportes y meses, y la insignia más rara del año. */
export function YearRecapCard({ recap }: { recap: YearRecapModel }) {
  const facts = [
    { n: recap.days, label: recap.days === 1 ? 'día jugado' : 'días jugados' },
    { n: recap.sports, label: recap.sports === 1 ? 'deporte' : 'deportes' },
    { n: recap.months, label: recap.months === 1 ? 'mes activo' : 'meses activos' },
  ].filter((f): f is { n: number; label: string } => f.n !== null);
  return (
    <section aria-label={`Tu ${recap.year} en MatchMate`} className="flex w-full flex-col gap-3 rounded-2xl bg-surface-2 p-3">
      {facts.length > 0 && (
        <dl className="grid grid-cols-3 gap-2">
          {facts.map((f) => (
            <div key={f.label} className="flex flex-col items-center">
              <dt className="order-2 text-xs text-muted">{f.label}</dt>
              <dd className="order-1 text-2xl font-bold tabular-nums">{f.n.toLocaleString('es-DO')}</dd>
            </div>
          ))}
        </dl>
      )}
      {recap.rarest && (
        <div className="flex items-center gap-3 text-left">
          <Insignia badge={recap.rarest.look} size={40} label={recap.rarest.label} />
          <div className="min-w-0">
            <p className="text-xs text-muted">{`Tu insignia más rara de ${recap.year}`}</p>
            <p className="font-semibold break-words">{`${recap.rarest.name} · ${levelLine(recap.rarest)}`}</p>
            {recap.rarestText && <p className="text-xs text-muted">{recap.rarestText}</p>}
          </div>
        </div>
      )}
    </section>
  );
}

interface Sharing {
  card: ShareCard;
  frame: CardFrame;
  url?: string;
  filename: string;
}

/**
 * El aviso al ganar (§6.4) sobre las insignias sin ver: al cerrarlo (o «Ver mis insignias») se marcan vistas en el
 * servidor (`mark_badges_seen`, `mark_league_badges_seen`), así no vuelve a salir en otro teléfono. Lo monta
 * `BadgeUnlockHost`.
 */
export default function UnlockModal({
  awards,
  leagueAwards = [],
  onDone,
}: {
  awards: readonly BadgeAward[];
  leagueAwards?: readonly LeagueBadgeAward[];
  onDone: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const auth = useAuth();
  const navigate = useNavigate();
  const run = useAction();
  const showing = useBusy();
  const plan = useMemo(() => unlockPlan(awards, leagueAwards), [awards, leagueAwards]);
  // El 7 de enero, `year_recap` abre el resumen del año: hace falta la vitrina propia y la rareza.
  const recapAward = plan.items.find((x) => x.kind === 'app' && x.view.award.key === 'year_recap');
  const mine = useProfileBadges(recapAward ? auth.user?.uid : null);
  const stats = useBadgeStats(!!recapAward);
  const recap = useMemo(
    () => (recapAward?.kind === 'app' ? yearRecap(recapAward.view.award, mine.data?.awards ?? [], stats.data) : null),
    [recapAward, mine.data, stats.data],
  );
  const [index, setIndex] = useState(0);
  // Las privadas que ya contestó (la pregunta no sale más) y las que mostró (esas sí se pueden compartir).
  const [shown, setShown] = useState<ReadonlySet<string>>(new Set());
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set());
  const [sharing, setSharing] = useState<Sharing | null>(null);
  const closed = useRef(false);

  const finish = (go?: boolean) => {
    if (closed.current) return;
    closed.current = true;
    const warn = (e: unknown) => console.warn('[insignias] no se pudieron marcar vistas', e);
    markBadgesSeen(plan.ids).catch(warn);
    markLeagueBadgesSeen(plan.leagueIds).catch(warn);
    ref.current?.close();
    onDone();
    const only = plan.items.length === 1 && plan.items[0].kind === 'app' ? plan.items[0].id : undefined;
    // La animación ya se vio aquí: el detalle se abre quieto.
    if (go) navigate(myBadgesPath(only, { still: true }));
  };

  useEffect(() => {
    const d = ref.current;
    // Nada que mostrar (insignias que esta versión no conoce): solo se marcan.
    if (!plan.items.length && !plan.history.length) {
      finish();
      return;
    }
    if (d && !d.open) {
      try {
        d.showModal();
      } catch {
        d.setAttribute('open', '');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se abre una vez
  }, []);

  const current = plan.items[Math.min(index, plan.items.length - 1)];

  const share = () => {
    if (!current) return;
    const name = displayName(auth);
    const uid = auth.user?.uid;
    const here = typeof location !== 'undefined' ? location : undefined;
    const url = uid && here ? `${here.origin}/u/${uid}` : here?.href;
    const input = current.kind === 'app' ? shareInputOf(current.view, name) : leagueShareInputOf(current.view, name);
    const sport = current.kind === 'app' ? (current.view.award.sport === 'all' ? null : current.view.award.sport) : current.view.award.sport;
    setSharing({ card: badgeShare(input), frame: shareFrame(sport, url), url, filename: shareFileName(['insignia', input.name, name]) });
  };

  const show = async (it: UnlockItem) => {
    if (it.kind !== 'app') return;
    const ok = await showing.run(it.id, () => run(() => setBadgeHidden(it.view.award, false), 'Ya se ve en tu perfil'));
    if (ok !== undefined) {
      setShown((s) => new Set([...s, it.id]));
      setRevealed((s) => new Set([...s, it.id]));
    }
  };

  const canShare = !!current && !(current.kind === 'app' && current.view.award.hidden && !revealed.has(current.id));

  return (
    <>
      <dialog
        ref={ref}
        data-badge-unlock=""
        aria-labelledby="insignia-titulo"
        onCancel={(e) => {
          e.preventDefault();
          finish();
        }}
        className="m-auto w-[calc(100%-1.5rem)] max-w-md overflow-hidden overscroll-none rounded-3xl border border-line bg-surface p-0 text-fg shadow-2xl"
      >
        <div className="flex max-h-[calc(100dvh-1.5rem)] flex-col">
          <div className="flex justify-end px-2 pt-2">
            <button type="button" className={ICON_BUTTON} aria-label="Cerrar" onClick={() => finish()}>
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          <div className="modal-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
            <UnlockContent
              plan={plan}
              index={index}
              onIndex={setIndex}
              shown={shown}
              onShow={(it) => void show(it)}
              onKeepPrivate={(it) => setShown((s) => new Set([...s, it.id]))}
              showing={showing.busy}
              recap={recap}
            />
          </div>
          <div className="flex flex-wrap justify-center gap-2 border-t border-line px-5 py-3">
            {canShare && (
              <Button className="h-11" icon={<Share2 className="size-4" />} onClick={share}>
                Compartir
              </Button>
            )}
            <Button className="h-11" variant="primary" icon={<Award className="size-4" />} onClick={() => finish(true)}>
              Ver mis insignias
            </Button>
          </div>
        </div>
      </dialog>
      {sharing && (
        <ShareImageModal open onClose={() => setSharing(null)} card={sharing.card} frame={sharing.frame} url={sharing.url} filename={sharing.filename} />
      )}
    </>
  );
}
