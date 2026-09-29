/**
 * La hoja de invitar sin pantalla: quién puede invitar, qué se ve según la búsqueda, quién se puede elegir, el
 * botón de enviar y el link para compartir.
 */
import { describe, expect, it } from 'vitest';
import type { PersonHit } from '../../lib/data/people';
import {
  PERSON_STATE_TEXT,
  canInviteTo,
  codeInviteUrl,
  handleOf,
  inviteLink,
  inviteShareText,
  inviteTitle,
  peopleView,
  personLabel,
  personState,
  personStateText,
  selectedSummary,
  selectionAfterSend,
  sendLabel,
  sendTone,
  toggleSelected,
} from './logic';

const hit = (id: string, extra: Partial<PersonHit> = {}): PersonHit => ({
  id,
  name: `Persona ${id}`,
  username: `p${id}`,
  isFollowing: false,
  followsYou: false,
  inLeague: false,
  invited: false,
  ...extra,
});

describe('quién puede invitar', () => {
  it('el admin a cualquiera de sus ligas; un miembro solo a una pública; nadie más', () => {
    const pub = { visibility: 'public' as const };
    const priv = { visibility: 'private' as const };
    expect(canInviteTo(pub, false, true)).toBe(true);
    expect(canInviteTo(priv, false, true)).toBe(false);
    expect(canInviteTo(priv, true, true)).toBe(true);
    // Superadmin sin ser miembro.
    expect(canInviteTo(priv, true, false)).toBe(true);
    expect(canInviteTo(pub, false, false)).toBe(false);
  });
});

describe('las personas', () => {
  it('quien ya está en la liga o ya tiene invitación sale marcado', () => {
    expect(personState(hit('a'))).toBeNull();
    expect(personState(hit('a', { inLeague: true }))).toBe('member');
    expect(personState(hit('a', { invited: true }))).toBe('invited');
    // Si está en la liga, eso manda.
    expect(personState(hit('a', { inLeague: true, invited: true }))).toBe('member');
    expect(PERSON_STATE_TEXT).toEqual({ member: 'En la liga', invited: 'Invitado' });
  });

  it('@usuario con la arroba (sin usuario todavía, nada) y lo que lee el lector de pantalla', () => {
    expect(handleOf('ana')).toBe('@ana');
    expect(handleOf('')).toBeNull();
    expect(handleOf(undefined)).toBeNull();
    expect(personLabel(hit('a', { name: 'Ana Pérez', username: 'ana' }))).toBe('Ana Pérez, @ana');
    expect(personLabel(hit('a', { name: 'Ana', username: 'ana', inLeague: true }))).toBe('Ana, @ana, ya está en la liga');
    expect(personLabel(hit('a', { name: 'Ana', username: '', invited: true }))).toBe('Ana, ya tiene invitación');
    expect(personLabel(hit('a', { name: '', username: 'ana' }))).toBe('@ana');
  });

  it('en un torneo: «En el torneo» (la hoja y el botón, «Invitar al torneo»)', () => {
    expect(personStateText('member')).toBe('En la liga');
    expect(personStateText('member', 'torneo')).toBe('En el torneo');
    expect(personStateText('invited', 'torneo')).toBe('Invitado');
    expect(personLabel(hit('a', { name: 'Ana', username: 'ana', inLeague: true }), 'torneo')).toBe('Ana, @ana, ya está en el torneo');
    expect(inviteTitle('liga')).toBe('Invitar a la liga');
    expect(inviteTitle('torneo')).toBe('Invitar al torneo');
  });

  it('después de enviar: salen quienes ya quedaron invitados o en la liga; se quedan a los que no les llegó', () => {
    const sel = new Map(['a', 'b', 'c', 'd', 'e'].map((id) => [id, hit(id)]));
    const next = selectionAfterSend(sel, [
      { userId: 'a', status: 'sent' },
      { userId: 'b', status: 'pending' },
      { userId: 'c', status: 'member' },
      { userId: 'd', status: 'declined' },
      { userId: 'e', status: 'unavailable' },
    ]);
    expect([...next.keys()]).toEqual(['d', 'e']);
    expect(selectionAfterSend(sel, [{ userId: 'x', status: 'sent' }])).toBe(sel);
    expect(sendTone([{ status: 'sent' }, { status: 'declined' }])).toBe('ok');
    expect(sendTone([{ status: 'declined' }, { status: 'pending' }])).toBe('error');
    expect(sendTone([])).toBe('error');
  });

  it('tocar elige o suelta; a quien ya está o ya tiene invitación no; no más de 50', () => {
    const none: ReadonlyMap<string, PersonHit> = new Map();
    const one = toggleSelected(none, hit('a'));
    expect([...one.keys()]).toEqual(['a']);
    expect(none.size).toBe(0);
    const two = toggleSelected(one, hit('b'));
    expect([...two.keys()]).toEqual(['a', 'b']);
    expect([...toggleSelected(two, hit('a')).keys()]).toEqual(['b']);
    // Ya en la liga o invitado: la misma selección.
    expect(toggleSelected(two, hit('c', { inLeague: true }))).toBe(two);
    expect(toggleSelected(two, hit('c', { invited: true }))).toBe(two);
    // En el tope no entra nadie más (pero sí se puede soltar).
    expect(toggleSelected(two, hit('c'), 2)).toBe(two);
    expect(toggleSelected(two, hit('a'), 2).size).toBe(1);
    const full = new Map(Array.from({ length: 50 }, (_, i) => [String(i), hit(String(i))]));
    expect(toggleSelected(full, hit('x'))).toBe(full);
  });

  it('el botón y a quiénes va', () => {
    expect(sendLabel(1)).toBe('Enviar invitación');
    expect(sendLabel(3)).toBe('Enviar a 3 personas');
    expect(selectedSummary([])).toBe('');
    expect(selectedSummary([{ name: 'Ana', username: 'ana' }])).toBe('Ana');
    expect(selectedSummary([{ name: 'Ana', username: 'ana' }, { name: '', username: 'beto' }])).toBe('Ana y @beto');
    const four = ['Ana', 'Beto', 'Carla', 'Dani'].map((name) => ({ name, username: name.toLowerCase() }));
    expect(selectedSummary(four.slice(0, 3))).toBe('Ana, Beto y Carla');
    expect(selectedSummary(four)).toBe('Ana, Beto y 2 más');
  });
});

describe('qué se ve según la búsqueda', () => {
  const live = (extra: Partial<Parameters<typeof peopleView>[1]> = {}) => ({ data: [] as unknown[], loading: false, settled: true, query: '', ...extra });

  it('sin buscar: las personas que sigo, o «Aún no sigues a nadie»', () => {
    expect(peopleView('', live({ data: [hit('a')] }))).toBe('following');
    expect(peopleView('', live())).toBe('no-following');
    expect(peopleView('', live({ loading: true }))).toBe('loading');
  });

  it('una letra: que escriba otra (la base no busca con menos de 2)', () => {
    expect(peopleView('a', live({ data: [hit('a')] }))).toBe('short');
    expect(peopleView(' @a ', live())).toBe('short');
  });

  it('buscando: lo encontrado, nadie, o esperando', () => {
    expect(peopleView('ana', live({ query: 'ana', data: [hit('a')] }))).toBe('results');
    expect(peopleView('ana', live({ query: 'ana' }))).toBe('none');
    expect(peopleView('ana', live({ query: 'ana', loading: true }))).toBe('loading');
    // Mientras espera a que deje de escribir se sigue viendo la lista de antes.
    expect(peopleView('ana', live({ query: '', settled: false, data: [hit('a')] }))).toBe('following');
    expect(peopleView('ana', live({ query: 'an', settled: false, data: [hit('a')] }))).toBe('results');
    // Sin nada que mostrar todavía: esperando (no «nadie» ni «no sigues a nadie»).
    expect(peopleView('ana', live({ query: '', settled: false }))).toBe('loading');
    expect(peopleView('ana', live({ query: 'an', settled: false }))).toBe('loading');
    // Borró hasta vacío desde una letra: espera la lista de las que sigue.
    expect(peopleView('', live({ query: 'a', settled: false }))).toBe('loading');
  });

  it('si falla y no hay nada que mostrar: el error', () => {
    const error = new Error('Failed to fetch');
    expect(peopleView('ana', live({ query: 'ana', error }))).toBe('error');
    expect(peopleView('', live({ error }))).toBe('error');
    // Con algo en pantalla se sigue viendo.
    expect(peopleView('ana', live({ query: 'ana', error, data: [hit('a')] }))).toBe('results');
  });
});

describe('el link para compartir', () => {
  const origin = 'https://matchmate.app';

  it('un miembro de una liga pública: el de la liga', () => {
    expect(inviteLink({ lid: 'l1', isAdmin: false, code: undefined, origin })).toEqual({ kind: 'url', url: 'https://matchmate.app/l/l1' });
  });

  it('el admin: el de invitación con código; mientras se pide, esperando; sin código, ninguno (se crea en la hoja)', () => {
    expect(inviteLink({ lid: 'l1', isAdmin: true, code: 'ABC123', origin })).toEqual({ kind: 'url', url: 'https://matchmate.app/unirse/ABC123' });
    expect(inviteLink({ lid: 'l1', isAdmin: true, code: undefined, origin })).toEqual({ kind: 'loading' });
    expect(inviteLink({ lid: 'l1', isAdmin: true, code: null, origin })).toEqual({ kind: 'none' });
    expect(codeInviteUrl(origin, 'XYZ')).toBe('https://matchmate.app/unirse/XYZ');
  });

  it('el texto que va con el link', () => {
    expect(inviteShareText('Liga de los martes')).toBe('Únete a Liga de los martes en MatchMate');
    expect(inviteShareText('  ')).toBe('Únete a mi liga en MatchMate');
  });
});
