import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Camera, CheckCircle2, ChevronRight, Image } from 'lucide-react';
import { useLeagueCtx } from '../../lib/league';
import type { BowlingEvent, Entry } from '../../lib/types';
import type { GameMark } from '../../lib/bowlingSeason';
import { FramesGrid } from '../frames/FramesGrid';
import { PhotoModal } from '../PhotoModal';
import { Badge, Button, Modal, Position, cx } from '../ui';
import { GameMarkBadges } from './GameMarks';
// La lógica (el puesto, los pinos, strikes y spares, si cada juego cuenta y su foto) está en gameDetail.ts: la usa la app.
import { ONLY_TOTAL_TEXT, gameDetail } from './gameDetail';

/** Juegos de un jugador en un evento: pinos, cuadros tiro por tiro, strikes/spares y la foto. */
export function GameDetailModal({
  event,
  entries,
  entry,
  name,
  onClose,
  marks,
  mine,
  children,
}: {
  event: BowlingEvent;
  entries: Entry[];
  entry: Entry | null;
  name: string;
  onClose: () => void;
  /** «Récord personal» y «+15 sobre tu promedio» de cada juego (null mientras no se sabe). */
  marks?: (GameMark | null)[] | null;
  /** El juego es de quien mira («tu promedio»; si no, «su promedio»). */
  mine?: boolean;
  /** Debajo de los juegos (p. ej. me gusta y comentarios). */
  children?: ReactNode;
}) {
  const { base } = useLeagueCtx();
  const [photoId, setPhotoId] = useState<{ id: string; game: number } | null>(null);
  if (!entry) return null;

  const detail = gameDetail(event, entries, entry);
  const { line, pos, totals, isTorneo } = detail;

  return (
    <>
      <Modal
        open={!photoId}
        onClose={onClose}
        title={name}
        wide
        footer={
          <>
            <Link to={`${base}/j/${entry.playerId}`} className="mr-auto inline-flex h-10 items-center gap-1 px-2 text-sm font-medium text-accent">
              Ver su perfil <ChevronRight className="size-4" />
            </Link>
            <Button onClick={onClose}>Cerrar</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Summary label={detail.placeLabel} value={pos ? <Position pos={pos.pos} /> : '—'} sub={pos ? `de ${pos.of}` : undefined} />
            <Summary label={detail.pinsLabel} value={detail.pins} />
            <Summary label="Promedio" value={line.avg || '—'} />
          </div>

          {totals && (
            <div className="flex flex-wrap gap-2">
              <Badge tone="accent">{totals.strikes} strikes</Badge>
              <Badge tone="accent">{totals.spares} spares</Badge>
              <Badge>{totals.opens} abiertos</Badge>
            </div>
          )}

          {detail.games.map(({ score: s, verified, frames, photo: realPhoto }, i) => {
            return (
              <section key={i} className="flex flex-col gap-2 rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">Juego {i + 1}</span>
                  {s == null ? (
                    <Badge>Sin jugar</Badge>
                  ) : verified ? (
                    <Badge tone="ok">
                      <CheckCircle2 className="size-3" /> Cuenta
                    </Badge>
                  ) : (
                    <Badge tone="warn">
                      <Camera className="size-3" /> Falta foto
                    </Badge>
                  )}
                  {verified && <GameMarkBadges mark={marks?.[i]} mine={mine} />}
                  <span className={cx('ml-auto text-2xl font-bold tabular-nums', !verified && s != null && 'text-warn')}>{s ?? '—'}</span>
                  {isTorneo && s != null && line.hcp > 0 && <span className="text-xs text-muted tabular-nums">+{line.hcp}</span>}
                </div>
                {frames ? (
                  <FramesGrid rolls={frames.rolls} masks={frames.masks} compact />
                ) : (
                  s != null && <p className="text-xs text-muted">{ONLY_TOTAL_TEXT}</p>
                )}
                {realPhoto && (
                  <Button size="sm" className="self-start" icon={<Image className="size-4" />} onClick={() => setPhotoId({ id: realPhoto, game: i })}>
                    Ver foto
                  </Button>
                )}
              </section>
            );
          })}
          {children}
        </div>
      </Modal>
      <PhotoModal photoId={photoId?.id ?? null} onClose={() => setPhotoId(null)} title={photoId ? `${name} · Juego ${photoId.game + 1}` : ''} />
    </>
  );
}

function Summary({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-xl bg-surface-2 px-2 py-2.5">
      <span className="text-[11px] text-muted">{label}</span>
      <span className="flex h-8 items-center text-xl font-bold tabular-nums">{value}</span>
      {sub && <span className="text-[11px] text-muted">{sub}</span>}
    </div>
  );
}
