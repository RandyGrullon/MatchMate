/**
 * Los premios del torneo dibujados sin navegador (renderToString): los estados de la tarjeta (jugador y admin), el aviso
 * «El podio cambió», «Elegir premios» y «Entregar premios» (el lugar apagado por «a sí mismo» y el antes → ahora).
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { LeagueBadge } from '../../lib/data/leagueBadges';
import type { PrizeSlot, TournamentPodium, TournamentPrize } from '../../lib/data/prizes';
import { initialPicks, payloadOf, planDelivery } from '../../prizes/award';
import { cardModel } from '../../prizes/card';
import type { PrizeComp } from '../../prizes/catalog';
import type { PodiumProvider } from '../../prizes/providers';
import { initialRows, setupSections } from '../../prizes/setup';
import { FeedbackProvider } from '../feedback';
import { AwardBody } from './AwardPrizesSheet';
import { PickerBody } from './PrizePicker';
import { PrizesCardView, type PrizesCardViewProps } from './PrizesCard';

const render = (el: ReactElement) => renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, el)));
const text = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<title>[^<]*<\/title>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
const noop = () => undefined;
const NOW = Date.parse('2026-10-13T15:00:00Z');

const comp: PrizeComp = { lid: 'L1', scope: 'evento', refId: 'E1', kind: 'bowling', sport: 'bowling', name: 'Copa Aniversario', date: '2026-10-12', bowling: { type: 'torneo', hcpPercent: 80, hasTeams: true } };

const design = (id: string, name: string, template: string, over: Partial<LeagueBadge> = {}): LeagueBadge => ({
  id,
  leagueId: 'L1',
  name,
  description: '',
  shape: 'shield',
  palette: 'oro',
  color: null,
  icon: 'trophy',
  topText: 'TORNEO',
  periodText: '',
  template,
  limitKind: 'unica',
  byTeam: false,
  status: 'activa',
  createdBy: null,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '',
  given: 0,
  active: 0,
  locked: false,
  openReports: null,
  ...over,
});
const champ = design('B1', 'Campeón', 'champion');
const sub = design('B2', 'Subcampeón', 'runner_up', { palette: 'plata' });

const slot = (id: string, category: PrizeSlot['category'], place: 1 | 2 | 3, over: Partial<PrizeSlot> = {}): PrizeSlot => ({
  id,
  category,
  division: '',
  label: '',
  place,
  badgeId: place === 1 ? 'B1' : 'B2',
  title: '',
  winners: [],
  verified: false,
  deliveredAt: null,
  deliveredBy: null,
  editableUntil: null,
  updatedAt: '',
  ...over,
});
const prize = (slots: PrizeSlot[], over: Partial<TournamentPrize> = {}): TournamentPrize => ({
  id: 'Z1',
  leagueId: 'L1',
  scope: 'evento',
  refId: 'E1',
  period: 'OCT 2026',
  closedAt: null,
  closedBy: null,
  createdAt: '',
  updatedAt: '',
  slots,
  ...over,
});

const names: Record<string, string> = { ana: 'Ana', luis: 'Luis', pedro: 'Pedro', rosa: 'Rosa' };
const podium: PodiumProvider = (s) =>
  s.category === 'equipo'
    ? { status: 'listo', units: [{ ref: 't:T1', name: 'Los Strikers', teamId: 'T1', players: [{ id: 'ana', name: 'Ana' }, { id: 'luis', name: 'Luis' }], detail: '1170 pinos' }] }
    : s.place === 1
      ? { status: 'listo', units: [{ ref: 'p:pedro', name: 'Pedro', teamId: null, players: [{ id: 'pedro', name: 'Pedro' }], detail: '762 pinos' }] }
      : { status: 'listo', units: [{ ref: 'p:ana', name: 'Ana', teamId: null, players: [{ id: 'ana', name: 'Ana' }] }] };

const view = (p: Partial<PrizesCardViewProps> & Pick<PrizesCardViewProps, 'model'>) =>
  text(
    render(
      h(PrizesCardView, {
        sport: 'bowling',
        period: 'OCT 2026',
        base: '/l/L1',
        nameOf: (id: string) => names[id] ?? 'Jugador',
        canPick: false,
        canDeliver: false,
        isOwner: false,
        ready: true,
        now: NOW,
        onPick: noop,
        onAward: noop,
        onClosePrizes: noop,
        onOpenBadge: noop,
        ...p,
      }),
    ),
  );

describe('la tarjeta «Premios del torneo» (§6.1)', () => {
  const chosen = prize([slot('S1', 'equipo', 1), slot('S2', 'individual', 1), slot('S3', 'individual', 2)]);

  it('sin premios: quien diseña ve «Elegir premios»', () => {
    const t = view({ model: cardModel(comp, null, []), canPick: true });
    expect(t).toContain('Premios del torneo');
    expect(t).toContain('Elige qué insignia se lleva el campeón.');
    expect(t).toContain('Elegir premios');
  });

  it('elegidos, jugador: «El campeón se lleva…» con los dos podios del boliche y quién va ganando', () => {
    const t = view({ model: cardModel(comp, chosen, [champ, sub], { podium }) });
    expect(t).toContain('El campeón se lleva…');
    expect(t.indexOf('Equipos (scratch)')).toBeLessThan(t.indexOf('Individual (handicap)'));
    expect(t).toContain('1.er lugar · Campeón');
    expect(t).toContain('2.º lugar · Subcampeón');
    expect(t).toContain('Por ahora: Los Strikers (1170 pinos)');
    expect(t).toContain('Por ahora: Pedro (762 pinos)');
    expect(t).not.toContain('Entregar premios');
    expect(t).not.toContain('Cambiar premios');
  });

  it('elegidos, admin: cambiar y entregar (apagado hasta que termine, con el porqué)', () => {
    const on = view({ model: cardModel(comp, chosen, [champ, sub], { podium, admin: true }), canPick: true, canDeliver: true });
    expect(on).toContain('Entregar premios');
    expect(on).toContain('Cambiar premios');
    const html = render(
      h(PrizesCardView, {
        model: cardModel(comp, chosen, [champ, sub], { admin: true }),
        sport: 'bowling', period: 'OCT 2026', base: '/l/L1', nameOf: () => '', canPick: false, canDeliver: true, isOwner: false,
        ready: false, waitText: 'Se entregan cuando termine el torneo', now: NOW, onPick: noop, onAward: noop, onClosePrizes: noop, onOpenBadge: noop,
      }),
    );
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*Entregar premios/s);
    expect(text(html)).toContain('Se entregan cuando termine el torneo.');
  });

  it('entregados: «Campeones» con quién ganó; admin: plazo, revisar, cerrar y «El podio cambió»', () => {
    const d = { deliveredAt: '2026-10-12T22:00:00Z', editableUntil: '2026-10-26T22:00:00Z', verified: true };
    const done = prize([
      slot('S1', 'equipo', 1, { ...d, winners: [{ ref: 't:T1', name: 'Los Strikers', teamId: 'T1', players: ['ana', 'luis'] }] }),
      slot('S2', 'individual', 1, { ...d, winners: [{ ref: 'p:rosa', name: 'Rosa', teamId: null, players: ['rosa'] }] }),
    ]);
    const player = view({ model: cardModel(comp, done, [champ], { podium }) });
    expect(player).toContain('Campeones');
    expect(player).toContain('Los Strikers · Ana y Luis');
    expect(player).toContain('Rosa');
    expect(player).not.toContain('Por ahora');
    expect(player).not.toContain('El podio cambió');
    const admin = view({ model: cardModel(comp, done, [champ], { podium, admin: true }), canDeliver: true });
    expect(admin).toContain('El podio cambió: revisa los premios.');
    expect(admin).toContain('Puedes corregir hasta el');
    expect(admin).toContain('Revisar premios');
    expect(admin).toContain('Cerrar premios');
  });

  it('cerrados: sin cerrar ni revisar para un admin; el dueño sigue revisando', () => {
    const d = { deliveredAt: '2026-10-12T22:00:00Z', editableUntil: '2026-10-26T22:00:00Z' };
    const closed = prize([slot('S1', 'equipo', 1, { ...d, winners: [{ ref: 't:T1', name: 'Los Strikers', teamId: 'T1', players: ['ana'] }] })], { closedAt: '2026-10-13T00:00:00Z' });
    const admin = view({ model: cardModel(comp, closed, [champ], { admin: true }), canDeliver: true });
    expect(admin).toContain('Premios cerrados');
    expect(admin).toContain('Solo el dueño puede corregirlos.');
    expect(admin).not.toContain('Revisar premios');
    expect(admin).not.toContain('Cerrar premios');
    const owner = view({ model: cardModel(comp, closed, [champ], { admin: true }), canDeliver: true, canPick: true, isOwner: true });
    expect(owner).toContain('Revisar premios');
  });

  it('un lugar vencido no apaga la entrega de los que faltan (la base lo revisa lugar por lugar)', () => {
    const old = { deliveredAt: '2026-09-20T22:00:00Z', editableUntil: '2026-10-04T22:00:00Z' };
    const mixed = prize([slot('S1', 'equipo', 1, { ...old, winners: [{ ref: 't:T1', name: 'Los Strikers', teamId: 'T1', players: ['ana'] }] }), slot('S2', 'individual', 1)]);
    const admin = view({ model: cardModel(comp, mixed, [champ], { admin: true }), canDeliver: true });
    expect(admin).toContain('Revisar premios');
    expect(admin).toContain('Lo entregado hace más de 14 días solo lo corrige el dueño.');
    expect(admin).not.toContain('Solo el dueño puede corregirlos.');
    // Todo entregado y vencido: solo el dueño.
    const allOld = prize([mixed.slots[0]]);
    const done = view({ model: cardModel(comp, allOld, [champ], { admin: true }), canDeliver: true });
    expect(done).toContain('Solo el dueño puede corregirlos.');
    expect(done).not.toContain('Revisar premios');
  });

  it('un lugar quitado a propósito no dice «Nadie en este lugar» bajo «Campeones» ni «El podio cambió»', () => {
    const d = { deliveredAt: '2026-10-12T22:00:00Z', editableUntil: '2026-10-26T22:00:00Z' };
    const p = prize([
      slot('S1', 'equipo', 1, { ...d, winners: [{ ref: 't:T1', name: 'Los Strikers', teamId: 'T1', players: ['ana', 'luis'] }] }),
      slot('S2', 'individual', 1, { ...d, winners: [] }),
    ]);
    const t = view({ model: cardModel(comp, p, [champ], { podium, admin: true }), canDeliver: true });
    expect(t).not.toContain('Nadie en este lugar.');
    expect(t).not.toContain('El podio cambió');
    expect(t).toContain('Por ahora: Pedro (762 pinos)');
  });
});

describe('«Elegir premios» (§6.2)', () => {
  it('las dos secciones del boliche, los tres lugares, la cinta y el atajo; lo entregado no cambia', () => {
    const saved = prize([slot('S1', 'equipo', 1, { deliveredAt: '2026-10-12T22:00:00Z' })]);
    const sections = setupSections(comp, saved);
    const t = text(
      render(
        h(PickerBody, {
          sections,
          rows: initialRows(sections, saved, [champ, sub]),
          designs: [champ, sub],
          sport: 'bowling',
          period: 'OCT 2026',
          periodLocked: true,
          delivered: new Set(['equipo||1']),
          choosing: null,
          creating: null,
          ruleText: 'Los premios siguen esta regla: Equipos por scratch, Individual con handicap.',
          onPeriod: noop,
          onToggle: noop,
          onChoosing: noop,
          onChoose: noop,
          onCreate: noop,
          onDesign: noop,
          onUseTemplates: noop,
        }),
      ),
    );
    expect(t).toContain('Los premios siguen esta regla: Equipos por scratch, Individual con handicap.');
    expect(t).toContain('Cinta de las insignias');
    expect(t).toContain('Ya se entregaron premios: la cinta no cambia.');
    expect(t).toContain('Usar Campeón, Subcampeón y Tercer lugar');
    expect(t.indexOf('Equipos (scratch)')).toBeLessThan(t.indexOf('Individual (handicap)'));
    expect(t.match(/1\.er lugar/g)).toHaveLength(2);
    expect(t).toContain('Entregado');
  });

  it('el interruptor de cada lugar se toca en toda la fila (44 px)', () => {
    const sections = setupSections(comp, null);
    const html = render(
      h(PickerBody, {
        sections,
        rows: initialRows(sections, null, [champ, sub]),
        designs: [champ, sub],
        sport: 'bowling',
        period: 'OCT 2026',
        periodLocked: false,
        delivered: new Set<string>(),
        choosing: null,
        creating: null,
        onPeriod: noop,
        onToggle: noop,
        onChoosing: noop,
        onChoose: noop,
        onCreate: noop,
        onDesign: noop,
        onUseTemplates: noop,
      }),
    );
    expect(html).toMatch(/<label for="premio-equipo--1" class="[^"]*min-h-11[^"]*"><input id="premio-equipo--1" type="checkbox" role="switch"/);
  });

  it('la lista de un lugar: la plantilla de ese lugar arriba y «Crear» si la liga no la tiene', () => {
    const sections = setupSections(comp, null);
    const rows = { ...initialRows(sections, null, [champ, sub]), 'individual||2': { on: true, badgeId: 'B2' }, 'individual||3': { on: true, badgeId: null } };
    const list = (choosing: string) => {
      const html = render(
        h(PickerBody, {
          sections,
          rows,
          designs: [champ, sub],
          sport: 'bowling',
          period: 'OCT 2026',
          periodLocked: false,
          delivered: new Set<string>(),
          choosing,
          creating: null,
          onPeriod: noop,
          onToggle: noop,
          onChoosing: noop,
          onChoose: noop,
          onCreate: noop,
          onDesign: noop,
          onUseTemplates: noop,
        }),
      );
      return text(html.slice(html.indexOf('role="listbox"')));
    };
    const second = list('individual||2');
    expect(second.indexOf('Subcampeón')).toBeLessThan(second.indexOf('Campeón'));
    expect(second).not.toContain('Crear «');
    const third = list('individual||3');
    expect(third).toContain('Crear «Tercer lugar»');
    expect(third).toContain('Diseñar otra');
    expect(text(render(h(PickerBody, {
      sections, rows, designs: [champ, sub], sport: 'bowling', period: 'OCT 2026', periodLocked: false, delivered: new Set<string>(), choosing: null, creating: null,
      onPeriod: noop, onToggle: noop, onChoosing: noop, onChoose: noop, onCreate: noop, onDesign: noop, onUseTemplates: noop,
    })))).toContain('Elegir insignia');
  });
});

describe('«Entregar premios» (§6.3)', () => {
  const pod = (over: Partial<TournamentPodium> = {}): TournamentPodium => ({
    prizeId: 'Z1',
    kind: 'bowling',
    verified: true,
    slots: [
      { slotId: 'S1', verified: true, status: 'listo', finished: true, units: [{ ref: 't:T1', name: 'Los Strikers', teamId: 'T1', players: [{ id: 'ana', name: 'Ana' }, { id: 'luis', name: 'Luis' }] }], holders: [{ awardId: 'a1', playerId: 'rosa', teamId: null }], withdrawn: [] },
      { slotId: 'S2', verified: true, status: 'vacio', finished: true, units: [], holders: [], withdrawn: [] },
    ],
    ...over,
  });
  const body = (plans: ReturnType<typeof planDelivery>, warnings: string[] = []) =>
    text(
      render(
        h(AwardBody, {
          plans,
          picks: initialPicks(plans),
          designs: [champ, sub],
          sport: 'bowling',
          period: 'OCT 2026',
          nameOf: (id: string) => names[id] ?? 'Jugador',
          warnings,
          notify: true,
          canNotify: true,
          onToggleSlot: noop,
          onTogglePlayer: noop,
          onNotify: noop,
        }),
      ),
    );

  it('cada lugar con su insignia, sus jugadores marcados, los avisos y el antes → ahora', () => {
    const p = prize([slot('S1', 'equipo', 1, { deliveredAt: '2026-10-12T22:00:00Z', editableUntil: '2026-10-26T22:00:00Z' }), slot('S2', 'individual', 2)]);
    const plans = planDelivery(p, pod(), { comp, now: NOW });
    expect(payloadOf(plans, initialPicks(plans))).toEqual([{ slotId: 'S1', units: [{ ref: 't:T1', players: ['ana', 'luis'] }] }]);
    const t = body(plans, ['Hay 3 juegos por verificar: pueden cambiar el podio.']);
    expect(t).toContain('Hay 3 juegos por verificar: pueden cambiar el podio.');
    expect(t).toContain('1.er lugar · Equipos (scratch)');
    expect(t).toContain('2.º lugar · Individual (handicap)');
    expect(t).toContain('Los Strikers');
    expect(t).toContain('Entregar este lugar');
    expect(t).toContain('Antes: Rosa');
    expect(t).toContain('Ahora: Ana y Luis');
    expect(t).toContain('Nadie en este lugar.');
    expect(t).toContain('Avisar a los ganadores');
  });

  it('golf: el lugar de quien entrega va apagado («Estás en este podio»)', () => {
    const golf: PrizeComp = { ...comp, kind: 'golf', bowling: undefined };
    const p = prize([slot('G1', 'individual', 1)]);
    const pd: TournamentPodium = { prizeId: 'Z1', kind: 'golf', verified: false, slots: [{ slotId: 'G1', verified: false, status: 'telefono', finished: true, units: [], holders: [], withdrawn: [] }] };
    const plans = planDelivery(p, pd, { comp: golf, phone: () => ({ status: 'listo', units: [{ ref: 'p:ana', name: 'Ana', teamId: null, players: [{ id: 'ana', name: 'Ana' }] }] }), myPlayers: ['ana'] });
    const t = body(plans);
    expect(t).toContain('Estás en este podio: lo entrega otro admin o el dueño.');
    expect(t).not.toContain('Entregar este lugar');
    expect(payloadOf(plans, initialPicks(plans))).toEqual([]);
  });
});
