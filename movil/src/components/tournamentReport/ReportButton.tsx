/**
 * «Reporte del torneo» (ReportButton de la web): el PDF (para WhatsApp o imprimir) o el Excel del torneo con todo. Lo
 * ve todo el que ve el torneo. 'row': la fila de «•••» de la web («Reporte de la ronda», con «PDF para WhatsApp o
 * imprimir, o Excel» abajo), en una tarjeta donde la pantalla de la app no tiene «•••»; 'card': la tarjeta grande, para
 * quien organiza cuando el torneo terminó. Tocar abre la hoja (ReportSheet).
 */
import { useState } from 'react';
import { View } from 'react-native';
import { FileDown } from 'lucide-react-native';
import { REPORT_CARD_TEXT, REPORT_MENU_HINT, REPORT_TITLE } from '@mm/components/tournamentReport/view';
import { Button, Card, ListRow, RowIcon, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { ReportSheet, type ReportSource } from './ReportSheet';

export function ReportButton({
  report,
  comp,
  look,
  label = REPORT_TITLE,
  disabled,
}: ReportSource & {
  look: 'card' | 'row';
  /** El nombre de la fila ('row'): el de la fila de «•••» de esa pantalla en la web. */
  label?: string;
  disabled?: boolean;
}) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const sheet = <ReportSheet open={open} onClose={() => setOpen(false)} report={report} comp={comp} />;
  if (look === 'row') {
    return (
      <>
        <Card padded={false}>
          <ListRow
            icon={
              <RowIcon>
                <FileDown size={18} color={c.accent} />
              </RowIcon>
            }
            title={label}
            subtitle={REPORT_MENU_HINT}
            onPress={disabled ? undefined : () => setOpen(true)}
          />
        </Card>
        {sheet}
      </>
    );
  }
  return (
    <>
      {/* Una fila en una tarjeta: el reporte, para quien organiza cuando el torneo terminó. */}
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, paddingLeft: 20, paddingRight: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accentSoft }}>
          <FileDown size={20} color={c.accent} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="bodyStrong">{REPORT_TITLE}</Txt>
          <Txt variant="meta" tone="muted">
            {REPORT_CARD_TEXT}
          </Txt>
        </View>
        <Button variant="soft" disabled={disabled} onPress={() => setOpen(true)}>
          Descargar
        </Button>
      </Card>
      {sheet}
    </>
  );
}
