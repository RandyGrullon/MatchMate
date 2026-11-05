import { lazy, Suspense, useMemo, type ComponentType } from 'react';
import { useAdminOverview } from '../../lib/data/admin';
import { useBadgeReports } from '../../lib/data/badgeAdmin';
import { useReportCounts } from '../../lib/data/reports';
import { Loading } from '../../components/ui';
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
import ErrorsSection from './ErrorsSection';
import BrandSection from './BrandSection';
import ReportsSection from './ReportsSection';
import LegalSection from './LegalSection';
import BusinessesSection from './BusinessesSection';
import { useAdminBusinesses } from '../../lib/data/business';

// Insignias (revisar, motor y la galería de todo el catálogo dibujado) se descarga solo al abrirla.
const BadgesSection = lazy(() => import('./BadgesSection'));

export const SECTION_VIEWS: Record<SectionKey, ComponentType> = {
  resumen: OverviewSection,
  cuentas: UsersSection,
  ligas: LeaguesSection,
  empresas: BusinessesSection,
  reportes: ReportsSection,
  deportes: SportsSection,
  anuncios: AnnouncementsSection,
  fotos: ScanSection,
  sistema: SystemSection,
  errores: ErrorsSection,
  legal: LegalSection,
  auditoria: AuditSection,
  logo: BrandSection,
  insignias: BadgesSection,
};

/** La consola con la sección elegida. Quien la usa ya pasó la guarda de superadmin (SuperAdminPage). */
export function Console({ section }: { section: SectionKey }) {
  // El resumen se comparte (una sola consulta): marca en el menú cuántos avisos hay que revisar.
  const overview = useAdminOverview(true).data;
  const urgent = useMemo(() => (overview ? urgentCount(healthAlerts(overview)) : 0), [overview]);
  // Reportes abiertos de toda la app: el número al lado de «Reportes». Los de insignias (diseños del creador e
  // insignias automáticas) son otra cola (private.badge_reports): su número va al lado de «Insignias».
  const reports = useReportCounts(true).data.open;
  const badgeReports = useBadgeReports(true).data.open;
  // Empresas en revisión y promociones pedidas: el número al lado de «Empresas».
  const business = useAdminBusinesses('pending', '').data.counts;
  const View = SECTION_VIEWS[section];
  return (
    <ConsoleShell section={section} badges={{ resumen: urgent, reportes: reports, insignias: badgeReports, empresas: business.pending + business.requests }}>
      <Suspense fallback={<Loading />}>
        <View />
      </Suspense>
    </ConsoleShell>
  );
}
