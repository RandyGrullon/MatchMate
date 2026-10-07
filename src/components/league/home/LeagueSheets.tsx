import { useMemo } from 'react';
import { CalendarPlus, Trophy, UserCog } from 'lucide-react';
import type { LeagueFeed } from '../../../lib/data';
import { usePlayers } from '../../../lib/data/players';
import { useLeagueCtx } from '../../../lib/league';
import type { EventType } from '../../../lib/types';
import { initials } from '../../Avatar';
import { WeekAgenda } from '../../home/WeekAgenda';
import { ProOnly } from '../../mode';
import { Button, ListRow, ListSkeleton, RowIcon, Sheet, cx } from '../../ui';
import { MeTag } from './LeagueSections';

/**
 * «Jugadores · 6 en la liga»: toda la gente de la liga por nombre (también los que todavía no entran en la Tabla); cada
 * fila abre la página del jugador (sus números, seguir, me gusta). En Pro, quien organiza tiene «Editar jugadores»
 * (Organizar › Jugadores).
 */
export function PlayersSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lid, league, base, myPlayerId, isAdmin } = useLeagueCtx();
  const players = usePlayers(open ? lid : undefined);
  const list = useMemo(() => [...players.data].sort((a, b) => a.name.localeCompare(b.name, 'es')), [players.data]);
  return (
    <Sheet open={open} onClose={onClose} title="Jugadores" subtitle={league.name}>
      <div className="-mx-5">
        {players.loading && !list.length ? (
          <div className="px-5">
            <ListSkeleton rows={4} />
          </div>
        ) : list.length ? (
          list.map((p) => {
            const me = p.id === myPlayerId;
            return (
              <ListRow
                key={p.id}
                me={me}
                leading={
                  <span
                    aria-hidden="true"
                    className={cx('grid size-10 shrink-0 place-items-center rounded-full text-sm font-[650]', me ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg-2')}
                  >
                    {initials(p.name)}
                  </span>
                }
                title={
                  <>
                    {p.name}
                    {me && <MeTag />}
                  </>
                }
                to={`${base}/j/${p.id}`}
              />
            );
          })
        ) : (
          <p className="px-5 py-4 text-meta text-muted">Todavía no hay jugadores.</p>
        )}
        {isAdmin && (
          <ProOnly>
            <ListRow
              leading={
                <RowIcon tone="accent">
                  <UserCog className="size-5" />
                </RowIcon>
              }
              title="Editar jugadores"
              subtitle="Agregar, cambiar nombres y vincular cuentas"
              to={`${base}/admin?tab=jugadores`}
            />
          </ProOnly>
        )}
      </div>
    </Sheet>
  );
}

/**
 * El Calendario de la liga (desde «Próximas fechas»): la semana con sus fechas y «Voy», y las semanas que vienen (el
 * mismo calendario de Hoy, solo con esta liga). En Pro, quien organiza crea aquí la próxima práctica o un torneo (antes
 * era «+ Nuevo» en la pestaña Calendario; en Lite está en Ligas › Crear o unirme).
 */
export function LeagueCalendarSheet({
  open,
  onClose,
  feed,
  today,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  feed: LeagueFeed;
  today: string;
  /** Solo quien organiza: crear una práctica o un torneo. */
  onCreate?: (type: EventType) => void;
}) {
  const { league } = useLeagueCtx();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Calendario"
      subtitle={league.name}
      footer={
        onCreate && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="soft" size="lg" icon={<CalendarPlus className="size-[18px]" />} onClick={() => onCreate('practica')} aria-label="Nueva práctica">
              Práctica
            </Button>
            <Button variant="quiet" size="lg" icon={<Trophy className="size-[18px]" />} onClick={() => onCreate('torneo')} aria-label="Nuevo torneo">
              Torneo
            </Button>
          </div>
        )
      }
    >
      {open && <WeekAgenda feeds={[feed]} leagues={[league]} matches={[]} today={today} />}
    </Sheet>
  );
}
