import { useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { fetchEntriesOfEvents } from '../lib/data';
import { EXCEL_DONE, LEAGUE_EXCEL_NOTE, LEAGUE_EXCEL_TEXT, LEAGUE_EXCEL_TITLE, leagueExcelScopes, scopeEventIds, type LeagueExcelScope } from '../lib/leagueExcel';
import { useLeagueCtx } from '../lib/league';
import type { Season } from '../lib/seasons';
import type { BowlingEvent, Player } from '../lib/types';
import { useAction } from './feedback';
import { pillClass } from './ranking/parts';
import { Button, Modal, cx } from './ui';

/**
 * Tabla › «Excel» (Pro, la píldora de arriba): descarga la temporada elegida en la tabla (sus fechas; la que sigue
 * abierta, hasta hoy) o toda la liga, con la tabla, todos los juegos y cada práctica y torneo. Sin temporadas: las
 * fechas de la liga. Qué se baja, las hojas y los textos: src/lib/leagueExcel.ts (los usa también la app del teléfono).
 */
export function LeagueExcelButton({
  season,
  events,
  players,
  className,
}: {
  season: Season | null;
  events: BowlingEvent[];
  players: Player[];
  className?: string;
}) {
  const { lid, league } = useLeagueCtx();
  const run = useAction();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const scopes = leagueExcelScopes(season, league);

  async function download(scope: LeagueExcelScope) {
    setBusy(scope.key);
    const ok = await run(async () => {
      // Solo lo de las fechas elegidas (no toda la historia de la liga).
      const [{ exportLeagueToExcel }, entries] = await Promise.all([import('../lib/exportExcel'), fetchEntriesOfEvents(lid, scopeEventIds(events, scope))]);
      await exportLeagueToExcel(league.name, scope, events, entries, players);
      return true;
    }, EXCEL_DONE);
    setBusy(null);
    if (ok) setOpen(false);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" title="Descargar en Excel" className={cx(pillClass, className)}>
        <Download aria-hidden="true" className="size-4 shrink-0" />
        Excel
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={
          <span className="flex items-center gap-2">
            <FileSpreadsheet className="size-5 text-accent" /> {LEAGUE_EXCEL_TITLE}
          </span>
        }
        footer={<Button onClick={() => setOpen(false)}>Cerrar</Button>}
      >
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">{LEAGUE_EXCEL_TEXT}</p>
          {scopes.map((s) => (
            <Button key={s.key} className="justify-start" icon={<FileSpreadsheet className="size-4" />} loading={busy === s.key} disabled={!!busy} onClick={() => download(s)}>
              {s.label}
            </Button>
          ))}
          <p className="text-xs text-muted">{LEAGUE_EXCEL_NOTE}</p>
        </div>
      </Modal>
    </>
  );
}
