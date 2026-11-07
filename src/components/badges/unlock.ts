/**
 * El aviso al ganar una insignia sin pantalla (docs/insignias.md §6.4): los textos de cada una, la pregunta de las
 * privadas y cuándo se puede compartir. Salió de UnlockModal.tsx para que la app del teléfono haga lo mismo. Funciones
 * puras, con pruebas en unlock.test.ts.
 */
import { levelLine, type UnlockItem, type UnlockPlan, type YearRecapModel } from './logic';

/** Cuántas del historial se dibujan en el aviso (las demás: «y 20 más»). */
export const HISTORY_SHOWN = 12;

/** ¿Es una automática privada por defecto que todavía no se mostró? (`shown`: las que ya se contestaron). */
export const isPrivateUnlock = (it: UnlockItem, shown?: ReadonlySet<string>): boolean => it.kind === 'app' && it.view.award.hidden && !shown?.has(it.id);

/** El título, la línea de abajo y la liga de una insignia del aviso. */
export function unlockHeader(it: UnlockItem): { title: string; line: string; where: string | null } {
  if (it.kind === 'liga') return { title: `${it.view.leagueName} te dio una insignia`, line: it.view.givenBy, where: null };
  return { title: '¡Te ganaste una insignia!', line: levelLine(it.view), where: it.view.leagueName };
}

/** «Te dimos 12 insignias por tu historial». */
export const historyTitle = (n: number): string => `Te dimos ${n} ${n === 1 ? 'insignia' : 'insignias'} por tu historial`;

/** Debajo del carrusel: «y 3 más · 12 por tu historial» (null si no hay nada más). */
export function unlockMoreLine(plan: Pick<UnlockPlan, 'more' | 'history'>): string | null {
  if (!(plan.more > 0 || plan.history.length > 0)) return null;
  return [plan.more > 0 ? `y ${plan.more} más` : null, plan.history.length ? `${plan.history.length} por tu historial` : null].filter(Boolean).join(' · ');
}

/** Los tres números del resumen del año (los que trae el motor). */
export function recapFacts(recap: YearRecapModel): { n: number; label: string }[] {
  return [
    { n: recap.days, label: recap.days === 1 ? 'día jugado' : 'días jugados' },
    { n: recap.sports, label: recap.sports === 1 ? 'deporte' : 'deportes' },
    { n: recap.months, label: recap.months === 1 ? 'mes activo' : 'meses activos' },
  ].filter((f): f is { n: number; label: string } => f.n !== null);
}

/** ¿Se puede compartir la que se ve? Una privada, solo si ya se mostró en el perfil desde el aviso. */
export const canShareUnlock = (current: UnlockItem | undefined, revealed: ReadonlySet<string>): boolean =>
  !!current && !(current.kind === 'app' && current.view.award.hidden && !revealed.has(current.id));

/** «Ver mis insignias» abre esa si es una sola (y automática); si no, la vitrina. */
export const unlockTarget = (plan: Pick<UnlockPlan, 'items'>): string | undefined =>
  plan.items.length === 1 && plan.items[0].kind === 'app' ? plan.items[0].id : undefined;
