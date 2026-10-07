import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router';
import { CheckCircle2, ChevronRight, Circle, Hourglass, Inbox, ListChecks, Swords, UserCheck, Users } from 'lucide-react';
import { useLeaguePending, type Checklist, type LeaguePending } from '../../lib/data/organizer';
import { useLeagueCtx } from '../../lib/league';
import type { Notice } from '../../lib/notices';
import type { LeagueKind } from '../../lib/types';
import { useNow } from '../../lib/useNow';
import { useProSuggestion } from '../mode';
import { NoticeSlot, useNotice } from '../NoticeSlot';
import { Badge, Card, Empty, ListSkeleton, LoadError } from '../ui';
import { checklistSteps, pendingLine, pendingSections, showPendingCard, type PendingKey } from './logic';
import { SuspendDayButton } from './SuspendDay';

const ICONS: Record<PendingKey, ReactNode> = {
  submissions: <Inbox className="size-5" />,
  disputes: <Swords className="size-5" />,
  overdue: <Hourglass className="size-5" />,
  claims: <UserCheck className="size-5" />,
  waitlists: <Users className="size-5" />,
};

/**
 * Admin › Pendientes (la primera pestaña en todos los deportes): lo que espera por el admin, cada cosa con su
 * enlace (league_pending), los «primeros pasos» mientras la liga es nueva y «Suspender un día». Sin nada: «Todo al
 * día». `playersTab`: la pestaña donde se agregan jugadores en este deporte (si no es «Jugadores»).
 */
export function PendingPanel({ playersTab = null }: { playersTab?: string | null }) {
  const { lid, league } = useLeagueCtx();
  const pending = useLeaguePending(lid);
  const now = useNow();
  const p = pending.data;
  const sections = pendingSections(p, now.getTime(), league.tz);
  const checklist = p?.checklist && !p.checklist.complete ? p.checklist : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-tight">Pendientes</h2>
          <p className="text-sm text-muted">Lo que espera por ti en {league.kind === 'torneo' ? 'el torneo' : 'la liga'}.</p>
        </div>
        <SuspendDayButton />
      </div>

      {checklist && <FirstSteps checklist={checklist} playersTab={playersTab} />}

      {pending.error && !p ? (
        <LoadError error={pending.error} />
      ) : !p ? (
        <ListSkeleton rows={3} />
      ) : sections.length === 0 ? (
        <Empty icon={<CheckCircle2 className="size-8" />} title="Todo al día">
          No hay nada esperando por ti. Aquí salen los juegos por aprobar, los resultados reclamados, los partidos sin resultado y los reclamos de jugadores.
        </Empty>
      ) : (
        sections.map((s) => (
          <section key={s.key} className="flex flex-col gap-2" aria-label={s.title}>
            <div className="flex items-center gap-2">
              <span className="text-accent">{ICONS[s.key]}</span>
              <h3 className="min-w-0 flex-1 truncate font-semibold">{s.title}</h3>
              <Badge tone="danger">{s.count}</Badge>
            </div>
            <p className="-mt-1 text-xs text-muted">{s.hint}</p>
            <Card className="stagger divide-y divide-line overflow-hidden">
              {s.items.map((it, i) => (
                <Link
                  key={it.id || i}
                  to={it.url}
                  style={{ '--i': i } as CSSProperties}
                  className="flex min-h-11 items-center gap-3 px-4 py-2.5 transition hover:bg-surface-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{it.title}</p>
                    {it.sub && <p className="truncate text-xs text-muted">{it.sub}</p>}
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted" />
                </Link>
              ))}
              {s.count > s.items.length && (
                <Link to={s.url} className="flex min-h-11 items-center justify-center gap-1 text-sm font-medium text-accent transition hover:bg-surface-2">
                  {`Ver los ${s.count}`} <ChevronRight className="size-4" />
                </Link>
              )}
            </Card>
          </section>
        ))
      )}
    </div>
  );
}

/** «Primeros pasos» de una liga nueva: lo que falta, con su enlace, y lo hecho tachado. */
export function FirstSteps({ checklist, playersTab = null }: { checklist: Checklist; playersTab?: string | null }) {
  const { lid } = useLeagueCtx();
  const steps = checklistSteps(checklist, lid, { playersTab });
  const pct = checklist.total ? Math.round((checklist.done / checklist.total) * 100) : 0;
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <ListChecks className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">Primeros pasos</h3>
          <p className="text-xs text-muted">
            {checklist.done} de {checklist.total} listos
          </p>
        </div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <ul className="flex flex-col">
        {steps.map((s) => (
          <li key={s.key}>
            {s.done ? (
              <span className="flex min-h-11 items-center gap-3 text-sm text-muted line-through">
                <CheckCircle2 className="size-5 shrink-0 text-ok" />
                {s.label}
              </span>
            ) : (
              <Link to={s.url} className="-mx-2 flex min-h-11 items-center gap-3 rounded-xl px-2 text-sm font-medium transition hover:bg-surface-2">
                <Circle className="size-5 shrink-0 text-muted" />
                <span className="min-w-0 flex-1">{s.label}</span>
                <ChevronRight className="size-4 shrink-0 text-muted" />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * El aviso del inicio de la liga para quien la organiza (va al NoticeSlot, nunca como cartel aparte): lo que espera
 * por él («2 juegos por aprobar · Ver», el de más prioridad) o, con la liga nueva y nada pendiente, los primeros pasos
 * («Tu liga nueva · Primeros pasos: 2 de 4 · Seguir», una pista). El id cambia con el número: si lo cierra y llega algo
 * más, vuelve a salir. null = nada que decir.
 */
export function pendingNotice(p: LeaguePending | null | undefined, lid: string, base: string, kind: LeagueKind | undefined): Notice | null {
  if (!p || !showPendingCard(p)) return null;
  const to = `${base}/admin?tab=pendientes`;
  if (p.total > 0) return { id: `pendientes:${lid}:${p.total}`, kind: 'admin', title: pendingLine(p), action: { label: 'Ver', to } };
  return {
    id: `primeros-pasos:${lid}:${p.checklist?.done ?? 0}`,
    kind: 'tip',
    title: kind === 'torneo' ? 'Tu torneo nuevo' : 'Tu liga nueva',
    text: pendingLine(p),
    action: { label: 'Seguir', to },
  };
}

/**
 * Inicio de la liga, solo para quien la organiza: su lugar del aviso (NoticeSlot) con lo pendiente o los primeros pasos
 * y, si está en Lite, la sugerencia «Organizas esta liga · Probar Pro». Sale uno solo, el más importante (instalar la
 * app o permitir los avisos le ganan a la sugerencia y a la pista). A los demás no les pide nada.
 */
export function PendingHomeCard() {
  const { lid, league, isAdmin, base } = useLeagueCtx();
  const p = useLeaguePending(isAdmin ? lid : null).data;
  useNotice(isAdmin && pendingNotice(p, lid, base, league.kind));
  useProSuggestion({ title: 'Organizas esta liga', enabled: isAdmin });
  if (!isAdmin) return null;
  return <NoticeSlot className="animate-fade-up" />;
}
