import { useContext, useState } from 'react';
import { Copy, MessageCircle, Share2 } from 'lucide-react';
import type { Match } from '../../lib/data/matches';
import { usePlayers } from '../../lib/data/players';
import { LeagueContext } from '../../lib/league';
import type { Side } from '../../sports/types';
import { useFeedback } from '../feedback';
import { MATCH_SHAREABLE, leagueShareTarget, matchPostText, matchSharePick } from '../posts/shareGame';
import { PublishButton } from '../posts/ShareToSocial';
import { ShareButton } from '../share/ShareButton';
import type { ShareResultSide } from '../share/cards';
import { resultShare } from '../share/match';
import { Button, Card, cx } from '../ui';
import { flipScoreText, matchShareText, sideName, whatsappShareUrl } from './format';

/**
 * Tarjeta para compartir el resultado: como imagen (con la marca y el color del deporte, lista para WhatsApp)
 * o como texto por WhatsApp, con el menú del teléfono o copiado. El texto sale de `matchShareText`: título,
 * ronda y cancha, quién ganó y con qué marcador, y el link. Abajo, «Publicar en Social» (el partido como publicación en
 * la liga, src/components/posts/ShareToSocial.tsx) para los miembros de una liga sin menores con el partido terminado.
 */
export function ShareResultCard({
  match,
  title,
  roundWord,
  url,
  sideExtra,
  mySide,
  className,
}: {
  match: Match;
  /** Nombre de la liga o de la noche. */
  title?: string;
  roundWord?: string;
  url?: string;
  /** Color y línea chica de cada lado en la imagen (el color del equipo). */
  sideExtra?: (side: Side) => Pick<ShareResultSide, 'dot' | 'sub'> | undefined;
  /** El lado de quien mira si jugó el partido (su texto sugerido es «¡Ganamos…!»). */
  mySide?: Side | null;
  className?: string;
}) {
  const { toast } = useFeedback();
  const ctx = useContext(LeagueContext);
  const [busy, setBusy] = useState(false);
  const text = matchShareText({ match, title, roundWord, url });

  // «Publicar en Social»: solo miembros de una liga sin menores y con el partido terminado. Si quien mira no lo jugó,
  // va con el primer jugador con cuenta del lado que ganó (la base pide uno que lo jugó).
  const target = leagueShareTarget(ctx);
  const mine = !!(mySide && ctx?.myPlayerId);
  const players = usePlayers(target && !mine && MATCH_SHAREABLE.includes(match.status) ? ctx?.lid : undefined);
  const pick = target
    ? matchSharePick(match, {
        mySide,
        myPlayerId: ctx?.myPlayerId,
        hasAccount: (id) => players.data.some((p) => p.id === id && !!p.uid && !p.isMinor),
      })
    : null;

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;
  const share = async () => {
    setBusy(true);
    try {
      if (canShare && matchMedia('(pointer: coarse)').matches) {
        try {
          await navigator.share({ text });
          return;
        } catch {
          // cancelado: se copia
        }
      }
      await navigator.clipboard.writeText(text);
      toast('Copiado');
    } catch {
      toast('No se pudo copiar', 'error');
    } finally {
      setBusy(false);
    }
  };

  const card = () => resultShare(match, { title: title || ctx?.league.name || 'Resultado', roundWord, tz: ctx?.league.tz, url, sideExtra });

  return (
    <Card className={cx('flex flex-col gap-3.5 px-[18px] pt-4 pb-[18px]', className)}>
      <pre className="rounded-2xl bg-surface-2 px-4 py-3 font-sans text-[15px] leading-[1.45] whitespace-pre-wrap">{text}</pre>
      <ShareButton card={card} url={url} variant="primary" size="md" label="Compartir imagen" className="h-12 w-full rounded-[15px] text-base font-semibold" />
      <div className="grid grid-cols-2 gap-2.5">
        <a
          href={whatsappShareUrl(text)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-[15px] bg-surface-2 px-4 text-[15px] font-semibold text-fg transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <MessageCircle className="size-5" />
          WhatsApp
        </a>
        <Button
          variant="quiet"
          size="lg"
          loading={busy}
          onClick={() => void share()}
          icon={canShare ? <Share2 className="size-5" /> : <Copy className="size-5" />}
          aria-label={canShare ? 'Compartir como texto' : 'Copiar el texto'}
        >
          {canShare ? 'Texto' : 'Copiar'}
        </Button>
      </div>
      {pick && (
        <PublishButton
          league={target}
          game={pick.game}
          text={matchPostText(match, pick.side, pick.mine, target?.sport)}
          preview={<MatchPreview match={match} side={pick.side} />}
        />
      )}
    </Card>
  );
}

/** El partido en la hoja para publicarlo: los dos lados (primero el del jugador) y el marcador desde su lado. */
function MatchPreview({ match: m, side }: { match: Match; side: Side }) {
  const other: Side = side === 1 ? 2 : 1;
  const name = (s: Side) => sideName(m.sides.find((x) => x.side === s) ?? { label: '' });
  const raw = typeof m.score?.text === 'string' ? m.score.text.trim() : '';
  const score = m.status === 'walkover' ? 'W.O.' : side === 1 ? raw : flipScoreText(raw);
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3">
      <p className="min-w-0 flex-1 truncate text-sm">
        <span className="font-semibold">{name(side)}</span>
        <span className="text-muted"> vs </span>
        <span className="font-semibold">{name(other)}</span>
      </p>
      {score && <span className="shrink-0 text-xl leading-tight font-bold tabular-nums">{score}</span>}
    </div>
  );
}
