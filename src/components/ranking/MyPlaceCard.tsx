import { Card, cx } from '../ui';
import type { PlaceCopy } from './logic';

/**
 * Tarjeta de Lite que responde «¿en qué lugar estoy?» antes de leer la lista: «2.º · Vas 2.º de 6, con 195 · Pedro te
 * lleva 24 pinos» y la barra de lo tuyo contra lo del 1.º («Tú · 195» … «1.º · Pedro 219»). Si todavía no sales,
 * cuántos juegos te faltan («4/6»). En acento suave, sin sombra.
 */
export function MyPlaceCard({ copy, className }: { copy: PlaceCopy; className?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, copy.bar)) * 100);
  return (
    <Card soft className={cx('px-[22px] py-5', className)}>
      <section aria-label="Tu lugar en la tabla">
        <div className="flex items-center gap-[18px]">
          <b className="num shrink-0 text-[54px] leading-none font-[650] text-accent">{copy.big}</b>
          <div className="min-w-0">
            <p className="text-[17px] leading-[1.4] font-[650] tracking-[-0.01em]">{copy.title}</p>
            <p className="mt-[3px] text-[14.5px] leading-[1.4] text-fg-2">{copy.subtitle}</p>
          </div>
        </div>
        <div className="mt-4">
          <div aria-hidden="true" className="h-2 overflow-hidden rounded bg-accent/16">
            <div className="h-full rounded bg-accent" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-[7px] flex justify-between gap-3 text-[12.5px] leading-[1.4] font-[550] text-fg-2">
            <span>{copy.left}</span>
            {copy.right && <span className="truncate">{copy.right}</span>}
          </div>
        </div>
      </section>
    </Card>
  );
}
