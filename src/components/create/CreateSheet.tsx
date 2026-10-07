import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, CalendarPlus, ChevronRight, QrCode, Target, Ticket, Trophy, Users, X } from 'lucide-react';
import type { League, Member } from '../../lib/types';
import { leagueSport, sportsOf } from '../../sports/registry';
import { SportIcon } from '../../pages/sports/SportBits';
import { QrHelpSheet } from '../home/HomeSheets';
import { useMyLeagues } from '../home/useHomeData';
import { MODAL_OPENED, cx, keyboardInset } from '../ui';
import { CreateStyles } from './styles';

/** Una liga de boliche que organizo (dueño o admin): ahí puedo crear una práctica o un torneo. */
export interface OrganizedLeague {
  league: League;
  member: Member;
}

/** Lo que la hoja necesita saber de la cuenta: las ligas de boliche que organiza y si juega boliche (juego suelto). */
export function createChoices(leagues: readonly League[], memberships: readonly Member[]): { organized: OrganizedLeague[]; soloOk: boolean } {
  const organized: OrganizedLeague[] = [];
  for (const league of leagues) {
    const member = memberships.find((m) => m.leagueId === league.id);
    if (!member || (member.role !== 'owner' && member.role !== 'admin')) continue;
    if (league.kind === 'torneo' || leagueSport(league) !== 'bowling') continue;
    organized.push({ league, member });
  }
  organized.sort((a, b) => a.league.name.localeCompare(b.league.name, 'es', { sensitivity: 'base' }));
  // El juego suelto es de boliche: sale si juega boliche o si todavía no está en ninguna liga.
  const soloOk = !leagues.length || sportsOf(leagues).includes('bowling');
  return { organized, soloOk };
}

/** Separación entre la hoja y la barra de abajo (y el borde de la pantalla). */
const GAP = 10;

/**
 * Hoja que flota sobre la barra de abajo (que sigue a la vista, sin oscurecer): esquinas de 30 px y 10 px a los lados.
 * En la computadora (sin barra) es un cuadro en el centro, como las demás hojas. Se cierra con la X, tocando fuera
 * (también sobre la barra) o con Esc; con el teclado del teléfono abierto se para encima de él.
 */
function FloatingSheet({ open, onClose, labelledBy, children }: { open: boolean; onClose: () => void; labelledBy: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [place, setPlace] = useState<{ nav: number; kb: number; vh: number } | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      window.dispatchEvent(new Event(MODAL_OPENED));
    }
    if (!open && d.open) d.close();
  }, [open]);
  useLayoutEffect(() => {
    const d = ref.current;
    return () => {
      if (d?.open) d.close();
    };
  }, []);
  // Dónde termina la barra de abajo (en el teléfono) y cuánto tapa el teclado.
  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const vv = window.visualViewport;
    const measure = () => {
      const nav = document.querySelector<HTMLElement>('nav[aria-label="Secciones"].fixed');
      const r = nav?.getBoundingClientRect();
      const navH = r && r.height > 0 ? Math.max(0, Math.round(window.innerHeight - r.top)) : 0;
      setPlace({ nav: navH, kb: keyboardInset(window.innerHeight, vv), vh: Math.floor(vv?.height ?? window.innerHeight) });
    };
    measure();
    window.addEventListener('resize', measure);
    vv?.addEventListener('resize', measure);
    vv?.addEventListener('scroll', measure);
    return () => {
      window.removeEventListener('resize', measure);
      vv?.removeEventListener('resize', measure);
      vv?.removeEventListener('scroll', measure);
    };
  }, [open]);
  // La barra de abajo queda fuera de la sombra, pero no se puede tocar mientras la hoja está abierta: tocarla cierra la
  // hoja (como tocar fuera).
  useEffect(() => {
    if (!open || !place?.nav || place.kb) return;
    const limit = window.innerHeight - place.nav;
    const down = (e: PointerEvent) => {
      if (e.clientY >= limit && !ref.current?.querySelector('dialog[open]')) onClose();
    };
    window.addEventListener('pointerdown', down, true);
    return () => window.removeEventListener('pointerdown', down, true);
  }, [open, place, onClose]);

  const bottom = place?.kb ? place.kb + GAP : place?.nav ? place.nav + GAP : null;
  const style =
    bottom != null && place
      ? ({
          marginBottom: bottom,
          maxHeight: `${Math.max(240, (place.kb ? place.vh : window.innerHeight) - (place.kb ? GAP : bottom) - 2 * GAP)}px`,
          '--mm-nav-h': `${place.kb ? 0 : place.nav}px`,
        } as CSSProperties)
      : undefined;
  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onCancel={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      style={style}
      className={cx(
        'mm-create mm-sheet overflow-hidden overscroll-none bg-(--mm-sheet) p-0 text-fg shadow-(--mm-sheet-shadow)',
        // Teléfono: flota sobre la barra de abajo; la sombra de atrás no la tapa.
        'm-0 mx-2.5 mt-auto mb-[calc(0.625rem+env(safe-area-inset-bottom))] max-h-[calc(100dvh-1.25rem)] w-[calc(100%-1.25rem)] max-w-none rounded-[30px]',
        'max-sm:backdrop:bottom-(--mm-nav-h,0px) backdrop:bg-(--mm-scrim)! backdrop:backdrop-blur-none!',
        // Computadora: cuadro en el centro.
        'sm:m-auto sm:max-h-[min(44rem,calc(100dvh-3rem))] sm:w-[calc(100%-1.5rem)] sm:max-w-lg',
      )}
    >
      {open && <div className="modal-scroll flex max-h-[inherit] flex-col overflow-y-auto overscroll-contain px-[18px] pt-4 pb-2">{children}</div>}
    </dialog>
  );
}

/** Una opción de la hoja: ícono en caja de 44 px, qué es y una línea; la línea entre opciones empieza después del ícono. */
export function OptionRow({ icon, title, text, onClick }: { icon: ReactNode; title: string; text: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex min-h-[62px] w-full items-center gap-3.5 rounded-2xl px-1.5 py-2 text-left transition active:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
    >
      <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-surface-2 text-fg-2">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-semibold tracking-[-0.01em]">{title}</span>
        <span className="mt-0.5 block truncate text-sm text-muted">{text}</span>
      </span>
      <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-faint" />
    </button>
  );
}

/** Las opciones van juntas: la línea entre una y otra empieza a 60 px (después del ícono). */
const optionList =
  "flex flex-col [&>*+*]:before:pointer-events-none [&>*+*]:before:absolute [&>*+*]:before:top-0 [&>*+*]:before:right-0 [&>*+*]:before:left-[60px] [&>*+*]:before:h-px [&>*+*]:before:bg-line [&>*+*]:before:content-['']";

/** «Un juego suelto»: boliche fuera de una liga o un torneo, solo para ti. */
export function SoloOption({ onClick }: { onClick: () => void }) {
  return <OptionRow icon={<Target className="size-[21px]" />} title="Un juego suelto" text="Solo para ti, sin liga" onClick={onClick} />;
}

/**
 * «Unirme con un código» (lo más común: te lo pasa quien organiza): el código y «Unirme» (lleva a /unirse/<código>), y
 * «o escanea el QR» (se abre con la cámara del teléfono: la hoja lo explica).
 */
export function JoinCodeBox({ onJoin, onQr }: { onJoin: (code: string) => void; onQr: () => void }) {
  const [code, setCode] = useState('');
  const input = useRef<HTMLInputElement>(null);
  function submit(e: FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c) onJoin(c);
    else input.current?.focus();
  }
  return (
    <form onSubmit={submit} className="mt-3 rounded-[22px] bg-accent-soft px-4 pt-4 pb-1" aria-labelledby="unirme-codigo">
      <p id="unirme-codigo" className="flex items-center gap-2.5 text-body font-[650] text-fg">
        <Ticket aria-hidden="true" className="size-[22px] shrink-0 text-accent" /> Unirme con un código
      </p>
      <p className="mt-[3px] mb-3 pl-8 text-sm text-fg-2">Te lo da quien organiza la liga</p>
      <div className="flex gap-2">
        <input
          ref={input}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="EJ. ABCD2345"
          aria-label="Código de invitación"
          maxLength={12}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          className="h-[52px] min-w-0 flex-1 rounded-[15px] bg-(--mm-code) px-4 text-base font-semibold tracking-[0.1em] text-fg uppercase placeholder:text-faint focus:outline-2 focus:outline-offset-1 focus:outline-accent max-[389px]:px-3 max-[389px]:tracking-[0.04em]"
        />
        <button
          type="submit"
          className="h-[52px] w-[104px] shrink-0 rounded-[15px] max-[389px]:w-[92px] bg-accent text-base font-semibold text-accent-fg transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Unirme
        </button>
      </div>
      <button
        type="button"
        onClick={onQr}
        className="flex h-11 w-full items-center justify-center gap-[7px] text-[14.5px] font-semibold text-accent transition active:opacity-70"
      >
        <QrCode aria-hidden="true" className="size-[17px]" /> o escanea el QR
      </button>
    </form>
  );
}

type Pick = 'practica' | 'torneo';

/**
 * La hoja «¿Qué quieres hacer?» de Ligas › «Crear o unirme» (antes el botón «+» del centro de la barra): primero
 * unirse con un código o el QR, y debajo crear una liga, un torneo (en una liga que organizas o sin liga), una
 * práctica (en una liga de boliche que organizas) o anotar un juego suelto. Si hay que elegir la liga, la misma hoja
 * pregunta «¿En qué liga?».
 */
export function CreateSheet({
  open,
  onClose,
  onJoin,
  onCreate,
  onEvent,
  onSolo,
}: {
  open: boolean;
  onClose: () => void;
  onJoin: (code: string) => void;
  onCreate: (kind: 'liga' | 'torneo') => void;
  onEvent: (org: OrganizedLeague, type: 'practica' | 'torneo') => void;
  onSolo: () => void;
}) {
  const [pick, setPick] = useState<Pick | null>(null);
  const [qr, setQr] = useState(false);
  useEffect(() => {
    if (!open) {
      setPick(null);
      setQr(false);
    }
  }, [open]);
  return (
    <>
      <CreateStyles />
      <FloatingSheet open={open} onClose={onClose} labelledBy="crear-titulo">
        {/* Se monta al abrirla: las ligas de la cuenta se leen cuando hace falta. */}
        <CreateSheetBody pick={pick} setPick={setPick} onClose={onClose} onJoin={onJoin} onCreate={onCreate} onEvent={onEvent} onSolo={onSolo} onQr={() => setQr(true)} />
        <QrHelpSheet open={qr} onClose={() => setQr(false)} />
      </FloatingSheet>
    </>
  );
}

function CreateSheetBody({
  pick,
  setPick,
  onClose,
  onJoin,
  onCreate,
  onEvent,
  onSolo,
  onQr,
}: {
  pick: Pick | null;
  setPick: (p: Pick | null) => void;
  onClose: () => void;
  onJoin: (code: string) => void;
  onCreate: (kind: 'liga' | 'torneo') => void;
  onEvent: (org: OrganizedLeague, type: 'practica' | 'torneo') => void;
  onSolo: () => void;
  onQr: () => void;
}) {
  const mine = useMyLeagues(null);
  const { organized, soloOk } = useMemo(() => createChoices(mine.all, mine.memberships.data), [mine.all, mine.memberships.data]);

  function torneo() {
    if (organized.length) setPick('torneo');
    else onCreate('torneo');
  }
  function practica() {
    if (organized.length === 1) onEvent(organized[0], 'practica');
    else setPick('practica');
  }

  if (pick) {
    return (
      <>
        <SheetHead id="crear-titulo" title={pick === 'torneo' ? '¿Dónde es el torneo?' : '¿En qué liga?'} onClose={onClose} onBack={() => setPick(null)} />
        <div className={cx(optionList, 'mt-2')}>
          {organized.map((o) => (
            <OptionRow
              key={o.league.id}
              icon={<SportIcon sport={leagueSport(o.league)} className="size-[21px]" />}
              title={pick === 'torneo' ? `En ${o.league.name}` : o.league.name}
              text={pick === 'torneo' ? 'Con los jugadores de la liga' : o.league.schedule || 'Práctica de la liga'}
              onClick={() => onEvent(o, pick)}
            />
          ))}
          {pick === 'torneo' && <OptionRow icon={<Trophy className="size-[21px]" />} title="Sin liga" text="Un torneo suelto, con sus inscritos" onClick={() => onCreate('torneo')} />}
        </div>
      </>
    );
  }

  return (
    <>
      <SheetHead id="crear-titulo" title="¿Qué quieres hacer?" onClose={onClose} />
      <JoinCodeBox onJoin={onJoin} onQr={onQr} />
      <p className="mx-1.5 mt-4 mb-0.5 text-[13px] font-[650] tracking-[0.06em] text-muted uppercase">Crear</p>
      <div className={optionList}>
        <OptionRow icon={<Users className="size-[21px]" />} title="Una liga" text="Para jugar cada semana" onClick={() => onCreate('liga')} />
        <OptionRow
          icon={<Trophy className="size-[21px]" />}
          title="Un torneo"
          text={organized.length ? 'Un día, con o sin liga' : 'Un día, con sus inscritos'}
          onClick={torneo}
        />
        {organized.length > 0 && (
          <OptionRow
            icon={<CalendarPlus className="size-[21px]" />}
            title="Una práctica"
            text={organized.length === 1 ? `En ${organized[0].league.name}` : 'En una de tus ligas'}
            onClick={practica}
          />
        )}
        {soloOk && <SoloOption onClick={onSolo} />}
      </div>
    </>
  );
}

/** Título de la hoja (21 px) con la X (y, al elegir la liga, «atrás»). */
function SheetHead({ id, title, onClose, onBack }: { id: string; title: string; onClose: () => void; onBack?: () => void }) {
  const round =
    "relative grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-fg-2 transition after:absolute after:-inset-0.5 after:content-[''] active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
  return (
    <div className="flex items-center gap-2 pr-0.5 pl-1.5">
      {onBack && (
        <button type="button" onClick={onBack} aria-label="Atrás" className={cx(round, '-ml-1.5')}>
          <ArrowLeft aria-hidden="true" className="size-5" />
        </button>
      )}
      <h2 id={id} className="min-w-0 flex-1 truncate text-[21px] font-bold tracking-[-0.02em]">
        {title}
      </h2>
      <button type="button" onClick={onClose} aria-label="Cerrar" className={round}>
        <X aria-hidden="true" className="size-5" />
      </button>
    </div>
  );
}
