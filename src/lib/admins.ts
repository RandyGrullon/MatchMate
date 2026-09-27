/**
 * Superadmins fijos: administran todas las ligas y las cuentas.
 * Debe coincidir con isFixedSuper() de firestore.rules. Otros se nombran desde la app (flag `superadmin`).
 */
export const FIXED_SUPERADMINS = ['admin@admin.com'];

export const isFixedSuper = (email: string | null | undefined) => !!email && FIXED_SUPERADMINS.includes(email.toLowerCase());
