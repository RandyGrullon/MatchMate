/**
 * Avisos de salud de la app (Resumen de la consola), calculados del resumen general.
 * Los topes son los del plan gratis de Supabase: base 500 MB y Storage 1 GB.
 */
import type { AdminOverview } from '../../lib/data/admin';
import { GB, MB, fmtBytes, fmtNum, fmtPct, ratio } from './format';

export type AlertLevel = 'info' | 'warn' | 'danger';

export interface HealthAlert {
  id: 'db' | 'photos' | 'scan' | 'push-failed' | 'push-queue' | 'pending' | 'blocked';
  level: AlertLevel;
  title: string;
  detail: string;
  /** Sección de la consola donde se ve más (ruta). */
  to?: string;
}

/** Topes del plan gratis y cuándo avisar. */
export const LIMITS = {
  dbBytes: 500 * MB,
  dbWarnBytes: 400 * MB,
  photosBytes: 1 * GB,
  photosWarnBytes: 800 * MB,
  /** Lecturas de fotos de hoy: avisar al pasar del 80 % del tope diario. */
  scanWarnRatio: 0.8,
  /** Envíos del boliche sin aprobar: muchos = los admins de liga no están revisando. */
  pendingWarn: 50,
  /** Avisos push en cola sin salir. */
  pushQueueWarn: 200,
} as const;

/** Casi lleno (≥ 95 %) es rojo; pasar el umbral de aviso, amarillo. */
const levelFor = (value: number, warn: number, max: number): AlertLevel | null =>
  value >= max * 0.95 ? 'danger' : value > warn ? 'warn' : null;

const ORDER: Record<AlertLevel, number> = { danger: 0, warn: 1, info: 2 };

/** Avisos a mostrar, los más graves primero. Vacío = todo bien. */
export function healthAlerts(o: AdminOverview): HealthAlert[] {
  const out: HealthAlert[] = [];

  const db = o.storage.dbBytes;
  if (db != null) {
    const level = levelFor(db, LIMITS.dbWarnBytes, LIMITS.dbBytes);
    if (level)
      out.push({
        id: 'db',
        level,
        title: 'La base de datos se está llenando',
        detail: `${fmtBytes(db)} de ${fmtBytes(LIMITS.dbBytes)} (${fmtPct(ratio(db, LIMITS.dbBytes))}). Borra fotos viejas o pasa a un plan pagado.`,
        to: '/superadmin/sistema',
      });
  }

  const photos = o.storage.photosBytes;
  if (photos != null) {
    const level = levelFor(photos, LIMITS.photosWarnBytes, LIMITS.photosBytes);
    if (level)
      out.push({
        id: 'photos',
        level,
        title: 'Las fotos se están llenando',
        detail: `${fmtBytes(photos)} de ${fmtBytes(LIMITS.photosBytes)} (${fmtPct(ratio(photos, LIMITS.photosBytes))}) en ${fmtNum(o.storage.photos)} fotos.`,
        to: '/superadmin/sistema',
      });
  }

  const { today, dailyLimit } = o.scan;
  if (dailyLimit > 0 && today > dailyLimit * LIMITS.scanWarnRatio) {
    out.push({
      id: 'scan',
      level: today >= dailyLimit ? 'danger' : 'warn',
      title: today >= dailyLimit ? 'Se acabaron las lecturas de fotos de hoy' : 'Quedan pocas lecturas de fotos hoy',
      detail: `${fmtNum(today)} de ${fmtNum(dailyLimit)} (${fmtPct(ratio(today, dailyLimit))}). Mañana se reinicia el tope.`,
      to: '/superadmin/fotos',
    });
  }

  if (o.push.failed24h > 0)
    out.push({
      id: 'push-failed',
      level: 'warn',
      title: 'Avisos push que fallaron',
      detail: `${fmtNum(o.push.failed24h)} en las últimas 24 horas. Revisa la cola en Sistema.`,
      to: '/superadmin/sistema',
    });

  if (o.push.queued >= LIMITS.pushQueueWarn)
    out.push({
      id: 'push-queue',
      level: 'warn',
      title: 'Muchos avisos push en cola',
      detail: `${fmtNum(o.push.queued)} esperando salir. Puede que la tarea de envío esté parada.`,
      to: '/superadmin/sistema',
    });

  if (o.activity.submissionsPending >= LIMITS.pendingWarn)
    out.push({
      id: 'pending',
      level: 'warn',
      title: 'Muchos envíos sin aprobar',
      detail: `${fmtNum(o.activity.submissionsPending)} envíos de juegos esperan que un admin de liga los apruebe.`,
      to: '/superadmin/ligas',
    });

  if (o.users.blocked > 0)
    out.push({
      id: 'blocked',
      level: 'info',
      title: o.users.blocked === 1 ? 'Hay 1 cuenta bloqueada' : `Hay ${fmtNum(o.users.blocked)} cuentas bloqueadas`,
      detail: 'No pueden guardar nada hasta que las desbloquees.',
      to: '/superadmin/cuentas?f=blocked',
    });

  return out.sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}

/** Cuántos avisos importan (amarillo o rojo) para la marca del menú. */
export const urgentCount = (alerts: readonly HealthAlert[]) => alerts.filter((a) => a.level !== 'info').length;
