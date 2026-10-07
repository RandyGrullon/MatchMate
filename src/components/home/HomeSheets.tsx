import { useState } from 'react';
import { CalendarSearch, Check, ClipboardCheck, Leaf, Target, Zap, type LucideIcon } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import type { CalendarMatch } from '../../lib/calendar';
import { useLeaguesByIds, useMyMemberships, type LeagueFeed } from '../../lib/data';
import type { UiMode } from '../../lib/mode';
import type { League } from '../../lib/types';
import { scorePath, type RecentEvent } from '../../lib/useNextGame';
import { agendaCardNote } from '../agenda/logic';
import { useMode, useSwitchMode } from '../mode';
import { Button, DateBlock, ListRow, RowIcon, Sheet, cx } from '../ui';
import { todayTitle } from './logic';
import { WeekAgenda } from './WeekAgenda';

/**
 * El Calendario (desde «Lo que viene» y desde «Esta semana»): la semana de tus ligas con sus fechas, «Voy» en las
 * prácticas y las semanas que vienen (hasta 8). Es el mismo calendario que estaba en el inicio, ahora en una hoja. Al
 * final, «¿Dónde juego esta semana?» (lo abierto en otras ligas, que antes era una tarjeta del inicio).
 */
export function CalendarSheet({
  open,
  onClose,
  feeds,
  leagues,
  matches,
  today,
  showSport,
}: {
  open: boolean;
  onClose: () => void;
  feeds: readonly LeagueFeed[];
  leagues: readonly League[];
  matches: readonly CalendarMatch[];
  today: string;
  showSport?: boolean;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Calendario" subtitle="Tus ligas, semana por semana">
      {feeds.length || matches.length ? (
        <WeekAgenda feeds={feeds} leagues={leagues} matches={matches} today={today} showSport={showSport} />
      ) : (
        <p className="py-4 text-meta text-muted">Todavía no hay fechas en tus ligas.</p>
      )}
      <div className="-mx-5 mt-3">
        <ListRow
          leading={
            <RowIcon tone="accent">
              <CalendarSearch className="size-5" />
            </RowIcon>
          }
          title="¿Dónde juego esta semana?"
          subtitle={agendaCardNote(null)}
          to="/agenda"
        />
      </div>
    </Sheet>
  );
}

/**
 * «¿Dónde jugaste?»: cuando no hay un juego que te toque hoy, a dónde anotar lo que jugaste. Los eventos de ayer y de
 * hoy de tus ligas (abren la hoja de anotar en el juego que sigue) y un juego suelto (solo para ti, sin liga).
 */
export function WhereSheet({ open, onClose, recent, today }: { open: boolean; onClose: () => void; recent: readonly RecentEvent[]; today: string }) {
  return (
    <Sheet open={open} onClose={onClose} title="¿Dónde jugaste?" subtitle="Elige dónde anotar tu juego">
      <div className="-mx-5">
        {recent.map((r) => (
          <ListRow
            key={`${r.lid}:${r.event.id}`}
            leading={<DateBlock date={r.event.date} />}
            title={r.event.date === today ? todayTitle(r.event, today) : r.event.name?.trim() || (r.event.type === 'torneo' ? 'Torneo' : 'Práctica de ayer')}
            subtitle={r.leagueName}
            to={scorePath(r.lid, r.event.id)}
          />
        ))}
        <ListRow
          leading={
            <RowIcon>
              <Target className="size-5" />
            </RowIcon>
          }
          title="Juego suelto"
          subtitle="Solo para ti, sin liga"
          to="/juegos-sueltos?nuevo=1"
        />
      </div>
    </Sheet>
  );
}

/**
 * «o escanea el QR»: el QR de la invitación es un link, así que se abre con la cámara del teléfono (la app no lee
 * códigos). La hoja lo explica en dos líneas.
 */
export function QrHelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Escanea el QR"
      footer={
        <Button variant="primary" size="xl" className="w-full" onClick={onClose}>
          Entendido
        </Button>
      }
    >
      <p className="text-body text-fg-2">
        Abre la cámara del teléfono y apunta al QR que te mostró quien organiza. Se abre la invitación y entras a la liga con un toque.
      </p>
    </Sheet>
  );
}

/** Qué trae cada modo (las tarjetas de la hoja). */
export const MODE_CARDS: Record<UiMode, { label: string; tagline: string; items: readonly string[]; icon: LucideIcon }> = {
  lite: { label: 'Lite', tagline: 'Lo esencial', items: ['Anotar rápido', 'Tu promedio', 'Tus ligas y fechas'], icon: Leaf },
  pro: { label: 'Pro', tagline: 'Todo el detalle', items: ['Aprobar juegos', 'Planilla y Excel', 'Estadísticas'], icon: Zap },
};

/** La liga que organizas (dueño o admin) para la línea «Organizas Liga de los martes»: su nombre, «2 ligas» o null. */
function useOrganizedLabel(): string | null {
  const { user } = useAuth();
  const members = useMyMemberships(user?.uid);
  const ids = members.data.filter((m) => m.role === 'owner' || m.role === 'admin').map((m) => m.leagueId);
  const leagues = useLeaguesByIds(ids.slice(0, 1));
  if (!ids.length) return null;
  if (ids.length > 1) return `${ids.length} ligas`;
  return leagues.data[0]?.name ?? null;
}

/**
 * «Elige cómo ver la app» (desde «PRO ▾» de Hoy): Lite (lo esencial) o Pro (todo el detalle), en dos tarjetas; a quien
 * organiza una liga y está en Lite, Pro sale marcado «Para ti» con la línea «Organizas …: en Pro tienes la pestaña
 * Organizar». «Usar Pro» cambia al momento (se guarda en la cuenta, con «Deshacer» abajo); «Seguir en Lite» la cierra.
 */
export function ModeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={<span className="block text-[23px] leading-tight font-bold tracking-[-0.025em]">Elige cómo ver la app</span>}>
      <ModeChoice onDone={onClose} />
    </Sheet>
  );
}

/** Lo de adentro de la hoja (se arma cada vez que se abre: arranca en el modo de ahora, o en Pro «Para ti»). */
function ModeChoice({ onDone }: { onDone: () => void }) {
  const { mode, suggestedPro } = useMode();
  const switchMode = useSwitchMode();
  const organized = useOrganizedLabel();
  const forYou = suggestedPro && mode === 'lite';
  const [pick, setPick] = useState<UiMode>(forYou ? 'pro' : mode);
  const changes = pick !== mode;
  const PickIcon = MODE_CARDS[pick].icon;
  return (
    <div className="flex flex-col pb-1">
      <p className="-mt-1 text-meta leading-[1.45] text-muted">La misma app, con más o menos detalle. Se guarda en tu cuenta y cambias cuando quieras.</p>
      <div role="radiogroup" aria-label="Cómo ver la app" className="mt-[18px] grid grid-cols-2 gap-2.5">
        {(['lite', 'pro'] as const).map((key) => {
          const card = MODE_CARDS[key];
          const on = pick === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setPick(key)}
              className={cx(
                'relative flex min-w-0 flex-col rounded-[22px] p-3.5 text-left transition active:scale-[0.98]',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                on ? 'bg-accent-soft shadow-[inset_0_0_0_2px_var(--accent)]' : 'shadow-[inset_0_0_0_1.5px_var(--line)]',
              )}
            >
              {key === 'pro' && forYou && (
                <span className="absolute top-3 right-3 grid h-[22px] place-items-center rounded-full bg-accent px-2 text-[11.5px] font-bold text-accent-fg">Para ti</span>
              )}
              <span className="flex items-center gap-2 text-lg font-bold tracking-[-0.02em]">
                <card.icon aria-hidden="true" className={cx('size-5 shrink-0', on ? 'text-accent' : 'text-muted')} />
                {card.label}
              </span>
              <span className="mt-0.5 text-[13px] text-muted">{card.tagline}</span>
              <ModeSketch mode={key} on={on} />
              <span className="flex flex-col gap-[7px]">
                {card.items.map((it) => (
                  <span key={it} className="flex gap-1.5 text-[13px] leading-[1.3] text-fg-2">
                    <Check aria-hidden="true" strokeWidth={2.6} className="mt-px size-3.5 shrink-0 text-accent" />
                    {it}
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
      {forYou && organized && (
        <p className="mt-3.5 flex items-center gap-3 rounded-2xl bg-surface-2 px-3.5 py-3 text-sm leading-[1.4] text-fg-2">
          <ClipboardCheck aria-hidden="true" className="size-[22px] shrink-0 text-accent" />
          <span>
            Organizas <b className="font-semibold text-fg">{organized}</b>: en Pro tienes la pestaña Organizar.
          </span>
        </p>
      )}
      <Button
        variant="primary"
        size="xl"
        className="mt-4 w-full"
        icon={<PickIcon className="size-[19px]" />}
        onClick={() => {
          if (changes) void switchMode(pick);
          onDone();
        }}
      >
        {changes ? `Usar ${MODE_CARDS[pick].label}` : `Seguir en ${MODE_CARDS[mode].label}`}
      </Button>
      {changes && (
        <button type="button" onClick={onDone} className="flex h-[46px] w-full items-center justify-center text-meta font-[550] text-fg-2 transition active:opacity-70">
          Seguir en {MODE_CARDS[mode].label}
        </button>
      )}
    </div>
  );
}

/** El dibujito de cada modo (adorno): Lite, una tarjeta y un botón; Pro, cuatro fichas, dos botones y líneas. */
function ModeSketch({ mode, on }: { mode: UiMode; on: boolean }) {
  const soft = on ? 'bg-accent/[0.18]' : 'bg-accent-soft';
  return (
    <span aria-hidden="true" className={cx('my-3 flex h-[88px] flex-col gap-[5px] rounded-[14px] p-[9px]', on ? 'bg-surface' : 'bg-bg')}>
      {mode === 'lite' ? (
        <>
          <i className={cx('block h-[38px] rounded-[5px]', soft)} />
          <i className="block h-3 rounded-[5px] bg-accent/90" />
          <i className="block h-2 w-[70%] rounded-[5px] bg-surface-2" />
          <i className="block h-2 w-1/2 rounded-[5px] bg-surface-2" />
        </>
      ) : (
        <>
          <span className="flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <i key={i} className={cx('block h-4 flex-1 rounded-[5px]', soft)} />
            ))}
          </span>
          <span className="flex gap-1">
            <i className="block h-2.5 flex-[1.4] rounded-[5px] bg-accent/90" />
            <i className="block h-2.5 flex-1 rounded-[5px] bg-surface-2" />
          </span>
          <i className="block h-[7px] rounded-[5px] bg-surface-2" />
          <i className="block h-[7px] rounded-[5px] bg-surface-2" />
          <i className="block h-[7px] w-4/5 rounded-[5px] bg-surface-2" />
        </>
      )}
    </span>
  );
}
