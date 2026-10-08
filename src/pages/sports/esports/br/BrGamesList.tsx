import { useState } from 'react';
import { Camera, Crosshair, Pencil } from 'lucide-react';
import type { BrGame } from '../../../../lib/data/esports';
import { usePhoto } from '../../../../lib/photos';
import { useLeagueCtx } from '../../../../lib/league';
import { brPointsOf, type TournamentSettings } from '../../../../sports/esports';
import { PhotoModal } from '../../../../components/PhotoModal';
import { Button, Card, Empty, ListRow, RowIcon, SectionHeader, Sheet, Skeleton, cx } from '../../../../components/ui';
import { brByRound } from '../logic';

const STATUS: Record<BrGame['status'], string> = { scheduled: 'Por jugar', finished: 'Anotada', void: 'Anulada' };

/**
 * Las partidas de battle royale por jornada (§12.8 «Partidas»): cada una con su estado y su mapa; al tocarla, sus
 * puestos y kills con los puntos de cada inscrito y las capturas. Quien organiza (Pro) la edita desde ahí (`onEdit`).
 */
export function BrGamesList({
  games,
  settings,
  nameOf,
  onEdit,
  className,
}: {
  games: readonly BrGame[];
  settings: TournamentSettings;
  nameOf: (entryId: string) => string;
  onEdit?: (g: BrGame) => void;
  className?: string;
}) {
  const [open, setOpen] = useState<BrGame | null>(null);
  if (!games.length) {
    return (
      <Empty icon={<Crosshair className="size-8" />} title="Todavía no hay partidas">
        Cuando el organizador anote la primera, sale aquí con los puestos y las kills.
      </Empty>
    );
  }
  return (
    <div className={cx('flex flex-col gap-[26px]', className)}>
      {brByRound(games).map((r) => (
        <section key={r.round} aria-label={`Jornada ${r.round}`}>
          <SectionHeader title={`Jornada ${r.round}`} />
          <Card className="overflow-hidden">
            {r.games.map((g) => (
              <ListRow
                key={g.id}
                leading={
                  <RowIcon tone={g.status === 'finished' ? 'accent' : 'neutral'}>
                    <span className="num text-[15px] font-bold">{g.gameNo}</span>
                  </RowIcon>
                }
                title={`Partida ${g.gameNo}`}
                subtitle={[STATUS[g.status], g.map, g.results.filter((x) => x.placement != null).length ? `${g.results.filter((x) => x.placement != null).length} con puesto` : null].filter(Boolean).join(' · ')}
                onClick={() => setOpen(g)}
              />
            ))}
          </Card>
        </section>
      ))}
      <Sheet
        open={!!open}
        onClose={() => setOpen(null)}
        title={open ? `Jornada ${open.round} · Partida ${open.gameNo}` : ''}
        subtitle={open ? [STATUS[open.status], open.map].filter(Boolean).join(' · ') : undefined}
        footer={
          open && onEdit ? (
            <Button
              variant="quiet"
              size="lg"
              className="w-full"
              icon={<Pencil className="size-4" />}
              onClick={() => {
                const g = open;
                setOpen(null);
                onEdit(g);
              }}
            >
              Editar la partida
            </Button>
          ) : undefined
        }
      >
        {open && <GameDetail game={open} settings={settings} nameOf={nameOf} />}
      </Sheet>
    </div>
  );
}

/** Los puestos y las kills de una partida, del 1.º para abajo (los que no jugaron al final), con sus puntos. */
function GameDetail({ game, settings, nameOf }: { game: BrGame; settings: TournamentSettings; nameOf: (id: string) => string }) {
  const pts = settings.br ?? { placementPoints: [], killPoints: 1 };
  const rows = [...game.results].sort((a, b) => (a.placement ?? 999) - (b.placement ?? 999) || b.kills - a.kills);
  return (
    <div className="flex flex-col gap-4 pb-1">
      {rows.length ? (
        <ul className="-mx-1 flex flex-col">
          {rows.map((r, i) => (
            <li key={r.entryId} className={cx('flex min-h-12 items-center gap-3 px-1', i > 0 && 'border-t border-line')}>
              <span className="w-7 shrink-0 text-center text-[15px] font-semibold text-muted tabular-nums">{r.placement ?? '–'}</span>
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{nameOf(r.entryId)}</span>
              <span className="shrink-0 text-[13px] text-muted tabular-nums">{r.kills} K</span>
              <span className="num w-10 shrink-0 text-right text-[17px] font-bold">{brPointsOf(pts, r.placement, r.kills)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl bg-surface-2 px-4 py-3.5 text-sm text-muted">Todavía sin puestos.</p>
      )}
      {game.proof.length > 0 && <ProofStrip ids={game.proof} />}
    </div>
  );
}

/** Las capturas de la partida o la serie (miniaturas que se abren grandes). */
export function ProofStrip({ ids, className }: { ids: readonly string[]; className?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className={cx('flex flex-col gap-2', className)}>
      <p className="mx-1 inline-flex items-center gap-1.5 text-sm font-[650] text-fg-2">
        <Camera aria-hidden="true" className="size-4" />
        {ids.length === 1 ? 'Captura' : 'Capturas'}
      </p>
      <div className="flex gap-2.5">
        {ids.map((id, i) => (
          <Thumb key={id} id={id} n={i + 1} onOpen={() => setOpen(id)} />
        ))}
      </div>
      <PhotoModal photoId={open} onClose={() => setOpen(null)} title="Captura" />
    </div>
  );
}

function Thumb({ id, n, onOpen }: { id: string; n: number; onOpen: () => void }) {
  const { lid } = useLeagueCtx();
  const photo = usePhoto(lid, id);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Ver la captura ${n}`}
      className="size-20 shrink-0 overflow-hidden rounded-2xl bg-surface-2 transition active:scale-95 focus-visible:outline-2 focus-visible:outline-accent"
    >
      {photo.data ? <img src={photo.data.url} alt="" className="size-full object-cover" /> : <Skeleton className="size-full" />}
    </button>
  );
}
