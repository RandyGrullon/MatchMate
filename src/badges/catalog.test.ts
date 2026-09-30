import { describe, expect, it } from 'vitest';
import { SPORT_FAMILY, type SportId } from '../sports/types';
import {
  allowedBy,
  badgeDef,
  BADGE_KEY_RE,
  BADGES,
  badgesForSport,
  badgesOfEvaluator,
  badgeSports,
  CATEGORY_LABEL,
  descriptionOf,
  definitionCount,
  EVALUATOR_JOBS,
  evaluatorsFor,
  fillText,
  howOf,
  levelFor,
  levelNameOf,
  levelsReached,
  nameOf,
  needsAval,
  nextLevel,
  paramOf,
  pickVariant,
  placeholdersIn,
  PLACEHOLDERS,
  placeLevel,
  rarityOf,
  SECTION_OF,
  thresholdOf,
  unitOf,
  variantsOf,
} from './catalog';
import type { BadgeDef, BadgeGroup, BadgeSport, Variant } from './types';
import { BADGE_ICON_KEYS } from './visual/icons';

const ALL_SPORTS = Object.keys(SPORT_FAMILY) as SportId[];
const SHAPES = ['hex', 'shield', 'circle', 'star', 'medal', 'medal_laurel', 'square'];
const RARITIES = ['C', 'PC', 'R', 'E', 'L'];

/** Todas las variantes de una fila de esa insignia en ese deporte (3x3 y 9 hoyos aparte). */
function variantSets(def: BadgeDef, sport: BadgeSport): Variant[][] {
  const out: Variant[][] = [variantsOf(sport)];
  if (sport === 'basketball' && !def.excludeVariants?.includes('basketball3x3')) out.push(variantsOf(sport, { is3x3: true }));
  if (sport === 'golf') out.push(variantsOf(sport, { nineHoles: true }));
  return out;
}

describe('catálogo: totales del diseño (§2.0 y §2.13)', () => {
  it('100 keys y 197 definiciones contando niveles', () => {
    expect(BADGES).toHaveLength(100);
    expect(definitionCount()).toBe(197);
  });

  it('keys y definiciones por grupo', () => {
    const want: Record<BadgeGroup, [number, number]> = {
      general: [9, 23],
      bowling: [12, 26],
      racket: [10, 23],
      team: [4, 12],
      basketball: [8, 14],
      football: [7, 15],
      golf: [10, 19],
      swimming: [7, 18],
      mensual: [12, 14],
      anual: [4, 6],
      temporada: [10, 14],
      comunidad: [7, 13],
    };
    for (const [group, [keys, defs]] of Object.entries(want)) {
      const list = BADGES.filter((b) => b.group === group);
      expect([group, list.length, definitionCount(list)]).toEqual([group, keys, defs]);
    }
  });

  it('instanciadas por deporte: 505 en total, todos los deportes abiertos desde el inicio', () => {
    const want: Record<BadgeSport, number> = {
      bowling: 54,
      padel: 49,
      pickleball: 49,
      tennis: 48,
      table_tennis: 48,
      basketball: 48,
      football: 51,
      futsal: 51,
      golf: 45,
      swimming: 33,
      all: 29,
    };
    let total = 0;
    for (const [sport, n] of Object.entries(want) as [BadgeSport, number][]) {
      const got = definitionCount(badgesForSport(sport));
      expect([sport, got]).toEqual([sport, n]);
      total += got;
    }
    expect(total).toBe(505);
    // Cada uno de los 10 deportes tiene su debut, su «Fijo del mes», «Todo el año» y la asistencia de temporada.
    for (const s of ALL_SPORTS) {
      for (const key of ['debut', 'monthly_regular', 'full_year', 'season_attendance']) expect(badgesForSport(s).map((b) => b.key)).toContain(key);
    }
  });

  it('las 11 de cuenta sin deporte', () => {
    expect(badgesForSport('all').map((b) => b.key).sort()).toEqual(
      ['anniversary', 'good_vibes', 'league_builder', 'mileage', 'month_streak', 'multisport', 'season_organizer', 'strong_start', 'table_crew', 'three_worlds', 'year_recap'].sort(),
    );
  });

  it('24 keys comparan con otros (se apagan con «sin títulos»); 8 de ellas comparan mejora', () => {
    const titles = BADGES.filter((b) => b.title).map((b) => b.key);
    expect(titles).toHaveLength(24);
    for (const k of ['most_improved_month', 'streak_month', 'progress_of_year', 'season_most_improved', 'season_rookie', 'category_title', 'box_top_month', 'bowling_category_win']) {
      expect(titles).toContain(k);
    }
    // Las marcas se quedan con menores (§1.5); lo mensual que vale con «sin títulos» (§2.9) no es título.
    expect(titles).not.toContain('swim_record');
    for (const k of ['perfect_attendance_month', 'personal_best_month', 'monthly_regular']) expect(titles).not.toContain(k);
    for (const b of BADGES.filter((x) => x.category === 'resultados')) expect(b.title).toBe(true);
  });
});

describe('catálogo: cada insignia está completa', () => {
  it('keys únicas, con el formato de la base', () => {
    expect(new Set(BADGES.map((b) => b.key)).size).toBe(BADGES.length);
    for (const b of BADGES) expect(b.key).toMatch(BADGE_KEY_RE);
  });

  it('forma, ícono, categoría y evaluador conocidos', () => {
    for (const b of BADGES) {
      expect(SHAPES).toContain(b.shape);
      if (b.icon === 'sport') expect(b.sports).not.toBe('all');
      else expect(BADGE_ICON_KEYS).toContain(b.icon);
      expect(CATEGORY_LABEL[b.category]).toBeTruthy();
      expect(SECTION_OF[b.category]).toBeTruthy();
      expect(EVALUATOR_JOBS[b.evaluator]?.length).toBeGreaterThan(0);
    }
  });

  it('nombre, nombre de nivel, descripción y cómo se gana en cada deporte, variante y nivel', () => {
    for (const b of BADGES) {
      for (const sport of badgeSports(b)) {
        for (const variants of variantSets(b, sport)) {
          const o = { sport, variants };
          expect(nameOf(b, o), `${b.key} ${variants}`).toBeTruthy();
          expect(howOf(b, o), `${b.key} ${variants}`).toBeTruthy();
          for (const l of b.levels) {
            expect(descriptionOf(b, { ...o, level: l.level }), `${b.key} ${l.level}`).toBeTruthy();
            expect(levelNameOf(b, l.level, o)).toBeTruthy();
          }
          for (const alt of Object.keys(b.alts ?? {})) expect(nameOf(b, { ...o, alt })).toBeTruthy();
          if (b.unit) expect(unitOf(b, 2, o)).toBeTruthy();
        }
      }
    }
  });

  it('los textos solo usan llaves conocidas', () => {
    const texts = (v: unknown): string[] =>
      typeof v === 'string' ? [v] : v && typeof v === 'object' && !Array.isArray(v) ? Object.values(v).flatMap(texts) : [];
    for (const b of BADGES) {
      const all = [b.name, b.description, b.how, ...Object.values(b.levelNames ?? {}), ...Object.values(b.levelDescriptions ?? {}), ...Object.values(b.alts ?? {})].flatMap(texts);
      for (const t of all) for (const p of placeholdersIn(t)) expect(PLACEHOLDERS, `${b.key}: {${p}}`).toContain(p);
    }
  });

  it('niveles en orden; las de un nivel usan el 0; los nombres de nivel son de niveles que existen', () => {
    for (const b of BADGES) {
      const levels = b.levels.map((l) => l.level);
      expect([...levels].sort((x, y) => x - y)).toEqual(levels);
      expect(new Set(levels).size).toBe(levels.length);
      if (levels.includes(0)) expect(levels).toEqual([0]);
      for (const k of Object.keys(b.levelNames ?? {})) expect(levels).toContain(Number(k));
      for (const k of Object.keys(b.levelDescriptions ?? {})) expect(levels).toContain(Number(k));
    }
  });

  it('umbral y rareza para todo deporte y variante; los umbrales suben con el nivel', () => {
    for (const b of BADGES) {
      for (const sport of badgeSports(b)) {
        for (const variants of variantSets(b, sport)) {
          const ts: number[] = [];
          for (const l of b.levels) {
            const r = rarityOf(b, l.level, variants);
            if (b.closed) expect(r).toBe('cerrada');
            else expect(RARITIES, `${b.key} ${variants}`).toContain(r);
            const t = thresholdOf(b, l.level, variants);
            if (b.compare === 'gte' || b.compare === 'lt' || b.compare === 'place') {
              expect(t, `${b.key} ${l.level} ${variants}`).toBeTypeOf('number');
              ts.push(t!);
            }
          }
          if (b.compare === 'gte') expect([...ts].sort((x, y) => x - y)).toEqual(ts);
          if (b.compare === 'lt' || b.compare === 'place') expect([...ts].sort((x, y) => y - x)).toEqual(ts);
          for (const name of Object.keys(b.params ?? {})) {
            // Un parámetro por deporte vale para los deportes que lo nombran (o para todos si trae `default`).
            const raw = b.params![name];
            if (typeof raw === 'number' || 'default' in raw || variants.some((v) => v in raw)) expect(paramOf(b, name, variants)).toBeTypeOf('number');
          }
        }
      }
    }
  });

  it('los podios dan oro al 1.º, plata al 2.º y bronce al 3.º', () => {
    for (const b of BADGES.filter((x) => x.compare === 'place')) {
      expect(b.levels.map((l) => [l.level, thresholdOf(b, l.level, badgeSports(b)[0])])).toEqual([
        [1, 3],
        [2, 2],
        [3, 1],
      ]);
      expect(b.repeatable).toBe(true);
    }
  });

  it('hazañas con aval y privadas por defecto', () => {
    expect(BADGES.filter((b) => b.aval).map((b) => b.key).sort()).toEqual(['bowling_perfect_game', 'bowling_seven_ten', 'golf_hole_in_one', 'golf_par_round']);
    const eagle = badgeDef('golf_eagle')!;
    expect(needsAval(eagle)).toBe(false);
    expect(needsAval(eagle, 'albatross')).toBe(true);
    expect(nameOf(eagle, { sport: 'golf', alt: 'albatross' })).toBe('¡Albatros!');
    expect(BADGES.filter((b) => b.privateByDefault).map((b) => b.key)).toEqual(['bowling_breakthrough']);
  });

  it('cada evaluador tiene insignias y cada trabajo sabe qué evaluadores corre', () => {
    for (const id of Object.keys(EVALUATOR_JOBS) as (keyof typeof EVALUATOR_JOBS)[]) expect(badgesOfEvaluator(id).length, id).toBeGreaterThan(0);
    expect(evaluatorsFor('temporada').sort()).toEqual(['season_league', 'season_staff']);
    expect(evaluatorsFor('cajas')).toEqual(['box_month']);
    expect(evaluatorsFor('aviso')).toEqual([]);
  });
});

describe('catálogo: ayudas', () => {
  it('variantes: 3x3, 9 hoyos y cuenta', () => {
    expect(variantsOf('basketball', { is3x3: true })).toEqual(['basketball3x3', 'basketball']);
    expect(variantsOf('golf', { nineHoles: true })).toEqual(['golf9', 'golf']);
    expect(variantsOf('all')).toEqual([]);
    expect(pickVariant({ default: 1, futsal: 2 }, ['football'])).toBe(1);
    expect(pickVariant({ football: 5, futsal: 10 }, ['futsal'])).toBe(10);
    expect(pickVariant({ football: 5 }, ['futsal'])).toBeUndefined();
    expect(pickVariant(['juego', 'juegos'] as const, ['bowling'])).toEqual(['juego', 'juegos']);
  });

  it('umbrales por deporte y variante', () => {
    const goals = badgeDef('football_goals')!;
    expect(thresholdOf(goals, 1, 'football')).toBe(5);
    expect(thresholdOf(goals, 1, 'futsal')).toBe(10);
    const pts = badgeDef('basketball_points_game')!;
    expect(thresholdOf(pts, 3, 'basketball')).toBe(30);
    expect(thresholdOf(pts, 3, 'basketball3x3')).toBe(14);
    const barrier = badgeDef('golf_break_barrier')!;
    expect(thresholdOf(barrier, 4, 'golf9')).toBe(40);
    expect(rarityOf(badgeDef('racket_bagel')!, 0, 'pickleball')).toBe('R');
    expect(rarityOf(badgeDef('racket_bagel')!, 0, 'padel')).toBe('PC');
    expect(rarityOf(badgeDef('racket_bagel')!, 0, 'table_tennis')).toBe('R');
    // Remontada: desde 0-1 en sets (o juegos); en ping pong desde 0-2 en juegos.
    expect(paramOf(badgeDef('racket_comeback')!, 'down', 'tennis')).toBe(1);
    expect(paramOf(badgeDef('racket_comeback')!, 'down', 'table_tennis')).toBe(2);
    expect(paramOf(badgeDef('most_improved_month')!, 'minGain', 'golf')).toBe(2);
  });

  it('nivel alcanzado, todos los niveles y el siguiente', () => {
    const games = badgeDef('bowling_games')!;
    expect(levelFor(games, 29, 'bowling')).toBeNull();
    expect(levelsReached(games, 120, 'bowling')).toEqual([1, 2]);
    expect(levelFor(games, 1000, 'bowling')).toBe(4);
    expect(nextLevel(games, 120, 'bowling')).toEqual({ level: 3, target: 300 });
    expect(nextLevel(games, 1000, 'bowling')).toBeNull();
    // «Por debajo de»: 89 rompe las barreras de 110, 100 y 90.
    const barrier = badgeDef('golf_break_barrier')!;
    expect(levelsReached(barrier, 89, 'golf')).toEqual([1, 2, 3]);
    expect(levelFor(barrier, 90, 'golf')).toBe(2);
    expect(nextLevel(barrier, 95, 'golf')).toEqual({ level: 3, target: 90 });
    expect(levelFor(badgeDef('strong_start')!, 4, 'all')).toBe(0);
    expect(nextLevel(badgeDef('strong_start')!, 2, 'all')).toEqual({ level: 0, target: 4 });
    expect(levelsReached(badgeDef('event_podium')!, 2, 'bowling')).toEqual([2]);
    expect([placeLevel(1), placeLevel(2), placeLevel(3), placeLevel(4)]).toEqual([3, 2, 1, null]);
  });

  it('textos por deporte, nivel y cara', () => {
    expect(nameOf(badgeDef('debut')!, { sport: 'bowling' })).toBe('Primera línea');
    expect(nameOf(badgeDef('debut')!, { sport: 'futsal' })).toBe('Debut en la cancha');
    expect(nameOf(badgeDef('team_unbeaten')!, { sport: 'basketball' })).toBe('Racha ganadora');
    expect(levelNameOf(badgeDef('football_goals_in_match')!, 1, { sport: 'futsal' })).toBe('Hat-trick');
    expect(levelNameOf(badgeDef('football_goals_in_match')!, 1, { sport: 'football' })).toBe('Doblete');
    expect(levelNameOf(badgeDef('bowling_games')!, 4)).toBe('Platino');
    expect(levelNameOf(badgeDef('debut')!, 0)).toBe('Única');
    expect(descriptionOf(badgeDef('event_podium')!, { sport: 'golf', level: 2 })).toBe('Quedaste en segundo lugar en {evento}.');
    expect(nameOf(badgeDef('season_podium')!, { sport: 'padel', alt: 'torneo' })).toBe('Título del torneo');
    expect(unitOf(badgeDef('bowling_games')!, 1)).toBe('juego');
    expect(unitOf(badgeDef('climbing')!, 3, { sport: 'golf' })).toBe('golpes');
    expect(fillText('Ya llevas {n} juegos en {liga}.', { n: 30 })).toBe('Ya llevas 30 juegos en {liga}.');
    expect(fillText(nameOf(badgeDef('year_recap')!), { anio: 2026 })).toBe('Tu 2026');
  });

  it('«badges_auto»: sin títulos apaga las 24 de liga que comparan; ninguna apaga las de liga; las de cuenta siguen', () => {
    const podium = badgeDef('event_podium')!;
    const attendance = badgeDef('perfect_attendance_month')!;
    const regular = badgeDef('monthly_regular')!;
    expect([allowedBy(podium, 'todas'), allowedBy(podium, 'sin_titulos'), allowedBy(podium, 'ninguna')]).toEqual([true, false, false]);
    expect([allowedBy(attendance, 'sin_titulos'), allowedBy(attendance, 'ninguna')]).toEqual([true, false]);
    expect(allowedBy(regular, 'ninguna')).toBe(true);
    expect(BADGES.filter((b) => !allowedBy(b, 'sin_titulos'))).toHaveLength(24);
  });
});

describe('catálogo: ping pong', () => {
  it('entra en las de raqueta (no en la noche) con sus propios textos', () => {
    const keys = badgesForSport('table_tennis').map((b) => b.key);
    const racket = ['racket_matches', 'racket_wins', 'racket_win_streak', 'racket_bagel', 'racket_comeback', 'racket_tiebreaks', 'racket_upset', 'racket_partners'];
    const formats = ['racket_ladder_climber', 'box_top_month', 'box_promoted', 'ladder_top', 'honor_word'];
    const titles = ['event_podium', 'streak_month', 'perfect_attendance_month', 'player_of_month', 'figure_of_year'];
    for (const k of [...racket, ...formats, ...titles]) expect(keys).toContain(k);
    expect(keys).not.toContain('racket_night_champion');
    const o = { sport: 'table_tennis' as const };
    expect(nameOf(badgeDef('debut')!, o)).toBe('Debut en la mesa');
    expect(nameOf(badgeDef('racket_bagel')!, o)).toBe('Zapatero');
    expect(descriptionOf(badgeDef('racket_bagel')!, o)).toBe('Ganaste un juego 11-0.');
    expect(howOf(badgeDef('racket_bagel')!, o)).toBe('Gana un juego 11-0 en un partido confirmado.');
    expect(descriptionOf(badgeDef('racket_comeback')!, o)).toBe('Ibas 0-2 en juegos y le diste la vuelta.');
    expect(nameOf(badgeDef('racket_tiebreaks')!, o)).toBe('Al filo');
    expect(descriptionOf(badgeDef('racket_tiebreaks')!, o)).toBe('Ganaste {n} juegos después del 10-10.');
    expect(unitOf(badgeDef('racket_tiebreaks')!, 2, o)).toBe('juegos');
    expect(howOf(badgeDef('racket_wins')!, o)).toBe('Gana {n} partidos que confirme el rival (máximo 3 por mes contra el mismo).');
    // Los demás deportes de raqueta no cambian.
    expect(nameOf(badgeDef('racket_bagel')!, { sport: 'tennis' })).toBe('Set en blanco');
    expect(howOf(badgeDef('racket_wins')!, { sport: 'padel' })).toBe('Gana {n} partidos a sets que confirme el rival (máximo 3 por mes contra el mismo).');
    for (const [key, name, n] of [
      ['player_of_month', 'minMatches', 4],
      ['most_improved_month', 'minGain', 8],
      ['streak_month', 'minRun', 4],
      ['figure_of_year', 'minMatches', 12],
      ['progress_of_year', 'minGain', 10],
      ['progress_of_year', 'minMatchesPerHalf', 8],
      ['season_most_improved', 'minGain', 10],
      ['season_most_improved', 'minPerHalf', 5],
      ['season_attendance', 'minDates', 6],
    ] as const) {
      expect([key, name, paramOf(badgeDef(key)!, name, 'table_tennis')]).toEqual([key, name, n]);
    }
  });
});
