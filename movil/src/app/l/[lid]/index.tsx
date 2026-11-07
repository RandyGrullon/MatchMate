import { useEffect, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CalendarDays, ChevronLeft, ClipboardList, Clock, Globe, ListOrdered, MapPin, Medal, Megaphone, Newspaper, Swords, Target, Timer, UserPlus, UserRound } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { useEvents, useLeague, useMembership } from '@mm/lib/data';
import { useLeagueSocial } from '@mm/lib/data/leagueSocial';
import { canInviteTo, inviteTitle } from '@mm/components/invite/logic';
import { adminScreenTitle, organizeUrl } from '@mm/components/organizer/hubLogic';
import { useLeagueToDo } from '@mm/components/league/home/useLeagueData';
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
import { openOnWeb } from '@/lib/web';
import { useColors } from '@/theme/theme';

/**
 * La liga: nombre y deporte, dónde y cuándo, y las fechas (prácticas y torneos del boliche). Entrar a una liga pone
 * la app en su deporte (su color), como la web. Lo demás de la liga (tabla, jugadores, admin) por ahora en la web.
 */
export default function LeagueScreen() {
  const { lid } = useLocalSearchParams<{ lid: string }>();
  const c = useColors();
  const auth = useAuth();
  const league = useLeague(lid);
  const membership = useMembership(lid, auth.user?.uid);
  const events = useEvents(lid);
  const social = useLeagueSocial(auth.user ? lid : null);
  const sport = league.data ? leagueSport(league.data) : null;
  const meta = sport ? sportMeta(sport) : null;

  useEffect(() => {
    if (sport) setActiveSport(sport);
  }, [sport]);

  const today = toIsoDate(new Date());
  const { upcoming, past } = useMemo(() => {
    const sorted = [...events.data].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return { upcoming: sorted.filter((e) => e.date >= today).slice(0, 8), past: sorted.filter((e) => e.date < today).reverse().slice(0, 8) };
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
  const Icon = meta?.icon;
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          {Icon && <Icon size={28} color={c.accent} />}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="cardTitle" numberOfLines={2}>
            {l.name}
          </Txt>
          <Txt variant="meta" tone="muted">
            {[meta?.label, l.kind === 'torneo' ? 'Torneo' : 'Liga', l.visibility === 'public' ? 'pública' : 'privada'].filter(Boolean).join(' · ')}
          </Txt>
        </View>
      </View>

      {/* El aviso del admin de los últimos 2 días (lluvia, apagón…), arriba como en la web. */}
      <LeagueScope lid={l.id}>
        <LeagueNotices />
      </LeagueScope>

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
            <OrganizeRow lid={l.id} bowling={isBowling} />
            <Divider inset={68} />
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

      {isBowling ? (
        <>
          {/* La tabla por temporada y «Mis números» (la página de tu jugador). */}
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
            {!!membership.data?.playerId && (
              <>
                <Divider inset={68} />
                <ListRow
                  icon={
                    <RowIcon>
                      <UserRound size={20} color={c.accent} />
                    </RowIcon>
                  }
                  title="Mis números"
                  onPress={() => router.push({ pathname: '/l/[lid]/j/[playerId]', params: { lid: l.id, playerId: membership.data!.playerId! } })}
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
          {past.length > 0 && (
            <>
              <SectionHeader title="Resultados anteriores" />
              <Card padded={false}>
                {past.map((e, i) => (
                  <View key={e.id}>
                    {i > 0 && <Divider inset={16} />}
                    <ListRow title={eventTitle(e, sport ?? 'bowling')} subtitle={formatDateLong(e.date)} onPress={() => openEvent(e.id)} />
                  </View>
                ))}
              </Card>
            </>
          )}
        </>
      ) : sport === 'golf' ? (
        <LeagueScope lid={l.id}>
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
          <SportLinks lid={l.id} mine={!!membership.data?.playerId} />
          <RacketHome />
          <SuggestionBox />
        </LeagueScope>
      ) : family === 'team' ? (
        <LeagueScope lid={l.id}>
          <SportLinks lid={l.id} mine={!!membership.data?.playerId} mineLabel="Mi equipo" />
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

      <Button full icon={<Globe size={18} color={c.fg} />} onPress={() => openOnWeb(`/l/${l.id}`)}>
        {membership.data ? 'Tabla, jugadores y más en la web' : 'Ver la liga en la web'}
      </Button>
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
