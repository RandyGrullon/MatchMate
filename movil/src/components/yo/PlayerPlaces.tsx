import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { MapPin, Shield } from 'lucide-react-native';
import { invalidate } from '@mm/lib/data/client';
import { peopleTags } from '@mm/lib/data/follows';
import { usePlayerPlaces, type LeaguePlace } from '@mm/lib/data/places';
import { isGameId } from '@mm/sports/esports/catalog';
import { firstRows, placeCount, placeSections, type PlaceRow, type PlaceSection } from '@mm/components/places/logic';
import { SportMark } from '@/components/agenda/SportMark';
import { GameMark, TeamLogo } from '@/components/esports/bits';
import { LeagueMark, SquadLogo, openSquad } from '@/components/squads/bits';
import { Card, Divider, ListRow, LoadError, SectionHeader, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/**
 * «Dónde juego» en Yo (PlayerPlaces de la web, con su lógica: src/components/places/logic.ts): las ligas y torneos
 * agrupados por deporte o juego (con su cuadro del deporte), tus equipos y tus equipos de esports. Cada fila lleva a lo
 * tuyo ahí: en el boliche y la natación, tu página de jugador en la liga; en esports, «Lo mío»; en los otros deportes
 * (la app todavía no tiene su página de jugador), la liga. Los equipos, con tu ficha (`?jugador=`). Con muchas, las
 * primeras `limit` y «Ver todo».
 */
export function PlayerPlaces({ uid, name, isMe, limit = 6 }: { uid: string; name?: string; isMe?: boolean; limit?: number }) {
  const c = useColors();
  const places = usePlayerPlaces(uid);
  const [all, setAll] = useState(false);
  const title = isMe ? 'Dónde juego' : 'Dónde juega';

  if (places.loading && !places.data) {
    return (
      <View style={{ gap: 12 }}>
        <SectionHeader title={title} />
        <View accessibilityLabel="Cargando" style={{ height: 136, borderRadius: 24, backgroundColor: c.surface2 }} />
      </View>
    );
  }
  if (!places.data) {
    // Sin datos y sin error: esa persona no existe o te bloqueó (el perfil ya lo dice).
    if (!places.error) return null;
    return (
      <View style={{ gap: 12 }}>
        <SectionHeader title={title} />
        <LoadError error={places.error} onRetry={() => invalidate(peopleTags.user(uid))} />
      </View>
    );
  }

  const sections = placeSections(places.data, uid);
  const total = placeCount(sections);
  const shown = all ? sections : firstRows(sections, limit);
  const more = total > limit;
  const first = name?.trim().split(/\s+/)[0];

  return (
    <View style={{ gap: 12 }}>
      <SectionHeader
        title={title}
        action={
          more ? (
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: all }} hitSlop={6} onPress={() => setAll((v) => !v)} style={{ minHeight: 44, justifyContent: 'center' }}>
              <Txt style={{ fontSize: 15, fontFamily: font.semibold, color: c.accent }}>{all ? 'Ver menos' : `Ver todo (${total})`}</Txt>
            </Pressable>
          ) : undefined
        }
      />
      {total === 0 ? (
        <Card padded={false} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 16 }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface2 }}>
            <MapPin size={20} color={c.fg2} />
          </View>
          <Txt variant="meta" tone="muted" style={{ flex: 1, minWidth: 0 }}>
            {isMe ? (
              <>
                Todavía no juegas en ninguna liga ni equipo.{' '}
                <Txt accessibilityRole="link" variant="meta" style={{ fontFamily: font.semibold, color: c.accent }} onPress={() => router.navigate('/ligas')}>
                  Buscar ligas
                </Txt>
              </>
            ) : (
              `${first || 'Esta persona'} todavía no juega en ligas o equipos que puedas ver.`
            )}
          </Txt>
        </Card>
      ) : (
        <View style={{ gap: 16 }}>
          {shown.map((s) => (
            <View key={s.key} style={{ gap: 8 }}>
              <SectionLabel section={s} />
              <Card padded={false}>
                {s.rows.map((r, i) => (
                  <View key={r.key}>
                    {i > 0 && <Divider inset={68} />}
                    <ListRow icon={<RowMark row={r} />} title={r.title} subtitle={r.subtitle} onPress={() => openPlace(r, uid)} />
                  </View>
                ))}
              </Card>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** A lo tuyo en ese lugar (ver arriba). */
function openPlace(r: PlaceRow, uid: string) {
  if (r.kind === 'squad') return openSquad(r.place.id, { jugador: uid });
  if (r.kind === 'esports') return router.push({ pathname: '/esports/equipo/[teamId]', params: { teamId: r.place.id } });
  openLeaguePlace(r.place);
}

function openLeaguePlace(l: LeaguePlace) {
  if (l.sport === 'bowling' || l.sport === 'swimming') router.push({ pathname: '/l/[lid]/j/[playerId]', params: { lid: l.leagueId, playerId: l.playerId } });
  else if (l.sport === 'esports') router.push({ pathname: '/l/[lid]/perfil', params: { lid: l.leagueId } });
  else router.push({ pathname: '/l/[lid]', params: { lid: l.leagueId } });
}

/** El encabezado de cada bloque: el cuadro del deporte (o del juego) y su nombre; en «Equipos», el escudo. */
function SectionLabel({ section: s }: { section: PlaceSection }) {
  const c = useColors();
  return (
    <View accessibilityRole="header" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 4 }}>
      {s.kind === 'squads' ? (
        <View style={{ width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface2 }}>
          <Shield size={14} color={c.fg2} />
        </View>
      ) : (
        <SportMark sport={s.sport} game={s.game} size="xs" />
      )}
      <Txt variant="meta" tone="fg2" numberOfLines={1} style={{ flexShrink: 1, fontFamily: font.semibold }}>
        {s.label}
      </Txt>
    </View>
  );
}

/** Lo de la izquierda de cada fila: el logo de la liga (o su cuadro), el del equipo, o el del equipo de esports (o su juego). */
function RowMark({ row: r }: { row: PlaceRow }) {
  if (r.kind === 'league') {
    const l = r.place;
    if (!l.logo && l.sport === 'esports' && isGameId(l.game)) return <GameMark game={l.game} side={40} decorative />;
    return <LeagueMark sport={l.sport} logo={l.logo} />;
  }
  if (r.kind === 'squad') return <SquadLogo squad={r.place} />;
  const t = r.place;
  if (t.logo) return <TeamLogo path={t.logo} name={t.name} tag={t.tag} />;
  return isGameId(t.game) ? <GameMark game={t.game} side={40} decorative /> : <LeagueMark sport="esports" logo={null} />;
}
