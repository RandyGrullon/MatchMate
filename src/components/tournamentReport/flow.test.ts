/**
 * Lo que decide la hoja «Reporte del torneo» con el navegador de mentira (como share/actions.test.ts): los premios
 * (escondidos en una liga con menores para quien no es miembro), la descarga de una vez sin menú para archivos, y qué
 * sigue después del menú del teléfono (compartido, cancelado, sin menú o con error).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LeagueBadge } from '../../lib/data/leagueBadges';
import type { PrizeSlot, TournamentPrize } from '../../lib/data/prizes';
import type { ReportFormat, TournamentReport } from '../../lib/report/model';
import type { PrizeComp } from '../../prizes/catalog';
import { canShareFiles, shareFile } from '../share/actions';
import { afterShare, buildReport, offerReport, prizesHidden, reportWithPrizes, shareReport, shareText, type ReportDevice, type ReportPrizes } from './flow';

afterEach(() => {
  vi.unstubAllGlobals();
});

const BASE: TournamentReport = {
  sport: 'bowling',
  title: 'Copa Aniversario',
  subtitle: 'Liga Norte · Boliche',
  facts: [],
  logoPath: null,
  final: true,
  notes: [],
  podiums: [],
  prizes: [],
  highlights: [],
  general: [],
  individual: [],
  sheets: [],
  fileName: 'Copa Aniversario',
};

const COMP: Pick<PrizeComp, 'kind' | 'bowling' | 'racket'> = { kind: 'bowling', bowling: { type: 'torneo', hcpPercent: 80, hasTeams: true } };
const slot = (id: string, category: PrizeSlot['category'], place: 1 | 2 | 3, over: Partial<PrizeSlot> = {}): PrizeSlot => ({
  id,
  category,
  division: '',
  label: '',
  place,
  badgeId: 'B1',
  title: '',
  winners: [],
  verified: true,
  deliveredAt: null,
  deliveredBy: null,
  editableUntil: null,
  updatedAt: '',
  ...over,
});
const PRIZE: TournamentPrize = {
  id: 'Z1',
  leagueId: 'L1',
  scope: 'evento',
  refId: 'E1',
  period: 'OCT 2026',
  closedAt: null,
  closedBy: null,
  createdAt: '',
  updatedAt: '',
  slots: [
    slot('s1', 'equipo', 1, { deliveredAt: '2026-10-13', winners: [{ ref: 't:T1', name: 'Strikers', teamId: 'T1', players: ['a', 'b'] }] }),
    slot('s2', 'individual', 1),
  ],
};
const PRIZES: ReportPrizes = {
  comp: COMP,
  prize: PRIZE,
  designs: [{ id: 'B1', name: 'Campeón', status: 'activa' } as LeagueBadge],
  players: [
    { id: 'a', name: 'Ana' },
    { id: 'b', name: 'Beto' },
  ],
  hidden: false,
};

const pdf = () => new File([new Uint8Array([37, 80, 68, 70])], 'reporte-copa-aniversario-2026-10-13.pdf', { type: 'application/pdf' });

/** El teléfono de mentira: los ayudantes de verdad (con `navigator` de mentira) y la descarga anotada. */
const device = () => {
  const downloads: string[] = [];
  const d: ReportDevice = { canShareFiles, shareFile, downloadFile: (_blob, name) => void downloads.push(name) };
  return { d, downloads };
};

describe('premios del reporte', () => {
  it('en una liga con menores solo los ven los miembros', () => {
    expect(prizesHidden({ hasMinors: true }, null)).toBe(true);
    expect(prizesHidden({ hasMinors: true }, { role: 'player' })).toBe(false);
    expect(prizesHidden({ hasMinors: false }, null)).toBe(false);
    expect(prizesHidden({}, null)).toBe(false);
  });

  it('los entregados con sus jugadores; lo no entregado, por entregar', () => {
    const r = reportWithPrizes(BASE, PRIZES);
    expect(r.prizes).toEqual([
      { title: 'Equipos (scratch)', rows: [{ place: 1, label: '1.er lugar', badge: 'Campeón', delivered: true, winners: ['Strikers · Ana y Beto'] }] },
      { title: 'Individual (handicap)', rows: [{ place: 1, label: '1.er lugar', badge: 'Campeón', delivered: false, winners: [] }] },
    ]);
    // El reporte de la pantalla no cambia.
    expect(BASE.prizes).toEqual([]);
  });

  it('escondidos (menores y no eres miembro), sin competencia o sin premios elegidos: el reporte tal cual', () => {
    expect(reportWithPrizes(BASE, { ...PRIZES, hidden: true })).toBe(BASE);
    expect(reportWithPrizes(BASE, { ...PRIZES, comp: null })).toBe(BASE);
    expect(reportWithPrizes(BASE, { ...PRIZES, prize: null })).toBe(BASE);
  });
});

describe('hacer el archivo', () => {
  const makeFile = vi.fn(async (format: ReportFormat, report: TournamentReport, _opts: { generated: string }) => new File([report.title], `reporte.${format === 'pdf' ? 'pdf' : 'xlsx'}`));

  it('el reporte del deporte (también con import) con los premios, y el título para compartir', async () => {
    const built = await buildReport('pdf', async () => BASE, PRIZES, { generated: '13 oct 2026', makeFile });
    expect(built.title).toBe('Copa Aniversario');
    expect(built.file.name).toBe('reporte.pdf');
    const [format, report, opts] = makeFile.mock.lastCall!;
    expect(format).toBe('pdf');
    expect(report.prizes.map((s) => s.title)).toEqual(['Equipos (scratch)', 'Individual (handicap)']);
    expect(opts).toEqual({ generated: '13 oct 2026' });
  });

  it('con los premios escondidos, el archivo sale sin ellos', async () => {
    await buildReport('excel', () => BASE, { ...PRIZES, hidden: true }, { generated: '13 oct 2026', makeFile });
    expect(makeFile.mock.lastCall![1].prizes).toEqual([]);
  });

  it('sin nada que reportar: error (la hoja dice «No se pudo»)', async () => {
    await expect(buildReport('pdf', () => null, PRIZES, { generated: '', makeFile })).rejects.toThrow('Sin reporte');
  });
});

describe('ofrecer el archivo', () => {
  it('en el teléfono con menú para archivos: «Compartir», sin descargar', () => {
    vi.stubGlobal('navigator', { share: vi.fn(), canShare: (d: ShareData) => !!d.files?.length });
    const { d, downloads } = device();
    expect(offerReport(pdf(), d)).toEqual({ canShare: true });
    expect(downloads).toEqual([]);
  });

  it('sin menú (computadora) o sin archivos (el Excel en Android): se descarga de una vez', () => {
    vi.stubGlobal('navigator', {});
    const { d, downloads } = device();
    expect(offerReport(pdf(), d)).toEqual({ canShare: false });
    vi.stubGlobal('navigator', { share: vi.fn(), canShare: () => false });
    expect(offerReport(pdf(), d)).toEqual({ canShare: false });
    expect(downloads).toEqual(['reporte-copa-aniversario-2026-10-13.pdf', 'reporte-copa-aniversario-2026-10-13.pdf']);
  });
});

describe('compartir (WhatsApp)', () => {
  const ready = () => ({ file: pdf(), title: 'Copa Aniversario' });

  it('el archivo con el texto y el link dentro; compartido, se cierra la hoja', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share, canShare: () => true });
    const f = ready();
    expect(await shareReport(f, 'https://matchmate.do/l/L1/e/E1', device().d)).toBe('close');
    expect(share).toHaveBeenCalledWith({ files: [f.file], text: 'Copa Aniversario · Reporte del torneo\nhttps://matchmate.do/l/L1/e/E1', title: 'Copa Aniversario' });
    expect(shareText('Copa', '')).toBe('Copa · Reporte del torneo');
  });

  it('cancelar no hace nada; sin menú o con error, se descarga para mandarlo', async () => {
    const abort = Object.assign(new Error('cancelado'), { name: 'AbortError' });
    vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(abort), canShare: () => true });
    expect(await shareReport(ready(), '', device().d)).toBe('stay');
    vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(new Error('NotAllowedError')), canShare: () => true });
    expect(await shareReport(ready(), '', device().d)).toBe('download');
    vi.stubGlobal('navigator', {});
    expect(await shareReport(ready(), '', device().d)).toBe('download');
    expect([afterShare('shared'), afterShare('cancelled'), afterShare('unsupported'), afterShare('failed')]).toEqual(['close', 'stay', 'download', 'download']);
  });
});
