/**
 * Las piezas chicas de esports (§11.4) dibujadas a texto (renderToString): el monograma del juego, los chips de rango,
 * de ID, de inscripción y de fase, el logo del equipo (o su tag en un círculo) y el color del deporte.
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GAME_IDS, GAMES, PHASE_TEXT, type Phase } from '../../sports/esports';
import {
  EntryStatusChip,
  EsportsTint,
  GameMark,
  IdChip,
  PHASE_TONE,
  PhaseChip,
  RankChip,
  TeamLogo,
  entryStatusText,
  idChipText,
  monoFontSize,
  rankChipText,
  teamInitials,
} from './bits';

const render = (el: ReactElement) => renderToString(el);
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('GameMark', () => {
  it('el monograma en su color, con el nombre del juego para el lector de pantalla (24, 32 y 48 px)', () => {
    const out = render(h(GameMark, { game: 'valorant' }));
    expect(out).toContain('role="img"');
    expect(out).toContain('aria-label="VALORANT"');
    expect(out).toContain(`fill="${GAMES.valorant.color}"`);
    expect(text(out)).toBe('VAL');
    expect(out).toContain('size-8');
    expect(render(h(GameMark, { game: 'rocket_league', size: 'sm' }))).toContain('size-6');
    expect(render(h(GameMark, { game: 'pubg_mobile', size: 'lg', className: 'mx-auto' }))).toMatch(/class="[^"]*size-12[^"]*mx-auto/);
  });

  it('todos los juegos: su monograma cabe (menos letras, más grandes)', () => {
    for (const id of GAME_IDS) {
      const out = render(h(GameMark, { game: id }));
      expect(text(out), id).toBe(GAMES[id].mono);
      expect(out, id).toContain(`aria-label="${GAMES[id].name.replace(/&/g, '&amp;')}"`);
    }
    expect(monoFontSize('FC')).toBeGreaterThan(monoFontSize('VAL'));
    expect(monoFontSize('VAL')).toBeGreaterThan(monoFontSize('MLBB'));
  });

  it('un juego que esta versión no conoce: un cuadro neutro con «?»', () => {
    const out = render(h(GameMark, { game: 'tetris' as never }));
    expect(out).toContain('aria-label="Juego"');
    expect(text(out)).toBe('?');
  });
});

describe('chips', () => {
  it('rango: «· Verificado» solo si salió verificado; si no, «· Declarado»; nada sin rango', () => {
    expect(rankChipText('lol', { tier: 'diamond', div: 2 }, 'verificado')).toBe('Diamante II · Verificado');
    expect(rankChipText('valorant', { tier: 'diamond', div: 2 }, 'declarado')).toBe('Diamante 2 · Declarado');
    expect(rankChipText('lol', { tier: 'gold', div: 4 }, 'declarado')).toBe('Oro IV · Declarado');
    // Lo de antes (una captura aprobada) ya no existe: se ve declarado.
    expect(rankChipText('valorant', { tier: 'silver', div: 3 }, 'captura' as never)).toBe('Plata 3 · Declarado');
    // Sin fuente, solo el rango.
    expect(rankChipText('clash_royale', { value: 7320 })).toMatch(/^7.320 trofeos$/);
    expect(rankChipText('valorant', null, 'verificado')).toBe('');
    const verified = render(h(RankChip, { game: 'lol', rank: { tier: 'gold', div: 1 }, source: 'verificado' }));
    expect(text(verified)).toBe('Oro I · Verificado');
    expect(verified).toContain('bg-ok-soft');
    const declared = render(h(RankChip, { game: 'valorant', rank: { tier: 'silver', div: 3 }, source: 'declarado' }));
    expect(text(declared)).toBe('Plata 3 · Declarado');
    expect(declared).toContain('bg-surface-2');
    expect(render(h(RankChip, { game: 'valorant', rank: undefined }))).toBe('');
  });

  it('ID de juego por de dónde sale: cuenta conectada y comprobado (verde) o declarado (neutro)', () => {
    expect(idChipText('login')).toBe('Cuenta conectada');
    expect(idChipText('busqueda')).toBe('Comprobado');
    expect(idChipText('declarado')).toBe('Declarado');
    // Sin ownership, por el estado; lo viejo ('codigo') sale por el estado.
    expect(idChipText(undefined, 'confirmado')).toBe('Comprobado');
    expect(idChipText(undefined, 'pendiente')).toBe('Declarado');
    expect(idChipText()).toBe('Declarado');
    expect(idChipText('codigo' as never, 'pendiente')).toBe('Declarado');
    const login = render(h(IdChip, { status: 'confirmado', ownership: 'login' }));
    expect(text(login)).toBe('Cuenta conectada');
    expect(login).toContain('bg-ok-soft');
    const found = render(h(IdChip, { status: 'confirmado', ownership: 'busqueda' }));
    expect(text(found)).toBe('Comprobado');
    expect(found).toContain('bg-ok-soft');
    const declared = render(h(IdChip, { status: 'pendiente', ownership: 'declarado' }));
    expect(text(declared)).toBe('Declarado');
    expect(declared).toContain('bg-surface-2');
    expect(text(render(h(IdChip, { ownership: 'declarado' })))).toBe('Declarado');
  });

  it('inscripción: por aprobar, aprobado (o con check-in), rechazado, se retiró, en un equipo', () => {
    expect(entryStatusText('pending')).toBe('Por aprobar');
    expect(entryStatusText('approved')).toBe('Aprobado');
    expect(entryStatusText('approved', true)).toBe('Check-in hecho');
    expect(entryStatusText('pending', true)).toBe('Por aprobar');
    expect(entryStatusText('rejected')).toBe('Rechazado');
    expect(entryStatusText('withdrawn')).toBe('Se retiró');
    expect(entryStatusText('assigned')).toBe('En un equipo');
    const out = render(h(EntryStatusChip, { status: 'pending' }));
    expect(text(out)).toBe('Por aprobar');
    expect(out).toContain('bg-warn-soft');
  });

  it('fase del torneo con su texto y su tono', () => {
    for (const phase of Object.keys(PHASE_TEXT) as Phase[]) {
      const out = render(h(PhaseChip, { phase }));
      expect(text(out)).toBe(PHASE_TEXT[phase]);
      expect(PHASE_TONE[phase]).toBeTruthy();
    }
    expect(render(h(PhaseChip, { phase: 'registration' }))).toContain('bg-ok-soft');
    expect(render(h(PhaseChip, { phase: 'cancelled' }))).toContain('bg-danger-soft');
  });
});

describe('TeamLogo', () => {
  it('sin logo: el tag en un círculo (o las primeras letras del nombre)', () => {
    const out = render(h(TeamLogo, { path: null, name: 'Los Tigres', tag: 'TGR' }));
    expect(text(out)).toBe('TGR');
    expect(out).toContain('rounded-full');
    expect(out).toContain('size-10');
    expect(teamInitials('Los Tigres', '')).toBe('LO');
    expect(teamInitials('  ', '')).toBe('?');
    expect(teamInitials('X', 'abcdefg')).toBe('ABCDE');
    expect(text(render(h(TeamLogo, { path: null, name: 'ñandú gaming', tag: '', className: 'size-16' })))).toBe('ÑA');
  });

  it('con logo: mientras llega su URL, un círculo vacío del mismo tamaño (sin saltos)', () => {
    const out = render(h(TeamLogo, { path: '01900000-0000-7000-8000-0000000000aa/01900000-0000-7000-8000-0000000000bb.webp', name: 'Turbo', tag: 'TRB' }));
    expect(text(out)).toBe('');
    expect(out).toMatch(/<span aria-hidden="true" class="[^"]*size-10 rounded-full/);
  });
});

describe('EsportsTint', () => {
  it('lo de adentro toma el violeta de esports', () => {
    const out = render(h(EsportsTint, null, h('b', null, 'hola')));
    expect(out).toContain('mm-tint-esports');
    expect(out).toContain('<b>hola</b>');
  });
});
