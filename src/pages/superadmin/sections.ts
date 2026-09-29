/**
 * Secciones de la consola (menú de la izquierda en la computadora, selector arriba en el teléfono).
 * La sección va en la ruta: /superadmin/<clave>. /superadmin solo = Resumen.
 * «Marca» usa la clave `logo` porque /superadmin/marca es la página de logo y animaciones (SplashPreviewPage).
 */
import { Bug, Flag, LayoutDashboard, Megaphone, Palette, Scale, ScanLine, ScrollText, Server, Trophy, Users, Volleyball, type LucideIcon } from 'lucide-react';

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
  | 'logo';

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
  { key: 'reportes', label: 'Reportes', hint: 'Lo que la gente reportó: comentarios, avisos, juegos, ligas y cuentas. Descartar, atender y las herramientas.', icon: Flag },
  { key: 'deportes', label: 'Deportes', hint: 'Qué deportes están abiertos a todos, en prueba o cerrados.', icon: Volleyball },
  { key: 'anuncios', label: 'Anuncios', hint: 'Mandar un aviso al teléfono de todos o de un grupo.', icon: Megaphone },
  { key: 'fotos', label: 'Lectura de fotos', hint: 'Cuántas fotos del marcador se leen con IA y quién las usa.', icon: ScanLine },
  { key: 'sistema', label: 'Sistema', hint: 'Base de datos, límites del plan gratis, tareas y respaldo.', icon: Server },
  { key: 'errores', label: 'Errores', hint: 'Lo que falla en los teléfonos: qué pantalla, cuántas veces, a cuántas cuentas y en qué teléfono.', icon: Bug },
  { key: 'legal', label: 'Legal', hint: 'Versiones de los términos y la privacidad, quién ya las aceptó y lo que falta completar.', icon: Scale },
  { key: 'auditoria', label: 'Auditoría', hint: 'Todo lo que se hizo desde esta consola, con quién y cuándo.', icon: ScrollText },
  { key: 'logo', label: 'Marca', hint: 'Logo y animaciones de apertura de cada deporte.', icon: Palette },
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
