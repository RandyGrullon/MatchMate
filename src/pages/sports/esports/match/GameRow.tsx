import type { ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { GAMES, type GameRecord, type SeriesRules } from '../../../../sports/esports';
import { Card, Select, cx } from '../../../../components/ui';
import { ToggleRow } from '../../racket/bits';
import { ChoiceChips, ScoreStepper, SideStepRow, WinnerPick } from '../parts';

/** «Mapa» o «Juego» (singular de `mapsWord`). */
export function gameWord(rules: Pick<SeriesRules, 'game'>): string {
  return GAMES[rules.game].mapsWord === 'mapas' ? 'Mapa' : GAMES[rules.game].mapsWord === 'partidas' ? 'Partida' : 'Juego';
}

/** Un mapa o juego vacío para la regla del juego. */
export function emptyGame(rules: Pick<SeriesRules, 'game'>): GameRecord {
  switch (GAMES[rules.game].scoring) {
    case 'val':
    case 'cs':
    case 'goals_ot':
    case 'goals_pen':
    case 'points':
    case 'crowns':
      return { a: 0, b: 0 };
    default:
      return {};
  }
}

/**
 * Lo que ya no aplica se va solo al cambiar el marcador: la prórroga de Rocket League si dejó de ser por 1 y los penales
 * del FC si dejó de ser empate (si no, el error no se podría arreglar: su campo ya no se ve).
 */
export function tidyGame(rules: Pick<SeriesRules, 'game'>, g: GameRecord): GameRecord {
  const scoring = GAMES[rules.game].scoring;
  const next = { ...g };
  const scored = typeof next.a === 'number' && typeof next.b === 'number';
  if (scoring === 'goals_ot' && next.ot && (!scored || Math.abs(next.a! - next.b!) !== 1)) delete next.ot;
  if (scoring === 'goals_pen' && scored && next.a !== next.b) {
    delete next.pa;
    delete next.pb;
  }
  return next;
}

/** Sin las claves vacías (la base no acepta otras ni `undefined`). */
export function cleanGame(g: GameRecord): GameRecord {
  const out: GameRecord = {};
  if (g.w === 1 || g.w === 2) out.w = g.w;
  if (typeof g.a === 'number') out.a = g.a;
  if (typeof g.b === 'number') out.b = g.b;
  if (typeof g.pa === 'number') out.pa = g.pa;
  if (typeof g.pb === 'number') out.pb = g.pb;
  if (g.ot === true) out.ot = true;
  if (g.map) out.map = g.map;
  return out;
}

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
      const close = typeof g.a === 'number' && typeof g.b === 'number' && Math.abs(g.a - g.b) === 1;
      body = (
        <>
          {steppers(99, 'Goles')}
          {close && <ToggleRow checked={g.ot === true} onChange={(v) => set({ ot: v ? true : undefined })} label="Prórroga (gol de oro)" />}
        </>
      );
      break;
    }
    case 'goals_pen': {
      const tied = typeof g.a === 'number' && g.a === g.b;
      const draw = tied && g.pa == null && g.pb == null;
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
      const rtw = rules.roundsToWin ?? meta.roundsToWin?.default ?? 2;
      const opts = Array.from({ length: rtw }, (_, i) => ({ key: `${rtw}-${i}`, label: `${rtw}-${i}` }));
      const current = g.w && typeof g.a === 'number' && typeof g.b === 'number' ? `${rtw}-${g.w === 1 ? g.b : g.a}` : 'none';
      body = (
        <>
          <WinnerPick value={g.w ?? null} names={names} onChange={(w) => set(swapFor(g, w))} />
          {g.w && (
            <>
              <p className="mt-2 text-[13px] text-muted">Rondas (opcional)</p>
              <ChoiceChips
                label="Rondas del juego"
                items={[...opts, { key: 'none', label: 'Sin detalle' }]}
                value={current}
                onChange={(k) => {
                  if (k === 'none') return set({ a: undefined, b: undefined });
                  const lost = Number(k.split('-')[1]);
                  set(g.w === 1 ? { a: rtw, b: lost } : { a: lost, b: rtw });
                }}
              />
            </>
          )}
        </>
      );
      break;
    }
    case 'stocks': {
      const top = rules.stocks ?? meta.stocks?.default ?? 3;
      const left = g.w === 1 ? g.a : g.w === 2 ? g.b : undefined;
      body = (
        <>
          <WinnerPick value={g.w ?? null} names={names} onChange={(w) => set(swapFor(g, w))} />
          {g.w && (
            <>
              <p className="mt-2 text-[13px] text-muted">Vidas que le quedaron (opcional)</p>
              <ChoiceChips
                label="Vidas que le quedaron"
                items={[...Array.from({ length: top }, (_, i) => ({ key: String(i + 1), label: String(i + 1) })), { key: 'none', label: 'Sin detalle' }]}
                value={left == null ? 'none' : String(left)}
                onChange={(k) => {
                  if (k === 'none') return set({ a: undefined, b: undefined });
                  const n = Number(k);
                  set(g.w === 1 ? { a: n, b: 0 } : { a: 0, b: n });
                }}
              />
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

/** Al cambiar quién ganó, el detalle (rondas o vidas) se da vuelta para que siga siendo del ganador. */
function swapFor(g: GameRecord, w: 1 | 2): Partial<GameRecord> {
  if (g.w && g.w !== w && typeof g.a === 'number' && typeof g.b === 'number') return { w, a: g.b, b: g.a };
  return { w };
}
