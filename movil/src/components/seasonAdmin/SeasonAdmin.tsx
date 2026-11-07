import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { CalendarPlus, CalendarRange, Flag, History, Pencil } from 'lucide-react-native';
import { useLeagueSeasons } from '@mm/lib/data/seasons';
import { useLeagueCtx } from '@mm/lib/league';
import type { Season } from '@mm/lib/seasons';
import { leagueSport } from '@mm/sports/registry';
import { seasonCopiesTeams, seasonsOverview } from '@mm/components/season/adminLogic';
import { Button, Card, Empty, LoadError, Loading, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { CloseSeason } from './CloseSeason';
import { SeasonHead } from './parts';
import { StartSeasonSheet } from './StartSeasonSheet';

/**
 * Organizar › Temporada (SeasonAdmin de la web, con su misma lógica; todas las ligas, no los torneos sueltos): la
 * temporada en curso con sus fechas, «Cerrar temporada» (la tabla final, los premios propuestos que se pueden cambiar
 * y el aviso a la liga), «Nueva temporada» y «Corregir premios» de la última cerrada, con la tabla de cada deporte
 * (CloseSeason.tsx). Va dentro de LeagueScope.
 */
export function SeasonAdmin() {
  const c = useColors();
  const { lid, league } = useLeagueCtx();
  const sport = leagueSport(league);
  const seasons = useLeagueSeasons(lid);
  const [closing, setClosing] = useState<Season | null>(null);
  const [starting, setStarting] = useState(false);
  const list = seasons.data;
  const { active, lastClosed } = seasonsOverview(list);
  const teamSport = seasonCopiesTeams(sport);
  const close = (s: Season) => setClosing(s);

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 4 }}>
        <Txt variant="section" accessibilityRole="header">
          Temporada
        </Txt>
        <Txt tone="muted" style={{ fontSize: 14 }}>
          Al cerrar la temporada se guarda la tabla final con sus campeones y se avisa a la liga. Después empiezas la nueva: la tabla vuelve a cero y las anteriores
          quedan en el historial.
        </Txt>
      </View>
      {seasons.error && !list.length ? (
        <LoadError error={seasons.error} />
      ) : seasons.loading && !list.length ? (
        <Loading />
      ) : !list.length ? (
        <Empty icon={<CalendarRange size={28} color={c.accent} />} title="Sin temporadas" text="Esta liga todavía no tiene temporada. Actualiza la app o vuelve a entrar." />
      ) : (
        <>
          {active ? (
            <Card style={{ gap: 12, padding: 16 }}>
              <SeasonHead season={active} />
              <Button variant="primary" icon={<Flag size={18} color={c.accentFg} />} style={{ alignSelf: 'flex-start' }} onPress={() => close(active)}>
                Cerrar temporada
              </Button>
              <Txt tone="muted" style={{ fontSize: 12 }}>
                Para empezar la nueva temporada, primero cierra esta.
              </Txt>
            </Card>
          ) : (
            <Card style={{ gap: 12, padding: 16 }}>
              <Txt style={{ fontSize: 14 }}>
                {`No hay temporada en curso${lastClosed ? `: ${lastClosed.name} está cerrada` : ''}. Los juegos que se jueguen ahora no cuentan en ninguna tabla hasta que empieces la nueva.`}
              </Txt>
              <Button variant="primary" icon={<CalendarPlus size={18} color={c.accentFg} />} style={{ alignSelf: 'flex-start' }} onPress={() => setStarting(true)}>
                Nueva temporada
              </Button>
            </Card>
          )}
          {lastClosed && (
            <Card style={{ gap: 12, padding: 16 }}>
              <SeasonHead season={lastClosed} />
              <Button icon={<Pencil size={18} color={c.fg} />} style={{ alignSelf: 'flex-start' }} onPress={() => close(lastClosed)}>
                Corregir premios
              </Button>
            </Card>
          )}
          <Pressable
            accessibilityRole="link"
            hitSlop={4}
            onPress={() => router.push({ pathname: '/l/[lid]/temporadas', params: { lid } })}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start', opacity: pressed ? 0.6 : 1 })}
          >
            <History size={16} color={c.accent} />
            <Txt tone="accent" style={{ fontSize: 14, fontFamily: font.medium }}>
              Historial de temporadas
            </Txt>
          </Pressable>
        </>
      )}
      {/* Cada hoja se monta al abrirse: empieza desde cero, con la temporada como está. */}
      {closing && <CloseSeason key={`${sport}:${closing.id}`} sport={sport} season={closing} onClose={() => setClosing(null)} />}
      {starting && <StartSeasonSheet seasons={list} teamSport={teamSport} onClose={() => setStarting(false)} />}
    </View>
  );
}
