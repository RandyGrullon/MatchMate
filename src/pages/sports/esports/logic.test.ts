import { describe, expect, it } from 'vitest';
import { champion, defaultSettings, doubleEliminationPlan, resolvePlan, singleEliminationPlan, type GameRecord } from '../../../sports/esports';
import {
  bestOfLine,
  brTable,
  canAddGame,
  cardScoreText,
  competitors,
  entryBySideTeam,
  formatDetails,
  freeAgents,
  infoInTeams,
  keyIndex,
  keyResultOf,
  lastStage,
  memberProblem,
  myActionMatches,
  myProblemText,
  myEntryOf,
  needsSync,
  nextBrSlot,
  pendingEntries,
  pickView,
  placementError,
  planFor,
  planFromStage,
  primaryAction,
  registerLabel,
  resultSummary,
  resultsByKey,
  rosterCheck,
  rosterText,
  rulesFromMatch,
  seedsFor,
  sideOfTeams,
  stageDone,
  stageMatches,
  stageUntouched,
  standingsColumns,
  tableOf,
  tournamentPathFor,
  viewsFor,
  type PrimaryInput,
} from './logic';
import { cleanGame, emptyGame, gameWord, tidyGame } from './match/GameRow';
import { mkBrGame, mkEntry, mkMatch, mkMember, mkTournament, played, stageFromPlan } from './testData';

const HOUR = 3_600_000;
const NOW = Date.parse('2026-10-08T12:00:00Z');

describe('vistas por formato', () => {
  it('simple y doble: Cuadro · Equipos · Info; grupos: Grupos · Playoffs · Equipos; liga y BR con Tabla', () => {
    expect(viewsFor('double_elim', '5v5').map((v) => v.label)).toEqual(['Cuadro', 'Equipos', 'Info']);
    expect(viewsFor('single_elim', '1v1').map((v) => v.label)).toEqual(['Cuadro', 'Jugadores', 'Info']);
    expect(viewsFor('groups_playoffs', '5v5').map((v) => v.label)).toEqual(['Grupos', 'Playoffs', 'Equipos']);
    expect(viewsFor('round_robin', '1v1').map((v) => v.label)).toEqual(['Tabla', 'Partidos', 'Jugadores']);
    expect(viewsFor('br', 'squad').map((v) => v.label)).toEqual(['Tabla', 'Partidas', 'Equipos']);
    expect(viewsFor('br', 'solo').map((v) => v.label)).toEqual(['Tabla', 'Partidas', 'Jugadores']);
  });

  it('«Info» va dentro de «Equipos» donde no tiene vista; una vista que el formato no tiene cae en la primera', () => {
    expect(infoInTeams('double_elim')).toBe(false);
    expect(infoInTeams('groups_playoffs')).toBe(true);
    expect(infoInTeams('br')).toBe(true);
    expect(pickView('double_elim', '5v5', 'equipos')).toBe('equipos');
    expect(pickView('double_elim', '5v5', 'grupos')).toBe('cuadro');
    expect(pickView('br', 'squad', null)).toBe('tabla');
  });

  it('el link del torneo: el inicio en un torneo suelto, el evento dentro de una liga', () => {
    expect(tournamentPathFor('L1', 'E1', 'torneo')).toBe('/l/L1');
    expect(tournamentPathFor('L1', 'E1', 'liga')).toBe('/l/L1/e/E1');
  });
});

describe('inscritos', () => {
  const entries = [
    mkEntry('a', 'Alfa', { seed: 2, captainId: 'u1', members: [mkMember('u1', 'Ana', 'captain')] }),
    mkEntry('b', 'Beta', { seed: 1 }),
    mkEntry('c', 'Gama', { status: 'pending', sideTeamId: null }),
    mkEntry('d', 'Delta', { kind: 'free_agent', status: 'approved', members: [mkMember('u4', 'Dani', 'captain')], sideTeamId: null }),
    mkEntry('e', 'Épsilon', { status: 'withdrawn' }),
  ];
  it('compiten los aprobados (sin agentes libres) por siembra; pendientes y agentes libres aparte', () => {
    expect(competitors(entries).map((e) => e.id)).toEqual(['b', 'a']);
    expect(pendingEntries(entries).map((e) => e.id)).toEqual(['c']);
    expect(freeAgents(entries).map((e) => e.id)).toEqual(['d']);
  });
  it('mi inscripción viva por la foto o por ser capitán; el equipo de temporada lleva al inscrito', () => {
    expect(myEntryOf(entries, 'u1')?.id).toBe('a');
    expect(myEntryOf(entries, 'u4')?.id).toBe('d');
    expect(myEntryOf(entries, 'nadie')).toBeNull();
    expect(myEntryOf(entries, null)).toBeNull();
    expect(entryBySideTeam(entries).get('T-a')).toBe('a');
    expect(entryBySideTeam(entries).has('T-c')).toBe(false);
  });
  it('la plantilla en palabras', () => {
    expect(rosterText(5, 1)).toBe('5 titulares · 1 suplente');
    expect(rosterText(1, 0)).toBe('1 titular');
  });
});

describe('siembra para armar el cuadro', () => {
  const t = mkTournament({ settings: { ...defaultSettings('valorant', '5v5', 'double_elim'), seeding: 'rank' } });
  const ranked = (id: string, tier: string) => mkEntry(id, id.toUpperCase(), { members: [mkMember(`u-${id}`, id, 'captain', { ranks: { main: { tier, div: 1 } } })] });
  it('con todos sembrados, ese orden', () => {
    const list = [mkEntry('a', 'A', { seed: 3 }), mkEntry('b', 'B', { seed: 1 }), mkEntry('c', 'C', { seed: 2 })];
    expect(seedsFor(list, t)).toEqual(['b', 'c', 'a']);
  });
  it('sin siembra: por el método del torneo (por rango: el mejor primero)', () => {
    const list = [ranked('a', 'gold'), ranked('b', 'radiant'), ranked('c', 'iron')];
    expect(seedsFor(list, t)).toEqual(['b', 'a', 'c']);
  });
  it('los sembrados a mano primero y los demás con el método', () => {
    const list = [ranked('a', 'gold'), { ...ranked('b', 'iron'), seed: 1 }, ranked('c', 'radiant')];
    expect(seedsFor(list, t)).toEqual(['b', 'c', 'a']);
  });
  it('al azar: misma semilla (el evento), mismo orden', () => {
    const r = mkTournament({ settings: { ...defaultSettings('valorant', '5v5', 'double_elim'), seeding: 'random' } });
    const list = ['a', 'b', 'c', 'd', 'e'].map((x) => mkEntry(x, x));
    expect(seedsFor(list, r)).toEqual(seedsFor(list, r));
    expect([...seedsFor(list, r)].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('el plan con los ajustes del torneo', () => {
  const seeds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  it('simple con 3.er lugar, doble con reinicio, grupos y liga; battle royale no tiene fase', () => {
    const single = planFor(mkTournament({ format: 'single_elim', settings: { ...defaultSettings('valorant', '5v5', 'single_elim'), thirdPlace: true } }), seeds)!;
    expect(single.kind).toBe('bracket');
    expect(single.matches).toHaveLength(8);
    expect(single.matches.find((m) => m.key === 'W3-1')?.bestOf).toBe(5);
    const double = planFor(mkTournament(), seeds)!;
    expect(double.matches).toHaveLength(15);
    expect(double.matches.some((m) => m.part === 'GF2')).toBe(true);
    const groups = planFor(mkTournament({ format: 'groups_playoffs', settings: defaultSettings('valorant', '5v5', 'groups_playoffs') }), seeds)!;
    expect(groups.kind).toBe('groups');
    expect(groups.matches).toHaveLength(12);
    const league = planFor(mkTournament({ format: 'round_robin', settings: defaultSettings('valorant', '5v5', 'round_robin') }), seeds.slice(0, 4))!;
    expect(league.kind).toBe('league');
    expect(league.matches).toHaveLength(6);
    expect(planFor(mkTournament({ game: 'free_fire', mode: 'squad', format: 'br', settings: defaultSettings('free_fire', 'squad', 'br') }), seeds)).toBeNull();
  });
});

describe('el cuadro guardado vuelto plan (de los enlaces y los partidos)', () => {
  const names = { a: 'Alfa', b: 'Beta', c: 'Gama', d: 'Delta' };
  const plan = doubleEliminationPlan(['a', 'b', 'c', 'd'], { bracketReset: true, bestOf: 1, finalBestOf: 3 });
  const { matches, links } = stageFromPlan({ ...plan, kind: 'bracket' }, names);
  const entryOf = new Map(Object.keys(names).map((id) => [`T-${id}`, id]));

  it('mismas llaves, partes, rondas, posiciones y enlaces que el plan del motor', () => {
    const back = planFromStage('bracket', matches, links, entryOf);
    expect(back.matches.map((m) => m.key).sort()).toEqual(plan.matches.map((m) => m.key).sort());
    for (const p of plan.matches) {
      const r = back.matches.find((m) => m.key === p.key)!;
      expect([r.part, r.round, r.index, r.bestOf]).toEqual([p.part, p.round, p.index, p.bestOf]);
      expect(r.winnerTo).toEqual(p.winnerTo);
      expect(r.loserTo).toEqual(p.loserTo);
      expect(r.sides.map((s) => s.kind)).toEqual(p.sides.map((s) => s.kind));
    }
    expect(keyIndex('W1-2')).toBe(1);
    expect(keyIndex('G1-R2-3')).toBe(2);
    expect(keyIndex('GF')).toBe(0);
  });

  it('con resultados: quién juega cada uno y el campeón (la gran final la gana el invicto)', () => {
    const won = (key: string, w: 1 | 2, list = matches) => list.map((m) => (m.bracketKey === key ? played(m, w === 1 ? [{ a: 13, b: 5 }] : [{ a: 5, b: 13 }]) : m));
    let ms = won('W1-1', 1);
    ms = won('W1-2', 1, ms);
    // La base ya puso a los ganadores en W2-1 y a los perdedores en L1-1.
    ms = ms.map((m) => (m.bracketKey === 'W2-1' ? { ...m, sides: [{ ...m.sides[0], teamId: 'T-a' }, { ...m.sides[1], teamId: 'T-b' }] as typeof m.sides } : m));
    const results = resultsByKey(ms, entryOf, NOW);
    const resolved = resolvePlan(planFromStage('bracket', ms, links, entryOf), results);
    expect(resolved.find((m) => m.key === 'W2-1')?.known).toEqual(['a', 'b']);
    expect(resolved.find((m) => m.key === 'L1-1')?.known.filter(Boolean).sort()).toEqual(['c', 'd']);
    const finals: Record<string, { winner: string; loser: string }> = {
      ...results,
      'W2-1': { winner: 'a', loser: 'b' },
      'L1-1': { winner: 'c', loser: 'd' },
      'L2-1': { winner: 'b', loser: 'c' },
      GF: { winner: 'a', loser: 'b' },
    };
    expect(champion(planFromStage('bracket', ms, links, entryOf), finals)).toBe('a');
  });

  it('las series de una fase, terminada o no, y si se puede rehacer', () => {
    const rows = stageMatches('bracket', matches, links);
    expect(rows).toHaveLength(7);
    expect(stageDone(rows, NOW)).toBe(false);
    expect(stageUntouched(rows)).toBe(true);
    const one = matches.map((m, i) => (i === 0 ? played(m, [{ a: 13, b: 3 }]) : m));
    expect(stageUntouched(stageMatches('bracket', one, links))).toBe(false);
    expect(stageDone(stageMatches('bracket', matches.map((m) => played(m, [{ a: 13, b: 3 }])), links), NOW)).toBe(true);
    expect(lastStage(new Set(['groups', 'playoffs']))).toBe('playoffs');
    expect(lastStage(new Set())).toBeNull();
  });

  it('pide sincronizar si una serie pasó a final por las 48 h y su ganador no está en la siguiente', () => {
    const old = new Date(NOW - 49 * HOUR).toISOString();
    const ms = matches.map((m) => (m.bracketKey === 'W1-1' ? played(m, [{ a: 13, b: 7 }], { status: 'finished', proposedAt: old, proposedSide: 1 }) : m));
    expect(needsSync(ms, links, NOW)).toBe(true);
    const fresh = matches.map((m) => (m.bracketKey === 'W1-1' ? played(m, [{ a: 13, b: 7 }], { status: 'finished', proposedAt: new Date(NOW - HOUR).toISOString(), proposedSide: 1 }) : m));
    expect(needsSync(fresh, links, NOW)).toBe(false);
    // Confirmada: la base ya avanzó (trigger).
    expect(needsSync(matches.map((m) => (m.bracketKey === 'W1-1' ? played(m, [{ a: 13, b: 7 }]) : m)), links, NOW)).toBe(false);
  });
});

describe('de partidos a resultados y tablas', () => {
  const entryOf = new Map([
    ['T-a', 'a'],
    ['T-b', 'b'],
    ['T-c', 'c'],
  ]);
  it('W.O. de un lado gana el otro; doble W.O., nadie', () => {
    const wo = mkMatch({ teams: ['T-a', 'T-b'], status: 'walkover', walkoverSide: 2 });
    expect(keyResultOf(wo, entryOf)).toEqual({ winner: 'a', loser: 'b' });
    expect(keyResultOf({ ...wo, walkoverSide: 0 }, entryOf)).toEqual({ winner: null, loser: null });
  });
  it('solo cuentan las finales (confirmada, W.O. o propuesta hace 48 h)', () => {
    const base = mkMatch({ teams: ['T-a', 'T-b'], bracketKey: 'W1-1' });
    const proposed = played(base, [{ a: 13, b: 4 }], { status: 'finished', proposedAt: new Date(NOW - HOUR).toISOString(), proposedSide: 1 });
    expect(resultsByKey([proposed], entryOf, NOW)).toEqual({});
    expect(resultsByKey([{ ...proposed, proposedAt: new Date(NOW - 49 * HOUR).toISOString() }], entryOf, NOW)).toEqual({ 'W1-1': { winner: 'a', loser: 'b' } });
  });
  it('la tabla de VALORANT: 3 por serie ganada y dif. de mapas', () => {
    const ms = [
      played(mkMatch({ id: '1', teams: ['T-a', 'T-b'], rules: { game: 'valorant', bestOf: 3, draws: false } }), [{ a: 13, b: 9 }, { a: 7, b: 13 }, { a: 13, b: 11 }], { bestOf: 3 }),
      played(mkMatch({ id: '2', teams: ['T-b', 'T-c'], rules: { game: 'valorant', bestOf: 3, draws: false } }), [{ a: 13, b: 2 }, { a: 13, b: 3 }], { bestOf: 3 }),
      mkMatch({ id: '3', teams: ['T-a', 'T-c'] }),
    ];
    const rows = tableOf('valorant', ['a', 'b', 'c'], ms, entryOf, NOW);
    expect(rows.map((r) => [r.id, r.points, r.played])).toEqual([
      ['b', 3, 2],
      ['a', 3, 1],
      ['c', 0, 1],
    ]);
  });
  it('mi lado por mis equipos de temporada', () => {
    const m = mkMatch({ teams: ['T-a', 'T-b'] });
    expect(sideOfTeams(m, new Set(['T-b']))).toBe(2);
    expect(sideOfTeams(m, new Set(['T-a', 'T-b']))).toBeNull();
    expect(sideOfTeams(m, new Set())).toBeNull();
  });
  it('columnas: series «PJ G P Mapas Dif.»; FC como el fútbol', () => {
    expect(standingsColumns('valorant').map((c) => c.label)).toEqual(['PJ', 'G', 'P', 'Mapas', 'Dif.']);
    expect(standingsColumns('lol').map((c) => c.label)).toEqual(['PJ', 'G', 'P', 'Juegos', 'Dif.']);
    expect(standingsColumns('ea_fc').map((c) => c.label)).toEqual(['PJ', 'G', 'E', 'P', 'GF', 'GC', 'Dif.']);
  });
});

describe('la acción principal (una sola, la primera que aplique)', () => {
  const base: PrimaryInput = {
    format: 'double_elim',
    entryType: 'teams',
    mode: '5v5',
    status: 'registration',
    signedIn: true,
    registrationOpen: true,
    checkinOpen: false,
    myEntry: null,
    uid: 'u1',
    toConfirm: null,
    toScore: null,
    organizer: false,
    pending: 0,
    approved: 0,
    hasStage: false,
    groupsDone: false,
    hasPlayoffs: false,
  };
  it('confirmar antes que anotar; anotar antes que todo lo demás', () => {
    expect(primaryAction({ ...base, toConfirm: { id: 'm1' }, toScore: { id: 'm2' } })).toEqual({ kind: 'confirm', label: 'Confirmar resultado', matchId: 'm1' });
    expect(primaryAction({ ...base, toScore: { id: 'm2' }, organizer: true, pending: 3 })).toEqual({ kind: 'score', label: 'Anotar resultado', matchId: 'm2' });
  });
  it('check-in del capitán aprobado; inscribirme (o entrar) si no estoy', () => {
    const mine = { status: 'approved' as const, checkedInAt: null, captainId: 'u1', kind: 'team' as const };
    expect(primaryAction({ ...base, checkinOpen: true, myEntry: mine })?.label).toBe('Hacer check-in');
    expect(primaryAction({ ...base, checkinOpen: true, myEntry: { ...mine, captainId: 'otro' } })).toBeNull();
    expect(primaryAction(base)?.label).toBe('Inscribir mi equipo');
    expect(primaryAction({ ...base, entryType: 'open' })?.label).toBe('Inscribirme');
    expect(primaryAction({ ...base, signedIn: false, uid: null })?.kind).toBe('signin');
    expect(registerLabel('teams', '1v1')).toBe('Inscribirme');
  });
  it('el organizador en Pro: revisar, armar el cuadro, empezar BR, anotar partida, pasar a playoffs', () => {
    const org = { ...base, registrationOpen: false, organizer: true };
    expect(primaryAction({ ...org, pending: 2 })?.label).toBe('Revisar inscripciones (2)');
    expect(primaryAction({ ...org, approved: 3 })).toBeNull();
    expect(primaryAction({ ...org, approved: 4 })?.label).toBe('Armar el cuadro');
    expect(primaryAction({ ...org, approved: 4, hasStage: true })).toBeNull();
    expect(primaryAction({ ...org, format: 'br', approved: 2 })?.label).toBe('Empezar');
    expect(primaryAction({ ...org, format: 'br', status: 'live' })?.label).toBe('Anotar partida');
    expect(primaryAction({ ...org, format: 'groups_playoffs', status: 'live', hasStage: true, groupsDone: true })?.label).toBe('Pasar a playoffs');
    expect(primaryAction({ ...org, format: 'groups_playoffs', status: 'live', hasStage: true, groupsDone: true, hasPlayoffs: true })).toBeNull();
    // En Lite (sin `organizer`) nada de eso.
    expect(primaryAction({ ...org, organizer: false, pending: 2, approved: 4 })).toBeNull();
  });
  it('mis series: la que tengo que confirmar (la propuso el rival) y la siguiente por anotar', () => {
    const mine = new Set(['T-a']);
    const proposedByThem = played(mkMatch({ id: 'x', teams: ['T-a', 'T-b'] }), [{ a: 5, b: 13 }], { status: 'finished', proposedSide: 2, proposedAt: new Date(NOW - HOUR).toISOString() });
    const proposedByMe = { ...proposedByThem, id: 'y', proposedSide: 1 as const };
    const open = mkMatch({ id: 'z', teams: ['T-c', 'T-a'], round: 2 });
    const unknown = mkMatch({ id: 'w', teams: ['T-a', null], round: 1 });
    expect(myActionMatches([proposedByMe, open, unknown], mine, NOW)).toEqual({ toConfirm: null, toScore: open });
    expect(myActionMatches([proposedByThem, open], mine, NOW).toConfirm?.id).toBe('x');
  });
});

describe('inscribirse: lo que pide el torneo y la plantilla', () => {
  const settings = { requireConfirmedId: true, requireVerifiedRank: false };
  const declared = { status: 'pendiente' as const, ranks: {}, rankSource: 'declarado' as const };
  it('sin ID; sin comprobar solo si el torneo lo pide y el juego lo puede comprobar; el rango verificado solo en LoL', () => {
    expect(memberProblem(null, settings, 'main', 'valorant')).toBe('Sin ID');
    expect(memberProblem(undefined, { requireConfirmedId: false, requireVerifiedRank: false }, 'main', 'mlbb')).toBe('Sin ID');
    expect(memberProblem(declared, settings, 'main', 'valorant')).toBe('ID sin comprobar');
    expect(memberProblem(declared, settings, 'main', 'rocket_league')).toBe('ID sin comprobar');
    expect(memberProblem({ ...declared, status: 'confirmado' }, settings, 'main', 'valorant')).toBeNull();
    // Sin pedirlo, o en un juego sin verificación, tener el ID puesto basta.
    expect(memberProblem(declared, { ...settings, requireConfirmedId: false }, 'main', 'valorant')).toBeNull();
    expect(memberProblem(declared, settings, 'main', 'mlbb')).toBeNull();
    expect(memberProblem(declared, settings, 'main', 'smash')).toBeNull();
    const verified = { requireConfirmedId: false, requireVerifiedRank: true };
    const gold = { main: { tier: 'gold', div: 1 } };
    expect(memberProblem({ status: 'confirmado', ranks: gold, rankSource: 'declarado' }, verified, 'main', 'lol')).toBe('Sin rango verificado');
    expect(memberProblem({ status: 'confirmado', ranks: gold, rankSource: 'verificado' }, verified, 'main', 'lol')).toBeNull();
    expect(memberProblem({ status: 'confirmado', ranks: {}, rankSource: 'verificado' }, verified, 'main', 'lol')).toBe('Sin rango verificado');
    // En VALORANT (o cualquier otro) el rango verificado no se pide.
    expect(memberProblem({ status: 'confirmado', ranks: gold, rankSource: 'declarado' }, verified, 'main', 'valorant')).toBeNull();
    expect(memberProblem({ ...declared, ranks: { '2v2': { tier: 'gold1', div: 1 } } }, verified, '3v3', 'rocket_league')).toBeNull();
  });
  it('lo que te falta a ti, dicho como la base', () => {
    expect(myProblemText('Sin ID', 'valorant')).toBe('Primero pon tu ID de VALORANT.');
    expect(myProblemText('ID sin comprobar', 'cs2')).toBe('Este torneo pide tu ID de Counter-Strike 2 comprobado.');
    expect(myProblemText('Sin rango verificado', 'lol')).toBe('Este torneo pide tu rango verificado de League of Legends.');
  });
  it('la plantilla de 5v5 con hasta 2 suplentes', () => {
    const none = new Map<string, string | null>();
    const picks = (n: number, subs = 0) => [
      { userId: 'cap', role: 'captain' as const },
      ...Array.from({ length: n - 1 }, (_, i) => ({ userId: `m${i}`, role: 'member' as const })),
      ...Array.from({ length: subs }, (_, i) => ({ userId: `s${i}`, role: 'sub' as const })),
    ];
    const o = { mode: '5v5' as const, subs: 2, captainId: 'cap', problems: none };
    expect(rosterCheck(picks(5), o)).toEqual({ starters: 5, subs: 0, ok: true, error: null });
    expect(rosterCheck(picks(5, 2), o).ok).toBe(true);
    expect(rosterCheck(picks(4), o).error).toBe('Faltan titulares: son 5.');
    expect(rosterCheck(picks(5, 3), o).error).toBe('Como mucho 2 suplentes.');
    expect(rosterCheck(picks(5, 1), { ...o, subs: 0 }).error).toBe('Este torneo no lleva suplentes.');
    expect(rosterCheck(picks(6, 2), o).error).toBe('Como mucho 7 en la plantilla.');
    expect(rosterCheck([{ userId: 'cap', role: 'sub' }, ...picks(6).slice(1)], o).error).toBe('El capitán va de titular.');
    expect(rosterCheck(picks(5), { ...o, problems: new Map([['m1', 'Sin ID confirmado']]) }).error).toBe('Alguien no cumple lo que pide el torneo.');
  });
});

describe('battle royale', () => {
  const settings = defaultSettings('free_fire', 'squad', 'br');
  it('la partida que sigue: dentro de la jornada y después la siguiente', () => {
    const s = { br: { ...settings.br!, rounds: 2, gamesPerRound: 2 } };
    expect(nextBrSlot([], s)).toEqual({ round: 1, gameNo: 1 });
    expect(nextBrSlot([{ round: 1, gameNo: 1 }], s)).toEqual({ round: 1, gameNo: 2 });
    expect(nextBrSlot([{ round: 1, gameNo: 1 }, { round: 1, gameNo: 2 }], s)).toEqual({ round: 2, gameNo: 1 });
  });
  it('puestos sin repetir y dentro del lobby', () => {
    expect(placementError([{ entryId: 'a', placement: 1 }, { entryId: 'b', placement: 2 }], 12)).toBeNull();
    expect(placementError([{ entryId: 'a', placement: 1 }, { entryId: 'b', placement: 1 }], 12)).toBe('El puesto 1 está repetido.');
    expect(placementError([{ entryId: 'a', placement: 13 }], 12)).toBe('Los puestos van del 1 al 12.');
    expect(placementError([{ entryId: 'a', placement: null }], 12)).toBe('Pon el puesto de al menos uno.');
  });
  it('la tabla acumulada con los puntos del torneo (1.º con 3 kills = 15 en Free Fire)', () => {
    const games = [mkBrGame('g1', 1, 1, [{ entryId: 'a', placement: 1, kills: 3 }, { entryId: 'b', placement: 2, kills: 5 }]), mkBrGame('g2', 1, 2, [{ entryId: 'b', placement: 1, kills: 0 }], 'void')];
    const rows = brTable(['a', 'b'], games, settings, 'free_fire');
    expect(rows.map((r) => [r.entryId, r.points, r.wins, r.played])).toEqual([
      ['a', 15, 1, 1],
      ['b', 14, 0, 1],
    ]);
  });
});

describe('la hoja del partido', () => {
  it('las reglas de la serie de matches.rules (o el juego de format)', () => {
    expect(rulesFromMatch({ game: 'valorant', bestOf: 3, draws: false }, 'valorant')).toEqual({ game: 'valorant', bestOf: 3, draws: false });
    expect(rulesFromMatch({ bestOf: 5 }, 'rocket_league')).toEqual({ game: 'rocket_league', bestOf: 5, draws: false });
    expect(rulesFromMatch({ game: 'sf6', bestOf: 3, roundsToWin: 2 }, 'sf6')?.roundsToWin).toBe(2);
    expect(rulesFromMatch({}, 'sets')).toBeNull();
  });
  it('el resumen del botón: «Gana Tigres 2-1», el empate del FC y lo que falta', () => {
    const val = { game: 'valorant' as const, bestOf: 3 as const, draws: false };
    const names: [string, string] = ['Tigres', 'Leones'];
    const games: GameRecord[] = [{ a: 13, b: 9 }, { a: 7, b: 13 }, { a: 13, b: 11 }];
    expect(resultSummary(val, games, names)).toEqual({ text: 'Gana Tigres 2-1', done: true });
    expect(resultSummary(val, games.slice(0, 2), names)).toEqual({ text: 'Falta: nadie llegó a 2', done: false });
    expect(resultSummary({ ...val, bestOf: 1 }, [{ a: 9, b: 13 }], names)).toEqual({ text: 'Gana Leones 13-9', done: true });
    expect(resultSummary({ game: 'ea_fc', bestOf: 1, draws: true }, [{ a: 2, b: 2 }], names)).toEqual({ text: 'Empate 2-2', done: true });
    expect(canAddGame(val, games.slice(0, 2))).toBe(true);
    expect(canAddGame(val, games)).toBe(false);
  });
  it('el marcador corto de la tarjeta: el del juego al mejor de 1, los mapas si no', () => {
    expect(cardScoreText(played(mkMatch(), [{ a: 13, b: 9 }]).score)).toBe('13-9');
    expect(cardScoreText(played(mkMatch({ rules: { game: 'valorant', bestOf: 3, draws: false } }), [{ a: 13, b: 9 }, { a: 13, b: 7 }], { bestOf: 3 }).score)).toBe('2-0');
    expect(cardScoreText({ text: 'W.O.', wo: true, sides: [2, 0], totals: { maps: [2, 0], points: [0, 0] }, games: [], bestOf: 3 })).toBe('W.O.');
    expect(cardScoreText(null)).toBeNull();
  });
});

describe('un mapa o juego al anotar', () => {
  it('vacío según la regla, sin claves vacías al mandarlo y la palabra del juego', () => {
    expect(emptyGame({ game: 'valorant' })).toEqual({ a: 0, b: 0 });
    expect(emptyGame({ game: 'lol' })).toEqual({});
    expect(emptyGame({ game: 'clash_royale' })).toEqual({ a: 0, b: 0 });
    expect(cleanGame({ w: 1, a: undefined, b: 3, ot: undefined, map: '' })).toEqual({ w: 1, b: 3 });
    expect([gameWord({ game: 'cs2' }), gameWord({ game: 'rocket_league' }), gameWord({ game: 'sf6' })]).toEqual(['Mapa', 'Juego', 'Juego']);
  });
  it('la prórroga se va si dejó de ser por 1; los penales, si dejó de ser empate', () => {
    expect(tidyGame({ game: 'rocket_league' }, { a: 4, b: 2, ot: true })).toEqual({ a: 4, b: 2 });
    expect(tidyGame({ game: 'rocket_league' }, { a: 3, b: 2, ot: true })).toEqual({ a: 3, b: 2, ot: true });
    expect(tidyGame({ game: 'ea_fc' }, { a: 3, b: 2, pa: 4, pb: 3 })).toEqual({ a: 3, b: 2 });
    expect(tidyGame({ game: 'ea_fc' }, { a: 2, b: 2, pa: 4, pb: 3 })).toEqual({ a: 2, b: 2, pa: 4, pb: 3 });
  });
});

describe('textos del formato', () => {
  it('el mejor de por fase y las reglas para «Info»', () => {
    expect(bestOfLine('groups_playoffs', { groups: 1, playoffs: 3, final: 5 })).toBe('Al mejor de 1 en grupos, 3 en playoffs y 5 en la final');
    expect(bestOfLine('double_elim', { groups: 1, playoffs: 3, final: 5 })).toBe('Al mejor de 3 y 5 en la final');
    expect(bestOfLine('br', { groups: 1, playoffs: 1, final: 1 })).toBeNull();
    const t = mkTournament({ checkinMinutes: 30 });
    const lines = formatDetails(t);
    expect(lines).toContain('Gran final con reinicio si gana el que viene de perdedores');
    expect(lines).toContain('Check-in desde 30 min antes');
    // Apagados por defecto; encendidos, solo si el juego lo puede comprobar.
    expect(lines).not.toContain('Piden ID de juego confirmado');
    const asks = { ...t.settings, requireConfirmedId: true, requireVerifiedRank: true };
    expect(formatDetails({ ...t, settings: asks })).toContain('Piden ID de juego confirmado');
    expect(formatDetails({ ...t, settings: asks })).not.toContain('Piden rango verificado');
    expect(formatDetails({ ...t, game: 'lol', settings: asks })).toContain('Piden rango verificado');
    expect(formatDetails({ ...t, game: 'mlbb', settings: asks }).some((l) => l.startsWith('Piden'))).toBe(false);
    const br = formatDetails(mkTournament({ game: 'free_fire', mode: 'squad', format: 'br', settings: defaultSettings('free_fire', 'squad', 'br') }));
    expect(br.some((l) => l.startsWith('Puntos por puesto: 12, 9, 8'))).toBe(true);
  });
  it('la simple sin 3.er lugar es la del motor', () => {
    expect(singleEliminationPlan(['a', 'b', 'c', 'd'], { thirdPlace: false, bestOf: 1, finalBestOf: 3 }).matches).toHaveLength(3);
  });
});
