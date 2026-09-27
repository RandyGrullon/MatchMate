import { useMemo, type ComponentType } from 'react';
import { useAdminOverview } from '../../lib/data/admin';
import { healthAlerts, urgentCount } from './alerts';
import { ConsoleShell } from './ConsoleShell';
import type { SectionKey } from './sections';
import OverviewSection from './OverviewSection';
import UsersSection from './UsersSection';
import LeaguesSection from './LeaguesSection';
import SportsSection from './SportsSection';
import AnnouncementsSection from './AnnouncementsSection';
import ScanSection from './ScanSection';
import SystemSection from './SystemSection';
import AuditSection from './AuditSection';
import BrandSection from './BrandSection';

export const SECTION_VIEWS: Record<SectionKey, ComponentType> = {
  resumen: OverviewSection,
  cuentas: UsersSection,
  ligas: LeaguesSection,
  deportes: SportsSection,
  anuncios: AnnouncementsSection,
  fotos: ScanSection,
  sistema: SystemSection,
  auditoria: AuditSection,
  logo: BrandSection,
};

/** La consola con la sección elegida. Quien la usa ya pasó la guarda de superadmin (SuperAdminPage). */
export function Console({ section }: { section: SectionKey }) {
  // El resumen se comparte (una sola consulta): marca en el menú cuántos avisos hay que revisar.
  const overview = useAdminOverview(true).data;
  const urgent = useMemo(() => (overview ? urgentCount(healthAlerts(overview)) : 0), [overview]);
  const View = SECTION_VIEWS[section];
  return (
    <ConsoleShell section={section} badges={{ resumen: urgent }}>
      <View />
    </ConsoleShell>
  );
}
