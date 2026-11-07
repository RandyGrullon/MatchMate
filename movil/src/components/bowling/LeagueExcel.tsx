/**
 * Tabla › «Excel» (Pro, la píldora de arriba; LeagueExcelButton de la web): la hoja «Descargar en Excel» con la
 * temporada elegida en la tabla (sus fechas; la que sigue abierta, hasta hoy) o toda la liga, con la tabla, todos los
 * juegos y cada práctica y torneo. Sin temporadas: las fechas de la liga. Qué se baja, las hojas y los textos son los de
 * la web (src/lib/leagueExcel.ts); el archivo se comparte con la hoja del teléfono (shareExcel). Va dentro de
 * LeagueScope.
 */
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Download, FileSpreadsheet } from 'lucide-react-native';
import { fetchEntriesOfEvents } from '@mm/lib/data';
import { EXCEL_DONE, LEAGUE_EXCEL_NOTE, LEAGUE_EXCEL_TEXT, LEAGUE_EXCEL_TITLE, leagueExcelFileName, leagueExcelScopes, leagueExcelSheets, scopeEventIds, type LeagueExcelScope } from '@mm/lib/leagueExcel';
import { useLeagueCtx } from '@mm/lib/league';
import type { Season } from '@mm/lib/seasons';
import type { BowlingEvent, Player } from '@mm/lib/types';
import { runAction } from '@/components/swimming/parts';
import { Button, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { shareExcel } from './shareExcel';

export function LeagueExcelButton({ season, events, players }: { season: Season | null; events: readonly BowlingEvent[]; players: readonly Player[] }) {
  const c = useColors();
  const { lid, league } = useLeagueCtx();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const scopes = leagueExcelScopes(season, league);

  async function download(scope: LeagueExcelScope) {
    setBusy(scope.key);
    const ok = await runAction(async () => {
      // Solo lo de las fechas elegidas (no toda la historia de la liga).
      const entries = await fetchEntriesOfEvents(lid, scopeEventIds(events, scope));
      await shareExcel(leagueExcelFileName(league.name, scope), leagueExcelSheets(scope, events, entries, players), `${league.name} · ${scope.label}`);
      return true;
    }, EXCEL_DONE);
    setBusy(null);
    if (ok) setOpen(false);
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={LEAGUE_EXCEL_TITLE}
        hitSlop={4}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.pill, { backgroundColor: c.surface2, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
      >
        <Download size={16} color={c.fg} />
        <Txt style={{ fontSize: 14, fontFamily: font.semibold }}>Excel</Txt>
      </Pressable>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={LEAGUE_EXCEL_TITLE}
        footer={
          <Button full onPress={() => setOpen(false)}>
            Cerrar
          </Button>
        }
      >
        <Txt variant="meta" tone="muted">
          {LEAGUE_EXCEL_TEXT}
        </Txt>
        {scopes.map((s) => (
          <Button key={s.key} full icon={<FileSpreadsheet size={16} color={c.fg} />} loading={busy === s.key} disabled={!!busy} onPress={() => download(s)} style={{ justifyContent: 'flex-start' }}>
            {s.label}
          </Button>
        ))}
        <Txt tone="muted" style={{ fontSize: 12, lineHeight: 16 }}>
          {LEAGUE_EXCEL_NOTE}
        </Txt>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, borderRadius: 18, paddingHorizontal: 13 },
});
