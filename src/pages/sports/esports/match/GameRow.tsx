import type { ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { GAMES, type GameRecord, type SeriesRules } from '../../../../sports/esports';
import { fightChoices, gameWord, isCloseGame, penaltyState, stockChoices, swapFor, tidyGame } from './game';
import { Card, Select, cx } from '../../../../components/ui';
import { ToggleRow } from '../../racket/bits';
import { ChoiceChips, ScoreStepper, SideStepRow, WinnerPick } from '../parts';

// Lo puro (la palabra, el mapa vacío, limpiar y las fichas) está en game.ts: lo usa también la app del teléfono.
export { cleanGame, emptyGame, gameWord, tidyGame } from './game';

/**
 * Un mapa o juego de la serie con la regla del juego (§2.3, §12.8):
 * - VALORANT y CS2: el mapa (de la lista) y las rondas de cada lado;
 * - Rocket League: goles y «Prórroga (gol de oro)» si quedó por 1;
 * - EA SPORTS FC: goles y, con empate, los penales (o «Empate» en grupos si se permite);
 * - NBA 2K: puntos;
 * - LoL y MLBB: «¿Quién ganó?» y las kills (opcional);
 * - SF6 y TEKKEN 8: quién ganó y las rondas («2-1»);
 * - Smash: quién ganó y las vidas que le quedaron;
 * - Clash Royale: quién ganó y las coronas de cada uno.
 * Debajo, el error del motor (`validateGame`) en vivo.
 */
export function GameRow({
  rules,
  index,
  game: g,
  names,
  onChange,
  onRemove,
  error,
}: {
  rules: SeriesRules;
  index: number;
  game: GameRecord;
  names: readonly [string, string];
  onChange: (g: GameRecord) => void;
  onRemove?: () => void;
  error?: string | null;
}) {
  const meta = GAMES[rules.game];
  const word = gameWord(rules);
  const set = (patch: Partial<GameRecord>) => onChange(tidyGame(rules, { ...g, ...patch }));
  const pair = (key: 'a' | 'b', max: number, what: string, optional = false) => (
    <ScoreStepper
      value={g[key]}
      optional={optional}
      min={0}
      max={max}
      label={`${what} de ${names[key === 'a' ? 0 : 1]}`}
      onChange={(n) => set({ [key]: n } as Partial<GameRecord>)}
    />
  );
  const steppers = (max: number, what: string, optional = false) => (
    <div className="flex flex-col">
      <SideStepRow name={names[0]}>{pair('a', max, what, optional)}</SideStepRow>
      <SideStepRow name={names[1]} className="border-t border-line">
        {pair('b', max, what, optional)}
      </SideStepRow>
    </div>
  );

  let body: ReactNode = null;
  switch (meta.scoring) {
    case 'val':
    case 'cs':
      body = (
        <>
          {meta.maps.length > 0 && (
            <Select aria-label={`${word} ${index + 1}: cuál`} value={g.map ?? ''} onChange={(e) => set({ map: e.target.value || undefined })} className="mb-1 h-11">
              <option value="">Mapa (opcional)</option>
              {meta.maps.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          )}
          {steppers(99, 'Rondas')}
        </>
      );
      break;
    case 'goals_ot': {
      const close = isCloseGame(g);
      body = (
        <>
          {steppers(99, 'Goles')}
          {close && <ToggleRow checked={g.ot === true} onChange={(v) => set({ ot: v ? true : undefined })} label="Prórroga (gol de oro)" />}
        </>
      );
      break;
    }
    case 'goals_pen': {
      const { tied, draw } = penaltyState(g);
      body = (
        <>
          {steppers(30, 'Goles')}
          {tied && rules.draws && (
            <ToggleRow
              checked={draw}
              onChange={(v) => set(v ? { pa: undefined, pb: undefined } : { pa: 0, pb: 0 })}
              label="Empate (sin penales)"
              hint="En grupos o liga al mejor de 1 se puede empatar."
            />
          )}
          {tied && !draw && (
            <div className="mt-1 rounded-2xl bg-surface-2 px-3 pt-2 pb-1">
              <p className="text-sm font-[650] text-fg-2">Penales</p>
              <SideStepRow name={names[0]}>
                <ScoreStepper value={g.pa} min={0} max={30} label={`Penales de ${names[0]}`} onChange={(n) => set({ pa: n ?? 0 })} />
              </SideStepRow>
              <SideStepRow name={names[1]}>
                <ScoreStepper value={g.pb} min={0} max={30} label={`Penales de ${names[1]}`} onChange={(n) => set({ pb: n ?? 0 })} />
              </SideStepRow>
            </div>
          )}
          {tied && !rules.draws && g.pa == null && g.pb == null && (
            <button type="button" onClick={() => set({ pa: 0, pb: 0 })} className="min-h-11 text-left text-meta font-[550] text-accent">
              Poner los penales
            </button>
          )}
        </>
      );
      break;
    }
    case 'points':
      body = steppers(300, 'Puntos');
      break;
    case 'win':
      body = (
        <>
          <WinnerPick value={g.w ?? null} names={names} onChange={(w) => set({ w })} />
          <p className="mt-2 text-[13px] text-muted">Kills (opcional)</p>
          {steppers(200, 'Kills', true)}
        </>
      );
      break;
    case 'fight': {
      const fight = fightChoices(rules, g);
      body = (
        <>
          <WinnerPick value={g.w ?? null} names={names} onChange={(w) => set(swapFor(g, w))} />
          {g.w && (
            <>
              <p className="mt-2 text-[13px] text-muted">Rondas (opcional)</p>
              <ChoiceChips label="Rondas del juego" items={fight.items} value={fight.value} onChange={(k) => set(fight.pick(k))} />
            </>
          )}
        </>
      );
      break;
    }
    case 'stocks': {
      const stocks = stockChoices(rules, g);
      body = (
        <>
          <WinnerPick value={g.w ?? null} names={names} onChange={(w) => set(swapFor(g, w))} />
          {g.w && (
            <>
              <p className="mt-2 text-[13px] text-muted">Vidas que le quedaron (opcional)</p>
              <ChoiceChips label="Vidas que le quedaron" items={stocks.items} value={stocks.value} onChange={(k) => set(stocks.pick(k))} />
            </>
          )}
        </>
      );
      break;
    }
    case 'crowns':
      body = (
        <>
          <WinnerPick value={g.w ?? null} names={names} onChange={(w) => set({ w })} />
          <p className="mt-2 text-[13px] text-muted">Coronas</p>
          {steppers(3, 'Coronas')}
        </>
      );
      break;
    case 'br':
      body = null;
      break;
  }

  return (
    <Card className={cx('px-4 pt-3 pb-3.5', error && 'border-danger/40')}>
      <div className="mb-1.5 flex min-h-11 items-center gap-2">
        <h3 className="flex-1 text-[15px] font-[650]">{`${word} ${index + 1}`}</h3>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Quitar ${word.toLowerCase()} ${index + 1}`}
            className="-mr-2 grid size-11 place-items-center rounded-full text-faint transition hover:text-danger focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Trash2 aria-hidden="true" className="size-[18px]" />
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2">{body}</div>
      {error && (
        <p role="alert" className="mt-2 text-[13.5px] font-medium text-danger">
          {error}
        </p>
      )}
    </Card>
  );
}
