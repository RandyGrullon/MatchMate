import { useState } from 'react';
import { View } from 'react-native';
import { Settings } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { useLeagueCtx } from '@mm/lib/league';
import { configRowSubtitle, configRowTitle, leaguePhotos } from '@mm/components/league/settings';
import { Card, ListRow, RowIcon } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { ConfigSheet } from './ConfigSheet';
import { DataCard } from './DataCard';
import { EditLeagueSheet } from './EditLeagueSheet';
import { InviteCard } from './InviteCard';
import { LiveCard } from './LiveCard';
import { LogoCard } from './LogoCard';

/**
 * Ajustes de la liga (SettingsPanel de la web, `?tab=liga`): los datos (se editan en una hoja; ahí va la foto del
 * marcador), el logo, las transmisiones en vivo, la invitación y, al final, el respaldo, las fotos viejas y borrar la
 * liga (en su hoja). Avisar e Insignias tienen su propia fila en Organizar.
 */
export function SettingsPanel() {
  const c = useColors();
  const { league, isOwner } = useLeagueCtx();
  const { isSuper } = useAuth();
  const [sheet, setSheet] = useState<'editar' | 'config' | null>(null);
  const canDelete = isOwner || isSuper;
  return (
    <View style={{ gap: 20 }}>
      <DataCard onEdit={() => setSheet('editar')} />
      <LogoCard />
      {/* Transmisiones en vivo: los admins y anotadores ponen el link de un partido. */}
      <LiveCard />
      <InviteCard league={league} />
      <Card padded={false}>
        <ListRow
          icon={
            <RowIcon>
              <Settings size={19} color={c.accent} />
            </RowIcon>
          }
          title={configRowTitle(league.kind, canDelete)}
          subtitle={configRowSubtitle(league.kind, leaguePhotos(league), canDelete)}
          onPress={() => setSheet('config')}
        />
      </Card>
      {sheet === 'editar' && <EditLeagueSheet onClose={() => setSheet(null)} />}
      {sheet === 'config' && <ConfigSheet onClose={() => setSheet(null)} />}
    </View>
  );
}
