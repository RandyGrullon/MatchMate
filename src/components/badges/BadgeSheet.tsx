import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { CalendarDays, Eye, EyeOff, Flag, Hourglass, Lock, MapPin, MessageSquareQuote, MoreHorizontal, Share2, Sparkles, Star, StarOff, Trophy } from 'lucide-react';
import { Insignia, UnlockInsignia, tierDot } from '../../badges/visual';
import { reportBadge, setBadgeHidden, setFeaturedBadges, setLeagueBadgeHidden, type BadgeStat } from '../../lib/data/badges';
import { useAction, useFeedback } from '../feedback';
import { ShareImageModal } from '../share/ShareImageModal';
import { shareFrame } from '../share/ShareButton';
import { shareFileName } from '../share/actions';
import { badgeShare } from '../share/badge';
import type { CardFrame, ShareCard } from '../share/cards';
import { Button, Modal } from '../ui';
import { makerErrorText } from './maker/design';
import {
  leagueShareInputOf,
  levelLine,
  nextLevelLine,
  rarityText,
  shareInputOf,
  statFor,
  type AwardView,
  type BadgeTileModel,
  type LeagueTileModel,
  type LockedModel,
  type ProgressModel,
} from './logic';

/**
 * Qué se abre en el detalle: una insignia ganada (con todas sus filas), una bloqueada (solo el dueño) o una que dio la
 * liga (el creador).
 */
export type SheetSubject =
  | { kind: 'award'; tile: BadgeTileModel }
  | { kind: 'locked'; model: LockedModel | ProgressModel }
  | { kind: 'league'; tile: LeagueTileModel };

const MAX_TIMES = 20;

/** Barra de progreso (el arco de la insignia en palabras). */
export function ProgressBar({ ratio, text }: { ratio: number; text: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={text}>
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-sm font-medium text-fg">{text}</p>
    </div>
  );
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-accent">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs text-muted">{label}</dt>
        <dd className="break-words">{children}</dd>
      </div>
    </div>
  );
}

const leagueLink = (v: AwardView) =>
  v.leagueId ? (
    <Link to={`/l/${v.leagueId}`} className="font-medium text-accent hover:underline">
      {v.leagueName || 'Ver la liga'}
    </Link>
  ) : (
    v.leagueName
  );

const eventLink = (v: AwardView) =>
  v.event && v.leagueId && v.event.id ? (
    <Link to={`/l/${v.leagueId}/e/${v.event.id}`} className="font-medium text-accent hover:underline">
      {v.event.name || 'Ver el evento'}
    </Link>
  ) : (
    v.event?.name
  );

/**
 * Lo de adentro del detalle (§6.3): la insignia a 128 (la animación solo la primera vez), nombre, nivel y
 * descripción, dónde y cuándo con la evidencia, la rareza, los niveles (solo el dueño) o las veces (repetibles), y
 * en las bloqueadas cómo se gana y el progreso.
 */
export function BadgeSheetBody({
  subject,
  own,
  stats = [],
  progress,
  animate,
}: {
  subject: SheetSubject;
  own?: boolean;
  stats?: readonly BadgeStat[];
  progress?: ReadonlyMap<string, ProgressModel>;
  animate?: boolean;
}) {
  if (subject.kind === 'locked') {
    const m = subject.model;
    const p = 'progress' in m ? m.progress : m;
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <Insignia badge={m.look} size={128} state={p ? 'progress' : 'locked'} progress={p?.ratio} pad label={`${m.name}, bloqueada`} />
          <h3 className="text-xl font-bold tracking-tight">{m.name}</h3>
          <p className="flex items-center gap-1.5 text-sm font-medium text-muted">
            <Lock className="size-4" aria-hidden="true" /> Todavía no la tienes
          </p>
        </div>
        <div className="rounded-xl bg-surface-2 p-3">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Cómo se gana</p>
          <p className="mt-1 text-sm">{m.how}</p>
        </div>
        {p && <ProgressBar ratio={p.ratio} text={p.text} />}
      </div>
    );
  }

  if (subject.kind === 'league') {
    const { tile } = subject;
    const v = tile.top;
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <Insignia badge={v.look} size={128} state={tile.hidden ? 'hidden' : 'unlocked'} label={v.label} />
          <h3 className="text-xl font-bold tracking-tight break-words">{v.name}</h3>
          <p className="text-sm font-semibold">
            {v.givenBy}
            {tile.count > 1 && <span className="text-muted">{` · ×${tile.count}`}</span>}
          </p>
          {tile.hidden && (
            <p className="flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-sm font-medium text-muted">
              <EyeOff className="size-4" aria-hidden="true" /> Solo tú la ves
            </p>
          )}
          {v.description && <p className="text-sm text-muted">{v.description}</p>}
        </div>
        <dl className="grid gap-2.5 rounded-xl border border-line p-3 text-sm">
          <Row icon={<MapPin className="size-4" aria-hidden="true" />} label="Liga">
            <Link to={`/l/${v.award.leagueId}`} className="font-medium text-accent hover:underline">
              {v.leagueName}
            </Link>
          </Row>
          {v.detail && (
            <Row icon={<Trophy className="size-4" aria-hidden="true" />} label="Por">
              {v.detail}
            </Row>
          )}
          <Row icon={<CalendarDays className="size-4" aria-hidden="true" />} label="Cuándo">
            {v.date}
          </Row>
          {own && v.award.note && (
            <Row icon={<MessageSquareQuote className="size-4" aria-hidden="true" />} label="Nota de tu liga">
              {v.award.note}
            </Row>
          )}
        </dl>
        {tile.views.length > 1 && (
          <ul className="flex flex-col divide-y divide-line rounded-xl border border-line text-sm" aria-label="Veces">
            {tile.views.slice(0, MAX_TIMES).map((x) => (
              <li key={x.award.id} className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 truncate">{x.detail ?? x.name}</span>
                <span className="shrink-0 text-xs text-muted">{x.date}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const { tile } = subject;
  const top = tile.top;
  const stat = statFor(stats, top.award);
  const rarity = rarityText(stat, top.award.sport);
  const leveled = !tile.def.repeatable && tile.def.levels.length > 1;
  const levels = leveled ? [...tile.views].sort((a, b) => a.award.level - b.award.level) : [];
  const next = own && leveled && progress ? nextLevelLine(tile.def, tile.sport, progress) : null;
  const times = tile.def.repeatable ? tile.views : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2 text-center">
        {animate ? (
          <UnlockInsignia badge={top.look} px={200} label={top.label} />
        ) : (
          <Insignia badge={top.look} size={128} state={tile.state === 'new' ? 'unlocked' : tile.state} label={top.label} />
        )}
        <h3 className="text-xl font-bold tracking-tight break-words">{top.name}</h3>
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <span className="size-2.5 rounded-full" style={{ background: tierDot(top.look.tier) }} aria-hidden="true" />
          {levelLine(top)}
          {tile.count > 1 && <span className="text-muted">· ×{tile.count}</span>}
        </p>
        {tile.bucket === 'review' && (
          <p className="flex items-center gap-1.5 rounded-full bg-warn-soft px-3 py-1 text-sm font-medium text-warn">
            <Hourglass className="size-4" aria-hidden="true" /> Tu liga la está confirmando
          </p>
        )}
        {tile.bucket === 'hidden' && (
          <p className="flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-sm font-medium text-muted">
            <EyeOff className="size-4" aria-hidden="true" /> Solo tú la ves
          </p>
        )}
        {top.description && <p className="text-sm text-muted">{top.description}</p>}
      </div>

      <dl className="grid gap-2.5 rounded-xl border border-line p-3 text-sm">
        {top.leagueName && (
          <Row icon={<MapPin className="size-4" aria-hidden="true" />} label="Liga">
            {leagueLink(top)}
          </Row>
        )}
        {top.event && (
          <Row icon={<Trophy className="size-4" aria-hidden="true" />} label="Dónde">
            {eventLink(top)}
          </Row>
        )}
        <Row icon={<CalendarDays className="size-4" aria-hidden="true" />} label="Cuándo">
          {top.date}
        </Row>
        {top.evidence && (
          <Row icon={<Sparkles className="size-4" aria-hidden="true" />} label="Cómo fue">
            {top.evidence}
          </Row>
        )}
      </dl>

      {rarity && <p className="text-center text-sm font-medium text-muted">{rarity}</p>}

      {own && levels.length > 1 && (
        <section aria-label="Niveles">
          <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">Niveles</p>
          <ul className="flex flex-col gap-1 text-sm">
            {levels.map((v) => (
              <li key={v.award.id} className="flex items-center gap-2">
                <span className="size-2 rounded-full" style={{ background: tierDot(v.look.tier) }} aria-hidden="true" />
                <span className="font-medium">{v.levelName}</span>
                <span className="text-muted">· {v.date}</span>
              </li>
            ))}
            {next && <li className="text-muted">{next}</li>}
          </ul>
        </section>
      )}
      {own && levels.length <= 1 && next && <p className="text-sm text-muted">{next}</p>}

      {times.length > 1 && (
        <section aria-label="Veces">
          <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">{`${times.length} veces`}</p>
          <ul className="flex flex-col divide-y divide-line rounded-xl border border-line text-sm">
            {times.slice(0, MAX_TIMES).map((v) => (
              <li key={v.award.id} className="flex items-center gap-2 px-3 py-2">
                <span className="size-2 shrink-0 rounded-full" style={{ background: tierDot(v.look.tier) }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{[v.event?.name, v.levelName !== v.metal ? v.levelName : null].filter(Boolean).join(' · ') || v.name}</span>
                <span className="shrink-0 text-xs text-muted">{v.date}</span>
              </li>
            ))}
          </ul>
          {times.length > MAX_TIMES && <p className="mt-1 text-xs text-muted">{`y ${times.length - MAX_TIMES} más`}</p>}
        </section>
      )}
    </div>
  );
}

interface Sharing {
  card: ShareCard;
  frame: CardFrame;
  url?: string;
  filename: string;
}

export interface BadgeSheetProps {
  subject: SheetSubject | null;
  onClose: () => void;
  /** Tu vitrina: niveles, progreso y las acciones del dueño. */
  own?: boolean;
  /** Ids de las destacadas (tu vitrina). */
  featured?: readonly string[];
  stats?: readonly BadgeStat[];
  progress?: ReadonlyMap<string, ProgressModel>;
  /** Quién la ganó (sale en la tarjeta para compartir). */
  playerName?: string;
  /** Puede compartir sin las acciones del dueño (su propio jugador en la página de la liga). */
  canShare?: boolean;
  /** Un admin de la liga la comparte para anunciarla («Liga Los Pinos premió a Ana»). */
  announce?: boolean;
  /** Link que va con la imagen. */
  shareLink?: string;
  /**
   * Quien mira puede reportarla (`canReportAward`: otra cuenta, miembro de su liga o de cuenta): «Reportar» en el
   * menú ⋯ (§6.3).
   */
  canReport?: boolean;
  animate?: boolean;
}

/**
 * El detalle de una insignia en una hoja (§6.3), con las acciones del dueño: «Compartir», «Destacar en mi perfil» o
 * «Quitar de destacadas», «Ocultar de mi perfil» o «Mostrar en mi perfil». Un admin de la liga puede «Compartir».
 */
export function BadgeSheet({
  subject,
  onClose,
  own,
  featured = [],
  stats = [],
  progress,
  playerName = '',
  canShare: mayShare,
  announce,
  shareLink,
  canReport,
  animate,
}: BadgeSheetProps) {
  const run = useAction();
  const { toast, confirm } = useFeedback();
  const [busy, setBusy] = useState<string | null>(null);
  const [sharing, setSharing] = useState<Sharing | null>(null);
  // El menú ⋯ (Reportar) se cierra al cambiar de insignia.
  const [more, setMore] = useState(false);
  const subjectId = subject?.kind === 'award' ? subject.tile.top.award.id : subject?.kind === 'league' ? subject.tile.top.award.id : null;
  useEffect(() => setMore(false), [subjectId]);

  const tile = subject?.kind === 'award' ? subject.tile : null;
  const leagueTile = subject?.kind === 'league' ? subject.tile : null;
  const ids = tile ? tile.views.map((v) => v.award.id) : [];
  const isFeatured = ids.some((id) => featured.includes(id));

  const toggleFeatured = async () => {
    if (!tile) return;
    let next: string[];
    if (isFeatured) next = featured.filter((id) => !ids.includes(id));
    else if (featured.length >= 3) {
      toast('Ya tienes 3 destacadas. Quita una para poner esta.', 'error');
      return;
    } else next = [...featured, tile.top.award.id];
    setBusy('featured');
    await run(() => setFeaturedBadges(next), isFeatured ? 'Quitada de destacadas' : 'Destacada en tu perfil');
    setBusy(null);
  };

  const toggleHidden = async (hidden: boolean) => {
    if (!tile && !leagueTile) return;
    setBusy('hidden');
    const ok = await run(async () => {
      if (tile) for (const v of tile.views) if (v.award.hidden !== hidden) await setBadgeHidden(v.award, hidden);
      if (leagueTile) for (const v of leagueTile.views) if (v.award.hidden !== hidden) await setLeagueBadgeHidden(v.award, hidden);
      return true;
    }, hidden ? 'Oculta: solo tú la ves' : 'Ya se ve en tu perfil');
    setBusy(null);
    if (ok) onClose();
  };

  const share = () => {
    const here = typeof location !== 'undefined' ? location : undefined;
    const url = shareLink ?? here?.href;
    if (tile) {
      const v = tile.top;
      const input = shareInputOf(v, playerName, statFor(stats, v.award), !!announce && !own && !mayShare);
      setSharing({
        card: badgeShare(input),
        frame: shareFrame(v.award.sport === 'all' ? null : v.award.sport, url),
        url,
        filename: shareFileName(['insignia', v.name, playerName]),
      });
    } else if (leagueTile) {
      const v = leagueTile.top;
      setSharing({ card: badgeShare(leagueShareInputOf(v, playerName)), frame: shareFrame(v.award.sport, url), url, filename: shareFileName(['insignia', v.name, playerName]) });
    }
  };

  const report = async () => {
    if (!tile) return;
    const yes = await confirm({
      title: `¿Reportar «${tile.top.name}»?`,
      message: 'Le llega al equipo de MatchMate para que la revise. Úsalo si crees que se dio por un resultado que no fue.',
      confirmText: 'Reportar',
      danger: true,
    });
    if (!yes) return;
    setBusy('report');
    try {
      await reportBadge(tile.top.award.id);
      toast('Reporte enviado. Gracias.');
      setMore(false);
    } catch (e) {
      // «Ya mandaste 5 reportes hoy…», o el permiso de la liga, en palabras del creador (no el genérico de guardar).
      toast(makerErrorText(e, { action: 'reportar' }), 'error');
    } finally {
      setBusy(null);
    }
  };

  const canShare = (!!tile && tile.bucket === 'ok' && (own || mayShare || announce)) || (!!leagueTile && !leagueTile.hidden && (own || mayShare));
  const footer = leagueTile ? (
    <>
      {own && (
        <Button
          className="h-11"
          variant={leagueTile.hidden ? 'primary' : 'ghost'}
          loading={busy === 'hidden'}
          icon={leagueTile.hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          onClick={() => void toggleHidden(!leagueTile.hidden)}
        >
          {leagueTile.hidden ? 'Mostrar en mi perfil' : 'Ocultar de mi perfil'}
        </Button>
      )}
      {canShare ? (
        <Button className="h-11" variant="primary" icon={<Share2 className="size-4" />} onClick={share}>
          Compartir
        </Button>
      ) : (
        !own && (
          <Button className="h-11" onClick={onClose}>
            Cerrar
          </Button>
        )
      )}
    </>
  ) : tile ? (
    <>
      {own && tile.bucket === 'ok' && (
        <Button className="h-11" variant="ghost" loading={busy === 'hidden'} icon={<EyeOff className="size-4" />} onClick={() => void toggleHidden(true)}>
          Ocultar de mi perfil
        </Button>
      )}
      {own && tile.bucket === 'ok' && (
        <Button
          className="h-11"
          loading={busy === 'featured'}
          icon={isFeatured ? <StarOff className="size-4" /> : <Star className="size-4" />}
          onClick={() => void toggleFeatured()}
        >
          {isFeatured ? 'Quitar de destacadas' : 'Destacar en mi perfil'}
        </Button>
      )}
      {own && tile.bucket === 'hidden' && (
        <Button className="h-11" variant="primary" loading={busy === 'hidden'} icon={<Eye className="size-4" />} onClick={() => void toggleHidden(false)}>
          Mostrar en mi perfil
        </Button>
      )}
      {canShare && (
        <Button className="h-11" variant="primary" icon={<Share2 className="size-4" />} onClick={share}>
          Compartir
        </Button>
      )}
      {!own && canReport && tile.bucket === 'ok' &&
        (more ? (
          <Button className="h-11" variant="ghost" loading={busy === 'report'} icon={<Flag className="size-4" />} onClick={() => void report()}>
            Reportar
          </Button>
        ) : (
          <Button className="size-11" variant="ghost" icon={<MoreHorizontal className="size-5" />} aria-label="Más opciones" aria-expanded={false} onClick={() => setMore(true)} />
        ))}
      {!own && !canShare && (
        <Button className="h-11" onClick={onClose}>
          Cerrar
        </Button>
      )}
    </>
  ) : (
    <Button className="h-11" onClick={onClose}>
      Cerrar
    </Button>
  );

  return (
    <>
      <Modal open={!!subject} onClose={onClose} title="Insignia" footer={footer}>
        {subject && <BadgeSheetBody subject={subject} own={own} stats={stats} progress={progress} animate={animate} />}
      </Modal>
      {sharing && (
        <ShareImageModal open onClose={() => setSharing(null)} card={sharing.card} frame={sharing.frame} url={sharing.url} filename={sharing.filename} />
      )}
    </>
  );
}

/** Texto chico de estado debajo del nombre en la grilla. */
export function tileSub(tile: BadgeTileModel): string {
  if (tile.bucket === 'review') return 'En revisión';
  if (tile.bucket === 'hidden') return 'Solo tú la ves';
  return levelLine(tile.top);
}
