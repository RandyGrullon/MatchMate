import type { ReactNode } from 'react';
import {
  OWNERSHIP_LABEL,
  PHASE_TEXT,
  RANK_SOURCE_LABEL,
  gameMeta,
  rankLabel,
  type GameId,
  type IdStatus,
  type Ownership,
  type Phase,
  type RankSource,
  type RankValue,
} from '../../sports/esports';
import type { EntryStatus } from '../../lib/data/esports';
import { LeagueLogo } from '../home/LeagueCard';
import { SportTint } from '../home/SportTint';
import { Badge, cx } from '../ui';

/**
 * Piezas chicas de las pantallas de esports (docs/esports.md §11.4), las mismas en el índice, la página de cada juego,
 * los equipos, los IDs de juego y el torneo. Sin datos propios: reciben lo que muestran.
 */

type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger';

// ---------- Monograma del juego ----------

/** 24, 32 y 48 px; las esquinas son la cuarta parte del lado en los tres (6, 8 y 12 px). */
const MARK_BOX = { sm: 'size-6 rounded-md', md: 'size-8 rounded-lg', lg: 'size-12 rounded-xl' } as const;
/** Radio de las esquinas en el dibujo de 48 × 48 (el mismo de la caja: un cuarto del lado). */
const MARK_RADIUS = 12;

/** Tamaño de las letras del monograma (en el dibujo de 48 × 48) según cuántas son: «FC» grande, «MLBB» más chico. */
export const monoFontSize = (mono: string): number => (mono.length <= 2 ? 21 : mono.length === 3 ? 16 : 12.5);

/**
 * El juego como un monograma en su color («VAL», «CS2», «RL»…), sin logos de marcas (D16): 24, 32 o 48 px. Las letras
 * son blancas (el catálogo garantiza 4.5:1 con cada color) y el lector de pantalla dice el nombre del juego.
 */
export function GameMark({ game, size = 'md', className }: { game: GameId; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const meta = gameMeta(game);
  const mono = meta?.mono ?? '?';
  return (
    <svg viewBox="0 0 48 48" role="img" aria-label={meta?.name ?? 'Juego'} className={cx('block shrink-0 overflow-hidden', MARK_BOX[size], className)}>
      <rect width="48" height="48" rx={MARK_RADIUS} fill={meta?.color ?? 'currentColor'} className={meta ? undefined : 'text-faint'} />
      <text
        x="24"
        y="24"
        dy="0.35em"
        textAnchor="middle"
        fontSize={monoFontSize(mono)}
        fontWeight={800}
        letterSpacing="-0.02em"
        fill="#fff"
        aria-hidden="true"
      >
        {mono}
      </text>
    </svg>
  );
}

// ---------- Rango, ID y estado ----------

/** «{rango} · Verificado» solo si salió verificado (la búsqueda de LoL); si no, «{rango} · Declarado». */
const rankSourceText = (source: RankSource): string => (source === 'verificado' ? RANK_SOURCE_LABEL.verificado : RANK_SOURCE_LABEL.declarado);

/** El texto del chip de rango: «Diamante 2 · Verificado», «Oro IV · Declarado» (sin fuente, solo el rango). '' si no hay rango. */
export function rankChipText(game: GameId, rank: RankValue | null | undefined, source?: RankSource): string {
  if (!rank) return '';
  const label = rankLabel(game, rank).trim();
  if (!label) return '';
  return source ? `${label} · ${rankSourceText(source)}` : label;
}

/** El rango con de dónde salió: «Diamante 2 · Verificado» (verde) u «Oro IV · Declarado» (neutro). Nada sin rango. */
export function RankChip({ game, rank, source, className }: { game: GameId; rank: RankValue | null | undefined; source?: RankSource; className?: string }) {
  const text = rankChipText(game, rank, source);
  if (!text) return null;
  return (
    <Badge tone={source === 'verificado' ? 'ok' : 'neutral'} className={className}>
      {text}
    </Badge>
  );
}

/**
 * De dónde sale el ID para el chip: `ownership` manda («login», «busqueda», «declarado»); sin él, por el estado (uno
 * confirmado sin más datos se comprobó con la búsqueda).
 */
const chipOwnership = (ownership?: Ownership, status?: IdStatus): Ownership =>
  ownership === 'login' || ownership === 'busqueda' || ownership === 'declarado' ? ownership : status === 'confirmado' ? 'busqueda' : 'declarado';

/** «Cuenta conectada» (entró con Epic, Steam o Riot), «Comprobado» (la búsqueda de Riot lo encontró) o «Declarado». */
export function idChipText(ownership?: Ownership, status?: IdStatus): string {
  return OWNERSHIP_LABEL[chipOwnership(ownership, status)];
}

/** El ID de juego de una persona: «Cuenta conectada» y «Comprobado» en verde, «Declarado» neutro. */
export function IdChip({ ownership, status }: { ownership?: Ownership; status?: IdStatus }) {
  const own = chipOwnership(ownership, status);
  return <Badge tone={own === 'declarado' ? 'neutral' : 'ok'}>{OWNERSHIP_LABEL[own]}</Badge>;
}

const ENTRY_TEXT: Record<EntryStatus, string> = {
  pending: 'Por aprobar',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  withdrawn: 'Se retiró',
  assigned: 'En un equipo',
};
const ENTRY_TONE: Record<EntryStatus, Tone> = { pending: 'warn', approved: 'ok', rejected: 'danger', withdrawn: 'neutral', assigned: 'neutral' };

/** El texto del estado de una inscripción («Check-in hecho» si ya lo hizo un aprobado). */
export const entryStatusText = (status: EntryStatus, checkedIn?: boolean): string => (status === 'approved' && checkedIn ? 'Check-in hecho' : ENTRY_TEXT[status]);

/** El estado de una inscripción: «Por aprobar», «Aprobado», «Check-in hecho», «Rechazado»… */
export function EntryStatusChip({ status, checkedIn }: { status: EntryStatus; checkedIn?: boolean }) {
  return <Badge tone={ENTRY_TONE[status]}>{entryStatusText(status, checkedIn)}</Badge>;
}

/** El tono de cada fase del torneo: lo abierto en verde, el check-in en ámbar, en curso en el color del deporte. */
export const PHASE_TONE: Record<Phase, Tone> = {
  soon: 'neutral',
  registration: 'ok',
  checkin: 'warn',
  closed: 'neutral',
  live: 'accent',
  finished: 'neutral',
  cancelled: 'danger',
};

/** La fase del torneo: «Inscripción abierta», «Check-in abierto», «En curso», «Terminado»… */
export function PhaseChip({ phase }: { phase: Phase }) {
  return <Badge tone={PHASE_TONE[phase]}>{PHASE_TEXT[phase]}</Badge>;
}

// ---------- Logo del equipo ----------

/** Lo que va en el círculo sin logo: el tag («TGR») o, sin tag, las dos primeras letras del nombre. */
export function teamInitials(name: string, tag: string): string {
  const t = tag.trim().toUpperCase();
  if (t) return t.slice(0, 5);
  const letters = name.trim().replace(/[^\p{L}\p{N}]+/gu, '');
  return letters.slice(0, 2).toUpperCase() || '?';
}

/** Tamaño de las letras del círculo (en el dibujo de 40 × 40) según cuántas son. */
const initialsSize = (text: string) => (text.length <= 2 ? 15 : text.length === 3 ? 12.5 : text.length === 4 ? 10.5 : 9);

/**
 * El logo del equipo (imagen pública del bucket `logos`, con `useLogo`) o, sin logo, su tag en un círculo en el color
 * del deporte. 40 px por defecto; `className` cambia el tamaño (las letras crecen con él).
 */
export function TeamLogo({ path, name, tag, className }: { path: string | null; name: string; tag: string; className?: string }) {
  const box = cx('size-10 rounded-full', className);
  const text = teamInitials(name, tag);
  return (
    <LeagueLogo path={path} className={box}>
      <svg viewBox="0 0 40 40" aria-hidden="true" className={cx('block shrink-0 bg-accent-soft text-accent', box)}>
        <text x="20" y="20" dy="0.35em" textAnchor="middle" fontSize={initialsSize(text)} fontWeight={750} letterSpacing="-0.01em" fill="currentColor">
          {text}
        </text>
      </svg>
    </LeagueLogo>
  );
}

// ---------- Color del deporte ----------

/** Todo lo de adentro en el violeta de esports (--accent y compañía), en claro y en oscuro. */
export function EsportsTint({ children }: { children: ReactNode }) {
  return <SportTint sport="esports">{children}</SportTint>;
}
