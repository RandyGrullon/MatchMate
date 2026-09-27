import { useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { fetchEntriesOfEvents } from '../lib/data';
import { formatDate } from '../lib/format';
import { useLeagueCtx } from '../lib/league';
import type { BowlingEvent, Player } from '../lib/types';
import { useAction } from './feedback';
import { Button, Modal } from './ui';

/**
 * Ranking › Excel: descarga la temporada (el año elegido o las fechas de la temporada de la liga)
 * o toda la liga, con el ranking, todos los juegos y cada práctica y torneo.
 */
export function LeagueExcelButton({ year, events, players }: { year: string | undefined; events: BowlingEvent[]; players: Player[] }) {
  const { lid, league } = useLeagueCtx();
  const run = useAction();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const scopes = [
    ...(league.seasonStart && league.seasonEnd
      ? [{ key: 'temporada', label: `Temporada (${formatDate(league.seasonStart)} – ${formatDate(league.seasonEnd)})`, from: league.seasonStart, to: league.seasonEnd }]
      : []),
    ...(year ? [{ key: 'anio', label: `Temporada ${year}`, from: `${year}-01-01`, to: `${year}-12-31` }] : []),
    { key: 'todo', label: 'Toda la liga', from: undefined, to: undefined },
  ];

  async function download(scope: (typeof scopes)[number]) {
    setBusy(scope.key);
    const ok = await run(async () => {
      // Solo lo de las fechas elegidas (no toda la historia de la liga).
      const inScope = events.filter((e) => (!scope.from || e.date >= scope.from) && (!scope.to || e.date <= scope.to)).map((e) => e.id);
      const [{ exportLeagueToExcel }, entries] = await Promise.all([import('../lib/exportExcel'), fetchEntriesOfEvents(lid, inScope)]);
      await exportLeagueToExcel(league.name, scope, events, entries, players);
      return true;
    }, 'Excel descargado');
    setBusy(null);
    if (ok) setOpen(false);
  }

  return (
    <>
      <Button variant="ghost" aria-label="Descargar en Excel" title="Descargar en Excel" icon={<FileSpreadsheet className="size-5" />} onClick={() => setOpen(true)} />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={
          <span className="flex items-center gap-2">
            <FileSpreadsheet className="size-5 text-accent" /> Descargar en Excel
          </span>
        }
        footer={<Button onClick={() => setOpen(false)}>Cerrar</Button>}
      >
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">Ranking de jugadores, todos los juegos y el resumen de cada práctica y torneo (solo juegos verificados).</p>
          {scopes.map((s) => (
            <Button key={s.key} className="justify-start" icon={<FileSpreadsheet className="size-4" />} loading={busy === s.key} disabled={!!busy} onClick={() => download(s)}>
              {s.label}
            </Button>
          ))}
          <p className="text-xs text-muted">Cada práctica o torneo por separado se descarga desde su página (botón de Excel arriba).</p>
        </div>
      </Modal>
    </>
  );
}
