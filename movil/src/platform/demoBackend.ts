/**
 * Solo en desarrollo y en la vista previa web: un backend en memoria con una cuenta de prueba, para probar Mi empresa,
 * el modo de la cuenta y Dónde jugar sin entrar al Supabase real (ahí no se crean cuentas de prueba). Se prende y se
 * apaga en /dev/empresa (movil/src/app/dev/empresa.tsx). Lo hecho se guarda en sessionStorage: sigue al recargar la
 * página y se borra al salir de la demostración o al cerrar la pestaña.
 *
 * Contesta las mismas RPC de 20261105000100_empresas.sql con la misma forma (la lógica de la app es la de siempre:
 * src/lib/data/business.ts). Lo demás (ligas, social…) llega vacío. Todos los datos son ficticios.
 */
import { BackendError, type AuthEvent, type Backend, type Session } from '@mm/lib/backend/types';
import type { Business, BusinessStatus, OwnVenue, Venue, VenueDetail, VenuePhoto } from '@mm/lib/data/business';
import { uuidv7 } from '@mm/lib/db/ids';
import { CURRENT_LEGAL } from '@mm/lib/legal';
import { ballRpc, forgetDemoBalls } from './demoBalls';
import { demoPlayersSelect, forgetDemoPlayers, playersRpc } from './demoPlayers';
import { demoTeamsSelect, forgetDemoTeams, teamsRpc } from './demoTeams';
import { demoLeagueRpc, demoLeagueSelect, forgetDemoLeague } from './demoLeague';
import { demoSeasonsSelect, forgetDemoSeasons, seasonsRpc } from './demoSeasons';
import { demoMembersSelect, forgetDemoMembers, membersRpc } from './demoMembers';
import { accountRpc, demoAccountSelect, demoUpdatePassword, forgetDemoAccount } from './demoAccount';
import { demoSettingsSelect, forgetDemoSettings, settingsRpc } from './demoSettings';
import { demoScorersSelect, forgetDemoScorers, scorersRpc } from './demoScorers';
import { forgetDemoReports, reportsRpc } from './demoReports';
import { demoSquadsSelect, forgetDemoSquads, squadsRpc } from './demoSquads';

type DemoFilter = { col: string; op: string; value: unknown };
/**
 * Las tablas de las ligas ficticias por capas, de abajo hacia arriba: la liga (demoLeague.ts), lo que cambiaron las
 * temporadas («Suspender un día» mueve eventos; empezar una cambia las fechas de la liga), los miembros y los reclamos
 * (Organizar › Miembros y Reclamos), los equipos del boliche y los jugadores. Cada capa lee la de abajo entera; los filtros se aplican en la de arriba que tiene la tabla. null si
 * la tabla no es de las ligas ficticias.
 */
const baseLayer = (t: string, f: readonly DemoFilter[] = []) => demoLeagueSelect(DEMO_USER, t, f);
/** Justo encima de la liga, los equipos (demoSquads.ts): «Fútbol de Ejemplo» y su dueño, para que todas las capas la vean. */
const squadsBase = (t: string, f: readonly DemoFilter[] = []) => demoSquadsSelect(DEMO_USER, t, f, (x) => baseLayer(x)) ?? baseLayer(t, f);
const seasonsLayer = (t: string, f: readonly DemoFilter[] = []) => demoSeasonsSelect(t, f, (x) => squadsBase(x)) ?? squadsBase(t, f);
const membersLayer = (t: string, f: readonly DemoFilter[] = []) => demoMembersSelect(t, f, (x) => seasonsLayer(x)) ?? seasonsLayer(t, f);
/** Encima de los miembros, la liga de los anotadores invitados por link (demoScorers.ts). */
const scorersLayer = (t: string, f: readonly DemoFilter[] = []) => demoScorersSelect(t, f, (x) => membersLayer(x)) ?? membersLayer(t, f);
const teamsLayer = (t: string, f: readonly DemoFilter[] = []) => demoTeamsSelect(t, f, (x) => scorersLayer(x)) ?? scorersLayer(t, f);
const demoLayer = (t: string, f: readonly DemoFilter[] = []) => demoPlayersSelect(t, f, (x) => teamsLayer(x)) ?? teamsLayer(t, f);
/** Arriba de todo, Ajustes de la liga y el Buzón (demoSettings.ts): los datos cambiados, la liga borrada, las notas. */
const settingsLayer = (t: string, f: readonly DemoFilter[] = []) => demoSettingsSelect(t, f, (x) => demoLayer(x)) ?? demoLayer(t, f);

const FLAG = 'mm-demo';
const DATA = 'mm-demo-data';

/** ¿Está prendida la demostración? (solo la vista previa web la guarda). */
export function demoOn(): boolean {
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(FLAG) === 'empresa';
  } catch {
    return false;
  }
}

export function setDemo(on: boolean) {
  try {
    if (on) sessionStorage.setItem(FLAG, 'empresa');
    else {
      sessionStorage.removeItem(FLAG);
      sessionStorage.removeItem(DATA);
      sessionStorage.removeItem('mm-demo-invite');
      forgetDemoLeague();
      forgetDemoBalls();
      forgetDemoPlayers();
      forgetDemoTeams();
      forgetDemoSeasons();
      forgetDemoMembers();
      forgetDemoAccount();
      forgetDemoSettings();
      forgetDemoScorers();
      forgetDemoReports();
      forgetDemoSquads();
    }
  } catch {
    // sin sessionStorage no hay demostración
  }
}

const INVITE = 'mm-demo-invite';
type DemoInviteStatus = 'pending' | 'accepted' | 'declined';
const inviteStatus = (): DemoInviteStatus => {
  try {
    const v = sessionStorage.getItem(INVITE);
    return v === 'accepted' || v === 'declined' ? v : 'pending';
  } catch {
    return 'pending';
  }
};
const setInviteStatus = (v: DemoInviteStatus) => {
  try {
    sessionStorage.setItem(INVITE, v);
  } catch {
    // sin sessionStorage
  }
};

const DEMO_INVITE = {
  id: '00000000-0000-7000-8000-00000000e001',
  leagueId: '00000000-0000-7000-8000-00000000e0aa',
  leagueName: 'Liga de Ejemplo',
  logoPath: null,
  sport: 'padel',
  kind: 'liga',
  visibility: 'private',
  members: 12,
  invitedBy: { id: '00000000-0000-7000-8000-00000000d0ff', name: 'Persona de Prueba', username: 'prueba' },
  createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
};

const DEMO_INVITE_DETAILS = {
  id: DEMO_INVITE.id,
  mine: true,
  invitedBy: DEMO_INVITE.invitedBy,
  createdAt: DEMO_INVITE.createdAt,
  league: {
    id: DEMO_INVITE.leagueId,
    name: DEMO_INVITE.leagueName,
    logoPath: null,
    sport: 'padel',
    kind: 'liga',
    visibility: 'private',
    venue: 'Club de Ejemplo',
    schedule: 'Martes 7:00 p. m.',
    seasonStart: null,
    seasonEnd: null,
    members: 12,
  },
  players: [
    { id: '00000000-0000-7000-8000-00000000e101', name: 'Juan Pérez' },
    { id: '00000000-0000-7000-8000-00000000e102', name: 'Jugador Uno' },
  ],
};

/** La cuenta de prueba. */
export const DEMO_USER = '00000000-0000-7000-8000-00000000d001';
const SESSION: Session = { userId: DEMO_USER, email: 'usuario@ejemplo.test', name: 'Juan Pérez' };

type Core = Omit<Business, 'venues'> & { ownerId: string };
type Stored = Omit<OwnVenue, 'business'>;

const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();
const DAY = 86_400_000;

function seed() {
  const businesses = new Map<string, Core>();
  const venues: Stored[] = [];
  const other = (id: string, name: string, city: string): Core => ({
    id,
    ownerId: '00000000-0000-7000-8000-00000000d0ff',
    name,
    taxId: null,
    phone: '809-000-0000',
    email: 'usuario@ejemplo.test',
    city,
    address: 'Calle Ficticia 1',
    description: 'Un club de ejemplo para probar la app.',
    status: 'approved',
    statusNote: null,
    commissionPct: 10,
    createdAt: iso(-30 * DAY),
    reviewedAt: iso(-29 * DAY),
  });
  const a = other('00000000-0000-7000-8000-00000000b001', 'Club de Ejemplo', 'Santo Domingo');
  const b = other('00000000-0000-7000-8000-00000000b002', 'Bolera de Ejemplo', 'Santiago');
  businesses.set(a.id, a).set(b.id, b);
  const venue = (v: Partial<Stored> & Pick<Stored, 'id' | 'businessId' | 'sport' | 'name' | 'city' | 'details'>): Stored => ({
    address: 'Calle Ficticia 1',
    priceHour: null,
    hours: null,
    phone: null,
    featuredUntil: null,
    photos: [],
    active: true,
    leagues: 0,
    promotion: null,
    ...v,
  });
  venues.push(
    venue({ id: '00000000-0000-7000-8000-00000000c001', businessId: a.id, sport: 'padel', name: 'Pádel de Ejemplo', city: 'Santo Domingo', details: { canchas: 4, paredes: 'cristal', techada: true, iluminacion: true }, priceHour: 1500, hours: 'Lunes a domingo, 7:00 am a 11:00 pm', featuredUntil: iso(10 * DAY) }),
    venue({ id: '00000000-0000-7000-8000-00000000c002', businessId: a.id, sport: 'football', name: 'Campo de Ejemplo', city: 'Santo Domingo', details: { campos: 2, formato: 'f7', superficie: 'sintetica' }, priceHour: 3000 }),
    venue({ id: '00000000-0000-7000-8000-00000000c003', businessId: b.id, sport: 'bowling', name: 'Bolera de Ejemplo', city: 'Santiago', details: { pistas: 24, zapatos: true, barandas: true }, priceHour: 800 }),
  );
  return { businesses, venues };
}

interface Saved {
  businesses: [string, Core][];
  venues: Stored[];
  files: [string, string][];
  mode: 'player' | 'business' | null;
}

function load(): Saved | null {
  try {
    const raw = sessionStorage.getItem(DATA);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

export function createDemoBackend(): Backend {
  const saved = load();
  const fresh = saved ? null : seed();
  const businesses = saved ? new Map(saved.businesses) : fresh!.businesses;
  const venues = saved ? saved.venues : fresh!.venues;
  const files = new Map<string, string>(saved?.files ?? []);
  let mode: 'player' | 'business' | null = saved?.mode ?? null;
  const save = () => {
    try {
      sessionStorage.setItem(DATA, JSON.stringify({ businesses: [...businesses], venues, files: [...files], mode } satisfies Saved));
    } catch {
      // lleno (muchas fotos): sigue en memoria
    }
  };
  const listeners = new Set<(event: AuthEvent, s: Session | null) => void>();

  const mine = () => [...businesses.values()].find((b) => b.ownerId === DEMO_USER) ?? null;
  const fail = (message: string, kind: ConstructorParameters<typeof BackendError>[1], code: string | null = null): never => {
    throw new BackendError(message, kind, code);
  };
  const publicOf = (v: Stored): Venue => {
    const b = businesses.get(v.businessId)!;
    return { ...v, phone: v.phone ?? b.phone, business: { id: b.id, name: b.name, description: b.description, email: b.email } };
  };
  const own = (v: Stored): OwnVenue => ({ ...publicOf(v), active: v.active, leagues: v.leagues, promotion: v.promotion });
  const myVenue = (id: unknown) => {
    const b = mine();
    const v = venues.find((x) => x.id === id && x.businessId === b?.id);
    return v ?? fail('No existe.', 'not_found', 'no_existe');
  };
  const photoOwner = (photo: unknown) => {
    const b = mine();
    const v = venues.find((x) => x.businessId === b?.id && x.photos.some((p) => p.id === photo));
    return v ?? fail('No existe.', 'not_found', 'no_existe');
  };
  const myBusiness = (): Business | null => {
    const b = mine();
    if (!b) return null;
    const { ownerId: _owner, ...rest } = b;
    return { ...rest, venues: venues.filter((v) => v.businessId === b.id).map(own) };
  };
  const isPublic = (v: Stored) => v.active && businesses.get(v.businessId)?.status === 'approved';
  const featured = (v: Stored) => !!v.featuredUntil && Date.parse(v.featuredUntil) > Date.now();
  const text = (a: Record<string, unknown>, k: string) => (typeof a[k] === 'string' && (a[k] as string).trim() ? (a[k] as string).trim() : null);

  const rpcs: Record<string, (a: Record<string, unknown>) => unknown> = {
    // Una invitación a una liga (ficticia), para probar Avisos y /invitacion/<id> (src/lib/data/invites.ts).
    my_league_invites: () => (inviteStatus() === 'pending' ? [DEMO_INVITE] : []),
    // Como la base: sin invitaciones a equipos es una lista vacía (no null).
    my_squad_invites: () => [],
    league_invite_details: (x) => (x.p_invite === DEMO_INVITE.id ? { ...DEMO_INVITE_DETAILS, status: inviteStatus(), member: inviteStatus() === 'accepted' } : null),
    respond_league_invite: (x) => {
      if (x.p_invite !== DEMO_INVITE.id || inviteStatus() !== 'pending') return { status: inviteStatus(), leagueId: DEMO_INVITE.leagueId };
      setInviteStatus(x.p_accept ? 'accepted' : 'declined');
      return { status: inviteStatus(), leagueId: DEMO_INVITE.leagueId, joined: !!x.p_accept, playerId: null, claimId: null };
    },
    my_business: () => myBusiness(),
    register_business: (a) => {
      if (mine()) fail('Ya tiene empresa.', 'conflict', 'duplicado');
      const id = uuidv7();
      businesses.set(id, {
        id,
        ownerId: DEMO_USER,
        name: text(a, 'p_name') ?? fail('Falta el nombre.', 'validation'),
        city: text(a, 'p_city') ?? fail('Falta la ciudad.', 'validation'),
        phone: text(a, 'p_phone'),
        email: text(a, 'p_email'),
        taxId: text(a, 'p_tax_id'),
        address: text(a, 'p_address'),
        description: text(a, 'p_description'),
        status: 'pending',
        statusNote: null,
        commissionPct: 10,
        createdAt: iso(),
        reviewedAt: null,
      });
      mode = 'business';
      return id;
    },
    update_business: (a) => {
      const b = mine() ?? fail('No existe.', 'not_found', 'no_existe');
      Object.assign(b, {
        name: text(a, 'p_name') ?? b.name,
        city: text(a, 'p_city') ?? b.city,
        phone: text(a, 'p_phone'),
        email: text(a, 'p_email'),
        taxId: text(a, 'p_tax_id'),
        address: text(a, 'p_address'),
        description: text(a, 'p_description'),
        ...(b.status === 'rejected' ? { status: 'pending', statusNote: null } : {}),
      });
      return myBusiness();
    },
    delete_business: () => {
      const b = mine() ?? fail('No existe.', 'not_found', 'no_existe');
      businesses.delete(b.id);
      for (let i = venues.length - 1; i >= 0; i--) if (venues[i].businessId === b.id) venues.splice(i, 1);
      mode = null;
      return true;
    },
    set_account_mode: (a) => {
      if (a.p_mode === 'business' && !mine()) fail('Sin empresa.', 'permission');
      mode = a.p_mode === 'business' ? 'business' : 'player';
      return mode;
    },
    save_venue: (a) => {
      const b = mine() ?? fail('Sin empresa.', 'permission');
      if (b.status === 'suspended') fail('Suspendida.', 'permission');
      const fields = {
        sport: String(a.p_sport),
        name: text(a, 'p_name') ?? fail('Falta el nombre.', 'validation'),
        city: text(a, 'p_city') ?? fail('Falta la ciudad.', 'validation'),
        details: (a.p_details ?? {}) as Stored['details'],
        address: text(a, 'p_address'),
        priceHour: typeof a.p_price_hour === 'number' ? a.p_price_hour : null,
        hours: text(a, 'p_hours'),
        phone: text(a, 'p_phone'),
        active: a.p_active !== false,
      };
      if (a.p_id) {
        const v = myVenue(a.p_id);
        Object.assign(v, fields);
        return own(v);
      }
      if (venues.filter((v) => v.businessId === b.id).length >= 30) fail('Tope.', 'validation', 'limite');
      const v: Stored = { id: uuidv7(), businessId: b.id, featuredUntil: null, photos: [], leagues: 0, promotion: null, ...fields };
      venues.push(v);
      return own(v);
    },
    delete_venue: (a) => {
      const v = myVenue(a.p_venue);
      venues.splice(venues.indexOf(v), 1);
      return true;
    },
    add_venue_photo: (a) => {
      const v = myVenue(a.p_venue);
      if (v.photos.length >= 8) fail('Tope.', 'validation', 'limite');
      const photo: VenuePhoto = { id: String(a.p_photo), path: String(a.p_path), width: Number(a.p_width) || null, height: Number(a.p_height) || null };
      v.photos = [...v.photos, photo];
      return v.photos;
    },
    delete_venue_photo: (a) => {
      const v = photoOwner(a.p_photo);
      v.photos = v.photos.filter((p) => p.id !== a.p_photo);
      return v.photos;
    },
    set_venue_cover: (a) => {
      const v = photoOwner(a.p_photo);
      const p = v.photos.find((x) => x.id === a.p_photo)!;
      v.photos = [p, ...v.photos.filter((x) => x !== p)];
      return v.photos;
    },
    request_promotion: (a) => {
      const v = myVenue(a.p_venue);
      if (mine()?.status !== 'approved') fail('En revisión.', 'permission');
      v.promotion = { id: uuidv7(), status: 'requested', days: Number(a.p_days), startsAt: null, endsAt: null, note: text(a, 'p_note'), createdAt: iso() };
      return own(v);
    },
    cancel_promotion: (a) => {
      const v = venues.find((x) => x.promotion?.id === a.p_promotion) ?? fail('No existe.', 'not_found', 'no_existe');
      v.promotion = { ...v.promotion!, status: 'cancelled' };
      return true;
    },
    set_league_venue: (a) => {
      if (a.p_venue) myVenue(a.p_venue).leagues += 1;
      return true;
    },
    search_venues: (a) => {
      const sport = a.p_sport ? String(a.p_sport) : null;
      const city = a.p_city ? String(a.p_city).toLowerCase() : '';
      const q = a.p_search ? String(a.p_search).toLowerCase() : '';
      const rows = venues
        .filter((v) => isPublic(v) && (!sport || v.sport === sport) && (!city || v.city.toLowerCase().includes(city)))
        .filter((v) => !q || v.name.toLowerCase().includes(q) || businesses.get(v.businessId)!.name.toLowerCase().includes(q))
        .sort((x, y) => Number(featured(y)) - Number(featured(x)) || x.name.localeCompare(y.name, 'es'));
      return { rows: rows.slice(0, Number(a.p_limit) || 30).map(publicOf), total: rows.length };
    },
    venue_detail: (a) => {
      const v = venues.find((x) => x.id === a.p_venue);
      const isMine = !!v && v.businessId === mine()?.id;
      if (!v || (!isPublic(v) && !isMine)) return null;
      const detail: VenueDetail = { ...publicOf(v), mine: isMine, leagues: [] };
      return detail;
    },
    // Lo que hace el superadmin en la consola: aquí, para poder probar lo aprobado (botón de /dev/empresa).
    admin_set_business_status: (a) => {
      const b = businesses.get(String(a.p_business)) ?? fail('No existe.', 'not_found', 'no_existe');
      b.status = a.p_status as BusinessStatus;
      b.statusNote = text(a, 'p_note');
      b.reviewedAt = iso();
      return true;
    },
  };

  const profileRow = () => ({
    id: DEMO_USER,
    email: SESSION.email,
    name: SESSION.name,
    is_superadmin: false,
    adult_confirmed_at: iso(-DAY),
    created_at: iso(-DAY),
    username: 'juanperez',
    push_prefs: null,
    ui_mode: null,
    account_mode: mode,
  });

  const notInDemo = () => fail('En la demostración no se puede.', 'unknown');

  return {
    mode: 'supabase',
    auth: {
      getSession: async () => SESSION,
      onChange: (cb) => {
        listeners.add(cb);
        return () => void listeners.delete(cb);
      },
      signUp: async () => notInDemo(),
      signIn: async () => notInDemo(),
      signInWithGoogle: async () => notInDemo(),
      signOut: async () => {
        setDemo(false);
        listeners.forEach((l) => l('SIGNED_OUT', null));
      },
      resetPassword: async () => notInDemo(),
      resendConfirmation: async () => notInDemo(),
      updatePassword: (password) => demoUpdatePassword(password),
    },
    select: async <T,>(q: { table: string; filters?: { col: string; op: string; value: unknown }[] }) => {
      // La cuenta de prueba (Configuración: nombre, usuario, biografía y foto cambiados, demoAccount.ts).
      if (q.table === 'profiles') return (demoAccountSelect('profiles', q.filters, () => [profileRow()]) ?? []) as T[];
      // Las ligas ficticias, por capas (demoLayer): la liga, las temporadas, los equipos y los jugadores.
      const league = settingsLayer(q.table, q.filters);
      if (league) return league as T[];
      if (q.table === 'legal_acceptances') {
        return [
          { doc: 'terminos', version: CURRENT_LEGAL.terms },
          { doc: 'privacidad', version: CURRENT_LEGAL.privacy },
        ] as T[];
      }
      return [] as T[];
    },
    rpc: async <T,>(fn: string, args: Record<string, unknown> = {}) => {
      // Como la red: un momento (así se ven las cargas).
      await new Promise((r) => setTimeout(r, 120));
      // Ajustes de la liga y el Buzón (demoSettings.ts): leen todas las capas.
      const fromSettings = settingsRpc(DEMO_USER, fn, args, (t) => demoLayer(t) ?? []);
      if (fromSettings !== undefined) return structuredClone(fromSettings) as T;
      // Los equipos (demoSquads.ts): sus RPC, publicar en un equipo, buscar personas para el equipo y buscar ligas.
      const fromSquads = squadsRpc(DEMO_USER, fn, args, (t) => demoLayer(t) ?? []);
      if (fromSquads !== undefined) return structuredClone(fromSquads) as T;
      // Los anotadores (demoScorers.ts: invitar, el link para anotar) y los reportes de la liga (demoReports.ts).
      const fromScorers = scorersRpc(DEMO_USER, fn, args, (t) => demoLayer(t) ?? []);
      if (fromScorers !== undefined) return structuredClone(fromScorers) as T;
      const fromReports = reportsRpc(DEMO_USER, fn, args);
      if (fromReports !== undefined) return structuredClone(fromReports) as T;
      // Configuración de la cuenta de prueba (demoAccount.ts): nombre, usuario, biografía, foto y bloqueos.
      const fromAccount = accountRpc(DEMO_USER, fn, args, (t) => (t === 'profiles' ? [profileRow()] : null));
      if (fromAccount !== undefined) return structuredClone(fromAccount) as T;
      // Los jugadores de la liga ficticia (Organizar › Jugadores): leen la liga con las temporadas y los miembros encima.
      const fromPlayers = playersRpc(DEMO_USER, fn, args, (t) => membersLayer(t) ?? []);
      if (fromPlayers !== undefined) return structuredClone(fromPlayers) as T;
      // Organizar › Miembros y Reclamos (demoMembers.ts): leen todas las capas.
      const fromMembers = membersRpc(DEMO_USER, fn, args, (t) => demoLayer(t) ?? []);
      if (fromMembers !== undefined) return structuredClone(fromMembers) as T;
      // Los equipos del boliche (fijos y de torneo): leen la liga con las temporadas, los miembros y los jugadores encima.
      const fromTeams = teamsRpc(DEMO_USER, fn, args, (t) => demoPlayersSelect(t, [], (x) => membersLayer(x)) ?? membersLayer(t) ?? []);
      if (fromTeams !== undefined) return structuredClone(fromTeams) as T;
      // Las temporadas y «Suspender un día» (demoSeasons.ts): leen todas las capas.
      const fromSeasons = seasonsRpc(DEMO_USER, fn, args, (t) => demoLayer(t) ?? []);
      if (fromSeasons !== undefined) return structuredClone(fromSeasons) as T;
      // Las bolas (demoBalls.ts): leen los juegos de la liga y los sueltos de la demostración.
      const fromBalls = ballRpc(DEMO_USER, fn, args, (t) => demoLeagueSelect(DEMO_USER, t) ?? []);
      if (fromBalls !== undefined) return structuredClone(fromBalls) as T;
      const fromLeague = demoLeagueRpc(DEMO_USER, fn, args);
      if (fromLeague !== undefined) return structuredClone(fromLeague) as T;
      const run = rpcs[fn] as ((a: Record<string, unknown>) => unknown) | undefined;
      const out = run ? structuredClone(run(args)) : null;
      if (run) save();
      return out as T;
    },
    subscribe: () => () => undefined,
    storage: {
      upload: async (bucket, path, data, contentType) => {
        const bytes = new Uint8Array(await data.arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        files.set(`${bucket}/${path}`, `data:${contentType};base64,${btoa(binary)}`);
        save();
      },
      signedUrl: async (bucket, path) => files.get(`${bucket}/${path}`) ?? fail('No existe.', 'not_found'),
      publicUrl: async (bucket, path) => files.get(`${bucket}/${path}`) ?? fail('No existe.', 'not_found'),
      remove: async (bucket, paths) => {
        paths.forEach((p) => files.delete(`${bucket}/${p}`));
        save();
      },
    },
    invoke: async () => notInDemo(),
    online: () => true,
  };
}
