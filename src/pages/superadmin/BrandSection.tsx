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
      <Card className="flex flex-col gap-4 px-5 pt-[22px] pb-5 sm:max-w-xl">
        <span aria-hidden="true" className="grid size-[52px] place-items-center rounded-2xl bg-accent-soft text-accent">
          <Palette className="size-[26px]" />
        </span>
        <div>
          <h2 className="text-card-title-pro">Logo y animaciones de apertura</h2>
          <p className="mt-1.5 text-[15.5px] leading-[1.45] text-fg-2">Cada deporte, en claro y en oscuro, como lo ve la gente al abrir la app.</p>
        </div>
        <Link
          to="/superadmin/marca"
          className="inline-flex h-btn-pro items-center justify-center gap-2 rounded-[15px] bg-accent px-5 text-base font-semibold text-accent-fg transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:self-start"
        >
          Abrir la marca
        </Link>
      </Card>
    </>
  );
}
