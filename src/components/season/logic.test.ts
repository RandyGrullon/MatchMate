import { describe, expect, it } from 'vitest';
import type { Season } from '../../lib/seasons';
import {
  awardsArg,
  awardsProblem,
  awardees,
  initialAwards,
  makeSnapshot,
  matchDay,
  newOtherAward,
  newSeasonDefaults,
  newSeasonProblem,
  parseRef,
  parseSnapshot,
  pastSeasonTeams,
  playerRef,
  podiumRefs,
  seasonDates,
  seasonMatches,
  seasonName,
  shortDay,
  snapshotTable,
  SNAPSHOT_MAX_ROWS,
  teamRef,
  teamsOfSeason,
  withRank,
  withStartDate,
  type AwardDraft,
  type SeasonSnapshot,
} from './logic';

const season = (p: Partial<Season> & Pick<Season, 'id' | 'startsOn'>): Season => ({
  name: `Temporada ${p.startsOn.slice(0, 4)}`,
  endsOn: null,
  status: 'active',
  closedAt: null,
  closedBy: null,
  standings: null,
  awards: [],
  playoffs: [],
  ...p,
});

const TZ = 'America/Santo_Domingo';

describe('de qué temporada es cada partido y equipo', () => {
  it('el día del partido es el de su hora en la zona de la liga; sin hora, cuándo se creó', () => {
    // 1:30 a. m. en UTC del 2 de marzo = 9:30 p. m. del 1 de marzo en Santo Domingo.
    expect(matchDay({ scheduledAt: '2026-03-02T01:30:00.000Z' }, TZ)).toBe('2026-03-01');
    expect(matchDay({ scheduledAt: null, createdAt: '2026-05-10T15:00:00.000Z' }, TZ)).toBe('2026-05-10');
    expect(matchDay({ scheduledAt: null, createdAt: { toMillis: () => Date.parse('2026-05-10T15:00:00.000Z') } }, TZ)).toBe('2026-05-10');
    expect(matchDay({ scheduledAt: null, createdAt: null }, TZ)).toBeNull();
  });

  it('los partidos de la temporada: por fecha; la activa no tiene fin; sin temporada, todos', () => {
    const ms = [
      { id: 'viejo', scheduledAt: '2025-11-20T20:00:00.000Z' },
      { id: 'nuevo', scheduledAt: '2026-02-10T20:00:00.000Z' },
      { id: 'despues', scheduledAt: '2026-12-20T20:00:00.000Z' },
      { id: 'sin-dia', scheduledAt: null, createdAt: null },
    ];
    const s2025 = season({ id: 's25', startsOn: '2025-01-01', endsOn: '2025-12-31', status: 'closed' });
    const s2026 = season({ id: 's26', startsOn: '2026-01-01', endsOn: '2026-11-30' });
    expect(seasonMatches(ms, s2025, TZ).map((m) => m.id)).toEqual(['viejo']);
    // La activa cuenta también lo que pasa de su fin previsto y lo que no tiene día.
    expect(seasonMatches(ms, s2026, TZ).map((m) => m.id)).toEqual(['nuevo', 'despues', 'sin-dia']);
    expect(seasonMatches(ms, null, TZ)).toHaveLength(4);
  });

  it('los equipos de la temporada; en la de ahora también los que no dicen de cuál son', () => {
    const teams = [
      { id: 'a', seasonId: 's1' },
      { id: 'b', seasonId: 's2' },
      { id: 'c', seasonId: null },
      { id: 'd' },
    ];
    expect(teamsOfSeason(teams, { id: 's2' }, true).map((t) => t.id)).toEqual(['b', 'c', 'd']);
    expect(teamsOfSeason(teams, { id: 's1' }, false).map((t) => t.id)).toEqual(['a']);
    expect(teamsOfSeason(teams, null, true)).toHaveLength(4);
  });

  it('una temporada pasada: sus equipos y los que jugaron sus partidos (las de antes de las temporadas no tienen equipos)', () => {
    const teams = [
      { id: 'a', seasonId: 's1' },
      { id: 'b', seasonId: 's2' },
      { id: 'c', seasonId: 's2' },
      { id: 'd', seasonId: null },
    ];
    const played = [{ sides: [{ teamId: 'b' }, { teamId: 'd' }] }, { sides: [{ teamId: null }, { teamId: undefined }] }];
    expect(pastSeasonTeams(teams, { id: 's2023' }, played).map((t) => t.id)).toEqual(['b', 'd']);
    expect(pastSeasonTeams(teams, { id: 's1' }, played).map((t) => t.id)).toEqual(['a', 'b', 'd']);
    expect(pastSeasonTeams(teams, { id: 's1' }, [])).toEqual([{ id: 'a', seasonId: 's1' }]);
  });
});

const snap = (rows: { rank: number; teamId?: string; playerId?: string; name: string }[]): SeasonSnapshot =>
  makeSnapshot('basketball', [{ key: 'tabla', title: 'Tabla', nameLabel: 'Equipo', columns: [{ label: 'Pts' }], rows: rows.map((r) => ({ ...r, values: [0] })) }], 0);

describe('la tabla que se guarda al cerrar', () => {
  it('snapshotTable: columnas, valores y a quién es cada fila; makeSnapshot quita las vacías y pone topes', () => {
    const t = snapshotTable(
      { key: 'k', title: 'Tabla', nameLabel: 'Equipo' },
      [
        { rank: 1, id: 'T1', pts: 9 },
        { rank: 2, id: 'T2', pts: 4 },
      ],
      [
        { label: 'PJ', title: 'Partidos', value: () => 3 },
        { label: 'Pts', wide: true, value: (r) => r.pts },
      ],
      (r) => ({ name: r.id === 'T1' ? 'Tigres' : 'Leones', teamId: r.id }),
    );
    expect(t.columns).toEqual([{ label: 'PJ', title: 'Partidos' }, { label: 'Pts', wide: true }]);
    expect(t.rows[0]).toEqual({ rank: 1, name: 'Tigres', teamId: 'T1', values: [3, 9] });
    const many = { ...t, key: 'm', rows: Array.from({ length: 100 }, (_, i) => ({ rank: i + 1, name: `J${i}`, values: [] })) };
    const s = makeSnapshot('golf', [t, { ...t, key: 'vacia', rows: [] }, many], Date.parse('2026-09-01T00:00:00Z'));
    expect(s).toMatchObject({ v: 1, sport: 'golf', at: '2026-09-01T00:00:00.000Z' });
    expect(s.tables.map((x) => x.key)).toEqual(['k', 'm']);
    expect(s.tables[1].rows).toHaveLength(SNAPSHOT_MAX_ROWS);
  });

  it('parseSnapshot: lo que no se entiende se descarta; sin tablas, null', () => {
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot({ tables: 'x' })).toBeNull();
    expect(parseSnapshot({ tables: [{ columns: [], rows: [] }] })).toBeNull();
    const s = parseSnapshot({
      v: 1,
      sport: 'football',
      tables: [{ key: 't', title: 'Tabla', nameLabel: 'Equipo', columns: [{ label: 'Pts' }, { label: 'G', wide: true }], rows: [{ name: 'Tigres', teamId: 'T1', values: [7, { mal: 1 }] }, 'basura'] }],
    });
    expect(s?.tables[0].rows).toEqual([{ rank: 1, name: 'Tigres', teamId: 'T1', values: [7, ''] }]);
    expect(s?.tables[0].columns[1]).toEqual({ label: 'G', wide: true });
  });

  it('withRank: los empatados comparten puesto', () => {
    expect(withRank([{ v: 10 }, { v: 10 }, { v: 7 }], (r) => r.v).map((r) => r.rank)).toEqual([1, 1, 3]);
  });

  it('awardees: por nombre y sin repetir', () => {
    expect(awardees([{ id: 'b', name: 'Beto' }, { id: 'a', name: 'Ana' }, { id: 'b', name: 'Beto' }]).map((a) => a.id)).toEqual(['a', 'b']);
  });
});

describe('premios', () => {
  it('a quién va: t:<equipo> o p:<jugador>', () => {
    expect(parseRef(teamRef('T1'))).toEqual({ teamId: 'T1' });
    expect(parseRef(playerRef('P1'))).toEqual({ playerId: 'P1' });
    expect(parseRef('')).toBeNull();
    expect(parseRef('x:1')).toBeNull();
  });

  it('el podio sale de la primera tabla, en su orden (sin las filas que no son de nadie)', () => {
    const s = snap([
      { rank: 2, teamId: 'T2', name: 'Leones' },
      { rank: 1, teamId: 'T1', name: 'Tigres' },
      { rank: 3, name: 'Sin equipo' },
      { rank: 4, playerId: 'P9', name: 'Pepe' },
    ]);
    expect(podiumRefs(s)).toEqual(['t:T1', 't:T2', 'p:P9']);
    expect(podiumRefs(null)).toEqual(['', '', '']);
  });

  it('se proponen campeón, subcampeón y tercero de la tabla; con playoff terminado, los de la final', () => {
    const s = snap([
      { rank: 1, teamId: 'T1', name: 'Tigres' },
      { rank: 2, teamId: 'T2', name: 'Leones' },
      { rank: 3, teamId: 'T3', name: 'Águilas' },
    ]);
    const base = season({ id: 's', startsOn: '2026-01-01' });
    expect(initialAwards(s, base).map((a) => [a.kind, a.ref])).toEqual([
      ['campeon', 't:T1'],
      ['subcampeon', 't:T2'],
      ['tercero', 't:T3'],
      ['mvp', ''],
      ['mas_mejorado', ''],
      ['fair_play', ''],
    ]);
    const withPlayoff = {
      ...base,
      playoffs: [{ id: 'p', name: 'Playoffs', status: 'finished' as const, champion: { teamId: 'T3', name: 'Águilas' }, runnerUp: { teamId: 'T1', name: 'Tigres' }, semifinalists: [] }],
    };
    expect(initialAwards(s, withPlayoff).slice(0, 3).map((a) => a.ref)).toEqual(['t:T3', 't:T1', 't:T2']);
    // Lo que propone el deporte (el más mejorado del boliche) sale ya elegido; lo demás, vacío.
    expect(initialAwards(s, base, { mas_mejorado: 'p:P4' }).slice(3).map((a) => [a.kind, a.ref])).toEqual([
      ['mvp', ''],
      ['mas_mejorado', 'p:P4'],
      ['fair_play', ''],
    ]);
  });

  it('al corregir una cerrada salen los premios que tenía', () => {
    const closed = season({
      id: 's',
      startsOn: '2025-01-01',
      status: 'closed',
      awards: [
        { id: 'a1', kind: 'campeon', label: 'Campeón', name: 'Tigres', playerId: null, teamId: 'T1', note: null },
        { id: 'a2', kind: 'otro', label: 'Mejor portero', name: 'Ana', playerId: 'P1', teamId: null, note: 'Sin goles en 5' },
      ],
    });
    // Los de siempre que faltan salen vacíos (así se pueden agregar al corregir); los 'otro', al final.
    expect(initialAwards(null, closed)).toEqual([
      { key: 'campeon', kind: 'campeon', label: '', ref: 't:T1', note: '' },
      { key: 'subcampeon', kind: 'subcampeon', label: '', ref: '', note: '' },
      { key: 'tercero', kind: 'tercero', label: '', ref: '', note: '' },
      { key: 'mvp', kind: 'mvp', label: '', ref: '', note: '' },
      { key: 'mas_mejorado', kind: 'mas_mejorado', label: '', ref: '', note: '' },
      { key: 'fair_play', kind: 'fair_play', label: '', ref: '', note: '' },
      { key: 'otro-1', kind: 'otro', label: 'Mejor portero', ref: 'p:P1', note: 'Sin goles en 5' },
    ]);
    // Dos del mismo tipo: claves distintas, en su orden.
    const twice = season({
      ...closed,
      awards: [
        { id: 'a1', kind: 'mvp', label: 'MVP', name: 'Ana', playerId: 'P1', teamId: null, note: null },
        { id: 'a2', kind: 'mvp', label: 'MVP', name: 'Luis', playerId: 'P2', teamId: null, note: null },
      ],
    });
    expect(initialAwards(null, twice).filter((a) => a.kind === 'mvp').map((a) => [a.key, a.ref])).toEqual([
      ['mvp', 'p:P1'],
      ['mvp-1', 'p:P2'],
    ]);
  });

  it('el podio que propone el deporte (el cuadro del torneo relámpago) va antes que la tabla; null = ninguno', () => {
    const groupA = snap([
      { rank: 1, teamId: 'T1', name: 'Tigres' },
      { rank: 2, teamId: 'T2', name: 'Leones' },
      { rank: 3, teamId: 'T3', name: 'Águilas' },
    ]);
    const base = season({ id: 's', startsOn: '2026-01-01' });
    const podium = (p?: Parameters<typeof initialAwards>[3]) => initialAwards(groupA, base, null, p).slice(0, 3).map((a) => a.ref);
    expect(podium()).toEqual(['t:T1', 't:T2', 't:T3']);
    expect(podium(null)).toEqual(['', '', '']);
    expect(podium(['t:T4', 't:T1', ''])).toEqual(['t:T4', 't:T1', '']);
    // Con playoff terminado manda la final; el tercero, el mejor del podio del deporte que no llegó a ella.
    const withPlayoff = {
      ...base,
      playoffs: [{ id: 'p', name: 'Playoffs', status: 'finished' as const, champion: { teamId: 'T4', name: 'Osos' }, runnerUp: { teamId: 'T5', name: 'Lobos' }, semifinalists: [] }],
    };
    expect(initialAwards(groupA, withPlayoff, null, ['t:T4', 't:T1', 't:T2']).slice(0, 3).map((a) => a.ref)).toEqual(['t:T4', 't:T5', 't:T1']);
    expect(initialAwards(groupA, withPlayoff, null, null).slice(0, 3).map((a) => a.ref)).toEqual(['t:T4', 't:T5', '']);
  });

  it('awardsProblem: nombre del otro premio, a quién va, podio sin repetir, largos', () => {
    const d = (p: Partial<AwardDraft>): AwardDraft => ({ key: p.kind ?? 'k', kind: 'mvp', label: '', ref: '', note: '', ...p });
    expect(awardsProblem([d({ kind: 'campeon', ref: 't:1' }), d({ kind: 'subcampeon', ref: 't:2' })])).toBeNull();
    expect(awardsProblem([d({ kind: 'otro', ref: 'p:1' })])).toMatch(/Ponle nombre/);
    expect(awardsProblem([d({ kind: 'otro', label: 'Mejor portero' })])).toMatch(/Elige a quién va «Mejor portero»/);
    expect(awardsProblem([d({ kind: 'campeon', ref: 't:1' }), d({ kind: 'tercero', ref: 't:1' })])).toMatch(/dos veces en el podio/);
    expect(awardsProblem([d({ kind: 'mvp', ref: 'p:1', note: 'x'.repeat(201) })])).toMatch(/nota es muy larga/);
    // El MVP puede ser del equipo campeón (no es el podio).
    expect(awardsProblem([d({ kind: 'campeon', ref: 't:1' }), d({ kind: 'mvp', ref: 'p:1' }), d({ kind: 'fair_play', ref: 't:1' })])).toBeNull();
  });

  it('awardsArg: solo los que tienen a quién; label solo en otro; nota recortada', () => {
    const drafts: AwardDraft[] = [
      { key: 'campeon', kind: 'campeon', label: 'ignorado', ref: 't:T1', note: '' },
      { key: 'mvp', kind: 'mvp', label: '', ref: '', note: '' },
      { ...newOtherAward(0), label: ' Mejor portero ', ref: 'p:P1', note: '  cero goles ' },
    ];
    expect(awardsArg(drafts)).toEqual([
      { kind: 'campeon', team_id: 'T1' },
      { kind: 'otro', player_id: 'P1', label: 'Mejor portero', note: 'cero goles' },
    ]);
  });
});

describe('temporada nueva', () => {
  const closed = season({ id: 's25', startsOn: '2025-01-15', endsOn: '2025-12-10', status: 'closed', name: 'Temporada 2025' });

  it('nombre: «Temporada <año>», o con (2) si ya hay una', () => {
    expect(seasonName('2027-02-01', [closed])).toBe('Temporada 2027');
    expect(seasonName('2025-06-01', [closed])).toBe('Temporada 2025 (2)');
  });

  it('el nombre sigue a la fecha de inicio mientras no se cambie a mano', () => {
    const d = newSeasonDefaults([closed], '2025-12-20');
    expect(d).toMatchObject({ name: 'Temporada 2025 (2)', startsOn: '2025-12-20' });
    expect(withStartDate(d, '2026-01-10', [closed], false)).toMatchObject({ name: 'Temporada 2026', startsOn: '2026-01-10' });
    expect(withStartDate({ ...d, name: 'Apertura' }, '2026-01-10', [closed], true)).toMatchObject({ name: 'Apertura', startsOn: '2026-01-10' });
    // Borrando la fecha no se toca el nombre.
    expect(withStartDate(d, '', [closed], false)).toMatchObject({ name: 'Temporada 2025 (2)', startsOn: '' });
  });

  it('lo que se propone: hoy, o el día después de que terminó la anterior', () => {
    expect(newSeasonDefaults([closed], '2026-01-05')).toEqual({ name: 'Temporada 2026', startsOn: '2026-01-05', endsOn: '', copyTeams: false });
    expect(newSeasonDefaults([closed], '2025-12-10', true)).toMatchObject({ startsOn: '2025-12-11', name: 'Temporada 2025 (2)', copyTeams: true });
    expect(newSeasonDefaults([], '2026-03-01').startsOn).toBe('2026-03-01');
  });

  it('newSeasonProblem: nombre, activa en curso, fechas y después de la anterior', () => {
    const ok = { name: 'Temporada 2026', startsOn: '2026-01-10', endsOn: '', copyTeams: false };
    expect(newSeasonProblem(ok, [closed])).toBeNull();
    expect(newSeasonProblem({ ...ok, name: '  ' }, [closed])).toMatch(/nombre/);
    expect(newSeasonProblem(ok, [closed, season({ id: 'x', startsOn: '2026-01-01' })])).toMatch(/Primero cierra/);
    expect(newSeasonProblem({ ...ok, startsOn: '' }, [closed])).toMatch(/cuándo empieza/);
    expect(newSeasonProblem({ ...ok, endsOn: '2026-01-01' }, [closed])).toMatch(/Termina antes/);
    // La cerrada no se toca: la nueva empieza después de que terminó (como start_season).
    expect(newSeasonProblem({ ...ok, startsOn: '2025-01-15' }, [closed])).toMatch(/después del 10 dic 2025 \(cuando terminó Temporada 2025\)/);
    expect(newSeasonProblem({ ...ok, startsOn: '2025-12-10' }, [closed])).toMatch(/después del 10 dic 2025/);
    expect(newSeasonProblem({ ...ok, startsOn: '2025-12-11' }, [closed])).toBeNull();
  });

  it('textos de fechas', () => {
    expect(shortDay('2026-02-12')).toBe('12 feb 2026');
    expect(seasonDates({ startsOn: '2026-02-12', endsOn: '2026-11-30' })).toBe('12 feb 2026 – 30 nov 2026');
    expect(seasonDates({ startsOn: '2026-02-12', endsOn: null })).toBe('Desde 12 feb 2026');
  });
});
