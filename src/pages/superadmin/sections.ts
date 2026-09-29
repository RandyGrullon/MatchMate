/**
 * Secciones de la consola (menú de la izquierda en la computadora, selector arriba en el teléfono).
 * La sección va en la ruta: /superadmin/<clave>. /superadmin solo = Resumen.
 * «Marca» usa la clave `logo` porque /superadmin/marca es la página de logo y animaciones (SplashPreviewPage).
 */
import { Award, Bug, LayoutDashboard, Megaphone, Palette, ScanLine, ScrollText, Server, Trophy, Users, Volleyball, type LucideIcon } from 'lucide-react';

export type SectionKey = 'resumen' | 'cuentas' | 'ligas' | 'deportes' | 'anuncios' | 'fotos' | 'sistema' | 'errores' | 'auditoria' | 'logo' | 'insignias';

export interface SectionMeta {
  key: SectionKey;
  label: string;
  /** Una línea bajo el título de la sección. */
  hint: string;
  icon: LucideIcon;
}

export const SECTIONS: readonly SectionMeta[] = [
  { key: 'resumen', label: 'Resumen', hint: 'Cómo va la app hoy: cuentas, ligas, actividad y avisos.', icon: LayoutDashboard },
  { key: 'cuentas', label: 'Cuentas', hint: 'Todas las cuentas: buscar, ver sus ligas, nombrar superadmins y bloquear.', icon: Users },
  { key: 'ligas', label: 'Ligas y torneos', hint: 'Todas las ligas y torneos de todos los deportes.', icon: Trophy },
  { key: 'deportes', label: 'Deportes', hint: 'Qué deportes están abiertos a todos, en prueba o cerrados.', icon: Volleyball },
  { key: 'anuncios', label: 'Anuncios', hint: 'Mandar un aviso al teléfono de todos o de un grupo.', icon: Megaphone },
  { key: 'fotos', label: 'Lectura de fotos', hint: 'Cuántas fotos del marcador se leen con IA y quién las usa.', icon: ScanLine },
  { key: 'sistema', label: 'Sistema', hint: 'Base de datos, límites del plan gratis, tareas y respaldo.', icon: Server },
  { key: 'errores', label: 'Errores', hint: 'Lo que falla en los teléfonos: qué pantalla, cuántas veces, a cuántas cuentas y en qué teléfono.', icon: Bug },
  { key: 'auditoria', label: 'Auditoría', hint: 'Todo lo que se hizo desde esta consola, con quién y cuándo.', icon: ScrollText },
  { key: 'logo', label: 'Marca', hint: 'Logo y animaciones de apertura de cada deporte.', icon: Palette },
  { key: 'insignias', label: 'Insignias', hint: 'Todo el catálogo en cada nivel, con formas, tamaños, estados y la animación, en claro y en oscuro.', icon: Award },
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
