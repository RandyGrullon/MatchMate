/**
 * Lo que deciden las piezas de «Premios del torneo» (docs/premios-torneo.md §6): la tarjeta (PrizesCard), «Elegir
 * premios» (PrizePicker) y «Entregar premios» (AwardPrizesSheet). Qué se muestra, con qué texto y cuándo, sin React ni
 * pantalla: lo usan las de la web (src/components/prizes/*.tsx) y las de la app (movil/src/components/prizes). Las
 * reglas de fondo están en src/prizes/ (card.ts, setup.ts, award.ts); si se ve la tarjeta, en gate.ts.
 */
import type { LeagueBadge } from '../../lib/data/leagueBadges';
import { anyDelivered, PRIZE_PERIOD_MAX, type PodiumUnit, type PrizePlace, type PrizeSlotInput, type PrizeWinner, type TournamentPrize } from '../../lib/data/prizes';
import { namesLine, type SlotPick, type SlotPlan } from '../../prizes/award';
import type { CardModel, CardRow, CorrectionWindow } from '../../prizes/card';
import { bowlingRuleText, type PrizeCategoryDef, type PrizeComp } from '../../prizes/catalog';
import { PLACE_TEMPLATE, setupPayload, setupProblem, templateDesign, type SetupRows } from '../../prizes/setup';
import { dayText } from '../badges/maker/design';
import { badgeTextError, cleanBadgeText, textLength } from '../badges/text';

// ---------- La tarjeta ----------

/** La tarjeta no se dibuja: sin premios y sin poder elegirlos, o con premios que quien mira no ve (diseños escondidos). */
export function cardHidden(model: Pick<CardModel, 'state' | 'sections'>, canPick: boolean): boolean {
  if (model.state === 'sin_premios') return !canPick;
  return !model.sections.length;
}

/**
 * Debajo de un lugar sin entregar, quién va ganando según el teléfono: «Por ahora: Equipo Uno (1 158) · …» (una línea
 * que se corta) o «Por ahora, nadie en este lugar.». null si no hay nada que decir.
 */
export function currentLine(row: Pick<CardRow, 'delivered' | 'current'>): { text: string; truncate: boolean } | null {
  if (row.delivered || !row.current) return null;
  const { status, units } = row.current;
  if (status === 'listo' && units.length) return { text: `Por ahora: ${units.map((u) => (u.detail ? `${u.name} (${u.detail})` : u.name)).join(' · ')}`, truncate: true };
  if (status === 'vacio') return { text: 'Por ahora, nadie en este lugar.', truncate: false };
  return null;
}

/** Un ganador que es un jugador solo (sin equipo ni club): va su nombre, sin «Equipo · » delante. */
export const soloWinner = (w: Pick<PrizeWinner, 'players' | 'teamId' | 'ref'>): boolean => w.players.length === 1 && !w.teamId && !w.ref.startsWith('c:');

/** El nombre de cada jugador de un ganador (el de un jugador solo, el que se guardó al entregar). */
export const winnerPlayerName = (w: PrizeWinner, playerId: string, nameOf: (id: string) => string): string => (soloWinner(w) ? w.name || nameOf(playerId) : nameOf(playerId));

/** Con más de 6 jugadores no van uno por uno: «Ana, Luis, Pedro, Rosa, Juan y 3 más». null si van uno por uno. */
export const winnerShortLine = (w: PrizeWinner, nameOf: (id: string) => string): string | null => (w.players.length > 6 ? namesLine(w.players.map(nameOf), 5) : null);

/** Lo que va antes del jugador `i` de `n` en «Ana, Luis y Pedro». */
export const nameJoiner = (i: number, n: number): string => (i === 0 ? '' : i === n - 1 ? ' y ' : ', ');

export const PODIUM_CHANGED_TEXT = 'El podio cambió: revisa los premios.';

/** Lo de abajo de la tarjeta para quien elige o entrega: avisos, el botón principal y los grises. */
export interface AdminBarView {
  /** Ya se entregó algo (el botón es «Revisar premios»). */
  delivered: boolean;
  /** «El podio cambió: revisa los premios.» */
  podiumWarning: boolean;
  /** Plazos y quién corrige, en orden. */
  notes: string[];
  /** «Entregar premios» o «Revisar premios» (null = no puede entregar ni corregir). */
  award: { label: 'Entregar premios' | 'Revisar premios'; quiet: boolean; disabled: boolean } | null;
  /** «Cambiar premios». */
  change: boolean;
  /** «Cerrar premios». */
  close: boolean;
  /** Con el botón apagado: «Se entregan cuando termine el torneo.» */
  wait: string | null;
}

export function adminBarView(p: {
  model: Pick<CardModel, 'state' | 'allDelivered' | 'podiumChanged'>;
  correction: CorrectionWindow;
  tz?: string;
  canPick: boolean;
  canDeliver: boolean;
  isOwner: boolean;
  ready: boolean;
  waitText?: string;
}): AdminBarView {
  const { model } = p;
  const closed = model.state === 'cerrados';
  const delivered = model.state === 'entregados' || closed;
  // Cerrados (o con todos los lugares pasados de sus 14 días): solo el dueño corrige. Un lugar sin entregar se sigue
  // entregando aunque otro ya se venció (la base lo revisa lugar por lugar).
  const { open, deadline, someExpired } = p.correction;
  const canCorrect = p.canDeliver && (p.isOwner || open);
  const notes: string[] = [];
  if (delivered && open && deadline) notes.push(`Puedes corregir hasta el ${dayText(deadline, p.tz)}.`);
  if (delivered && !open) notes.push(p.isOwner ? 'Solo tú puedes corregirlos.' : 'Solo el dueño puede corregirlos.');
  if (delivered && open && someExpired) notes.push(p.isOwner ? 'Lo entregado hace más de 14 días solo lo corriges tú.' : 'Lo entregado hace más de 14 días solo lo corrige el dueño.');
  return {
    delivered,
    podiumWarning: model.podiumChanged && canCorrect,
    notes,
    // Un solo botón principal (Entregar, o Revisar si falta alguno); lo demás en gris. Con algo entregado ya es
    // «Revisar» (un lugar que se quedó sin nadie nunca se entrega).
    award: canCorrect ? { label: delivered ? 'Revisar premios' : 'Entregar premios', quiet: delivered && model.allDelivered, disabled: !p.ready && !delivered } : null,
    change: p.canPick && !closed,
    close: p.canDeliver && delivered && open,
    wait: !p.ready && !delivered && p.canDeliver && p.waitText ? `${p.waitText}.` : null,
  };
}

/** «Cerrar premios»: lo que se pregunta antes. */
export const CLOSE_PRIZES_CONFIRM = {
  title: '¿Cerrar los premios?',
  message: 'Desde ahora solo el dueño puede corregirlos. No se puede deshacer.',
  confirmText: 'Cerrar premios',
} as const;

// ---------- Elegir premios ----------

export const pickerTitle = (prize: TournamentPrize | null): string => (prize ? 'Cambiar premios' : 'Elegir premios');

/** El lugar de una clave `categoría|división|lugar`. */
export const placeOfKey = (key: string): PrizePlace => (Number(key.split('|')[2]) || 1) as PrizePlace;

/** La cinta como se guarda (limpia y en mayúsculas) y lo que tiene mal (null si nada). */
export function periodCheck(period: string): { clean: string; error: string | null } {
  const clean = cleanBadgeText(period).toUpperCase();
  return { clean, error: textLength(clean) > PRIZE_PERIOD_MAX ? `La cinta lleva hasta ${PRIZE_PERIOD_MAX} letras.` : badgeTextError(period) };
}

/** La ayuda debajo de «Cinta de las insignias». */
export const periodHint = (locked: boolean): string =>
  locked ? 'Ya se entregaron premios: la cinta no cambia.' : 'La cinta de abajo de las insignias: el mes del torneo. Hasta 10 letras.';

/** Las letras de la cinta (el contador «3/10»). */
export const periodCount = (period: string): number => textLength(cleanBadgeText(period));

/** Prender o apagar un lugar: al prenderlo sin insignia, la de plantilla de ese lugar («Campeón» en el 1.º), si hay. */
export function toggleRow(rows: SetupRows, key: string, on: boolean, designs: readonly LeagueBadge[]): SetupRows {
  return { ...rows, [key]: { on, badgeId: rows[key]?.badgeId ?? (on ? (templateDesign(designs, PLACE_TEMPLATE[placeOfKey(key)])?.id ?? null) : null) } };
}

/** «Los premios siguen esta regla: Equipos por scratch, Individual con handicap.» (solo el boliche). */
export function ruleLine(comp: Pick<PrizeComp, 'kind' | 'bowling'>): string | null {
  const rule = comp.kind === 'bowling' && comp.bowling ? bowlingRuleText(comp.bowling) : null;
  return rule ? [rule.rule, rule.note].filter(Boolean).join(' ') : null;
}

/** El id de la fila de un lugar (las claves llevan «|»). */
export const slotFieldId = (key: string): string => `premio-${key.replace(/[^A-Za-z0-9]/g, '-')}`;

/** Lo que pasa al tocar «Guardar premios». */
export type SaveStep = { kind: 'error'; text: string } | { kind: 'confirm'; slots: PrizeSlotInput[] } | { kind: 'save'; slots: PrizeSlotInput[] };

/**
 * «Guardar premios»: lo que falta (la cinta, un lugar prendido sin insignia), preguntar antes de quitar todos los
 * premios (sin lugares prendidos y con premios guardados) o guardar el conjunto completo.
 */
export function saveStep(sections: readonly PrizeCategoryDef[], rows: SetupRows, prize: TournamentPrize | null, periodError: string | null): SaveStep {
  const problem = periodError ?? setupProblem(sections, rows);
  if (problem) return { kind: 'error', text: problem };
  const slots = setupPayload(sections, rows, prize);
  if (!slots.length) return prize ? { kind: 'confirm', slots } : { kind: 'error', text: 'Prende al menos un lugar y elige su insignia.' };
  return { kind: 'save', slots };
}

/** Antes de quitar todos los premios. */
export const REMOVE_PRIZES_CONFIRM = {
  title: '¿Quitar los premios del torneo?',
  message: 'Ningún lugar se lleva insignia. Los puedes volver a elegir cuando quieras.',
  confirmText: 'Quitar premios',
  danger: true,
} as const;

/** El aviso al guardar. */
export const savedPrizesText = (saved: TournamentPrize | null): string => (saved ? 'Premios guardados' : 'Quitaste los premios del torneo');

/** El aviso al crear un diseño de plantilla: «“Campeón” está lista». */
export const designReadyText = (name: string): string => `«${name}» está lista`;

/** Un diseño elegido que se archivó. */
export const archivedHint = (d: Pick<LeagueBadge, 'status'>): string | null => (d.status !== 'activa' ? 'Archivada: elige otra o actívala' : null);

// ---------- Entregar premios ----------

export const awardTitle = (prize: Pick<TournamentPrize, 'slots'>): string => (anyDelivered(prize) ? 'Revisar premios' : 'Entregar premios');

/** El botón de abajo: «Corregir» si alguien ya tiene algún premio; si no, «Entregar». */
export const awardButtonLabel = (plans: readonly SlotPlan[]): 'Corregir' | 'Entregar' => (plans.some((p) => p.holders.length > 0) ? 'Corregir' : 'Entregar');

/** Los nombres de los jugadores de la liga y los que trae el podio (alguien que ya no está en la lista). */
export function awardNames(players: readonly { id: string; name: string }[], plans: readonly SlotPlan[]): Map<string, string> {
  const m = new Map(players.map((p) => [p.id, p.name] as const));
  for (const p of plans) for (const u of p.units) for (const x of u.players) if (!m.has(x.id)) m.set(x.id, x.name);
  return m;
}

/** Cuando la base dice que el podio cambió mientras se miraba: se vuelve a cargar solo y se dice esto. */
export const PODIUM_RETRY_TEXT = 'El podio cambió: revísalo y vuelve a entregar.';

/** El nombre de una unidad del podio: el del equipo, o sus jugadores. */
export const unitTitle = (u: Pick<PodiumUnit, 'name' | 'players'>): string => u.name || namesLine(u.players.map((x) => x.name));

/** Se ven los jugadores de cada unidad (para marcarlos). */
export const showUnits = (plan: Pick<SlotPlan, 'units' | 'status'>): boolean => plan.units.length > 0 && (plan.status === 'listo' || plan.status === 'empate_multiple');

/** Debajo de «Entregar este lugar» apagado: a quién se le quita. */
export const removeHint = (plan: Pick<SlotPlan, 'holders'>, pick: SlotPick | undefined, nameOf: (id: string) => string): string | undefined =>
  !pick?.on && plan.holders.length ? `Se le quita a ${namesLine(plan.holders.map(nameOf))}.` : undefined;

export const NOTIFY_LABEL = 'Avisar a los ganadores';
export const NOTIFY_HINT = 'Les llega una notificación con su insignia.';
