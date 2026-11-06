import { View } from 'react-native';
import { Shield } from 'lucide-react-native';
import { applyLeagueTeams, useBowlingTeams } from '@mm/lib/data/bowlingTeams';
import { useLeagueCtx } from '@mm/lib/league';
import type { BowlingEvent } from '@mm/lib/types';
import { fixedTeamsAsk, fixedTeamsDone } from '@mm/components/bowlingTeams/logic';
import { confirmAsync, toast } from '@/components/feedback';
import { runAction } from '@/components/swimming/parts';
import { Button, Card, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { useBusy } from './parts';

/**
 * Torneo › Equipos (quien organiza), si la liga tiene equipos fijos (FixedTeamsCard de la web, con su misma lógica):
 * «Usar los equipos fijos de la liga» (cada inscrito que está en uno pasa a su equipo en este torneo) y que los que se
 * inscriban después entran solos al suyo.
 */
export function FixedTeamsCard({ event, entries }: { event: Pick<BowlingEvent, 'id' | 'teams'>; entries: readonly { teamId: string | null }[] }) {
  const c = useColors();
  const { lid, league } = useLeagueCtx();
  const teams = useBowlingTeams(league.kind === 'torneo' ? null : lid);
  const busy = useBusy();
  const n = teams.data.length;
  if (!n) return null;

  const apply = async () => {
    // Ya hay equipos armados aquí: se avisa antes de cambiar a alguien.
    if (fixedTeamsAsk(event, entries)) {
      const yes = await confirmAsync({
        title: '¿Usar los equipos fijos?',
        message: 'Cada inscrito que está en un equipo fijo pasa a su equipo en este torneo. Los demás se quedan como están.',
        confirmText: 'Usar',
      });
      if (!yes) return;
    }
    await busy.run('fijos', async () => {
      // La base dice cuántos inscritos quedaron con su equipo.
      const done = await runAction(() => applyLeagueTeams(lid, event.id));
      if (done != null) toast(fixedTeamsDone(done));
    });
  };

  return (
    <Card style={{ gap: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <Shield size={20} color={c.accent} style={{ marginTop: 2 }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt style={{ fontFamily: font.semibold }}>{`La liga tiene ${n} ${n === 1 ? 'equipo fijo' : 'equipos fijos'}`}</Txt>
          <Txt variant="meta" tone="muted">
            Quien se inscribe en este torneo entra solo a su equipo.
          </Txt>
        </View>
      </View>
      <Button variant="soft" full loading={busy.isBusy('fijos')} disabled={!entries.length || busy.isBusy()} onPress={() => void apply()}>
        Usar los equipos fijos de la liga
      </Button>
    </Card>
  );
}
