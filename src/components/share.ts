export const playerUrl = (lid: string, playerId: string) => `${location.origin}/l/${lid}/j/${playerId}`;

/** Comparte con el menú nativo del teléfono o copia al portapapeles. Devuelve true si se copió. */
export async function shareLink(url: string, title: string): Promise<boolean> {
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ title, url });
      return false;
    } catch {
      // cancelado: cae al portapapeles
    }
  }
  await navigator.clipboard.writeText(url);
  return true;
}
