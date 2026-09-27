import { useRef, useState } from 'react';
import { Camera, ImageUp } from 'lucide-react';
import { compressImage, type CompressedImage } from '../lib/image';
import { Button, Spinner, cx } from './ui';

/** Botón para tomar o elegir la foto del marcador; la devuelve ya comprimida. */
export function PhotoPicker({
  onPicked,
  compact,
  label = 'Tomar o elegir foto',
}: {
  onPicked: (img: CompressedImage) => void;
  compact?: boolean;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onPicked(await compressImage(file));
    } catch {
      setError('No se pudo abrir esa imagen.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => onChange(e.target.files?.[0])} />
      {compact ? (
        <Button onClick={() => input.current?.click()} loading={busy} icon={<ImageUp className="size-4" />}>
          {label}
        </Button>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className={cx(
            'flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line px-6 py-10 text-center transition',
            'hover:border-accent hover:bg-accent-soft/40',
          )}
        >
          {busy ? <Spinner className="size-8" /> : <Camera className="size-8 text-accent" />}
          <span className="font-medium">{busy ? 'Preparando foto…' : label}</span>
          <span className="text-xs text-muted">La pantalla de resultados de la pista, que se lean los nombres y los juegos.</span>
        </button>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </>
  );
}
