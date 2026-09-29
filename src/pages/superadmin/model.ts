/**
 * Textos y reglas de la consola que no son pantalla: etiquetas, estados de una cuenta, anuncios
 * (validación y a quién llegan) y cómo leer una entrada de la auditoría. Se prueban en model.test.ts.
 */
import {
  MAX_ANNOUNCE_BODY,
  MAX_ANNOUNCE_TITLE,
  MAX_BLOCK_REASON,
  isAnnouncementUrl,
  type AdminAuditEntry,
  type AdminClientError,
  type AdminUser,
  type AdminUserFilter,
  type AnnouncementAudience,
  type AnnouncementInput,
} from '../../lib/data/admin';
import type { SportStatus } from '../../sports/status';
import type { SportFamily } from '../../sports/types';
import type { LeagueRole } from '../../lib/types';
import { sportMeta } from '../../sports/registry';
import { fmtNum } from './format';

// ---------- Cuentas ----------

export const ROLE_LABEL: Record<LeagueRole, string> = { owner: 'Dueño', admin: 'Admin', member: 'Miembro' };

export const USER_FILTERS: readonly { key: AdminUserFilter; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'super', label: 'Superadmins' },
  { key: 'blocked', label: 'Bloqueadas' },
  { key: 'unconfirmed', label: 'Sin confirmar' },
  { key: 'inactive', label: 'Inactivas' },
];

export const isUserFilter = (v: unknown): v is AdminUserFilter => USER_FILTERS.some((f) => f.key === v);

/** Sin abrir la app en tantos días = inactiva (igual que el filtro «Inactivas»). */
export const INACTIVE_DAYS = 30;

export interface UserFlags {
  superadmin: boolean;
  blocked: boolean;
  unconfirmed: boolean;
  inactive: boolean;
}

export function userFlags(u: Pick<AdminUser, 'superadmin' | 'blockedAt' | 'confirmed' | 'lastSeenAt'>, now = Date.now()): UserFlags {
  const seen = u.lastSeenAt ? Date.parse(u.lastSeenAt) : NaN;
  return {
    superadmin: u.superadmin,
    blocked: !!u.blockedAt,
    unconfirmed: !u.confirmed,
    inactive: !Number.isFinite(seen) || now - seen > INACTIVE_DAYS * 86_400_000,
  };
}

export function providerLabel(p: string | null | undefined): string {
  if (!p) return 'No se sabe';
  if (p === 'email') return 'Correo y contraseña';
  if (p === 'google') return 'Google';
  return p.charAt(0).toUpperCase() + p.slice(1);
}

/** ¿Se le puede bloquear? No a sí mismo ni a un superadmin (la base también lo impide). */
export function canBlock(u: Pick<AdminUser, 'id' | 'superadmin'>, myId: string | undefined): boolean {
  return u.id !== myId && !u.superadmin;
}

/** El mismo tope que revisa la base (admin_block_user). */
export const BLOCK_REASON_MAX = MAX_BLOCK_REASON;

// ---------- Deportes ----------

export const SPORT_STATUS_HELP: Record<SportStatus, string> = {
  open: 'Cualquiera puede crear ligas y torneos de este deporte.',
  beta: 'En prueba: solo tú (superadmin) puedes crear; los demás no lo ven al crear.',
  closed: 'Nadie puede crear nuevas. Las ligas que ya existen siguen igual.',
};

export const FAMILY_LABEL: Record<SportFamily, string> = {
  series: 'Por marcas (cada quien anota su número)',
  racket: 'Raqueta (partidos a sets)',
  team: 'Equipos (partidos por tiempos)',
};

// ---------- Anuncios ----------

/** Los mismos topes que revisa la base (admin_announce). */
export const TITLE_MAX = MAX_ANNOUNCE_TITLE;
export const BODY_MAX = MAX_ANNOUNCE_BODY;

/**
 * ¿Es una ruta de adentro de la app? Empieza con una sola «/» (no «//», que el navegador lee como otro sitio),
 * sin barras invertidas, espacios ni caracteres de control, y de 200 caracteres o menos. Es la regla de la base
 * (private.app_path_ok, la misma de isAnnouncementUrl), pero aquí vacío no sirve.
 */
export function isInAppPath(url: string): boolean {
  return url !== '' && isAnnouncementUrl(url) && url === url.trim();
}

export type AnnouncementErrors = Partial<Record<'title' | 'body' | 'url' | 'audience', string>>;

/** Errores del anuncio en palabras sencillas (vacío = se puede mandar). */
export function validateAnnouncement(input: AnnouncementInput): AnnouncementErrors {
  const e: AnnouncementErrors = {};
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) e.title = 'Escribe un título.';
  else if (title.length > TITLE_MAX) e.title = `Máximo ${TITLE_MAX} letras.`;
  if (!body) e.body = 'Escribe el mensaje.';
  else if (body.length > BODY_MAX) e.body = `Máximo ${BODY_MAX} letras.`;
  const url = input.url?.trim();
  if (url && !isInAppPath(url)) e.url = 'Tiene que ser una ruta de la app que empiece con «/», por ejemplo /ligas.';
  const a = input.audience;
  if (a.kind === 'sport' && !a.sport) e.audience = 'Elige el deporte.';
  if (a.kind === 'league' && !a.leagueId) e.audience = 'Elige la liga.';
  return e;
}

/** El anuncio listo para mandar: textos recortados y sin link vacío. */
export function cleanAnnouncement(input: AnnouncementInput): AnnouncementInput {
  const url = input.url?.trim();
  return { title: input.title.trim(), body: input.body.trim(), ...(url ? { url } : {}), audience: input.audience };
}

/** «Todas las cuentas», «Quienes juegan pádel», «Miembros de Liga X», «Dueños y admins de ligas». */
export function audienceLabel(a: AnnouncementAudience, leagueName?: string | null): string {
  switch (a.kind) {
    case 'all':
      return 'Todas las cuentas con avisos activados';
    case 'sport':
      return `Miembros de ligas de ${sportMeta(a.sport)?.lower ?? 'ese deporte'}`;
    case 'league':
      return leagueName ? `Miembros de «${leagueName}»` : 'Miembros de la liga elegida';
    case 'admins':
      return 'Dueños y admins de ligas';
  }
}

/** Clave estable de un público (para no volver a contar lo mismo). */
export function audienceKey(a: AnnouncementAudience): string {
  switch (a.kind) {
    case 'sport':
      return `sport:${a.sport}`;
    case 'league':
      return `league:${a.leagueId}`;
    default:
      return a.kind;
  }
}

// ---------- Auditoría ----------

export const AUDIT_ACTIONS: readonly { key: string; label: string }[] = [
  { key: 'set_superadmin', label: 'Superadmin' },
  { key: 'block_user', label: 'Bloqueo de cuenta' },
  { key: 'unblock_user', label: 'Desbloqueo de cuenta' },
  { key: 'set_sport_status', label: 'Estado de deporte' },
  { key: 'announce', label: 'Anuncio' },
  { key: 'transfer_league', label: 'Traspaso de liga' },
  { key: 'delete_league', label: 'Liga borrada' },
  { key: 'delete_account', label: 'Cuenta borrada' },
  { key: 'clear_errors', label: 'Errores borrados' },
  { key: 'resolve_report', label: 'Reporte atendido' },
  // Insignias (docs/insignias.md §6.6).
  { key: 'review_badge', label: 'Aval de insignia' },
  { key: 'revoke_badge', label: 'Insignia retirada (fraude)' },
  { key: 'badges_backfill', label: 'Historial de insignias' },
  { key: 'badge_jobs', label: 'Trabajos del motor' },
  { key: 'hide_league_badge', label: 'Diseño escondido' },
  { key: 'hide_league_badge_award', label: 'Insignia de liga oculta' },
  { key: 'revoke_league_badge', label: 'Insignia de liga retirada' },
  { key: 'resolve_badge_reports', label: 'Reportes cerrados' },
  { key: 'blocked_terms', label: 'Palabras bloqueadas' },
];

export function auditActionLabel(action: string): string {
  const hit = AUDIT_ACTIONS.find((a) => a.key === action);
  if (hit) return hit.label;
  const words = action.replace(/[_-]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Acción';
}

export type AuditTone = 'accent' | 'danger' | 'ok' | 'warn' | 'neutral';

export function auditTone(action: string): AuditTone {
  if (action === 'delete_league' || action === 'block_user' || action === 'delete_account' || action === 'revoke_badge') return 'danger';
  if (action === 'hide_league_badge' || action === 'revoke_league_badge' || action === 'badges_backfill') return 'warn';
  if (action === 'unblock_user') return 'ok';
  if (action === 'announce') return 'accent';
  if (action === 'set_sport_status' || action === 'transfer_league') return 'warn';
  return 'neutral';
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Una frase corta con lo que pasó (lo que se pueda leer del detalle; lo demás va en «Ver detalle»).
 * El detalle es el que guarda la base (20260927001100_consola.sql): nombre, correo, motivo, from/to…
 */
export function auditSummary(e: Pick<AdminAuditEntry, 'action' | 'detail'> & { targetId?: string | null }): string {
  const d = e.detail ?? {};
  const name = str(d.name);
  const who = name ? ` a ${name}` : '';
  switch (e.action) {
    case 'set_superadmin':
      return d.value === false ? `Le quitó superadmin${who}` : `Hizo superadmin${who}${d.unblocked === true ? ' (y quedó desbloqueada)' : ''}`;
    case 'block_user': {
      const reason = str(d.reason);
      return `Bloqueó${who || ' la cuenta'}${reason ? `: «${reason}»` : ''}`;
    }
    case 'unblock_user':
      return `Desbloqueó${who || ' la cuenta'}`;
    case 'set_sport_status': {
      const status = str(d.to) ?? str(d.status);
      const sport = sportMeta(str(d.sport) ?? e.targetId ?? '')?.label;
      const verb = status === 'open' ? 'Abrió' : status === 'closed' ? 'Cerró' : status === 'beta' ? 'Puso en beta' : 'Cambió';
      return sport ? `${verb} ${sport}` : `${verb} un deporte`;
    }
    case 'announce': {
      const title = str(d.title);
      const n = numOrNull(d.recipients);
      const to = n == null ? '' : ` a ${fmtNum(n)} ${n === 1 ? 'cuenta' : 'cuentas'}`;
      return title ? `Mandó «${title}»${to}` : `Mandó un anuncio${to}`;
    }
    case 'transfer_league': {
      const from = str(d.fromName);
      const to = str(d.toName) ?? str(d.to_name);
      return `Pasó ${name ? `«${name}»` : 'la liga'}${from ? ` de ${from}` : ''}${to ? ` a ${to}` : ' a otra cuenta'}`;
    }
    case 'delete_league': {
      const owner = str(d.ownerName);
      return `${name ? `Borró «${name}»` : 'Borró una liga'}${owner ? ` (de ${owner})` : ''}`;
    }
    case 'delete_account':
      // La persona borró su cuenta (Configuración): ya no hay nombre ni correo.
      return 'La persona borró su cuenta';
    case 'clear_errors': {
      const n = numOrNull(d.deleted);
      const what = n == null ? 'reportes de errores' : `${fmtNum(n)} ${n === 1 ? 'reporte' : 'reportes'} de errores`;
      if (d.all === true) return `Vació los errores (${what})`;
      const message = str(d.message);
      return `Borró ${what}${message ? `: «${message.length > 80 ? `${message.slice(0, 79)}…` : message}»` : ''}`;
    }
    case 'resolve_report': {
      // 20260929000900_legal.sql: {kind, status, reason, note, closed}.
      const verb = d.status === 'dismissed' ? 'Descartó' : 'Atendió';
      const n = numOrNull(d.closed);
      const what = n != null && n > 1 ? `${fmtNum(n)} reportes` : 'un reporte';
      const note = str(d.note);
      return `${verb} ${what}${note ? `: «${note.length > 80 ? `${note.slice(0, 79)}…` : note}»` : ''}`;
    }
    default:
      return auditActionLabel(e.action);
  }
}

/** A dónde lleva el objetivo de una entrada (null = no hay a dónde ir). */
export function auditTargetPath(e: Pick<AdminAuditEntry, 'targetType' | 'targetId' | 'action'>): string | null {
  if (e.action === 'clear_errors') return '/superadmin/errores';
  if (e.action === 'resolve_report') return '/superadmin/reportes?e=closed';
  // Una cuenta borrada ya no se puede abrir.
  if (e.action === 'delete_account') return null;
  if (!e.targetId) return e.targetType === 'sport' ? '/superadmin/deportes' : null;
  switch (e.targetType) {
    case 'user':
      return `/superadmin/cuentas?u=${encodeURIComponent(e.targetId)}`;
    case 'league':
      // Una liga borrada ya no se puede abrir.
      return e.action === 'delete_league' ? null : `/l/${encodeURIComponent(e.targetId)}`;
    case 'sport':
      return '/superadmin/deportes';
    default:
      return null;
  }
}

export const TARGET_LABEL: Record<AdminAuditEntry['targetType'], string> = { user: 'Cuenta', league: 'Liga', sport: 'Deporte', app: 'App' };

// ---------- Errores de los teléfonos ----------

export const CLIENT_ERROR_KIND_LABEL: Record<AdminClientError['kind'], string> = {
  error: 'Código',
  promise: 'Promesa',
  render: 'Pantalla',
  chunk: 'Actualización',
};

/** Qué quiere decir cada tipo (ayuda del filtro). */
export const CLIENT_ERROR_KIND_HELP: Record<AdminClientError['kind'], string> = {
  error: 'Un error de código que nadie atrapó.',
  promise: 'Una promesa que falló sin catch (casi siempre una lectura o escritura).',
  render: 'Una pantalla que no se pudo dibujar: la persona vio el aviso de error.',
  chunk: 'Una parte de la app que no bajó: versión nueva publicada o se cayó la señal.',
};

export function clientErrorTone(kind: AdminClientError['kind']): AuditTone {
  if (kind === 'render') return 'danger';
  if (kind === 'chunk') return 'neutral';
  return 'warn';
}

const UA_BROWSERS: readonly (readonly [string, RegExp])[] = [
  ['Samsung Internet', /SamsungBrowser\/(\d+)/],
  ['Edge', /Edg(?:A|iOS)?\/(\d+)/],
  ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/],
  ['Chrome', /(?:Chrome|CriOS)\/(\d+)/],
  ['Safari', /Version\/(\d+)[^)]*Safari\//],
  ['Safari', /Safari\/()/],
];

/**
 * El teléfono en pocas palabras, del user agent: sistema y navegador (y si es la app instalada).
 * «Android 10 · Chrome 128 · app instalada», «iPhone iOS 17.4 · Safari», «Windows · Edge 127».
 */
export function describeUa(ua: string | null | undefined): string {
  if (!ua) return 'No se sabe';
  const parts: string[] = [];
  const android = /Android\s+([\d.]+)/.exec(ua);
  const ios = /(iPhone|iPad|iPod)[^)]*OS\s+([\d_]+)/.exec(ua);
  if (android) parts.push(`Android ${android[1]}`);
  else if (ios) parts.push(`${ios[1]} iOS ${ios[2].replace(/_/g, '.')}`);
  else if (/Windows/.test(ua)) parts.push('Windows');
  else if (/Macintosh|Mac OS X/.test(ua)) parts.push('Mac');
  else if (/Linux/.test(ua)) parts.push('Linux');
  // El orden importa: Samsung y Edge también dicen «Chrome», y todos dicen «Safari».
  for (const [name, re] of UA_BROWSERS) {
    const m = re.exec(ua);
    if (m) {
      parts.push(m[1] ? `${name} ${m[1]}` : name);
      break;
    }
  }
  if (/\[app instalada\]/.test(ua)) parts.push('app instalada');
  return parts.length ? parts.join(' · ') : ua.slice(0, 60);
}
