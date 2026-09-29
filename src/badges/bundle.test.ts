/**
 * El motor empaquetado para Deno (supabase/functions/_shared/badges-engine.gen.js, scripts/badges/bundle.mjs): está al
 * día con src/badges, es un solo ESM sin imports y da lo mismo que el código de src. Si falla la primera prueba:
 * `pnpm badges:bundle` y se sube el archivo generado con el cambio.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXPORTS, OUT_JS, ROOT, bodyOf, buildEngine, headerHashes, sourceHash, staleness } from '../../scripts/badges/bundle.mjs';
import * as bundled from '../../supabase/functions/_shared/badges-engine.gen.js';
import { evaluateJob } from './edge';
import { snapEntry, snapEvent, photoId } from './testkit';
import { NOW, job, player, snap, world } from './evaluators/fixtures';

const fresh = await buildEngine();
const current = readFileSync(join(ROOT, OUT_JS), 'utf8');

describe('motor empaquetado', () => {
  it('está al día con src/badges (si no: pnpm badges:bundle)', () => {
    expect(staleness(fresh), 'Corre pnpm badges:bundle y sube el archivo generado').toBeNull();
    expect(bundled.SOURCE_HASH).toBe(fresh.sourceHash);
  });

  it('un solo ESM sin imports que exporta lo que usa la función', () => {
    const body = bodyOf(current);
    expect(body).not.toMatch(/^\s*import[\s{*'"]/m);
    expect(body).not.toMatch(/\bimport\s*\(|\brequire\s*\(/);
    expect(Object.keys(bundled).sort()).toEqual([...EXPORTS].sort());
    expect(current.split('\n')[0]).toBe('// @ts-self-types="./badges-engine.gen.d.ts"');
    // Más de 50 archivos de src entran (catálogo, reglas, evaluadores y los helpers de src/lib y src/sports).
    expect(fresh.modules).toBeGreaterThan(50);
  });

  it('se da cuenta de un archivo viejo o editado a mano', () => {
    const { source, output } = headerHashes(current);
    expect(source).toBe(fresh.sourceHash);
    expect(output).toMatch(/^sha256-[0-9a-f]{64}$/);
    expect(staleness(fresh, current.replace(source!, `sha256-${'0'.repeat(64)}`))).toContain('es de otro código');
    expect(staleness(fresh, current.replace('export { ', '// a mano\nexport { '))).toContain('se editó a mano');
    expect(staleness(fresh, null)).toContain('falta');
    // Otro código con la cabecera rehecha a la par (otra versión de rolldown): la fuente es la misma, la salida no.
    const other = `${bodyOf(current)}// otra herramienta\n`;
    const head = current.replace(/\r\n?/g, '\n').split('\n// ---\n')[0].replace(output!, `sha256-${createHash('sha256').update(other, 'utf8').digest('hex')}`);
    const rebuilt = `${head}\n// ---\n${other}`;
    expect(headerHashes(rebuilt).output).toBe(`sha256-${createHash('sha256').update(bodyOf(rebuilt), 'utf8').digest('hex')}`);
    expect(staleness(fresh, rebuilt)).toContain('no es lo que empaqueta hoy');
    // El hash no depende del orden ni de los saltos de línea de Windows, sí del contenido y de la ruta.
    const a = { path: 'src/a.ts', text: 'export const a = 1;\n' };
    const b = { path: 'src/b.ts', text: 'export const b = 2;\n' };
    expect(sourceHash([a, b])).toBe(sourceHash([b, { ...a, text: 'export const a = 1;\r\n' }]));
    expect(sourceHash([a, b])).not.toBe(sourceHash([a, { ...b, text: 'export const b = 3;\n' }]));
    expect(sourceHash([a, b])).not.toBe(sourceHash([a, { ...b, path: 'src/c.ts' }]));
  });

  it('da lo mismo que src/badges, con los nombres para el push', () => {
    // p1 (cuenta u1) en la liga real 'L' de boliche: tres noches de 200+ con foto.
    let photo = 0;
    const events = [1, 2, 3].map((d) => snapEvent(`e${d}`, { date: `2026-10-0${d}` }));
    const entries = events.map((e, i) => snapEntry(`x${i + 1}`, e.id, 'p1', [200 + i * 10, 190, 205], [1, 2, 3].map(() => photoId(++photo))));
    const j = job('resultado', { ref: 'entry:x3' });
    const s = snap(j, world('bowling', { players: [player('p1', 'L', 'u1')], events, entries }));
    const mine = evaluateJob(j, s, NOW);
    const theirs = bundled.evaluateJob(j, s, NOW);
    expect(theirs).toEqual(mine);
    const awards = theirs.filter((d) => d.kind === 'award');
    expect(awards.length).toBeGreaterThan(0);
    for (const d of awards) expect((d.context as { name?: unknown }).name, d.badge_key).toEqual(expect.any(String));
  });
});
