import { useMemo } from 'react';
import { encode } from 'uqr';

/** Código QR en SVG (siempre negro sobre blanco para que lo lea cualquier cámara). */
export function QrCode({ value, className = 'size-44' }: { value: string; className?: string }) {
  const { d, size } = useMemo(() => {
    const qr = encode(value, { ecc: 'M', border: 2 });
    let path = '';
    qr.data.forEach((row, y) =>
      row.forEach((on, x) => {
        if (on) path += `M${x} ${y}h1v1h-1z`;
      }),
    );
    return { d: path, size: qr.size };
  }, [value]);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={className} shapeRendering="crispEdges" role="img" aria-label="Código QR de la invitación">
      <rect width={size} height={size} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}
