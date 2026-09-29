import { BackendError } from '../backend/types';
import { invalidate, rpc, useLive, type Live } from './client';
import { setRsvp } from './events';
import { registerGolf } from './golf';
import { joinLeague } from './leagues';
import { joinSignup } from './racket';

/**
 * «¿Dónde juego esta semana?» (public_agenda, 20260929000700_temporadas.sql): lo que viene en las ligas públicas sin
 * menores donde uno se puede apuntar y hay lugar, con y sin cuenta (sin cuenta la base pone un tope por IP: se lee
 * poco y se guarda un rato). Cómo apuntarse según `join`: 'rsvp' = join_league + set_rsvp (boliche), 'golf' =
 * join_league + golf_register, 'signup' = join_signup (raqueta; ya entra a la liga).
 */

export type AgendaJoin = 'rsvp' | 'golf' | 'signup';

export interface AgendaCategory {
  id: string;
  name: string;
  cap: number | null;
  taken: number;
  spotsLeft: number | null;
}

export interface AgendaItem {
  eventId: string;
  leagueId: string;
  leagueName: string;
  sport: string;
  leagueKind: string;
  /** Logo de la liga (bucket público `logos`) o null; una base de antes de 20260929001000 no lo trae. */
  logoPath?: string | null;
  type: string;
  name: string;
  /** YYYY-MM-DD */
  date: string;
  /** 'HH:MM' (la hora del evento o la del horario de la liga). */
  time: string | null;
  /** «7:00 pm». */
  timeLabel: string | null;
  venue: string;
  join: AgendaJoin;
  /** Tope (raqueta con cupo); null = sin tope o no aplica. */
  cap: number | null;
  /** Cuántos van, están inscritos o apuntados. */
  taken: number | null;
  /** Lugares libres cuando hay tope. */
  spotsLeft: number | null;
  /** En la lista de espera (raqueta). */
  waitlist: number | null;
  /** Fecha límite de la inscripción (ISO), raqueta. */
  until: string | null;
  /** Torneo de raqueta por categorías. */
  categories: AgendaCategory[] | null;
  /** La cuenta ya va, está inscrita o apuntada. */
  mine: boolean;
  /** Ruta del evento en la app. */
  url: string;
}

export interface Agenda {
  from: string;
  days: number;
  items: AgendaItem[];
}

/** Días que se piden (la página filtra por día y deporte sin volver a pedir). */
export const AGENDA_DAYS = 14;

export const agendaTag = 'agenda';

const empty = (from = '', days = AGENDA_DAYS): Agenda => ({ from, days, items: [] });

export async function fetchAgenda(opts: { sport?: string | null; from?: string | null; days?: number } = {}): Promise<Agenda> {
  const r = await rpc<Agenda | null>('public_agenda', { p_sport: opts.sport ?? null, p_from: opts.from ?? null, p_days: opts.days ?? AGENDA_DAYS });
  return r && Array.isArray(r.items) ? r : empty(opts.from ?? '', opts.days);
}

/** Lo que viene en los próximos 14 días (todos los deportes: se filtra en la pantalla). */
export function useAgenda(): Live<Agenda> {
  return useLive<Agenda>('agenda:*', { kind: 'agenda' }, () => fetchAgenda(), {
    initial: empty(),
    tags: [agendaTag],
    // Sin cuenta hay tope de consultas por IP: no se vuelve a pedir en cada vuelta a la pantalla.
    staleMs: 2 * 60_000,
  });
}

/** Cómo quedó al apuntarse: vas (boliche), inscrito (golf), en la lista o en la espera (raqueta). */
export type AgendaJoined = { kind: 'going' } | { kind: 'registered' } | { kind: 'in' | 'wait'; position: number };

/**
 * «Me apunto» desde la agenda con el flujo de siempre: entra a la liga pública (si no es miembro) y pone «Voy», se
 * inscribe en la ronda o se apunta a la noche. Un torneo de raqueta (categoría, pareja) se hace en su evento.
 */
export async function joinAgendaItem(item: AgendaItem, user: { uid: string; name: string }): Promise<AgendaJoined> {
  let out: AgendaJoined;
  if (item.join === 'signup') {
    const r = await joinSignup(item.leagueId, item.eventId);
    out = { kind: r.status, position: r.position };
  } else {
    const playerId = await joinLeague(item.leagueId, user, null);
    if (!playerId) throw new BackendError('No se pudo entrar a la liga. Intenta de nuevo.', 'unknown');
    if (item.join === 'golf') {
      await registerGolf(item.leagueId, item.eventId);
      out = { kind: 'registered' };
    } else {
      await setRsvp(item.leagueId, item.eventId, playerId, true);
      out = { kind: 'going' };
    }
  }
  invalidate(agendaTag);
  return out;
}
