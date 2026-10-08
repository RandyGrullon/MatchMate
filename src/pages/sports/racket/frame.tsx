import { createContext, lazy, Suspense, useContext, useState, type ComponentProps, type ReactNode } from 'react';
import { ChevronLeft, Share2, Zap } from 'lucide-react';
import { LeagueBackBar } from '../../../components/league/home/LeagueTopBar';
import { EventMenu, EventTopBar, MoreButton, type MenuItem } from '../../../components/event/EventHeader';
import { LiveDot } from '../../../components/home/TodayCard';
import { useIsPro, useSwitchMode } from '../../../components/mode';
import { useNotice } from '../../../components/NoticeSlot';
import { cx } from '../../../components/ui';
import { useLeagueCtx } from '../../../lib/league';
import { leagueSport } from '../../../sports/registry';
import { ShareImageModal, shareFileName, shareFrame } from '../../../components/share';
import type { CardFrame, ShareCard } from '../../../components/share/cards';

/**
 * Lo común de las pantallas de raqueta en el rediseño «Calma y foco» (como la práctica del boliche,
 * src/pages/EventPage.tsx): «‹ Pádel de los jueves» arriba con «•••» a la derecha, el título grande y una línea con lo de
 * ahora («● Ronda 1 de 7») y el día. Lo del organizador va en «•••» (nunca una fila de botones apilados) y, en Lite, lo de
 * organizar se esconde con un solo aviso «Usar Pro» (más la opción en «•••»).
 */

export type { MenuItem };

/** Una opción de «•••». `keep`: el menú no se cierra al tocarla (el Excel muestra su ruedita ahí mismo). */
export interface RacketMenuItem extends MenuItem {
  keep?: boolean;
}

/** A dónde vuelve la pantalla de un evento: null si está dentro del inicio (un torneo sin liga con un solo evento). */
const BackCtx = createContext<{ label: string; fallback: string } | null | undefined>(undefined);

/** RacketEventPage: el evento abierto desde su link (vuelve a la liga) o puesto en el inicio (`embedded`, sin atrás). */
export function EventBackProvider({ embedded, children }: { embedded: boolean; children: ReactNode }) {
  const { league, base } = useLeagueCtx();
  return <BackCtx.Provider value={embedded ? null : { label: league.name, fallback: base }}>{children}</BackCtx.Provider>;
}

/** «‹ Pádel de los jueves» (o nada, si el evento es la portada de un torneo sin liga). */
export function useEventBack(): { label: string; fallback: string } | null {
  const v = useContext(BackCtx);
  const { league, base } = useLeagueCtx();
  return v === undefined ? { label: league.name, fallback: base } : v;
}

/** Lo de ahora delante de la fecha: «● Ronda 1 de 7», «● En juego», «Terminada». */
export interface HeadStatus {
  text: string;
  /** Con el punto del deporte (se está jugando). */
  live?: boolean;
}

/**
 * Cabecera de una pantalla de raqueta: la barra («‹ atrás» y «•••»), el título (32 px en Lite, 28 en Pro) y la línea de
 * abajo. `right`: algo más junto a «•••» (la píldora «Excel» en Pro). El menú es una hoja con las opciones (`menu`).
 */
export function ScreenHead({
  back,
  title,
  status,
  meta,
  menu,
  menuTitle,
  right,
}: {
  back: { label: string; fallback: string } | null;
  title: ReactNode;
  status?: HeadStatus | null;
  meta?: ReactNode;
  menu?: readonly RacketMenuItem[];
  menuTitle?: string;
  right?: ReactNode;
}) {
  const pro = useIsPro();
  const [open, setOpen] = useState(false);
  const items: MenuItem[] = (menu ?? []).map(({ keep, ...it }) => ({
    ...it,
    onClick: () => {
      if (!keep) setOpen(false);
      it.onClick();
    },
  }));
  const hasBar = !!back || !!right || items.length > 0;
  return (
    <>
      {hasBar && (
        <EventTopBar
          back={back}
          right={
            <>
              {right}
              {items.length > 0 && <MoreButton onClick={() => setOpen(true)} compact={!!right} />}
            </>
          }
        />
      )}
      <h1 className={cx('break-words', pro ? 'mt-0.5 text-title-pro' : 'mt-1 text-title')}>{title}</h1>
      {/* Una línea que se corta como texto (sin dejar un «·» colgando al final de la primera). */}
      {(status || meta) && (
        <p className={cx('text-meta text-muted', pro ? 'mt-1' : 'mt-1.5')}>
          {status && (
            <span className={cx('font-semibold', status.live ? 'text-accent' : 'text-fg-2')}>
              {status.live && (
                <span className="mr-2 inline-flex align-middle">
                  <LiveDot />
                </span>
              )}
              {status.text}
            </span>
          )}
          {status && meta && ' · '}
          {meta}
        </p>
      )}
      {items.length > 0 && <EventMenu open={open} onClose={() => setOpen(false)} title={menuTitle ?? (typeof title === 'string' ? title : 'Opciones')} items={items} />}
    </>
  );
}

/**
 * Lite, quien organiza: lo de organizar (armar rondas, cerrar el mes, el cuadro…) está en Pro. Propone el único aviso de la
 * pantalla («Organizas esta noche · Las rondas se arman en Pro · Usar Pro») y devuelve la opción de «•••» que hace lo
 * mismo (el aviso se puede cerrar; el menú queda). En Pro, o para quien no organiza, no hace nada (null).
 */
export function useOrganizePro(on: boolean, notice: { id: string; title: string; text: string; menu: string }): RacketMenuItem | null {
  const pro = useIsPro();
  const switchMode = useSwitchMode();
  const show = on && !pro;
  useNotice(
    show && {
      id: notice.id,
      kind: 'admin',
      title: notice.title,
      text: notice.text,
      action: { label: 'Usar Pro', onClick: () => switchMode('pro') },
    },
  );
  if (!show) return null;
  return { key: 'pro', icon: Zap, label: notice.menu, hint: 'Está en Pro · Usar Pro', onClick: () => void switchMode('pro') };
}

/**
 * Una pantalla dentro de la liga que trae su propio «‹ atrás» (un partido abierto en Partidos o en Mis partidos): quita
 * la barra que pone LeagueShell para que no salgan dos.
 */
export function HideShellBar() {
  // La barra queda puesta (así LeagueShell no pone la suya) pero sin verse: la caja de afuera es la que no se dibuja.
  return (
    <div hidden>
      <LeagueBackBar />
    </div>
  );
}

/**
 * La barra de una pantalla que se abre encima de otra (un partido): «‹ Americano del jueves» vuelve con `onBack` (cierra
 * `?partido=`); a la derecha, lo de esa pantalla («•••»). Igual que la del evento (EventTopBar).
 */
export function BackBar({ label, onBack, right }: { label: string; onBack: () => void; right?: ReactNode }) {
  return (
    <div className="-mt-3 flex h-[52px] items-center justify-between gap-2">
      <button
        type="button"
        onClick={onBack}
        className="-ml-3 inline-flex h-11 min-w-0 items-center pr-2 pl-1 text-body font-[550] text-accent transition active:opacity-70 focus-visible:outline-2 focus-visible:outline-accent"
      >
        <ChevronLeft aria-hidden="true" className="size-6 shrink-0" />
        <span className="truncate">{label}</span>
      </button>
      <div className="-mr-2 flex shrink-0 items-center gap-2">{right}</div>
    </div>
  );
}

// Las hojas de «•••» se bajan al tocarlas (como en la práctica del boliche).
const ScorersSheetLazy = lazy(() => import('../../../components/scorers/ScorersSheet'));
const ReportSheetLazy = lazy(() => import('../../../components/tournamentReport/ReportSheet'));

/** «Anotadores» del evento (la hoja de siempre), abierta desde «•••». */
export function ScorersSheet(props: ComponentProps<typeof ScorersSheetLazy>) {
  return (
    <Suspense fallback={null}>
      <ScorersSheetLazy {...props} />
    </Suspense>
  );
}

/** «Reporte del torneo» (PDF o Excel), abierto desde «•••». */
export function ReportSheet(props: ComponentProps<typeof ReportSheetLazy>) {
  return (
    <Suspense fallback={null}>
      <ReportSheetLazy {...props} />
    </Suspense>
  );
}

/**
 * «Compartir» redondo de la barra de arriba (la imagen de la tabla para WhatsApp), del mismo tamaño que «•••»: hace lo
 * mismo que el ShareButton de siempre (la hoja con la imagen), con la forma de la barra.
 */
export function ShareRoundButton({ card, label = 'Compartir' }: { card: () => ShareCard | null; label?: string }) {
  const { league } = useLeagueCtx();
  const [open, setOpen] = useState<{ card: ShareCard; frame: CardFrame; url?: string; filename: string } | null>(null);
  const start = () => {
    const c = card();
    if (!c) return;
    const link = typeof location !== 'undefined' ? location.href : undefined;
    setOpen({
      card: c,
      frame: shareFrame(leagueSport(league), link, league.tz),
      url: link,
      filename: shareFileName([c.kind === 'result' ? 'resultado' : 'tabla', c.title, c.subtitle]),
    });
  };
  return (
    <>
      <button
        type="button"
        onClick={start}
        aria-label={label}
        aria-haspopup="dialog"
        className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-fg-2 transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Share2 aria-hidden="true" className="size-5" />
      </button>
      {open && <ShareImageModal open onClose={() => setOpen(null)} card={open.card} frame={open.frame} url={open.url} filename={open.filename} />}
    </>
  );
}
