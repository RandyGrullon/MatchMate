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
import type { Business, BusinessStatus, OwnVenue, PaymentStatus, PromotionPrice, Venue, VenueDetail, VenuePhoto } from '@mm/lib/data/business';
import { LOCAL_AZUL_URL, localAzulConfig } from '@mm/lib/azulLocal';
import { PAY_STATUS, startPayment, verifyPayment, type PayFailure } from '../../../supabase/functions/azul-pay/core';
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
import { badgesRpc, demoBadgesSelect, forgetDemoBadges } from './demoBadges';
import { approvalsRpc, demoApprovalFile, demoApprovalsInvoke, demoApprovalsSelect, forgetDemoApprovals } from './demoApprovals';
import { agendaRpc, demoAgendaSelect, forgetDemoAgenda } from './demoAgenda';
import { forgetDemoSocial, socialRpc } from './demoSocial';
import { demoPrizesSelect, forgetDemoPrizes, prizesRpc } from './demoPrizes';
import { yoRpc } from './demoYo';
import { statsRpc } from './demoStats';
import { demoMakerSelect, forgetDemoMaker, makerRpc } from './demoMaker';
import { forgetDemoLive, liveRpc } from './demoLive';
import { forgetDemoInvites, invitesRpc } from './demoInvites';
import { bowlingRpc, demoBowlingSelect, forgetDemoBowling } from './demoBowling';
import { demoRacketSelect, forgetDemoRacket, racketRpc } from './demoRacket';
import { demoGolfSelect, forgetDemoGolf, golfRpc } from './demoGolf';
import { demoGameSocialSelect, forgetDemoGameSocial, gameSocialRpc } from './demoGameSocial';
import { claimsRpc, demoClaimsSelect, forgetDemoClaims } from './demoClaims';
import { demoTourneySelect } from './demoTourney';
import { demoTeamSportsSelect, forgetDemoTeamSports, teamSportsRpc } from './demoTeamSports';
import { demoEventProInvoke, demoEventProSelect, eventProRpc, forgetDemoEventPro } from './demoEventPro';

type DemoFilter = { col: string; op: string; value: unknown };
/**
 * Las tablas de las ligas ficticias por capas, de abajo hacia arriba: la liga (demoLeague.ts), lo que cambiaron las
 * temporadas («Suspender un día» mueve eventos; empezar una cambia las fechas de la liga), los miembros y los reclamos
 * (Organizar › Miembros y Reclamos), los equipos del boliche y los jugadores. Cada capa lee la de abajo entera; los filtros se aplican en la de arriba que tiene la tabla. null si
 * la tabla no es de las ligas ficticias.
 */
const baseLayer = (t: string, f: readonly DemoFilter[] = []) => demoLeagueSelect(DEMO_USER, t, f);
/** Justo encima de la liga, los equipos (demoSquads.ts): «Fútbol de Ejemplo» y su dueño, para que todas las capas la vean. */
/** Los envíos por aprobar de más (Organizar › Aprobar juegos, demoApprovals.ts), justo encima de la liga. */
/** «Pádel de Ejemplo» y lo de raqueta (demoRacket.ts), justo encima de la liga. */
const racketBase = (t: string, f: readonly DemoFilter[] = []) => demoRacketSelect(DEMO_USER, t, f, (x) => baseLayer(x)) ?? baseLayer(t, f);
const approvalsLayer = (t: string, f: readonly DemoFilter[] = []) => demoApprovalsSelect(t, f, (x) => racketBase(x)) ?? racketBase(t, f);
/** Lo del organizador del boliche (demoBowling.ts): eventos creados, cambiados o borrados, inscritos y pistas. */
const bowlingLayer = (t: string, f: readonly DemoFilter[] = []) => demoBowlingSelect(t, f, (x) => approvalsLayer(x)) ?? approvalsLayer(t, f);
/** Lo de Pro del evento de boliche (demoEventPro.ts): inscritos, promedios y la lectura de la foto en la Planilla. */
const eventProLayer = (t: string, f: readonly DemoFilter[] = []) => demoEventProSelect(t, f, (x) => bowlingLayer(x)) ?? bowlingLayer(t, f);
const squadsBase = (t: string, f: readonly DemoFilter[] = []) => demoSquadsSelect(DEMO_USER, t, f, (x) => eventProLayer(x)) ?? eventProLayer(t, f);
/** Baloncesto, fútbol y el relámpago (demoTeamSports.ts): equipos, partidos, la mesa, el comité y los playoffs. */
const teamSportsLayer = (t: string, f: readonly DemoFilter[] = []) => demoTeamSportsSelect(DEMO_USER, t, f, (x) => squadsBase(x)) ?? squadsBase(t, f);
const seasonsLayer = (t: string, f: readonly DemoFilter[] = []) => demoSeasonsSelect(t, f, (x) => teamSportsLayer(x)) ?? teamSportsLayer(t, f);
const membersLayer = (t: string, f: readonly DemoFilter[] = []) => demoMembersSelect(t, f, (x) => seasonsLayer(x)) ?? seasonsLayer(t, f);
/** Encima de los miembros, la liga de los anotadores invitados por link (demoScorers.ts). */
const scorersLayer = (t: string, f: readonly DemoFilter[] = []) => demoScorersSelect(t, f, (x) => membersLayer(x)) ?? membersLayer(t, f);
const teamsLayer = (t: string, f: readonly DemoFilter[] = []) => demoTeamsSelect(t, f, (x) => scorersLayer(x)) ?? scorersLayer(t, f);
const demoLayer = (t: string, f: readonly DemoFilter[] = []) => demoPlayersSelect(t, f, (x) => teamsLayer(x)) ?? teamsLayer(t, f);
/** Arriba de todo, Ajustes de la liga y el Buzón (demoSettings.ts): los datos cambiados, la liga borrada, las notas. */
const settingsLayer = (t: string, f: readonly DemoFilter[] = []) => demoSettingsSelect(t, f, (x) => demoLayer(x)) ?? demoLayer(t, f);
/** Encima de todo, las insignias (demoBadges.ts): las ganadas, el progreso y lo de las insignias en cada liga. */
const badgesLayer = (t: string, f: readonly DemoFilter[] = []) => demoBadgesSelect(DEMO_USER, t, f, (x) => settingsLayer(x)) ?? settingsLayer(t, f);
/** Arriba de todo, la Agenda (demoAgenda.ts): las ligas públicas a las que la cuenta entró con «Me apunto» y sus «Voy». */
const agendaLayer = (t: string, f: readonly DemoFilter[] = []) => demoAgendaSelect(DEMO_USER, t, f, (x) => badgesLayer(x)) ?? badgesLayer(t, f);
/** Arriba de todo, los premios del torneo (demoPrizes.ts): los puestos y los entregados, y sus insignias encima. */
const prizesLayer = (t: string, f: readonly DemoFilter[] = []) => demoPrizesSelect(DEMO_USER, t, f, (x) => agendaLayer(x)) ?? agendaLayer(t, f);
/** Arriba de todo, el creador de insignias (demoMaker.ts): diseños y «Dar insignia» encima de los premios. */
const makerLayer = (t: string, f: readonly DemoFilter[] = []) => demoMakerSelect(DEMO_USER, t, f, (x) => prizesLayer(x)) ?? prizesLayer(t, f);
/** Arriba de todo, lo del organizador de golf (demoGolf.ts): campos, rondas, torneos, tarjetas e inscritos. */
const golfLayer = (t: string, f: readonly DemoFilter[] = []) => demoGolfSelect(t, f, (x) => makerLayer(x)) ?? makerLayer(t, f);
// Arriba de todo: los me gusta, felicitaciones y comentarios de los juegos de boliche (demoGameSocial.ts).
const gameSocialLayer = (t: string, f: readonly DemoFilter[] = []) => demoGameSocialSelect(t, f, (x) => golfLayer(x)) ?? golfLayer(t, f);
// Arriba de todo (ve las membresías de la Agenda): los pedidos de jugador de la cuenta de prueba (demoClaims.ts).
const claimsLayer = (t: string, f: readonly DemoFilter[] = []) => demoClaimsSelect(DEMO_USER, t, f, (x) => gameSocialLayer(x)) ?? gameSocialLayer(t, f);
// Un torneo de boliche sin liga, solo para mirar su inicio (demoTourney.ts).
const tourneyLayer = (t: string, f: readonly DemoFilter[] = []) => demoTourneySelect(DEMO_USER, t, f, (x) => claimsLayer(x)) ?? claimsLayer(t, f);

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
      forgetDemoBadges();
      forgetDemoApprovals();
      forgetDemoAgenda();
      forgetDemoSocial();
      forgetDemoPrizes();
      forgetDemoMaker();
      forgetDemoLive();
      forgetDemoInvites();
      forgetDemoBowling();
      forgetDemoRacket();
      forgetDemoGolf();
      forgetDemoGameSocial();
      forgetDemoClaims();
      forgetDemoTeamSports();
      forgetDemoEventPro();
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

/** Un pago con Azul de la demostración (la tabla payments de 20261105000200_pagos_azul.sql). */
interface DemoPayment {
  orderNumber: number;
  promotionId: string;
  venueId: string;
  amount: number;
  status: PaymentStatus;
}

interface Saved {
  businesses: [string, Core][];
  venues: Stored[];
  files: [string, string][];
  mode: 'player' | 'business' | null;
  /** Los precios de destacar (los pone /dev/empresa, como el superadmin) y los pagos con Azul. */
  prices?: PromotionPrice[];
  payments?: DemoPayment[];
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
  let prices: PromotionPrice[] = saved?.prices ?? [];
  const payments: DemoPayment[] = saved?.payments ?? [];
  const save = () => {
    try {
      sessionStorage.setItem(DATA, JSON.stringify({ businesses: [...businesses], venues, files: [...files], mode, prices, payments } satisfies Saved));
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
    // Pagar con Azul (20261105000200_pagos_azul.sql): los precios, empezar (la base pone el precio y deja la promoción
    // pedida y el pago pendiente) y volver con «Cancelar». Terminarlo lo hace azul-pay (abajo, en invoke).
    promotion_prices: () => [...prices].sort((x, y) => x.days - y.days),
    admin_set_promotion_price: (a) => {
      const days = Number(a.p_days);
      prices = prices.filter((x) => x.days !== days);
      if (typeof a.p_amount === 'number' && a.p_amount > 0) prices.push({ days, amount: a.p_amount });
      return [...prices].sort((x, y) => x.days - y.days);
    },
    begin_promotion_payment: (a) => {
      const v = venues.find((x) => x.id === a.p_venue && x.businessId === mine()?.id);
      if (!v || mine()?.status !== 'approved') fail('no_permitido', 'permission', 'no_permitido');
      const days = Number(a.p_days);
      const price = prices.find((x) => x.days === days) ?? fail('invalido', 'validation', 'invalido');
      const venue = v!;
      venue.promotion =
        venue.promotion?.status === 'requested'
          ? { ...venue.promotion, days }
          : { id: uuidv7(), status: 'requested', days, startsAt: null, endsAt: null, note: 'Pago con Azul', createdAt: iso() };
      // Lo que quedó pendiente de antes para esa promoción ya no sirve.
      for (const x of payments) if (x.promotionId === venue.promotion.id && x.status === 'pending') x.status = 'cancelled';
      const orderNumber = 1001 + payments.length;
      payments.push({ orderNumber, promotionId: venue.promotion.id, venueId: venue.id, amount: price.amount, status: 'pending' });
      return { orderNumber, amount: price.amount, days, venueName: venue.name };
    },
    cancel_payment: (a) => {
      const x = payments.find((p) => p.orderNumber === Number(a.p_order) && p.status === 'pending');
      if (!x) return false;
      x.status = 'cancelled';
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

  /**
   * finish_payment (la respuesta de Azul ya revisada): aprobado activa la promoción desde ahora por sus días o, si el
   * espacio ya está destacado, desde que termine lo que va. Repetirla no cambia nada.
   */
  const finishPayment = (order: number, status: 'approved' | 'declined' | 'error', amount: number) => {
    const x = payments.find((p) => p.orderNumber === order);
    if (!x) return null;
    // El monto que volvió tiene que ser el que se cobró.
    if (Math.round(amount * 100) !== Math.round(x.amount * 100)) fail('invalido', 'validation', 'invalido');
    const v = venues.find((y) => y.id === x.venueId);
    if (x.status === 'pending' || (x.status !== 'approved' && status === 'approved')) {
      x.status = status;
      const p = v?.promotion;
      if (status === 'approved' && v && p && p.id === x.promotionId && p.status !== 'active') {
        const start = Math.max(Date.now(), v.featuredUntil ? Date.parse(v.featuredUntil) : 0);
        const endsAt = new Date(start + p.days * DAY).toISOString();
        v.promotion = { ...p, status: 'active', startsAt: new Date(start).toISOString(), endsAt };
        v.featuredUntil = endsAt;
      }
    }
    const p = v?.promotion?.id === x.promotionId ? v.promotion : null;
    return { status: x.status, venueId: x.venueId, endsAt: p?.endsAt ?? null, days: p?.days ?? null, amount: x.amount };
  };

  /**
   * La Edge Function azul-pay con la lógica y la firma de verdad (supabase/functions/azul-pay/core.ts) y la clave de
   * prueba del modo local de la web (src/lib/azulLocal.ts): «Pagar con Azul» abre el simulador de la app (/dev/azul) y
   * su respuesta vuelve a la ruta de la app (/empresa/pago), sin cobrar nada.
   */
  const azulPay = async (body: unknown) => {
    const config = localAzulConfig('');
    const b = (body && typeof body === 'object' ? body : {}) as { action?: unknown; venueId?: unknown; days?: unknown; params?: unknown };
    const failure = (f: PayFailure) => {
      const status = PAY_STATUS[f.code];
      const kind = status === 401 ? 'auth' : status === 403 ? 'permission' : status === 404 ? 'not_found' : status === 429 ? 'rate_limited' : status === 400 ? 'validation' : 'unknown';
      return new BackendError(f.message, kind, f.code);
    };
    const dbError = (e: unknown) => ({ data: null, error: { message: e instanceof BackendError ? (e.code ?? e.message) : String(e) } });
    if (b.action === 'start' && typeof b.venueId === 'string' && typeof b.days === 'number') {
      const started = await startPayment(
        {
          begin: async (_token, venueId, days) => {
            try {
              const data = rpcs.begin_promotion_payment({ p_venue: venueId, p_days: days });
              save();
              return { data, error: null };
            } catch (e) {
              return dbError(e);
            }
          },
        },
        config,
        'demo',
        b.venueId,
        b.days,
      );
      if ('code' in started) throw failure(started);
      return { url: LOCAL_AZUL_URL, fields: started.fields, orderNumber: started.order.orderNumber, amount: started.order.amount };
    }
    if (b.action === 'verify' && b.params && typeof b.params === 'object') {
      const done = await verifyPayment(
        {
          finish: async (order, status, amount) => {
            try {
              const data = finishPayment(order, status as 'approved' | 'declined' | 'error', amount);
              save();
              return { data, error: null };
            } catch (e) {
              return dbError(e);
            }
          },
        },
        config,
        b.params as Record<string, string>,
      );
      if ('code' in done) throw failure(done);
      return done.result;
    }
    throw new BackendError('Petición inválida.', 'validation', 'invalido');
  };

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
      const league = tourneyLayer(q.table, q.filters);
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
      // Pedir ser un jugador sin cuenta y cancelar el pedido (demoClaims.ts), antes que la Agenda.
      const fromClaims = claimsRpc(DEMO_USER, fn, args, (t) => claimsLayer(t) ?? []);
      if (fromClaims !== undefined) return structuredClone(fromClaims) as T;
      // Me gusta, felicitar y comentar un juego de boliche (demoGameSocial.ts).
      const fromGameSocial = gameSocialRpc(DEMO_USER, fn, args, (t) => gameSocialLayer(t) ?? []);
      if (fromGameSocial !== undefined) return structuredClone(fromGameSocial) as T;
      // El organizador de golf (demoGolf.ts): campos, rondas y torneos, inscribir, grupos y la tarjeta.
      const fromGolf = golfRpc(DEMO_USER, fn, args, (t) => makerLayer(t) ?? []);
      if (fromGolf !== undefined) return structuredClone(fromGolf) as T;
      // El creador de insignias (demoMaker.ts): crear, cambiar, archivar, dar y quitar (antes de los premios: contesta
      // todo save_league_badge).
      const fromMaker = makerRpc(DEMO_USER, fn, args, (t) => prizesLayer(t) ?? []);
      if (fromMaker !== undefined) return structuredClone(fromMaker) as T;
      // Los premios del torneo (demoPrizes.ts): elegirlos, el podio y entregarlos; ven los diseños del creador.
      const fromPrizes = prizesRpc(DEMO_USER, fn, args, (t) => makerLayer(t) ?? []);
      if (fromPrizes !== undefined) return structuredClone(fromPrizes) as T;
      // Las insignias (demoBadges.ts): la vitrina, los avisos, confirmar y los ajustes de la liga.
      const fromBadges = badgesRpc(DEMO_USER, fn, args, (t) => settingsLayer(t) ?? []);
      if (fromBadges !== undefined) return structuredClone(fromBadges) as T;
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
      // La Agenda (demoAgenda.ts): las ligas públicas y apuntarse en ellas.
      const fromAgenda = agendaRpc(DEMO_USER, fn, args);
      if (fromAgenda !== undefined) return structuredClone(fromAgenda) as T;
      // Configuración de la cuenta de prueba (demoAccount.ts): nombre, usuario, biografía, foto, bloqueos y lo que detiene
      // «Borrar mi cuenta» (las ligas y los miembros con todas las capas).
      const fromAccount = accountRpc(DEMO_USER, fn, args, (t) => (t === 'profiles' ? [profileRow()] : (gameSocialLayer(t) ?? null)));
      if (fromAccount !== undefined) return structuredClone(fromAccount) as T;
      // Lo de Pro del evento de boliche (demoEventPro.ts): los inscritos, sus promedios y los juegos verificados con foto.
      const fromEventPro = eventProRpc(DEMO_USER, fn, args, (t) => demoLayer(t) ?? []);
      if (fromEventPro !== undefined) return structuredClone(fromEventPro) as T;
      // Los deportes de equipo (demoTeamSports.ts): equipos, partidos, la mesa, el resultado, el comité y los playoffs
      // (antes que los equipos del boliche y la raqueta).
      const fromTeamSports = teamSportsRpc(DEMO_USER, fn, args, (t) => settingsLayer(t) ?? []);
      if (fromTeamSports !== undefined) return structuredClone(fromTeamSports) as T;
      // Los jugadores de la liga ficticia (Organizar › Jugadores): leen la liga con las temporadas y los miembros encima.
      const fromPlayers = playersRpc(DEMO_USER, fn, args, (t) => membersLayer(t) ?? []);
      if (fromPlayers !== undefined) return structuredClone(fromPlayers) as T;
      // Organizar › Miembros y Reclamos (demoMembers.ts): leen todas las capas.
      const fromMembers = membersRpc(DEMO_USER, fn, args, (t) => demoLayer(t) ?? []);
      if (fromMembers !== undefined) return structuredClone(fromMembers) as T;
      // Los equipos del boliche (fijos y de torneo): leen la liga con las temporadas, los miembros y los jugadores encima.
      const fromTeams = teamsRpc(DEMO_USER, fn, args, (t) => demoPlayersSelect(t, [], (x) => membersLayer(x)) ?? membersLayer(t) ?? []);
      if (fromTeams !== undefined) return structuredClone(fromTeams) as T;
      // El organizador del boliche (demoBowling.ts): crear, cambiar y borrar eventos, la planilla y las pistas.
      const fromBowling = bowlingRpc(DEMO_USER, fn, args, (t) => demoLayer(t) ?? []);
      if (fromBowling !== undefined) return structuredClone(fromBowling) as T;
      // Las temporadas y «Suspender un día» (demoSeasons.ts): leen todas las capas.
      const fromSeasons = seasonsRpc(DEMO_USER, fn, args, (t) => demoLayer(t) ?? []);
      if (fromSeasons !== undefined) return structuredClone(fromSeasons) as T;
      // Las bolas (demoBalls.ts): leen los juegos de la liga y los sueltos de la demostración.
      const fromBalls = ballRpc(DEMO_USER, fn, args, (t) => demoLeagueSelect(DEMO_USER, t) ?? []);
      if (fromBalls !== undefined) return structuredClone(fromBalls) as T;
      // Aprobar juegos (demoApprovals.ts): la lectura de la foto y aprobar o rechazar sus envíos.
      const fromApprovals = approvalsRpc(DEMO_USER, fn, args, (t) => demoLeagueSelect(DEMO_USER, t) ?? []);
      if (fromApprovals !== undefined) return structuredClone(fromApprovals) as T;
      // En vivo (demoLive.ts: leen los ajustes por live_enabled) e «Invitar personas» (demoInvites.ts).
      const fromLive = liveRpc(DEMO_USER, fn, args, (t) => settingsLayer(t) ?? []);
      if (fromLive !== undefined) return structuredClone(fromLive) as T;
      const fromInvites = invitesRpc(DEMO_USER, fn, args, (t) => demoLayer(t) ?? []);
      if (fromInvites !== undefined) return structuredClone(fromInvites) as T;
      // Las estadísticas del perfil de la cuenta de prueba (demoStats.ts: profile_stats).
      const fromStats = statsRpc(DEMO_USER, fn, args, (t) => prizesLayer(t) ?? []);
      if (fromStats !== undefined) return structuredClone(fromStats) as T;
      // Yo (demoYo.ts): «Dónde juego», Mis publicaciones y Mis juegos de la cuenta de prueba (leen todas las capas y Social).
      const fromYo = yoRpc(DEMO_USER, fn, args, (t) => prizesLayer(t) ?? []);
      if (fromYo !== undefined) return structuredClone(fromYo) as T;
      // Social (demoSocial.ts): el feed, me gusta, comentarios, los juegos de los que sigues y los avisos sociales.
      const fromSocial = socialRpc(DEMO_USER, fn, args);
      if (fromSocial !== undefined) return structuredClone(fromSocial) as T;
      // Raqueta (demoRacket.ts): crear eventos, las parejas, los partidos, las cajas, la escalera y sus temporadas.
      const fromRacket = racketRpc(DEMO_USER, fn, args, (t) => demoLayer(t) ?? []);
      if (fromRacket !== undefined) return structuredClone(fromRacket) as T;
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
      signedUrl: async (bucket, path) => files.get(`${bucket}/${path}`) ?? demoApprovalFile(bucket, path) ?? fail('No existe.', 'not_found'),
      publicUrl: async (bucket, path) => files.get(`${bucket}/${path}`) ?? fail('No existe.', 'not_found'),
      remove: async (bucket, paths) => {
        paths.forEach((p) => files.delete(`${bucket}/${p}`));
        save();
      },
    },
    // La lectura de la foto del marcador con IA (demoApprovals.ts), con su espera, y pagar con Azul (azulPay, arriba).
    invoke: async <T,>(fn: string, body: unknown) => {
      if (fn === 'azul-pay') {
        await new Promise((r) => setTimeout(r, 400));
        return structuredClone(await azulPay(body)) as T;
      }
      const scan = demoApprovalsInvoke(fn, body) ?? demoEventProInvoke(fn, body, (t) => demoLayer(t) ?? []);
      if (scan === undefined) return notInDemo();
      await new Promise((r) => setTimeout(r, 900));
      return structuredClone(scan) as T;
    },
    online: () => true,
  };
}
