/**
 * CSV para bajar listas de la consola (se abre en Excel). Funciones puras más `downloadText` (navegador).
 */
import type { AdminLeague, AdminUser } from '../../lib/data/admin';
import { sportMeta } from '../../sports/registry';

export interface CsvColumn<T> {
  label: string;
  value: (row: T) => string | number | boolean | null | undefined;
}

/**
 * Una celda: comillas si tiene coma, comillas, saltos o espacios en los bordes; y un apóstrofo delante si
 * empieza como una fórmula (=, +, -, @, tab) para que Excel no la ejecute (inyección de fórmulas).
 */
export function csvCell(v: string | number | boolean | null | undefined): string {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'sí' : 'no';
  let s = v;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Filas → texto CSV (coma y fin de línea CRLF, como lo espera Excel). */
export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const lines = [columns.map((c) => csvCell(c.label)).join(',')];
  for (const r of rows) lines.push(columns.map((c) => csvCell(c.value(r))).join(','));
  return lines.join('\r\n') + '\r\n';
}

/** Fecha ISO → 'YYYY-MM-DD HH:MM' (UTC, sin depender de la zona de quien lo baja). */
export function csvDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 16).replace('T', ' ') : '';
}

export const USER_CSV_COLUMNS: readonly CsvColumn<AdminUser>[] = [
  { label: 'Nombre', value: (u) => u.name },
  { label: 'Correo', value: (u) => u.email },
  { label: 'Alta (UTC)', value: (u) => csvDate(u.createdAt) },
  { label: 'Última vez (UTC)', value: (u) => csvDate(u.lastSeenAt) },
  { label: 'Último inicio de sesión (UTC)', value: (u) => csvDate(u.lastSignInAt) },
  { label: 'Proveedor', value: (u) => u.provider },
  { label: 'Correo confirmado', value: (u) => u.confirmed },
  { label: 'Superadmin', value: (u) => u.superadmin },
  { label: 'Bloqueada', value: (u) => (u.blockedAt ? csvDate(u.blockedAt) : '') },
  { label: 'Motivo del bloqueo', value: (u) => u.blockedReason },
  { label: 'Ligas', value: (u) => u.leagues },
  { label: 'Dueño de', value: (u) => u.ownedLeagues },
  { label: 'Id', value: (u) => u.id },
];

export const LEAGUE_CSV_COLUMNS: readonly CsvColumn<AdminLeague>[] = [
  { label: 'Nombre', value: (l) => l.name },
  { label: 'Deporte', value: (l) => sportMeta(l.sport)?.label ?? l.sport },
  { label: 'Tipo', value: (l) => (l.kind === 'torneo' ? 'Torneo' : 'Liga') },
  { label: 'Visibilidad', value: (l) => (l.visibility === 'private' ? 'Privada' : 'Pública') },
  { label: 'Con menores', value: (l) => l.hasMinors },
  { label: 'Dueño', value: (l) => l.ownerName },
  { label: 'Correo del dueño', value: (l) => l.ownerEmail },
  { label: 'Miembros', value: (l) => l.members },
  { label: 'Jugadores', value: (l) => l.players },
  { label: 'Eventos', value: (l) => l.events },
  { label: 'Última actividad (UTC)', value: (l) => csvDate(l.lastActivityAt) },
  { label: 'Creada (UTC)', value: (l) => csvDate(l.createdAt) },
  { label: 'Id', value: (l) => l.id },
];

/** Nombre de archivo con la fecha: «matchmate-cuentas-2026-09-27.csv». */
export function csvFileName(what: string, now: Date = new Date()): string {
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `matchmate-${what}-${d}.csv`;
}

/** Baja un texto como archivo. El BOM hace que Excel lea bien las tildes. */
export function downloadText(fileName: string, text: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿', text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
