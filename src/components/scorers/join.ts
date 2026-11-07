/**
 * «Entrar para anotar» de /anotar/<código> (src/pages/ScorerJoinPage.tsx en la web y movil/src/app/anotar/[code].tsx en
 * el teléfono): qué sigue después de llamar a joinAsScorer. Sin pantalla ni navegación: cada lado hace lo suyo con lo
 * que devuelve. Prueba en join.test.ts.
 */
import { isScorerRateLimited, scorerJoinErrorText, type ScorerJoinResult, type ScorerLinkInfo, type ScorerLinkPreview } from '../../lib/data/scorers';
import { joinedScorerText } from './logic';

/** Qué sigue después de «Entrar para anotar»: ir al torneo (con el aviso), el vacío del link, o el error en palabras. */
export type ScorerJoinOutcome =
  | { kind: 'go'; path: string; toast: string | null }
  | { kind: 'dead'; preview: Exclude<ScorerLinkPreview, ScorerLinkInfo> }
  | { kind: 'error'; message: string };

/**
 * «Entrar para anotar» (a mano o solo al volver de /login): llama a `join` (joinAsScorer) una vez y dice qué sigue:
 * ir al torneo (joined, upgraded o already), el vacío del link que ya no sirve, que no sirve para esta cuenta o que
 * hubo muchos intentos, o el error en palabras (la tarjeta sigue ahí para intentarlo otra vez).
 */
export async function enterWithLink(
  code: string,
  info: Pick<ScorerLinkInfo, 'title'>,
  join: (code: string) => Promise<ScorerJoinResult>,
): Promise<ScorerJoinOutcome> {
  try {
    const r = await join(code);
    if (!r) return { kind: 'dead', preview: null };
    if (r.status === 'joined' || r.status === 'upgraded' || r.status === 'already') {
      return { kind: 'go', path: r.path, toast: joinedScorerText(r.status, r.title || info.title) };
    }
    return { kind: 'dead', preview: { status: r.status } };
  } catch (e) {
    console.warn('[anotar] entrar', e);
    if (isScorerRateLimited(e)) return { kind: 'dead', preview: { status: 'rate_limited' } };
    return { kind: 'error', message: scorerJoinErrorText(e) };
  }
}

/** El texto del link que no sirve según cómo vino la vista previa (null: el código no existe). */
export const deadStatusOf = (preview: ScorerLinkPreview): Exclude<NonNullable<ScorerLinkPreview>['status'], 'ok'> | null =>
  preview && preview.status !== 'ok' ? preview.status : null;

/** Las filas de la tarjeta de /anotar/<código>: qué haces, dónde (si no es un torneo sin liga) y hasta cuándo sirve. */
export function scorerJoinLines(reach: string | null, day: string): { key: 'que' | 'donde' | 'hasta'; label: string; value: string }[] {
  return [
    { key: 'que' as const, label: 'Qué haces', value: 'Anotas los resultados. No te inscribe como jugador.' },
    ...(reach ? [{ key: 'donde' as const, label: 'Dónde', value: reach }] : []),
    ...(day ? [{ key: 'hasta' as const, label: 'Hasta cuándo sirve', value: `El link vence el ${day}` }] : []),
  ];
}

/** La línea de abajo del nombre: «en Copa Aniversario» si el torneo no se llama como la liga. */
export const scorerJoinSub = (info: Pick<ScorerLinkInfo, 'title' | 'name'>): string | null => (info.title && info.title !== info.name ? `en ${info.title}` : null);
