/**
 * «Por confirmar» sin pantalla (docs/insignias.md §6.5): las hazañas de la liga que piden aval y los textos de cada una.
 * Salió de ReviewsPanel.tsx para que la app del teléfono haga lo mismo. Funciones puras, con pruebas en reviews.test.ts.
 */
import type { BadgeReview } from '../../lib/data/badges';
import { reviewModel, type ReviewModel } from './logic';

/** Largo máximo de la nota al no confirmar (el de la base). */
export const REVIEW_NOTE_MAX = 140;

/** Las de una liga, listas para mostrar (las que esta versión no conoce no salen). */
export const leagueReviews = (reviews: readonly BadgeReview[], lid: string): ReviewModel[] =>
  reviews
    .filter((r) => r.leagueId === lid)
    .map(reviewModel)
    .filter((m): m is ReviewModel => m !== null);

/** Debajo del nombre: el nivel (sin «Única») y la fecha. */
export const reviewSubline = (m: Pick<ReviewModel, 'levelName' | 'date'>): string => [m.levelName !== 'Única' ? m.levelName : null, m.date].filter(Boolean).join(' · ');

/** «Tarjeta firmada por 2 marcadores» (null sin marcadores). */
export const markersText = (n: number): string | null => (n > 0 ? `Tarjeta firmada por ${n} ${n === 1 ? 'marcador' : 'marcadores'}` : null);

/** El link al juego o la ronda donde pasó. */
export const reviewEventText = (m: Pick<ReviewModel, 'eventName'>): string => (m.eventName ? `Ver ${m.eventName}` : 'Ver el juego');

/** La pregunta antes de confirmar. */
export const approveQuestion = (m: Pick<ReviewModel, 'name' | 'review'>) => ({
  title: `¿Confirmar «${m.name}» de ${m.review.playerName}?`,
  message: 'Queda firme y se le avisa. Confírmala solo si lo viste o si la evidencia lo muestra.',
  confirmText: 'Confirmar',
});

/** Lo que se le explica a quien no la confirma. */
export const rejectText = (m: Pick<ReviewModel, 'name' | 'review'>): string =>
  `«${m.name}» de ${m.review.playerName} no va a contar. Se le dice que no se pudo confirmar, sin nada público.`;

/** El aviso al decidir. */
export const reviewDone = (ok: boolean): string => (ok ? 'Confirmada: ya es firme' : 'Listo: no cuenta');
