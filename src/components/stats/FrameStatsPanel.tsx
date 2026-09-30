import { useState } from 'react';
import { AlertTriangle, CircleDashed, Flame, Slash, Sparkles, Target, ThumbsUp, Zap } from 'lucide-react';
import {
  CONVERT_CUTS,
  LEFT_CUTS,
  MIN_PIN_RACKS,
  frameRates,
  hasPins,
  heatLevel,
  leaveName,
  leaveStats,
  pinInsights,
  pinReport,
  spareSummary,
  type PinReport,
  type Tally,
} from '../../lib/bowlingStats';
import type { GameFrames } from '../../lib/types';
import { Stat } from '../event/StandingsTab';
import { HeatLegend, PinHeatDeck, type HeatPin } from '../frames/PinHeatDeck';
import { Card, cx } from '../ui';

/** Lo que te quedó que se ve de una vez en la tabla (el resto con «Ver todos»). */
const LEAVES_SHOWN = 8;

type PinView = 'quedan' | 'spare';

const pct = (v: number | null) => (v == null ? '—' : `${v}%`);
const ofText = (t: Pick<Tally, 'converted' | 'faced'>) => `${t.converted} de ${t.faced}`;

/** Los pinos del mapa según lo que se mira: cuánto se queda parado cada uno, o cuánto spare se hace cuando queda. */
export function heatPins(report: PinReport, view: PinView): HeatPin[] {
  return report.pins.map((p) =>
    view === 'quedan'
      ? {
          pin: p.pin,
          value: p.leftPct == null ? null : `${p.leftPct}%`,
          level: heatLevel(p.leftPct, LEFT_CUTS),
          label: p.leftPct == null ? `Pino ${p.pin}: sin datos` : `Pino ${p.pin}: se queda parado el ${p.leftPct}% (${p.left} de ${report.racks})`,
        }
      : {
          pin: p.pin,
          value: p.convertedPct == null ? null : `${p.convertedPct}%`,
          level: heatLevel(p.convertedPct, CONVERT_CUTS),
          label:
            p.convertedPct == null
              ? `Pino ${p.pin}: todavía no le ha quedado para el spare`
              : `Pino ${p.pin}: spare el ${p.convertedPct}% de las veces que queda (${p.converted} de ${p.inLeave})`,
        },
  );
}

/**
 * Lo que sale de los cuadros: porcentajes (strikes, spares, abiertos), primera bola, racha y juegos limpios; y, con los
 * juegos anotados pino por pino, el mapa de calor de los pinos, los fuertes y débiles en palabras (solo a quien son
 * sus juegos) y los spares según lo que quedó. `frames` son los cuadros que cuentan (ver countedFrames); `games`, todos
 * los juegos que cuentan (para decir cuántos se anotaron por cuadros).
 */
export function FrameStatsPanel({
  frames,
  games,
  heading: Heading = 'h3',
  mine = true,
}: {
  frames: readonly GameFrames[];
  games: number;
  heading?: 'h2' | 'h3';
  /** Los juegos son de quien mira: fuertes y débiles en palabras y cómo anotar para ver más. */
  mine?: boolean;
}) {
  const [view, setView] = useState<PinView>('quedan');
  const [allLeaves, setAllLeaves] = useState(false);

  if (!frames.length) {
    if (!mine || !games) return null;
    return (
      <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-muted">
        Anota tus juegos por cuadros (Teclado) o pino por pino (Pines) para ver tu % de strikes y spares, qué pinos te quedan y cuánto
        conviertes cada spare.
      </p>
    );
  }

  const rates = frameRates(frames);
  const pinGames = frames.filter(hasPins);
  const report = pinReport(pinGames);
  const leaves = leaveStats(pinGames);
  const spares = spareSummary(leaves);
  const insights = mine ? pinInsights(report, spares) : null;
  const shownLeaves = allLeaves ? leaves : leaves.slice(0, LEAVES_SHOWN);
  const n = rates.games;

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2" aria-label="Por cuadros">
        <div>
          <Heading className="text-sm font-semibold text-muted">Por cuadros</Heading>
          <p className="text-xs text-muted">
            Con {n} {n === 1 ? 'juego anotado' : 'juegos anotados'} por cuadros{games > n ? ` (de ${games})` : ''}. Los que tienen solo el
            total no cuentan aquí.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat icon={<Zap className="size-4" />} label="Strikes" value={pct(rates.strikePct)} sub={`${rates.strikes} de ${rates.strikeChances}`} />
          <Stat icon={<Slash className="size-4" />} label="Spares" value={pct(rates.sparePct)} sub={`${rates.spares} de ${rates.spareChances}`} />
          <Stat icon={<CircleDashed className="size-4" />} label="Cuadros abiertos" value={pct(rates.openPct)} sub={`${rates.opens} de ${rates.frames}`} />
          <Stat
            icon={<Target className="size-4" />}
            label="Primera bola"
            value={rates.firstBall == null ? '—' : rates.firstBall.toLocaleString('es-DO')}
            sub="pinos por cuadro"
          />
          <Stat icon={<Flame className="size-4" />} label="Racha de strikes" value={String(rates.bestStrikeRun)} sub="seguidos en un juego" />
          <Stat
            icon={<Sparkles className="size-4" />}
            label="Juegos limpios"
            value={String(rates.cleanGames)}
            sub={`sin abiertos (de ${n})`}
          />
        </div>
      </section>

      {report.racks > 0 ? (
        <section className="flex flex-col gap-3" aria-label="Pino por pino">
          <div>
            <Heading className="text-sm font-semibold text-muted">Pino por pino</Heading>
            <p className="text-xs text-muted">
              Con {report.games} {report.games === 1 ? 'juego anotado' : 'juegos anotados'} pino por pino ({report.racks} primeras bolas).
            </p>
          </div>

          {insights && (insights.strengths.length > 0 || insights.weaknesses.length > 0) ? (
            <div className="flex flex-col gap-2">
              {insights.strengths.length > 0 && <Insights title="Tus fuertes" items={insights.strengths} tone="ok" />}
              {insights.weaknesses.length > 0 && <Insights title="A mejorar" items={insights.weaknesses} tone="warn" />}
            </div>
          ) : (
            mine &&
            report.racks < MIN_PIN_RACKS && (
              <p className="text-sm text-muted">Anota unos juegos más pino por pino y aquí te decimos tus fuertes y débiles.</p>
            )
          )}

          <Card className="flex flex-col gap-3 p-3">
            <div role="radiogroup" aria-label="Qué ver en los pinos" className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1 text-sm">
              {(
                [
                  ['quedan', 'Se queda parado'],
                  ['spare', 'Spare cuando queda'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={view === key}
                  onClick={() => setView(key)}
                  className={cx('min-h-11 rounded-lg px-2 font-medium transition', view === key ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg')}
                >
                  {label}
                </button>
              ))}
            </div>
            <PinHeatDeck
              pins={heatPins(report, view)}
              label={view === 'quedan' ? 'Cuánto se queda parado cada pino tras la primera bola' : 'Cuánto spare se hace cuando queda cada pino'}
            />
            <HeatLegend
              cuts={view === 'quedan' ? LEFT_CUTS : CONVERT_CUTS}
              caption={view === 'quedan' ? 'Más color: se queda parado más veces tras la primera bola' : 'Más color: más spares cuando queda ese pino'}
            />
          </Card>

          {leaves.length > 0 && (
            <div className="flex flex-col gap-2">
              <Heading className="text-sm font-semibold text-muted">Spares según lo que quedó</Heading>
              <div className="grid grid-cols-3 gap-2">
                <Stat className="px-3" label="Un pino" value={pct(spares.single.pct)} sub={ofText(spares.single)} />
                <Stat className="px-3" label="Sin splits" value={pct(spares.noSplits.pct)} sub={ofText(spares.noSplits)} />
                <Stat className="px-3" label="Splits" value={pct(spares.splits.pct)} sub={ofText(spares.splits)} />
              </div>
              <Card className="overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted">
                    <tr className="border-b border-line">
                      <th className="px-4 py-2 text-left font-medium">Quedó</th>
                      <th className="px-2 py-2 text-right font-medium">Spares</th>
                      <th className="px-4 py-2 text-right font-medium">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownLeaves.map((l) => (
                      <tr key={l.leave} className="border-b border-line last:border-0">
                        <td className="px-4 py-2">
                          <span className="font-medium">{leaveName(l.leave)}</span>
                          {l.split && (
                            <span className="ml-1.5 inline-flex h-5 items-center rounded-full border border-current px-1.5 text-[10px] text-muted">split</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {l.converted} de {l.faced}
                        </td>
                        <td className="px-4 py-2 text-right font-semibold tabular-nums">{Math.round((l.converted * 100) / l.faced)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {leaves.length > LEAVES_SHOWN && (
                  <button
                    type="button"
                    onClick={() => setAllLeaves((v) => !v)}
                    className="min-h-11 w-full border-t border-line text-sm font-medium text-accent hover:bg-surface-2"
                  >
                    {allLeaves ? 'Ver menos' : `Ver todos (${leaves.length})`}
                  </button>
                )}
              </Card>
            </div>
          )}
        </section>
      ) : (
        mine && (
          <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-muted">
            Anota pino por pino (Pines) para ver qué pinos te quedan, cuánto conviertes cada spare y tus fuertes y débiles.
          </p>
        )
      )}
    </div>
  );
}

function Insights({ title, items, tone }: { title: string; items: readonly string[]; tone: 'ok' | 'warn' }) {
  const Icon = tone === 'ok' ? ThumbsUp : AlertTriangle;
  return (
    <div className={cx('flex flex-col gap-1.5 rounded-xl px-3 py-2.5 text-sm', tone === 'ok' ? 'bg-ok-soft' : 'bg-warn-soft')}>
      <span className={cx('flex items-center gap-1.5 text-xs font-semibold', tone === 'ok' ? 'text-ok' : 'text-warn')}>
        <Icon className="size-3.5" aria-hidden="true" /> {title}
      </span>
      <ul className="flex flex-col gap-1 text-fg">
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}
