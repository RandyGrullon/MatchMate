import { useEffect, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { BarChart3, CalendarDays, ChevronLeft, ClipboardList, UsersRound, Trophy, Clock, List, ListOrdered, MapPin, Medal, Megaphone, Newspaper, Swords, Target, Timer, UserPlus, UserRound } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { useEvents, useLeague, useMembership } from '@mm/lib/data';
import { useLeagueSocial } from '@mm/lib/data/leagueSocial';
import { canInviteTo, inviteTitle } from '@mm/components/invite/logic';
import { pastLine } from '@mm/components/league/home/logic';
import { adminScreenTitle, organizeUrl } from '@mm/components/organizer/hubLogic';
import { useLeagueToDo } from '@mm/components/league/home/useLeagueData';
import { racketAdminTab } from '@mm/sports/adminTabs';
import type { RacketSport } from '@mm/sports/racket';
import { eventTitle, formatDateLong, toIsoDate } from '@mm/lib/format';
import { setActiveSport } from '@mm/lib/sportContext';
import { leagueSport, sportMeta } from '@mm/sports/registry';
import { Button, Card, Divider, Empty, ListRow, Loading, RowIcon, Screen, SectionHeader, Txt } from '@/components/ui';
import { LeagueFollowButton } from '@/components/social/People';
import { LeagueScope, sportFamily } from '@/components/league/LeagueScope';
import { SportLinks } from '@/components/league/SportLinks';
import { LeagueNotices } from '@/components/league/Announce';
import { PlayersRow } from '@/components/players/PlayersRow';
import { TeamsRow } from '@/components/bowlingTeams/TeamsRow';
import { LeagueTeamsSection } from '@/components/bowling/LeagueTeams';
import { ChampionsSection } from '@/components/season/Seasons';
import { LeagueBadgeAwards } from '@/components/badges/LeagueBadges';
import { LeagueMadeBadges } from '@/components/badges/maker/LeagueMadeBadges';
import { SeasonRow } from '@/components/seasonAdmin/SeasonRow';
import { CountBubble } from '@/components/organizer/Organize';
import { LeagueHomeNotice, OrganizesRow, SuspendTodayCard } from '@/components/league/LeagueHomePro';
import { useIsPro } from '@mm/lib/useMode';
import { SettingsRow } from '@/components/leagueSettings/SettingsRow';
import { SuggestionsRow } from '@/components/suggestions/SuggestionsRow';
import { SuggestionBox } from '@/components/suggestions/SuggestionBox';
import { SquadRequestsPanel } from '@/components/squads/SquadRequestsPanel';
import { canEnterLeagues } from '@mm/components/squads/logic';
import { RacketHome } from '@/components/racket/RacketHome';
import { TeamHome } from '@/components/team/TeamScreens';
import { GolfHome } from '@/components/golf/GolfHome';
import { SwimHome } from '@/components/swimming/SwimHome';
import { EsportsHome } from '@/components/esports/EsportsLeague';
import { BowlingLeagueHome, LeagueIdent } from '@/components/league/BowlingLeagueHome';
import { LiveBanner } from '@/components/live/LiveBanner';
import { ClaimBanner } from '@/components/claims/ClaimBanner';
import { useColors } from '@/theme/theme';

/**
 * El inicio de una liga (LeagueShell y LeagueHomePage de la web): el logo, el nombre y cuándo y dónde juegan; los avisos y
 * lo que está en vivo; Muro, invitar y seguir; para quien organiza, Organizar; y lo de cada deporte (el boliche, en una
 * sola pantalla: BowlingLeagueHome). Entrar a una liga pone la app en su deporte (su color), como la web.
 */
export default function LeagueScreen() {
  const { lid } = useLocalSearchParams<{ lid: string }>();
  const c = useColors();
  const auth = useAuth();
  const league = useLeague(lid);
  const membership = useMembership(lid, auth.user?.uid);
  const events = useEvents(lid);
  const social = useLeagueSocial(auth.user ? lid : null);
  const pro = useIsPro();
  const sport = league.data ? leagueSport(league.data) : null;
  const meta = sport ? sportMeta(sport) : null;

  useEffect(() => {
    if (sport) setActiveSport(sport);
  }, [sport]);

  const today = toIsoDate(new Date());
  const upcoming = useMemo(() => {
    const sorted = [...events.data].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return sorted.filter((e) => e.date >= today).slice(0, 8);
  }, [events.data, today]);

  if (league.loading && !league.data) return <Loading label="Cargando la liga" />;
  if (!league.data) {
    return (
      <Screen>
        <Empty
          title="No puedes ver esta liga"
          text="Es privada o ya no existe. Para entrar necesitas el link o el código de invitación que te comparta un admin."
          action={<Button onPress={() => router.navigate('/ligas')}>Ver ligas</Button>}
        />
      </Screen>
    );
  }
  const l = league.data;
  const isBowling = sport === 'bowling';
  const family = sportFamily(l);
  const openEvent = (eventId: string) => router.push({ pathname: '/l/[lid]/e/[eventId]', params: { lid: l.id, eventId } });

  return (
    <Screen>
      <Pressable accessibilityRole="button" accessibilityLabel="Atrás" onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))} style={{ flexDirection: 'row', alignItems: 'center', height: 44, marginLeft: -6 }}>
        <ChevronLeft size={24} color={c.accent} />
        <Txt tone="accent" variant="bodyStrong">
          Ligas
        </Txt>
      </Pressable>
      {/* El logo (o el ícono del deporte), el nombre completo y cuándo y dónde juegan (LeagueIdent de la web). */}
      <LeagueScope lid={l.id}>
        <LeagueIdent />
      </LeagueScope>

      {/* El aviso del admin de los últimos 2 días (lluvia, apagón…), arriba como en la web, y lo que está «EN VIVO». */}
      <LeagueScope lid={l.id}>
        <LeagueNotices />
        {/* Para los miembros: «Mi reclamo» o «¿Ya jugabas en esta liga? Busca tu nombre» (LeagueHomeTop de la web). */}
        {!!membership.data && <ClaimBanner key={`reclamo-${l.id}`} />}
        <LiveBanner lid={l.id} />
        {/* Pro, quien organiza y si hoy hay algo: «Hoy · … · Suspender» (SuspendTodayCard de la web). */}
        <SuspendTodayCard />
      </LeagueScope>
      {(() => {
        const isAdmin = membership.data?.role === 'admin' || membership.data?.role === 'owner';
        const canInvite = canInviteTo(l, isAdmin, !!membership.data);
        return (
          <Card padded={false}>
            {!l.hasMinors && (
              <ListRow
                icon={
                  <RowIcon>
                    <Newspaper size={20} color={c.accent} />
                  </RowIcon>
                }
                title="Muro"
                subtitle={`Lo que cuentan ${l.kind === 'torneo' ? 'en el torneo' : 'en la liga'}`}
                onPress={() => router.push({ pathname: '/l/[lid]/muro', params: { lid: l.id } })}
              />
            )}
            {canInvite && (
              <>
                {!l.hasMinors && <Divider inset={68} />}
                <ListRow
                  icon={
                    <RowIcon>
                      <UserPlus size={20} color={c.accent} />
                    </RowIcon>
                  }
                  title={inviteTitle(l.kind)}
                  subtitle="Con el link o el QR"
                  onPress={() => router.push({ pathname: '/l/[lid]/invitar', params: { lid: l.id } })}
                />
              </>
            )}
            {social.data?.canFollow && (
              <>
                <Divider inset={16} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
                  <Txt variant="meta" tone="muted" style={{ flex: 1 }}>
                    Síguela y sus publicaciones salen en Social.
                  </Txt>
                  <LeagueFollowButton leagueId={l.id} name={l.name} following={social.data.following} />
                </View>
              </>
            )}
          </Card>
        );
      })()}

      {/* Organizar (quien la organiza): «Organizas esta liga» (Organizar con «Por hacer» y «La liga», con lo que espera) y
          a un toque equipos, jugadores y miembros, temporada y fechas, y avisar a toda la liga. */}
      {(membership.data?.role === 'admin' || membership.data?.role === 'owner') && (
        <>
          {/* Equipos que piden entrar (fútbol, futsal, baloncesto); sin pendientes no sale. */}
          {canEnterLeagues(leagueSport(l)) && <SquadRequestsPanel lid={l.id} />}
          <SectionHeader title="Organizar" />
          <Card padded={false}>
            {pro ? (
              <LeagueScope lid={l.id}>
                <OrganizesRow />
              </LeagueScope>
            ) : (
              <OrganizeRow lid={l.id} bowling={isBowling} />
            )}
            <Divider inset={68} />
            {/* Raqueta: «Parejas y niveles» también en el inicio, para quien organiza (homeRow de la web). */}
            {family === 'racket' && (
              <>
                <ListRow
                  icon={
                    <RowIcon>
                      <UsersRound size={20} color={c.accent} />
                    </RowIcon>
                  }
                  title={racketAdminTab(sport as RacketSport).label}
                  onPress={() => router.push(`/l/${l.id}/parejas` as never)}
                />
                <Divider inset={68} />
              </>
            )}
            {isBowling && l.kind !== 'torneo' && (
              <>
                <TeamsRow lid={l.id} league={l} />
                <Divider inset={68} />
              </>
            )}
            <PlayersRow lid={l.id} league={l} />
            <Divider inset={68} />
            <SeasonRow lid={l.id} league={l} />
            <Divider inset={68} />
            <ListRow
              icon={
                <RowIcon>
                  <Megaphone size={20} color={c.accent} />
                </RowIcon>
              }
              title={adminScreenTitle('avisar', l.kind) ?? ''}
              onPress={() => router.push({ pathname: '/l/[lid]/avisar', params: { lid: l.id } })}
            />
            <Divider inset={68} />
            <SettingsRow lid={l.id} league={l} />
            <Divider inset={68} />
            <SuggestionsRow lid={l.id} league={l} />
          </Card>
        </>
      )}

      {isBowling && l.kind !== 'torneo' ? (
        <LeagueScope lid={l.id}>
          <BowlingLeagueHome />
        </LeagueScope>
      ) : isBowling ? (
        <>
          {/* Un torneo de boliche sin liga: la tabla, «Resultados anteriores» y «Mis números», y sus fechas. */}
          <Card padded={false}>
            <ListRow
              icon={
                <RowIcon>
                  <ListOrdered size={20} color={c.accent} />
                </RowIcon>
              }
              title="Tabla"
              onPress={() => router.push({ pathname: '/l/[lid]/tabla', params: { lid: l.id } })}
            />
            <Divider inset={68} />
            <ListRow
              icon={
                <RowIcon>
                  <List size={20} color={c.accent} />
                </RowIcon>
              }
              title="Resultados anteriores"
              subtitle={pastLine(events.data, today)}
              onPress={() => router.push({ pathname: '/l/[lid]/partidos', params: { lid: l.id } })}
            />
            {/* «Mis números» (para cualquier miembro: sin jugador todavía, `/perfil` se lo prepara, como la web). */}
            {!!membership.data && (
              <>
                <Divider inset={68} />
                <ListRow
                  icon={
                    <RowIcon>
                      <BarChart3 size={20} color={c.accent} />
                    </RowIcon>
                  }
                  title="Mis números"
                  onPress={() => router.push({ pathname: '/l/[lid]/perfil', params: { lid: l.id } })}
                />
              </>
            )}
            {/* El buzón de sugerencias: la última fila (no sale a quien organiza ni a quien no es miembro). */}
            <LeagueScope lid={l.id}>
              <SuggestionBox row divider />
            </LeagueScope>
          </Card>
          {/* Los equipos fijos de la liga (solo si tiene). */}
          <LeagueScope lid={l.id}>
            <LeagueTeamsSection />
          </LeagueScope>
          <SectionHeader title="Próximas fechas" />
          {upcoming.length ? (
            <Card padded={false}>
              {upcoming.map((e, i) => (
                <View key={e.id}>
                  {i > 0 && <Divider inset={16} />}
                  <ListRow title={eventTitle(e, sport ?? 'bowling')} subtitle={formatDateLong(e.date)} onPress={() => openEvent(e.id)} />
                </View>
              ))}
            </Card>
          ) : (
            <Empty title="No hay fechas próximas" text="Cuando el admin programe una práctica o un torneo, sale aquí." />
          )}
        </>
      ) : sport === 'golf' ? (
        <LeagueScope lid={l.id}>
          <SportLinks
            lid={l.id}
            mine={false}
            items={[
              { key: 'tabla', title: 'Orden de mérito', icon: Medal, go: () => router.push({ pathname: '/l/[lid]/tabla', params: { lid: l.id } }) },
              { key: 'perfil', title: 'Mi golf', icon: Target, go: () => router.push({ pathname: '/l/[lid]/perfil', params: { lid: l.id } }) },
            ]}
          />
          <GolfHome />
          <SuggestionBox />
        </LeagueScope>
      ) : sport === 'swimming' ? (
        <LeagueScope lid={l.id}>
          <SportLinks
            lid={l.id}
            mine={false}
            items={[
              { key: 'tabla', title: 'Puntos', icon: Medal, go: () => router.push({ pathname: '/l/[lid]/tabla', params: { lid: l.id } }) },
              { key: 'perfil', title: 'Mis marcas', icon: Timer, go: () => router.push({ pathname: '/l/[lid]/perfil', params: { lid: l.id } }) },
            ]}
          />
          <SwimHome />
          <SuggestionBox />
        </LeagueScope>
      ) : sport === 'esports' ? (
        <LeagueScope lid={l.id}>
          <SportLinks
            lid={l.id}
            mine={false}
            items={[
              { key: 'juegos', title: 'Partidos', icon: Swords, go: () => router.push({ pathname: '/l/[lid]/partidos', params: { lid: l.id } }) },
              { key: 'tabla', title: 'Tabla', icon: ListOrdered, go: () => router.push({ pathname: '/l/[lid]/tabla', params: { lid: l.id } }) },
              { key: 'perfil', title: 'Lo mío', icon: Target, go: () => router.push({ pathname: '/l/[lid]/perfil', params: { lid: l.id } }) },
            ]}
          />
          <EsportsHome />
          <SuggestionBox />
        </LeagueScope>
      ) : family === 'racket' ? (
        <LeagueScope lid={l.id}>
          <SportLinks lid={l.id} mine={!!membership.data?.playerId} mineToProfile />
          <RacketHome />
          <SuggestionBox />
        </LeagueScope>
      ) : family === 'team' ? (
        <LeagueScope lid={l.id}>
          <SportLinks
            lid={l.id}
            mine={false}
            items={[
              { key: 'juegos', title: 'Partidos', icon: Swords, go: () => router.push({ pathname: '/l/[lid]/partidos', params: { lid: l.id } }) },
              { key: 'tabla', title: 'Tabla', icon: ListOrdered, go: () => router.push({ pathname: '/l/[lid]/tabla', params: { lid: l.id } }) },
              ...(l.kind !== 'torneo' ? [{ key: 'playoffs', title: 'Playoffs', icon: Trophy, go: () => router.push({ pathname: '/l/[lid]/playoffs' as never, params: { lid: l.id } }) }] : []),
              { key: 'perfil', title: 'Mi equipo', icon: UserRound, go: () => router.push({ pathname: '/l/[lid]/perfil', params: { lid: l.id } }) },
            ]}
          />
          <TeamHome />
          <SuggestionBox />
        </LeagueScope>
      ) : (
        <Empty
          title={`${meta?.label ?? 'Este deporte'} llega pronto a la app`}
          text="La tabla, los partidos y anotar en la cancha. Mientras, la liga completa está en la web."
        />
      )}

      {/* Los campeones de las temporadas cerradas, con «Temporadas» (en todos los deportes). */}
      <LeagueScope lid={l.id}>
        {/* Los premios del mes de la liga (insignias), arriba de los campeones, como en la web. */}
        <LeagueBadgeAwards />
        <ChampionsSection />
        {/* El estante de las insignias que diseñó la liga (LeagueHomeBottom de la web). */}
        <LeagueMadeBadges />
      </LeagueScope>

      {/* El aviso de Lite para quien organiza: lo pendiente y «Organizas esta liga · … · Probar Pro». */}
      <LeagueScope lid={l.id}>
        <LeagueHomeNotice />
      </LeagueScope>

      {/* Dónde, cuándo y la temporada, al final (LeagueInfoCard de la web; el boliche lo dice arriba). */}
      {!isBowling && (
        <Card padded={false}>
          {!!l.venue && (
            <ListRow
              chevron={false}
              icon={
                <RowIcon>
                  <MapPin size={20} color={c.accent} />
                </RowIcon>
              }
              title={l.venue}
              subtitle={meta?.venue ?? null}
            />
          )}
          {!!l.schedule && (
            <>
              <Divider inset={68} />
              <ListRow
                chevron={false}
                icon={
                  <RowIcon>
                    <Clock size={20} color={c.accent} />
                  </RowIcon>
                }
                title={l.schedule}
                subtitle="Horario"
              />
            </>
          )}
          {!!l.seasonStart && (
            <>
              <Divider inset={68} />
              <ListRow
                chevron={false}
                icon={
                  <RowIcon>
                    <CalendarDays size={20} color={c.accent} />
                  </RowIcon>
                }
                title={`Temporada del ${formatDateLong(l.seasonStart)}${l.seasonEnd ? ` al ${formatDateLong(l.seasonEnd)}` : ''}`}
              />
            </>
          )}
        </Card>
      )}

    </Screen>
  );
}

/** «Organizas esta liga» (la fila de la web): lo que espera en Organizar, con su número; lleva a Organizar de la liga. */
function OrganizeRow({ lid, bowling }: { lid: string; bowling: boolean }) {
  const c = useColors();
  const toDo = useLeagueToDo(lid, bowling);
  return (
    <ListRow
      icon={
        <RowIcon>
          <ClipboardList size={20} color={c.accent} />
        </RowIcon>
      }
      title="Organizas esta liga"
      subtitle={toDo.line || 'Jugadores, fechas y ajustes'}
      accessibilityLabel={toDo.count ? `Organizas esta liga: ${toDo.count} ${toDo.count === 1 ? 'pendiente' : 'pendientes'}` : undefined}
      right={toDo.count ? <CountBubble n={toDo.count} /> : undefined}
      onPress={() => router.push(organizeUrl(lid) as never)}
    />
  );
}
