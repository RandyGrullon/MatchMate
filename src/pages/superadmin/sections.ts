/**
 * Secciones de la consola (menú de la izquierda en la computadora, selector arriba en el teléfono).
 * La sección va en la ruta: /superadmin/<clave>. /superadmin solo = Resumen.
 * «Marca» usa la clave `logo` porque /superadmin/marca es la página de logo y animaciones (SplashPreviewPage).
 */
import { Award, Bug, Flag, LayoutDashboard, Megaphone, Palette, Scale, ScanLine, ScrollText, Server, Trophy, Users, Volleyball, type LucideIcon } from 'lucide-react';

export type SectionKey =
  | 'resumen'
  | 'cuentas'
  | 'ligas'
  | 'reportes'
  | 'deportes'
  | 'anuncios'
  | 'fotos'
  | 'sistema'
  | 'errores'
  | 'legal'
  | 'auditoria'
  | 'logo'
  | 'insignias';

export interface SectionMeta {
  key: SectionKey;
  label: string;
  /** Una línea corta bajo el título de la sección (y en su fila de la lista de la consola). */
  hint: string;
  icon: LucideIcon;
}

export const SECTIONS: readonly SectionMeta[] = [
  { key: 'resumen', label: 'Resumen', hint: 'Cómo va la app hoy', icon: LayoutDashboard },
  { key: 'cuentas', label: 'Cuentas', hint: 'Buscar, bloquear y nombrar superadmins', icon: Users },
  { key: 'ligas', label: 'Ligas y torneos', hint: 'De todos los deportes', icon: Trophy },
  { key: 'reportes', label: 'Reportes', hint: 'Lo que la gente reportó', icon: Flag },
  { key: 'deportes', label: 'Deportes', hint: 'Abiertos, en prueba o cerrados', icon: Volleyball },
  { key: 'anuncios', label: 'Anuncios', hint: 'Un aviso al teléfono de todos o de un grupo', icon: Megaphone },
  { key: 'fotos', label: 'Lectura de fotos', hint: 'Fotos del marcador leídas con IA', icon: ScanLine },
  { key: 'sistema', label: 'Sistema', hint: 'Base de datos, plan gratis y respaldo', icon: Server },
  { key: 'errores', label: 'Errores', hint: 'Lo que falla en los teléfonos', icon: Bug },
  { key: 'legal', label: 'Legal', hint: 'Términos, privacidad y quién los aceptó', icon: Scale },
  { key: 'auditoria', label: 'Auditoría', hint: 'Lo que se hizo en la consola, quién y cuándo', icon: ScrollText },
  { key: 'logo', label: 'Marca', hint: 'Logo y animaciones de apertura', icon: Palette },
  { key: 'insignias', label: 'Insignias', hint: 'Por revisar, el motor y la galería', icon: Award },
];

export const DEFAULT_SECTION: SectionKey = 'resumen';

/** Clave de la ruta → sección (null si no existe). Sin clave = Resumen. */
export function sectionFromParam(param: string | undefined | null): SectionKey | null {
  if (!param) return DEFAULT_SECTION;
  const hit = SECTIONS.find((s) => s.key === param);
  return hit ? hit.key : null;
}

export const sectionMeta = (key: SectionKey): SectionMeta => SECTIONS.find((s) => s.key === key) ?? SECTIONS[0];

/** Ruta de una sección (Resumen = /superadmin). */
export const sectionPath = (key: SectionKey) => (key === DEFAULT_SECTION ? '/superadmin' : `/superadmin/${key}`);
