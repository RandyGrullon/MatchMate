import { describe, expect, it } from 'vitest';
import { BALL_BRANDS, BALL_CATALOG, catalogBall, searchBallCatalog, type CatalogCover } from './ballCatalog';

const COVERS: readonly CatalogCover[] = ['solida', 'perlada', 'hibrida', 'uretano', 'poliester'];
const kebab = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

describe('BALL_CATALOG', () => {
  it('tiene cientos de modelos', () => {
    expect(BALL_CATALOG.length).toBeGreaterThanOrEqual(250);
    expect(BALL_CATALOG.length).toBeLessThanOrEqual(450);
  });

  it('las claves son únicas y con la forma marca:modelo', () => {
    const ids = BALL_CATALOG.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of BALL_CATALOG) {
      expect(b.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(b.id.length).toBeLessThanOrEqual(80);
      expect(b.id.split(':')[0]).toBe(kebab(b.brand));
    }
  });

  it('no repite el mismo modelo en una marca', () => {
    const keys = BALL_CATALOG.map((b) => `${b.brand}|${b.name.toLowerCase()}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('cada marca está en BALL_BRANDS, y están las marcas principales', () => {
    for (const b of BALL_CATALOG) expect(BALL_BRANDS).toContain(b.brand);
    const main = ['Storm', 'Roto Grip', '900 Global', 'Motiv', 'Hammer', 'Brunswick', 'Ebonite', 'Track', 'Radical'];
    for (const brand of [...main, 'Columbia 300', 'DV8', 'Pyramid']) expect(BALL_BRANDS).toContain(brand);
    expect([...BALL_BRANDS]).toEqual([...BALL_BRANDS].sort((a, b) => a.localeCompare(b, 'es')));
  });

  it('cubiertas, núcleo, colores y años válidos', () => {
    for (const b of BALL_CATALOG) {
      expect(COVERS).toContain(b.cover);
      expect(b.name.trim()).toBe(b.name);
      expect(b.name).not.toBe('');
      if (b.coverstock !== undefined) expect(b.coverstock.trim()).not.toBe('');
      if (b.core !== undefined) expect(['simetrico', 'asimetrico']).toContain(b.core);
      if (b.year !== undefined) {
        expect(Number.isInteger(b.year)).toBe(true);
        expect(b.year).toBeGreaterThanOrEqual(1990);
        expect(b.year).toBeLessThanOrEqual(2027);
      }
      if (b.colors !== undefined) {
        expect(b.colors.length).toBeGreaterThanOrEqual(1);
        expect(b.colors.length).toBeLessThanOrEqual(3);
        for (const c of b.colors) expect(c).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it('trae las de entrada y las de spare', () => {
    const ids = ['storm:tropical-surge', 'storm:pitch-black', 'brunswick:rhino', 'brunswick:tzone'];
    for (const id of [...ids, 'columbia-300:white-dot', 'ebonite:maxim', 'hammer:purple-pearl-urethane']) {
      expect(catalogBall(id), id).not.toBeNull();
    }
    expect(catalogBall('storm:pitch-black')?.cover).toBe('uretano');
    expect(catalogBall('brunswick:tzone')?.cover).toBe('poliester');
  });
});

describe('catalogBall', () => {
  it('busca por clave', () => {
    expect(catalogBall('storm:phaze-ii')).toMatchObject({
      brand: 'Storm',
      name: 'Phaze II',
      cover: 'solida',
      core: 'simetrico',
      year: 2016,
    });
    expect(catalogBall('storm:no-existe')).toBeNull();
    expect(catalogBall(null)).toBeNull();
    expect(catalogBall(undefined)).toBeNull();
    expect(catalogBall('')).toBeNull();
  });
});

describe('searchBallCatalog', () => {
  const isPhaze = (b: { brand: string; name: string }) => b.brand === 'Storm' && b.name.startsWith('Phaze');

  it('«storm phaze» trae primero los Phaze de Storm', () => {
    const r = searchBallCatalog('storm phaze');
    expect(r.length).toBeGreaterThanOrEqual(5);
    const phazes = BALL_CATALOG.filter(isPhaze).length;
    expect(r.slice(0, phazes).every(isPhaze)).toBe(true);
    expect(r[0].name).toBe('Phaze');
  });

  it('el orden de las palabras no importa', () => {
    expect(searchBallCatalog('phaze storm').map((b) => b.id)).toEqual(searchBallCatalog('storm phaze').map((b) => b.id));
  });

  it('sin acentos ni mayúsculas', () => {
    expect(searchBallCatalog('STÓRM PHÁZE').map((b) => b.id)).toEqual(searchBallCatalog('storm phaze').map((b) => b.id));
    expect(searchBallCatalog('  Hámmer   BLACK widow ').length).toBeGreaterThan(0);
  });

  it('«hammer black widow» trae los Black Widow', () => {
    const r = searchBallCatalog('hammer black widow');
    expect(r.length).toBeGreaterThanOrEqual(3);
    for (const b of r) {
      expect(b.brand).toBe('Hammer');
      expect(b.name).toContain('Black Widow');
    }
  });

  it('«roto grip hustle» trae los Hustle', () => {
    const r = searchBallCatalog('roto grip hustle');
    expect(r.length).toBeGreaterThanOrEqual(5);
    for (const b of r) expect(b.name.startsWith('Hustle')).toBe(true);
    expect(searchBallCatalog('hustle ink')[0].id).toBe('roto-grip:hustle-ink');
  });

  it('solo la marca trae los de la marca, los más nuevos primero', () => {
    const r = searchBallCatalog('motiv');
    expect(r.length).toBe(20);
    for (const b of r) expect(b.brand).toBe('Motiv');
    const years = r.map((b) => b.year ?? 0);
    expect(years).toEqual([...years].sort((a, b) => b - a));
    expect(searchBallCatalog('motiv', 5)).toHaveLength(5);
  });

  it('«global 900» es 900 Global; y se escribe junto o con guion', () => {
    expect(searchBallCatalog('global 900 zen').every((b) => b.brand === '900 Global')).toBe(true);
    expect(searchBallCatalog('global 900 zen').length).toBeGreaterThan(0);
    expect(searchBallCatalog('rotogrip gem').every((b) => b.brand === 'Roto Grip')).toBe(true);
    expect(searchBallCatalog('rotogrip gem').length).toBeGreaterThan(0);
    expect(searchBallCatalog('hyroad').some((b) => b.name === 'Hy-Road')).toBe(true);
    expect(searchBallCatalog('t-zone')[0]?.id).toBe('brunswick:tzone');
    expect(searchBallCatalog('iq tour').every((b) => b.name.startsWith('!Q Tour'))).toBe(true);
    expect(searchBallCatalog('phaze ai')[0]?.id).toBe('storm:phaze-ai');
  });

  it('los romanos también con cifras: «storm phaze 2» es el Phaze II', () => {
    expect(searchBallCatalog('storm phaze 2')[0]?.id).toBe('storm:phaze-ii');
    expect(searchBallCatalog('phaze 3')[0]?.name).toBe('Phaze III');
    expect(searchBallCatalog('storm phaze ii')[0]?.id).toBe('storm:phaze-ii');
    // Del lado de lo escrito no se cambia nada: «v» sigue buscando lo que empieza con v.
    expect(searchBallCatalog('900 global v').some((b) => b.name === 'Vengeance')).toBe(true);
  });

  it('vacío o sin coincidencias → []', () => {
    expect(searchBallCatalog('')).toEqual([]);
    expect(searchBallCatalog('   ')).toEqual([]);
    expect(searchBallCatalog('!!!')).toEqual([]);
    expect(searchBallCatalog('zzzz no existe')).toEqual([]);
  });
});
