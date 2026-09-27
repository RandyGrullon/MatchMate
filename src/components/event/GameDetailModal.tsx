import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Camera, CheckCircle2, ChevronRight, Image } from 'lucide-react';
import { frameStats } from '../../lib/bowling';
import { useLeagueCtx } from '../../lib/league';
import { entryLine, eventPosition } from '../../lib/stats';
import { IMPORTED, NO_PHOTO, type BowlingEvent, type Entry } from '../../lib/types';
import { FramesGrid } from '../frames/FramesGrid';
import { PhotoModal } from '../PhotoModal';
import { Badge, Button, Modal, Position, cx } from '../ui';

/** Juegos de un jugador en un evento: pinos, cuadros tiro por tiro, strikes/spares y la foto. */
export function GameDetailModal({
  event,
  entries,
  entry,
  name,
  onClose,
  children,
}: {
  event: BowlingEvent;
  entries: Entry[];
  entry: Entry | null;
  name: string;
  onClose: () => void;
  /** Debajo de los juegos (p. ej. me gusta y comentarios). */
  children?: ReactNode;
}) {
  const { base } = useLeagueCtx();
  const [photoId, setPhotoId] = useState<{ id: string; game: number } | null>(null);
  if (!entry) return null;

  const line = entryLine(entry, event, true);
  const pos = eventPosition(event, entries, entry.id);
  const photos = entry.photos ?? [];
  const allFrames = Object.values(entry.frames ?? {});
  const totals = allFrames.reduce(
    (acc, f) => {
      const s = frameStats(f.rolls);
      return { strikes: acc.strikes + s.strikes, spares: acc.spares + s.spares, opens: acc.opens + s.opens };
    },
    { strikes: 0, spares: 0, opens: 0 },
  );
  const isTorneo = event.type === 'torneo';

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
            <Summary label={isTorneo ? 'Posición' : 'Puesto'} value={pos ? <Position pos={pos.pos} /> : '—'} sub={pos ? `de ${pos.of}` : undefined} />
            <Summary label={isTorneo && line.hcp ? 'Total c/hcp' : 'Pinos'} value={isTorneo && line.hcp ? line.total : line.scratch} />
            <Summary label="Promedio" value={line.avg || '—'} />
          </div>

          {allFrames.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Badge tone="accent">{totals.strikes} strikes</Badge>
              <Badge tone="accent">{totals.spares} spares</Badge>
              <Badge>{totals.opens} abiertos</Badge>
            </div>
          )}

          {line.scores.map((s, i) => {
            const frames = entry.frames?.[i];
            const p = photos[i] ?? null;
            const verified = s != null && p != null;
            const realPhoto = p && p !== NO_PHOTO && p !== IMPORTED;
            return (
              <section key={i} className="flex flex-col gap-2 rounded-xl border border-line p-3">
                <div className="flex items-center gap-2">
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
                  <span className={cx('ml-auto text-2xl font-bold tabular-nums', !verified && s != null && 'text-warn')}>{s ?? '—'}</span>
                  {isTorneo && s != null && line.hcp > 0 && <span className="text-xs text-muted tabular-nums">+{line.hcp}</span>}
                </div>
                {frames ? (
                  <FramesGrid rolls={frames.rolls} compact />
                ) : (
                  s != null && <p className="text-xs text-muted">Anotado solo el total (sin cuadros).</p>
                )}
                {realPhoto && (
                  <Button size="sm" className="self-start" icon={<Image className="size-4" />} onClick={() => setPhotoId({ id: p, game: i })}>
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
