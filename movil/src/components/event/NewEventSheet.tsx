import { useState } from 'react';
import { router } from 'expo-router';
import { Trophy } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { useLeaguesByIds, useMyMemberships } from '@mm/lib/data';
import { leagueSport, sportMeta } from '@mm/sports/registry';
import { createChoices, pickLeagueRow, pickLeagueTitle, type OrganizedLeague } from '@mm/components/create/createChoices';
import { ListRow, RowIcon, Sheet } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { EventFormSheet } from './EventFormSheet';

type Pick = 'practica' | 'torneo';

/**
 * Las ligas de boliche que organiza la cuenta (dueño o admin), por nombre: ahí puede crear una práctica o un torneo
 * (createChoices de la web, la misma de «Crear o unirme»). Vacío mientras cargan.
 */
export function useOrganizedBowling(): { organized: OrganizedLeague[]; loading: boolean } {
  const uid = useAuth().user?.uid;
  const memberships = useMyMemberships(uid);
  const leagues = useLeaguesByIds(memberships.data.map((m) => m.leagueId));
  return { organized: createChoices(leagues.data, memberships.data).organized, loading: memberships.loading || leagues.loading };
}

/**
 * Crear una práctica o un torneo en una liga que organizas (Ligas › «Crear o unirme» › «Una práctica» o «Un torneo» de
 * la web, CreateSheet + EventFormModal): «¿En qué liga?» (o «¿Dónde es el torneo?», con «Sin liga») y, al elegirla, el
 * formulario del evento (EventFormSheet). Con una sola liga, la práctica va directo al formulario. Al crearlo abre el
 * evento. «Sin liga» abre el asistente del torneo sin liga (`/crear?kind=torneo`). Se monta al abrirse.
 */
export function NewEventSheet({ pick, organized, onClose }: { pick: Pick; organized: readonly OrganizedLeague[]; onClose: () => void }) {
  const c = useColors();
  const [chosen, setChosen] = useState<OrganizedLeague | null>(() => (pick === 'practica' && organized.length === 1 ? organized[0] : null));

  if (chosen) {
    const lid = chosen.league.id;
    return (
      <EventFormSheet
        lid={lid}
        type={pick}
        onClose={onClose}
        onCreated={(id) => router.push({ pathname: '/l/[lid]/e/[eventId]', params: { lid, eventId: id } })}
      />
    );
  }

  return (
    <Sheet open onClose={onClose} title={pickLeagueTitle(pick)}>
      {organized.map((o) => {
        const row = pickLeagueRow(pick, o.league);
        const Icon = sportMeta(leagueSport(o.league))?.icon;
        return (
          <ListRow
            key={o.league.id}
            icon={<RowIcon>{Icon ? <Icon size={20} color={c.accent} /> : <Trophy size={20} color={c.accent} />}</RowIcon>}
            title={row.title}
            subtitle={row.text}
            onPress={() => setChosen(o)}
          />
        );
      })}
      {pick === 'torneo' && (
        <ListRow
          icon={
            <RowIcon>
              <Trophy size={20} color={c.accent} />
            </RowIcon>
          }
          title="Sin liga"
          subtitle="Un torneo suelto, con sus inscritos"
          onPress={() => {
            onClose();
            router.push({ pathname: '/crear', params: { kind: 'torneo' } });
          }}
        />
      )}
    </Sheet>
  );
}
