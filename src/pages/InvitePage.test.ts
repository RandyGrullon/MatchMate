/**
 * La pantalla de una invitación (/invitacion/<id>) dibujada sin navegador (renderToString) con datos de mentira:
 * sin cuenta, cargando, con error, una que no existe o no es tuya, pendiente (con y sin «¿Quién eres?») y ya
 * respondida (aceptada, rechazada, retirada o ya eres miembro).
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeagueInviteDetails } from '../lib/data/invites';
import { primeLogoUrl } from '../lib/logos';
import { FeedbackProvider } from '../components/feedback';

const state = vi.hoisted(() => ({
  auth: { user: { uid: 'u2' } as { uid: string } | null, profile: { name: 'Beto Ruiz' } as { name: string } | null, loading: false },
  details: { data: null as unknown, loading: false, error: null as Error | null },
  asked: [] as (string | null | undefined)[],
}));

vi.mock('../lib/auth', () => ({
  useAuth: () => state.auth,
  displayName: (a: { profile: { name: string } | null }) => a.profile?.name || 'Jugador',
}));
vi.mock('../lib/data/invites', () => ({
  useInviteDetails: (id: string | null | undefined) => {
    state.asked.push(id);
    return state.details;
  },
  respondInvite: vi.fn(),
  respondErrorText: () => 'No se pudo responder la invitación. Prueba otra vez.',
}));
vi.mock('../components/Shell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));

const { default: InvitePage } = await import('./InvitePage');

const invite = (extra: Partial<LeagueInviteDetails> = {}): LeagueInviteDetails => ({
  id: 'i1',
  status: 'pending',
  createdAt: '2026-09-28T12:00:00Z',
  invitedBy: { id: 'u1', name: 'Ana Pérez', username: 'ana' },
  mine: true,
  member: false,
  league: {
    id: 'l1',
    name: 'Liga Norte',
    logoPath: null,
    sport: 'bowling',
    kind: 'liga',
    visibility: 'private',
    venue: 'Bolera del Este',
    schedule: 'Martes 7:00 p. m.',
    seasonStart: '',
    seasonEnd: '',
    members: 12,
  },
  players: [],
  ...extra,
});

const render = () =>
  renderToString(
    h(
      MemoryRouter,
      { initialEntries: ['/invitacion/i1'] },
      h(FeedbackProvider, null, h(Routes, null, h(Route, { path: '/invitacion/:inviteId', element: h(InvitePage) }))),
    ),
  );
/** Texto visible (sin etiquetas), para buscar frases. */
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
const show = (data: LeagueInviteDetails | null, extra: Partial<typeof state.details> = {}) => {
  state.details = { data, loading: false, error: null, ...extra };
};

beforeEach(() => {
  state.auth = { user: { uid: 'u2' }, profile: { name: 'Beto Ruiz' }, loading: false };
  state.asked = [];
  show(invite());
});

describe('pantalla de una invitación', () => {
  it('sin cuenta: Entrar y Crear cuenta vuelven a la invitación (y no pregunta nada)', () => {
    state.auth = { user: null, profile: null, loading: false };
    const out = render();
    expect(text(out)).toContain('Entra para ver tu invitación');
    expect(out).toContain('href="/login?next=%2Finvitacion%2Fi1"');
    expect(out).toContain('href="/login?modo=registro&amp;next=%2Finvitacion%2Fi1"');
    expect(state.asked).toEqual([null]);
  });

  it('cargando la sesión o la invitación', () => {
    state.auth = { ...state.auth, loading: true };
    expect(render()).toContain('role="status"');
    state.auth = { ...state.auth, loading: false };
    show(null, { loading: true });
    expect(render()).toContain('role="status"');
  });

  it('no existe o no es para ti', () => {
    show(null);
    const t = text(render());
    expect(t).toContain('Esta invitación no existe o no es para ti.');
    expect(t).toContain('Ver ligas');
    expect(state.asked).toContain('i1');
  });

  it('con error: el aviso de error', () => {
    show(null, { error: new Error('sin señal') });
    expect(text(render())).toContain('No se pudieron cargar los datos');
  });

  it('pendiente: quién invitó, la liga, sus datos y Aceptar / Rechazar', () => {
    const out = render();
    const t = text(out);
    expect(t).toContain('Ana Pérez (@ana) te invitó a la liga');
    expect(t).toContain('Liga Norte');
    expect(t).toContain('Liga privada');
    expect(t).toContain('Boliche');
    expect(t).toContain('Bolera del Este');
    expect(t).toContain('Martes 7:00 p. m.');
    expect(t).toContain('12 miembros');
    expect(t).toContain('Aceptar');
    expect(t).toContain('Rechazar');
    // Sin jugadores libres no hay «¿Quién eres?».
    expect(out).not.toContain('type="radio"');
  });

  it('pendiente con jugadores libres: «¿Quién eres?» con la sugerencia por el nombre de la cuenta', () => {
    show(invite({ players: [{ id: 'p1', name: 'Beto Ruiz' }, { id: 'p2', name: 'Carla' }] }));
    const out = render();
    expect(out.match(/type="radio"/g)).toHaveLength(3);
    expect(text(out)).toContain('Aceptar como Beto Ruiz');
    expect(text(out)).toContain('No estoy en la lista');
  });

  it('pendiente con logo: la imagen de la liga en vez del ícono del deporte', () => {
    expect(render()).not.toContain('<img');
    const path = 'l1/0199a1b2-c3d4-7e5f-8a9b-000000000001.webp';
    primeLogoUrl(path, 'https://x/logos/l1.webp');
    show(invite({ league: { ...invite().league, logoPath: path } }));
    const out = render();
    expect(out).toContain('src="https://x/logos/l1.webp"');
    expect(text(out)).toContain('Liga Norte');
  });

  it('un torneo sin quien invitó (ya no tiene cuenta)', () => {
    show(invite({ invitedBy: null, league: { ...invite().league, kind: 'torneo', visibility: 'public' } }));
    const t = text(render());
    expect(t).toContain('Te invitaron al torneo');
    expect(t).toContain('Torneo');
  });

  it('aceptada o ya eres miembro: «Ya estás en la liga» con el link', () => {
    for (const d of [invite({ status: 'accepted', member: true }), invite({ member: true })]) {
      show(d);
      const out = render();
      expect(text(out)).toContain('Ya estás en la liga');
      expect(out).toContain('href="/l/l1"');
      expect(text(out)).not.toContain('Rechazar');
    }
  });

  it('rechazada o retirada: un mensaje corto', () => {
    show(invite({ status: 'declined' }));
    expect(text(render())).toContain('Rechazaste esta invitación');
    show(invite({ status: 'cancelled' }));
    const t = text(render());
    expect(t).toContain('Esta invitación ya no está disponible');
    expect(t).not.toContain('Aceptar');
  });

  it('la aceptó y después salió de la liga: «Ya no estás», sin link a la liga', () => {
    show(invite({ status: 'accepted', member: false }));
    const out = render();
    expect(text(out)).toContain('Ya no estás en la liga');
    expect(text(out)).not.toContain('Ya estás en la liga');
    expect(out).not.toContain('href="/l/l1"');
    expect(text(out)).toContain('Ver ligas');
  });

  it('la de otra cuenta (el superadmin): cómo está, sin Aceptar ni Rechazar', () => {
    show(invite({ mine: false }));
    const out = render();
    const t = text(out);
    expect(t).toContain('Esta invitación es de otra cuenta');
    expect(t).toContain('Ana Pérez (@ana) invitó a otra cuenta a Liga Norte. Está pendiente: solo esa cuenta la puede responder.');
    expect(t).not.toContain('Aceptar');
    expect(t).not.toContain('Rechazar');
    expect(t).not.toContain('te invitó');
    expect(out).toContain('href="/l/l1"');
    show(invite({ mine: false, status: 'accepted', member: true }));
    expect(text(render())).toContain('Está aceptada');
  });
});
