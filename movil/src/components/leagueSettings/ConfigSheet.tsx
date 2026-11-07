import { useState, type ComponentType } from 'react';
import { Platform, View } from 'react-native';
import { router } from 'expo-router';
import { DatabaseBackup, ImageMinus, Trash2 } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { downloadLeagueBackup } from '@mm/lib/backup';
import { deleteLeague, deleteOldPhotos } from '@mm/lib/data';
import { rememberLeague, useLeagueCtx } from '@mm/lib/league';
import { leagueSport } from '@mm/sports/registry';
import {
  BACKUP_ERROR_TEXT,
  DELETED_TEXT,
  FREE_PHOTOS_CONFIRM,
  OLD_PHOTOS_MONTHS,
  backupDoneText,
  configRows,
  configTitle,
  deleteLeagueConfirm,
  freedPhotosText,
  type ConfigKey,
  type ConfigRowItem,
} from '@mm/components/league/settings';
import { confirmAsync, toast } from '@/components/feedback';
import { runAction } from '@/components/swimming/parts';
import { Button, Sheet, Txt } from '@/components/ui';
import { openOnWeb } from '@/lib/web';
import { useColors } from '@/theme/theme';

const ICONS: Record<ConfigKey, ComponentType<{ size?: number; color?: string }>> = { backup: DatabaseBackup, photos: ImageMinus, delete: Trash2 };

/**
 * La configuración de la liga (LeagueConfigModal de la web): el respaldo (descargar los datos), las fotos viejas (boliche:
 * borrar las de hace más de un año) y borrar la liga o el torneo (dueño o superadmin). El respaldo es un archivo que
 * baja el navegador: en el teléfono se abre la web para bajarlo.
 */
export function ConfigSheet({ onClose }: { onClose: () => void }) {
  const { lid, league, isOwner } = useLeagueCtx();
  const { user, isSuper } = useAuth();
  const [busy, setBusy] = useState<ConfigKey | null>(null);
  const bowling = leagueSport(league) === 'bowling';
  const rows = configRows({ kind: league.kind, bowling, canDelete: isOwner || isSuper });

  async function backup() {
    if (Platform.OS !== 'web') return void openOnWeb(`/l/${lid}/admin?tab=liga`);
    setBusy('backup');
    try {
      toast(backupDoneText(await downloadLeagueBackup(league)));
    } catch (e) {
      console.error(e);
      toast(BACKUP_ERROR_TEXT, 'error');
    } finally {
      setBusy(null);
    }
  }

  async function freePhotos() {
    if (!(await confirmAsync(FREE_PHOTOS_CONFIRM))) return;
    setBusy('photos');
    const n = await runAction(() => deleteOldPhotos(lid, OLD_PHOTOS_MONTHS));
    if (n != null) toast(freedPhotosText(n));
    setBusy(null);
  }

  async function remove() {
    if (!(await confirmAsync(deleteLeagueConfirm(league.name, bowling))) || !user) return;
    setBusy('delete');
    const done = await runAction(async () => {
      await deleteLeague(lid, user.uid);
      return true;
    }, DELETED_TEXT);
    setBusy(null);
    if (done) {
      onClose();
      rememberLeague(null);
      router.replace('/ligas');
    }
  }

  const act: Record<ConfigKey, () => Promise<void>> = { backup, photos: freePhotos, delete: remove };

  return (
    <Sheet
      open
      onClose={onClose}
      title={configTitle(league.kind)}
      footer={
        <Button size="lg" full onPress={onClose}>
          Cerrar
        </Button>
      }
    >
      <View style={{ gap: 12 }}>
        {rows.map((r) => (
          <ConfigRow key={r.key} row={r} busy={busy} onPress={act[r.key]} />
        ))}
      </View>
    </Sheet>
  );
}

function ConfigRow({ row, busy, onPress }: { row: ConfigRowItem; busy: ConfigKey | null; onPress: () => Promise<void> }) {
  const c = useColors();
  const Icon = ICONS[row.key];
  const tone = row.danger ? c.danger : c.accent;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1.5, padding: 12, borderColor: row.danger ? c.danger : c.line, backgroundColor: row.danger ? c.dangerSoft : 'transparent' }}>
      <View style={{ alignSelf: 'flex-start', marginTop: 2 }}>
        <Icon size={20} color={tone} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="bodyStrong" tone={row.danger ? 'danger' : 'fg'}>
          {row.title}
        </Txt>
        <Txt variant="meta" tone="muted">
          {row.text}
        </Txt>
      </View>
      <Button variant={row.danger ? 'danger' : 'quiet'} loading={busy === row.key} disabled={!!busy} onPress={() => void onPress()}>
        {row.action}
      </Button>
    </View>
  );
}
