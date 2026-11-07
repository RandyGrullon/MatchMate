/**
 * Solo en la demostración en memoria (demoBackend.ts, /dev/empresa): En vivo (`/l/<liga>/vivo`) de las ligas ficticias
 * (demoLeague.ts). Contesta las RPC de src/lib/data/streams.ts que no son de los ajustes (league_streams, live_now,
 * start_stream y end_stream; set_league_live es de demoSettings.ts), con la misma forma que la base
 * (20261011000100_equipos_en_vivo.sql: stream_json, los permisos y los errores 'cerrado', 'invalido', 'duplicado',
 * 'limite'). Como en la base, con las transmisiones apagadas en la liga no sale ninguna (apagarlas las termina).
 *
 * De fábrica, en «Liga de Ejemplo» (se ven al prender «Transmisiones en vivo» en Ajustes): «Final de Ejemplo» en
 * YouTube (se ve dentro de la app) y «Práctica de Ejemplo» en Instagram (se abre afuera). Se guarda en sessionStorage y
 * se borra al salir de la demostración (forgetDemoLive). Todos los datos son ficticios.
 */
import { BackendError, type BackendErrorKind } from '@mm/lib/backend/types';
import { uuidv7 } from '@mm/lib/db/ids';
import { STREAM_TITLE_MAX } from '@mm/lib/data/streams';
import { normalizeStreamUrl, streamPlatform } from '@mm/lib/streams';
import { DEMO_LEAGUE } from './demoLeague';

type Row = Record<string, unknown>;
/** Las filas de una tabla de las ligas ficticias por debajo de esta capa (con los ajustes encima), sin filtrar. */
type Read = (table: string) => Row[];

const KEY = 'mm-demo-envivo';
const MIN = 60_000;

/** Una transmisión como la guarda la base (live_streams); `ended` = terminada. */
interface Stream {
  id: string;
  leagueId: string;
  matchId: string | null;
  eventId: string | null;
  url: string;
  platform: string;
  title: string | null;
  startedAt: string;
  startedBy: string;
  ended: boolean;
}

interface State {
  streams: Stream[];
}

const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();

function seed(uid: string): State {
  return {
    streams: [
      {
        id: '00000000-0000-7000-8000-0000000e1a01',
        leagueId: DEMO_LEAGUE,
        matchId: null,
        eventId: null,
        url: 'https://www.youtube.com/live/EJEMPLO1234',
        platform: 'youtube',
        title: 'Final de Ejemplo',
        startedAt: iso(-25 * MIN),
        startedBy: uid,
        ended: false,
      },
      {
        id: '00000000-0000-7000-8000-0000000e1a02',
        leagueId: DEMO_LEAGUE,
        matchId: null,
        eventId: null,
        url: 'https://www.instagram.com/ligadeejemplo/live/',
        platform: 'instagram',
        title: 'Práctica de Ejemplo',
        startedAt: iso(-70 * MIN),
        startedBy: uid,
        ended: false,
      },
    ],
  };
}

function load(uid: string): State {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return { ...seed(uid), ...(JSON.parse(raw) as Partial<State>) };
  } catch {
    // sin sessionStorage: lo de fábrica
  }
  const s = seed(uid);
  // Las horas de las de fábrica quedan fijas desde la primera vez.
  save(s);
  return s;
}

function save(s: State) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // sin sessionStorage: sigue en memoria hasta recargar
  }
}

export function forgetDemoLive() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // sin sessionStorage
  }
}

const fail = (message: string, kind: BackendErrorKind, code: string | null = null): never => {
  throw new BackendError(message, kind, code);
};

/**
 * Las RPC de En vivo. `read` da las filas de la capa de abajo (leagues con los ajustes encima, memberships, events y
 * matches). Devuelve `undefined` si la función no es suya.
 */
export function liveRpc(uid: string, fn: string, a: Record<string, unknown>, read: Read): unknown {
  const FNS = ['league_streams', 'live_now', 'start_stream', 'end_stream'];
  if (!FNS.includes(fn)) return undefined;
  const s = load(uid);
  const leagueOf = (id: unknown) => read('leagues').find((l) => l.id === id) ?? null;
  // Las transmisiones de las ligas de esports las lleva su demo (demoEsports.ts, con sus series).
  if ((fn === 'league_streams' || fn === 'start_stream') && leagueOf(a.p_league)?.sport === 'esports') return undefined;
  const memberOf = (league: unknown) => read('memberships').find((m) => m.league_id === league && m.user_id === uid) ?? null;
  const isAdmin = (league: unknown) => leagueOf(league)?.owner_id === uid || ['owner', 'admin'].includes(String(memberOf(league)?.role));
  // Admins y anotadores; en el boliche, solo los admins (private.stream_can).
  const canStream = (league: unknown) => isAdmin(league) || (memberOf(league)?.scorer === true && leagueOf(league)?.sport !== 'bowling');
  const playerName = (league: unknown, user: unknown) => String(read('memberships').find((m) => m.league_id === league && m.user_id === user)?.display_name ?? '') || 'Cuenta de Prueba';
  // «Tigres vs Leones» del partido o el nombre del evento (null si es de la liga).
  const labelOf = (st: Stream): string | null => {
    if (st.eventId) return String(read('events').find((e) => e.id === st.eventId)?.name ?? '') || null;
    if (st.matchId) {
      const sides = read('match_sides').filter((x) => x.match_id === st.matchId).sort((x, y) => Number(x.side) - Number(y.side));
      const names = sides.map((x) => String(x.label ?? '')).filter(Boolean);
      return names.length === 2 ? `${names[0]} vs ${names[1]}` : null;
    }
    return null;
  };
  const json = (st: Stream) => {
    const league = leagueOf(st.leagueId);
    return {
      id: st.id,
      leagueId: st.leagueId,
      leagueName: String(league?.name ?? ''),
      sport: String(league?.sport ?? 'bowling'),
      matchId: st.matchId,
      eventId: st.eventId,
      url: st.url,
      platform: st.platform,
      title: st.title,
      label: labelOf(st),
      startedAt: st.startedAt,
      startedBy: { id: st.startedBy, name: playerName(st.leagueId, st.startedBy) },
      canEnd: canStream(st.leagueId),
    };
  };
  // Las activas (las de una liga con las transmisiones apagadas no salen: la base las termina al apagarlas).
  const active = () =>
    s.streams.filter((st) => !st.ended && leagueOf(st.leagueId)?.live_enabled === true).sort((x, y) => (x.startedAt < y.startedAt ? 1 : x.startedAt > y.startedAt ? -1 : 0));

  switch (fn) {
    case 'league_streams': {
      if (!leagueOf(a.p_league)) return [];
      return active().filter((st) => st.leagueId === a.p_league).map(json);
    }
    case 'live_now': {
      const limit = Math.min(Math.max(Number(a.p_limit) || 10, 1), 50);
      return active().filter((st) => memberOf(st.leagueId) || leagueOf(st.leagueId)?.owner_id === uid).slice(0, limit).map(json);
    }
    case 'start_stream': {
      const league = leagueOf(a.p_league);
      if (!league) return fail('no_existe', 'not_found', 'no_existe');
      if (!canStream(league.id)) return fail('no_permitido', 'permission', 'no_permitido');
      if (league.live_enabled !== true) return fail('cerrado', 'validation', 'cerrado');
      const url = normalizeStreamUrl(String(a.p_url ?? ''));
      const platform = url ? streamPlatform(url) : null;
      const title = typeof a.p_title === 'string' && a.p_title.trim() ? a.p_title.trim() : null;
      const match = typeof a.p_match === 'string' ? a.p_match : null;
      const event = typeof a.p_event === 'string' ? a.p_event : null;
      if (!url || !platform || (title?.length ?? 0) > STREAM_TITLE_MAX || (match && event)) return fail('invalido', 'validation', 'invalido');
      const mine = active().filter((st) => st.leagueId === league.id);
      if ((match && mine.some((st) => st.matchId === match)) || (event && mine.some((st) => st.eventId === event))) return fail('duplicado', 'conflict', 'duplicado');
      if (mine.length >= 5) return fail('limite', 'validation', 'limite');
      const st: Stream = { id: uuidv7(), leagueId: String(league.id), matchId: match, eventId: event, url, platform, title, startedAt: iso(), startedBy: uid, ended: false };
      s.streams.push(st);
      save(s);
      return json(st);
    }
    case 'end_stream': {
      const st = s.streams.find((x) => x.id === a.p_stream);
      // Una que no es de aquí puede ser de una liga de esports (demoEsports.ts).
      if (!st) return undefined;
      if (!canStream(st.leagueId)) return fail('no_permitido', 'permission', 'no_permitido');
      if (!st.ended) {
        st.ended = true;
        save(s);
      }
      return null;
    }
  }
  return undefined;
}
