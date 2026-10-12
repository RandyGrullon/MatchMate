import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router';
import type { SquadLite, SquadRequestStatus } from '../../lib/data/squads';
import { squadPath } from '../../lib/data/squads';
import { loadTheme, scopedVarsCss, usesBrandAccent } from '../../lib/theme';
import { sportMeta } from '../../sports/registry';
import { LeagueLogo } from '../home/LeagueCard';
import { SportTint } from '../home/SportTint';
import { Badge, ListRow, cx } from '../ui';
import { LEAGUE_STATUS_TEXT, LEAGUE_STATUS_TONE, squadLine, squadTitle, validColor } from './logic';

/**
 * Piezas chicas de Equipos (sin datos propios: reciben lo que muestran): el color del equipo, su logo (o el tag en un
 * círculo de su color), la fila de un equipo, el estado de una liga y el chip del equipo en una publicación.
 */

// ---------- Color ----------

/** La clase con el color del equipo (`mm-squad-dc2626`). */
export const squadTintClass = (hex: string) => `mm-squad-${hex.slice(1).toLowerCase()}`;

/**
 * Todo lo de adentro toma el color del equipo (--accent y compañía, en claro y en oscuro, con el contraste de los
 * colores de los deportes). Sin color, el de su deporte.
 */
export function SquadTint({ color, sport, className, children }: { color: string | null | undefined; sport: string; className?: string; children: ReactNode }) {
  const hex = validColor(color);
  if (!hex || !usesBrandAccent(loadTheme())) {
    return (
      <SportTint sport={sport} className={className}>
        {children}
      </SportTint>
    );
  }
  const scope = squadTintClass(hex);
  const css = scopedVarsCss(`.${scope}`, hex);
  return (
    <div className={cx(css ? scope : null, className) || undefined}>
      {css && (
        <style href={scope} precedence="default">
          {css}
        </style>
      )}
      {children}
    </div>
  );
}

/** Tamaño de las letras del círculo (en el dibujo de 40 × 40) según cuántas son. */
const tagSize = (text: string) => (text.length <= 2 ? 15 : text.length === 3 ? 12.5 : text.length === 4 ? 10.5 : 9);

/**
 * El logo del equipo (imagen pública del bucket `logos`) o, sin logo, su tag en un círculo de su color (o el de su
 * deporte). 40 px por defecto; `className` cambia el tamaño (las letras crecen con él).
 */
export function SquadLogo({ squad, className }: { squad: Pick<SquadLite, 'logo' | 'name' | 'tag' | 'color' | 'sport'>; className?: string }) {
  const box = cx('size-10 rounded-full', className);
  const text = (squad.tag || squad.name.slice(0, 2)).toUpperCase().slice(0, 5) || '?';
  return (
    <SquadTint color={squad.color} sport={squad.sport} className="shrink-0">
      <LeagueLogo path={squad.logo} className={box}>
        <svg viewBox="0 0 40 40" aria-hidden="true" className={cx('block shrink-0 bg-accent text-accent-fg', box)}>
          <text x="20" y="20" dy="0.35em" textAnchor="middle" fontSize={tagSize(text)} fontWeight={750} letterSpacing="-0.01em" fill="currentColor">
            {text}
          </text>
        </svg>
      </LeagueLogo>
    </SquadTint>
  );
}

// ---------- Filas ----------

/** Un equipo en una lista: su logo, «Nombre [TAG]», su línea y lo de la derecha. Toda la fila abre el equipo. */
export function SquadRow({ squad, subtitle, trailing, dense }: { squad: SquadLite; subtitle?: ReactNode; trailing?: ReactNode; dense?: boolean }) {
  return (
    <ListRow
      dense={dense}
      to={squadPath(squad.id)}
      leading={<SquadLogo squad={squad} />}
      title={squadTitle(squad)}
      subtitle={subtitle ?? (squadLine(squad) || undefined)}
      trailing={trailing}
    />
  );
}

/**
 * Una fila con botones debajo (alineados con el texto, después del logo): la solicitud de un equipo (Aceptar ·
 * Rechazar) o una liga del equipo (Retirar, Pasar miembros nuevos). La línea entre filas sale igual que entre ListRow.
 */
export function RowWithActions({ row, actions }: { row: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mm-row relative">
      {row}
      {actions && <div className="flex flex-wrap gap-2 pr-[18px] pb-3 pl-5 min-[360px]:pl-[74px]">{actions}</div>}
    </div>
  );
}

/** «Pendiente» (ámbar), «Aceptado» (verde), «Rechazado» (rojo). */
export function LeagueStatusBadge({ status }: { status: SquadRequestStatus }) {
  return <Badge tone={LEAGUE_STATUS_TONE[status]}>{LEAGUE_STATUS_TEXT[status]}</Badge>;
}

// ---------- Publicaciones ----------

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/** El equipo de la publicación, en su color (o el de su deporte): lleva a su página. */
export function SquadChip({ squad, className }: { squad: Pick<SquadLite, 'id' | 'name' | 'tag' | 'color' | 'sport'>; className?: string }) {
  const color = validColor(squad.color) ?? sportMeta(squad.sport)?.color ?? 'var(--color-accent)';
  const style: CSSProperties = {
    color: `color-mix(in oklab, ${color} 78%, var(--color-fg))`,
    backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`,
  };
  return (
    <Link
      to={squadPath(squad.id)}
      style={style}
      title={`Ir a ${squad.name}`}
      data-squad-chip=""
      className={cx(
        "relative inline-flex max-w-[calc(100%-2rem)] items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-xs font-semibold after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] active:opacity-80",
        focusRing,
        className,
      )}
    >
      <span aria-hidden="true" className="shrink-0 font-bold tracking-[0.06em]">
        {squad.tag}
      </span>
      <span className="truncate">{squad.name}</span>
    </Link>
  );
}
