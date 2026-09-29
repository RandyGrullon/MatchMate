/**
 * Lo que decide la hoja «Reporte del torneo», sin React (se prueba con el navegador de mentira): qué premios lleva el
 * reporte, si el archivo se ofrece para compartir o se descarga de una vez, y qué sigue después del menú del teléfono.
 */
import type { LeagueBadge } from '../../lib/data/leagueBadges';
import type { TournamentPrize } from '../../lib/data/prizes';
import { reportFile } from '../../lib/report/file';
import { prizesFrom, withPrizes, type ReportFormat, type TournamentReport } from '../../lib/report/model';
import { cardModel } from '../../prizes/card';
import type { PrizeComp } from '../../prizes/catalog';
import { canShareFiles, downloadFile, shareFile, type ShareOutcome } from '../share/actions';

/** Los premios del reporte, como la tarjeta: en una liga con menores solo los ven los miembros. */
export const prizesHidden = (league: { hasMinors?: boolean }, member: unknown): boolean => !!league.hasMinors && !member;

/** Los premios que se leyeron para el reporte. */
export interface ReportPrizes {
  comp: Pick<PrizeComp, 'kind' | 'bowling' | 'racket'> | null;
  prize: TournamentPrize | null;
  designs: readonly LeagueBadge[];
  players: readonly { id: string; name: string }[];
  /** Escondidos (`prizesHidden`): el reporte sale sin ellos aunque se hayan leído. */
  hidden: boolean;
}

/** El reporte del deporte con los premios elegidos y entregados (sin premios, o escondidos: tal cual). */
export function reportWithPrizes(base: TournamentReport, p: ReportPrizes): TournamentReport {
  if (p.hidden || !p.comp || !p.prize) return base;
  const names = new Map(p.players.map((x) => [x.id, x.name] as const));
  return withPrizes(base, prizesFrom(cardModel(p.comp, p.prize, p.designs), (id) => names.get(id) ?? 'Jugador'));
}

/** El archivo del reporte: el del deporte (null = no hay nada que reportar: error) con los premios. */
export async function buildReport(
  format: ReportFormat,
  report: () => TournamentReport | null | Promise<TournamentReport | null>,
  prizes: ReportPrizes,
  opts: { generated: string; makeFile?: typeof reportFile },
): Promise<{ file: File; title: string }> {
  const base = await report();
  if (!base) throw new Error('Sin reporte');
  const full = reportWithPrizes(base, prizes);
  const file = await (opts.makeFile ?? reportFile)(format, full, { generated: opts.generated });
  return { file, title: full.title };
}

/** Lo del teléfono que usa la hoja (los ayudantes de share/actions). */
export interface ReportDevice {
  canShareFiles: (file: File) => boolean;
  shareFile: (file: File, text: string, title?: string) => Promise<ShareOutcome>;
  downloadFile: (blob: Blob, filename: string) => void;
}

const DEVICE: ReportDevice = { canShareFiles, shareFile, downloadFile };

/**
 * El archivo recién hecho: con menú para archivos (el teléfono) se ofrece «Compartir»; sin él (computadora, o el Excel
 * en Android) se descarga de una vez.
 */
export function offerReport(file: File, device: ReportDevice = DEVICE): { canShare: boolean } {
  const canShare = device.canShareFiles(file);
  if (!canShare) device.downloadFile(file, file.name);
  return { canShare };
}

/** Lo que sigue después del menú: compartido, se cierra la hoja; cancelado, nada; sin menú o con error, se descarga. */
export type ShareNext = 'close' | 'stay' | 'download';

export const afterShare = (outcome: ShareOutcome): ShareNext => (outcome === 'shared' ? 'close' : outcome === 'cancelled' ? 'stay' : 'download');

/** El texto que acompaña el archivo (el link va dentro: con archivos, varias apps ignoran `url`). */
export const shareText = (title: string, link: string): string => [`${title} · Reporte del torneo`, link].filter(Boolean).join('\n');

/** «Compartir»: el menú del teléfono con el archivo (WhatsApp) y lo que sigue. */
export async function shareReport(ready: { file: File; title: string }, link: string, device: ReportDevice = DEVICE): Promise<ShareNext> {
  return afterShare(await device.shareFile(ready.file, shareText(ready.title, link), ready.title));
}
