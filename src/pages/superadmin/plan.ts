/**
 * Límites del plan gratis de Supabase y cuánto se usa de cada uno (lo que la consola pueda saber).
 * Lo que no se mide desde la base (transferencia, invocaciones, conexiones de tiempo real) sale como «—»
 * con dónde verlo. La base y los archivos salen de admin_storage_usage cuando ya llegó (lo que pesan de verdad en
 * Storage, todos los buckets); si no, del resumen.
 */
import type { AdminOverview, AdminStorageUsage } from '../../lib/data/admin';
import { LIMITS } from './alerts';
import { GB, fmtBytes, fmtNum, ratio } from './format';

export interface PlanLimit {
  id: 'db' | 'storage' | 'egress' | 'mau' | 'functions' | 'realtime';
  label: string;
  /** El tope, escrito. */
  limit: string;
  /** Uso actual escrito, o null si no se sabe desde aquí. */
  current: string | null;
  /** Proporción usada (0–1+), o null si no se sabe. */
  used: number | null;
  /** Aclaración corta. */
  note: string;
}

export const FREE_PLAN = {
  egressBytes: 5 * GB,
  mau: 50_000,
  functionCalls: 500_000,
  realtimeConnections: 200,
} as const;

export function planLimits(o: AdminOverview | null, usage: AdminStorageUsage | null = null): PlanLimit[] {
  const db = usage?.dbBytes ?? o?.storage.dbBytes ?? null;
  // Lo que pesa Storage cuando lo hay; sin Storage (modo local) admin_storage_usage da 0 y vale lo del resumen.
  const photos = usage && usage.storageBytes > 0 ? usage.storageBytes : (o?.storage.photosBytes ?? usage?.storageBytes ?? null);
  const mau = o ? o.users.active30d : null;
  return [
    {
      id: 'db',
      label: 'Base de datos',
      limit: fmtBytes(LIMITS.dbBytes),
      current: db == null ? null : fmtBytes(db),
      used: db == null ? null : ratio(db, LIMITS.dbBytes),
      note: 'Tamaño de todas las tablas.',
    },
    {
      id: 'storage',
      label: 'Archivos (Storage)',
      limit: fmtBytes(LIMITS.photosBytes),
      current: photos == null ? (o ? `${fmtNum(o.storage.photos)} fotos` : null) : fmtBytes(photos),
      used: photos == null ? null : ratio(photos, LIMITS.photosBytes),
      note: 'Fotos del marcador.',
    },
    {
      id: 'egress',
      label: 'Transferencia',
      limit: `${fmtBytes(FREE_PLAN.egressBytes)} al mes`,
      current: null,
      used: null,
      note: 'Se ve en el panel de Supabase (Usage).',
    },
    {
      id: 'mau',
      label: 'Usuarios activos',
      limit: `${fmtNum(FREE_PLAN.mau)} al mes`,
      current: mau == null ? null : `≈ ${fmtNum(mau)}`,
      used: mau == null ? null : ratio(mau, FREE_PLAN.mau),
      note: 'Aproximado: cuentas que abrieron la app en 30 días.',
    },
    {
      id: 'functions',
      label: 'Invocaciones de funciones',
      limit: `${fmtNum(FREE_PLAN.functionCalls)} al mes`,
      current: null,
      used: null,
      note: 'Lectura de fotos y avisos push. Se ve en Supabase.',
    },
    {
      id: 'realtime',
      label: 'Tiempo real',
      limit: `${fmtNum(FREE_PLAN.realtimeConnections)} conexiones`,
      current: null,
      used: null,
      note: 'A la vez. Si se llena, la app consulta cada 15–20 s.',
    },
  ];
}
