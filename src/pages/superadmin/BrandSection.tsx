import { Link } from 'react-router';
import { Palette } from 'lucide-react';
import { Card } from '../../components/ui';
import { SectionHeader } from './bits';
import { sectionMeta } from './sections';

/** Marca: lleva a la vista previa del logo y las animaciones (/superadmin/marca, SplashPreviewPage). */
export default function BrandSection() {
  return (
    <>
      <SectionHeader title="Marca" hint={sectionMeta('logo').hint} />
      <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <Palette className="size-6" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Logo y animaciones de apertura</p>
          <p className="text-sm text-muted">Mira el logo y la animación de cada deporte en claro y en oscuro, como la ve la gente al abrir la app.</p>
        </div>
        <Link
          to="/superadmin/marca"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg shadow-sm transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-10"
        >
          <Palette className="size-4" aria-hidden="true" />
          Abrir la marca
        </Link>
      </Card>
    </>
  );
}
