import { useState, type ReactNode } from 'react';
import { Archive, ArchiveRestore, Copy, EyeOff, Eye, Flag, Gift, Pencil, ShieldAlert, ShieldCheck, Trash2, Undo2, UserMinus } from 'lucide-react';
import { Insignia, badgeLabel } from '../../../badges/visual';
import { useAuth } from '../../../lib/auth';
import { setLeagueBadgeHidden } from '../../../lib/data/badges';
import {
  archiveLeagueBadge,
  canMakeBadges,
  deleteLeagueBadge,
  hideLeagueBadge,
  reportLeagueBadge,
  revokeLeagueBadgeAward,
  useBadgeHolders,
  useLeagueBadges,
  type BadgeHolder,
  type LeagueBadge,
} from '../../../lib/data/leagueBadges';
import { useLeagueCtx } from '../../../lib/league';
import { leagueSport } from '../../../sports/registry';
import { useFeedback } from '../../feedback';
import { Badge, Button, ListSkeleton, LoadError, Modal, Textarea, cx } from '../../ui';
import { cleanBadgeText, textLength } from '../text';
import { limitLine, makerErrorText } from './design';
import { designLook } from './look';
import { Counter } from './parts';
import {
  DELETED_TOAST,
  HIDDEN_NOTE,
  NOBODY_TEXT,
  REPORTED_TOAST,
  archiveConfirm,
  archivedToast,
  askingKey,
  deleteConfirm,
  designActionLabel,
  designActions,
  hiddenToast,
  holderSub,
  holderUndoLabel,
  holdersHeading,
  mineHiddenToast,
  mineToggleLabel,
  prizeAwardIds,
  reasonCopy,
  reasonMax,
  reportsText,
  revokedLine,
  revokedToast,
  signedOutHolders,
  sortHolders,
  undoes,
  type Asking,
  type DesignAction,
} from './view';

/**
 * El detalle de una insignia de la liga (§5.6 y §6.5): el dibujo, qué hay que hacer, el cupo y «Quién la tiene», con
 * lo que cada uno puede hacer: dar, cambiar, duplicar, archivar o borrar (quien diseña); deshacer (quien la dio, en
 * 24 h) o quitar (el dueño); ocultarla de su perfil (el jugador); reportar el diseño (los miembros) y esconderlo (el
 * superadmin).
 */
export function DesignSheet({
  badge,
  onClose,
  onEdit,
  onDuplicate,
  onGive,
}: {
  /** null = cerrado. */
  badge: LeagueBadge | null;
  onClose: () => void;
  onEdit?: (b: LeagueBadge) => void;
  onDuplicate?: (b: LeagueBadge) => void;
  onGive?: (b: LeagueBadge) => void;
}) {
  return (
    <Modal open={badge != null} onClose={onClose} title={badge?.name ?? 'Insignia'}>
      {badge && <SheetContent key={badge.id} badge={badge} onClose={onClose} onEdit={onEdit} onDuplicate={onDuplicate} onGive={onGive} />}
    </Modal>
  );
}

function SheetContent({
  badge: listed,
  onClose,
  onEdit,
  onDuplicate,
  onGive,
}: {
  badge: LeagueBadge;
  onClose: () => void;
  onEdit?: (b: LeagueBadge) => void;
  onDuplicate?: (b: LeagueBadge) => void;
  onGive?: (b: LeagueBadge) => void;
}) {
  const ctx = useLeagueCtx();
  const { user, isSuper } = useAuth();
  const { confirm, toast } = useFeedback();
  const holders = useBadgeHolders(user ? listed : null);
  // Los otorgamientos que salieron de un premio del torneo (docs/premios-torneo.md §6.5): «Premio del torneo».
  const made = useLeagueBadges(user ? ctx.lid : null);
  const prizes = prizeAwardIds(made.data.awards);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Lo de la base manda (cuántas veces se dio de verdad, reportes); mientras llega, lo de la lista.
  const badge = holders.data?.badge ?? listed;
  const maker = canMakeBadges(ctx);
  const sport = leagueSport(ctx.league);
  const look = designLook(badge, sport);
  const hidden = badge.status === 'oculta';

  async function act<T>(key: string, fn: () => Promise<T>, ok: string, action?: 'borrar' | 'quitar'): Promise<boolean> {
    setBusy(key);
    try {
      await fn();
      toast(ok);
      return true;
    } catch (e) {
      console.error(e);
      toast(makerErrorText(e, { action, name: badge.name }), 'error');
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function archive() {
    const archived = badge.status === 'activa';
    if (archived) {
      const ok = await confirm(archiveConfirm(badge.name));
      if (!ok) return;
    }
    await act('archivar', () => archiveLeagueBadge(badge, archived), archivedToast(archived));
  }

  async function remove() {
    const ok = await confirm(deleteConfirm(badge.name));
    if (ok && (await act('borrar', () => deleteLeagueBadge(badge), DELETED_TOAST, 'borrar'))) onClose();
  }

  async function toggleMine(h: BadgeHolder) {
    await act(`ocultar-${h.id}`, () => setLeagueBadgeHidden({ id: h.id, leagueId: badge.leagueId }, !h.hidden), mineHiddenToast(h.hidden));
  }

  const keys = designActions({
    maker,
    status: badge.status,
    canGive: !!onGive,
    canEdit: !!onEdit,
    canDuplicate: !!onDuplicate,
    neverGiven: !!holders.data && !holders.data.badge.given,
    isSuper,
    member: !!ctx.member,
  });
  const button = (key: DesignAction): ReactNode => {
    const label = designActionLabel(key, badge);
    switch (key) {
      case 'dar':
        return (
          <Button key="dar" className="min-h-11" variant="primary" icon={<Gift className="size-4" />} onClick={() => onGive?.(badge)}>
            {label}
          </Button>
        );
      case 'editar':
        return (
          <Button key="editar" className="min-h-11" icon={<Pencil className="size-4" />} onClick={() => onEdit?.(badge)}>
            {label}
          </Button>
        );
      case 'duplicar':
        return (
          <Button key="duplicar" className="min-h-11" icon={<Copy className="size-4" />} onClick={() => onDuplicate?.(badge)}>
            {label}
          </Button>
        );
      case 'archivar':
        return (
          <Button
            className="min-h-11"
            key="archivar"
            icon={badge.status === 'activa' ? <Archive className="size-4" /> : <ArchiveRestore className="size-4" />}
            loading={busy === 'archivar'}
            onClick={() => void archive()}
          >
            {label}
          </Button>
        );
      case 'borrar':
        return (
          <Button key="borrar" variant="ghost" className="min-h-11 text-danger" icon={<Trash2 className="size-4" />} loading={busy === 'borrar'} onClick={() => void remove()}>
            {label}
          </Button>
        );
      case 'esconder':
        return (
          <Button key="esconder" className="min-h-11" variant="ghost" icon={hidden ? <ShieldCheck className="size-4" /> : <ShieldAlert className="size-4" />} onClick={() => setAsking({ kind: 'esconder' })}>
            {label}
          </Button>
        );
      case 'reportar':
        return (
          <Button key="reportar" className="min-h-11" variant="ghost" icon={<Flag className="size-4" />} onClick={() => setAsking({ kind: 'reportar' })}>
            {label}
          </Button>
        );
    }
  };
  const actions = keys.map(button);

  return (
    <div className="flex flex-col gap-4">
      <DesignHeader badge={badge} look={look} isAdmin={ctx.isAdmin} />
      {actions.length > 0 && <div className="flex flex-wrap gap-2">{actions}</div>}

      <section aria-labelledby="quien-la-tiene" className="flex flex-col gap-2">
        <h3 id="quien-la-tiene" className="text-sm font-semibold">
          {holdersHeading(holders.data?.awards ?? null, badge.active)}
        </h3>
        {!user ? (
          <p className="text-sm text-muted">{signedOutHolders(badge.active)}</p>
        ) : holders.loading && !holders.data ? (
          <ListSkeleton rows={2} />
        ) : holders.error && !holders.data ? (
          <LoadError error={holders.error} />
        ) : holders.data?.awards.length ? (
          <HoldersList
            holders={holders.data.awards}
            me={user.uid}
            owner={ctx.isOwner}
            tz={ctx.league.tz}
            busy={busy}
            prizes={prizes}
            onRevoke={(h) => setAsking({ kind: 'quitar', holder: h, undo: undoes(h, user.uid, ctx.isOwner) })}
            onToggleMine={(h) => void toggleMine(h)}
          />
        ) : (
          <p className="text-sm text-muted">{NOBODY_TEXT}</p>
        )}
      </section>

      <ReasonModal
        key={askingKey(asking)}
        asking={asking}
        badge={badge}
        onClose={() => setAsking(null)}
        onSubmit={async (reason) => {
          if (!asking) return;
          if (asking.kind === 'quitar') {
            const ok = await act(`quitar-${asking.holder.id}`, () => revokeLeagueBadgeAward(badge.leagueId, asking.holder.id, reason), revokedToast(asking.undo, asking.holder.playerName), 'quitar');
            if (ok) setAsking(null);
          } else if (asking.kind === 'reportar') {
            setBusy('reportar');
            try {
              await reportLeagueBadge(badge, reason);
              toast(REPORTED_TOAST);
              setAsking(null);
            } catch (e) {
              console.error(e);
              toast(makerErrorText(e, { action: 'reportar' }), 'error');
            } finally {
              setBusy(null);
            }
          } else {
            const ok = await act('esconder', () => hideLeagueBadge(badge, !hidden, reason), hiddenToast(hidden));
            if (ok) setAsking(null);
          }
        }}
        busy={busy != null && (busy.startsWith('quitar') || busy === 'reportar' || busy === 'esconder')}
      />
    </div>
  );
}

/** El dibujo, el nombre, qué hay que hacer y el cupo, con su estado. */
export function DesignHeader({ badge, look, isAdmin }: { badge: LeagueBadge; look: ReturnType<typeof designLook>; isAdmin: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <Insignia badge={look} size={128} label={badgeLabel(badge.name, look)} />
      <div className="flex flex-wrap justify-center gap-1">
        {badge.status === 'archivada' && <Badge>Archivada</Badge>}
        {badge.status === 'oculta' && <Badge tone="danger">Escondida por moderación</Badge>}
        {isAdmin && (badge.openReports ?? 0) > 0 && <Badge tone="warn">{reportsText(badge.openReports ?? 0)}</Badge>}
      </div>
      {badge.description ? <p className="max-w-sm text-sm">{badge.description}</p> : <p className="text-sm text-muted">Sin descripción.</p>}
      <p className="text-xs text-muted">
        {limitLine(badge.limitKind, badge.byTeam)}
        {badge.periodText ? ` · ${badge.periodText}` : ''}
      </p>
      {badge.status === 'oculta' && (
        <p className="text-xs text-muted">{HIDDEN_NOTE}</p>
      )}
    </div>
  );
}

/** «Quién la tiene»: vigentes primero; las retiradas (solo admins) al final, tachadas. */
export function HoldersList({
  holders,
  me,
  owner = false,
  tz,
  busy,
  prizes,
  onRevoke,
  onToggleMine,
}: {
  holders: readonly BadgeHolder[];
  me: string | null;
  owner?: boolean;
  tz?: string;
  busy?: string | null;
  /** Los otorgamientos que son premios del torneo (ids). */
  prizes?: ReadonlySet<string>;
  onRevoke: (h: BadgeHolder) => void;
  onToggleMine: (h: BadgeHolder) => void;
}) {
  const sorted = sortHolders(holders);
  return (
    <ul className="divide-y divide-line rounded-xl border border-line">
      {sorted.map((h) => {
        const mine = !!me && h.userId === me;
        const sub = holderSub(h, tz);
        return (
          <li key={h.id} className={cx('flex flex-col gap-1 px-3 py-2.5', h.revokedAt && 'opacity-70')}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className={cx('flex flex-wrap items-center gap-1.5 text-sm font-semibold', h.revokedAt && 'line-through')}>
                  {h.playerName}
                  {mine && <Badge>Tú</Badge>}
                  {!h.userId && <Badge>Sin cuenta</Badge>}
                  {prizes?.has(h.id) && <Badge tone="accent">Premio del torneo</Badge>}
                  {h.hidden && !h.revokedAt && <Badge>Oculta en su perfil</Badge>}
                </p>
                <p className="text-xs text-muted">{sub}</p>
                {h.awardedByName && <p className="text-xs text-muted">Se la dio {h.awardedByName}</p>}
                {h.revokedAt && (
                  <p className="text-xs font-medium text-muted">
                    {revokedLine(h, tz)}
                  </p>
                )}
                {h.note && <p className="mt-1 text-sm italic">“{h.note}”</p>}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {h.canUndo && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-h-11 text-danger"
                    loading={busy === `quitar-${h.id}`}
                    icon={undoes(h, me, owner) ? <Undo2 className="size-4" /> : <UserMinus className="size-4" />}
                    onClick={() => onRevoke(h)}
                  >
                    {holderUndoLabel(h, me, owner)}
                  </Button>
                )}
                {mine && !h.revokedAt && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-h-11"
                    loading={busy === `ocultar-${h.id}`}
                    icon={h.hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                    onClick={() => onToggleMine(h)}
                  >
                    {mineToggleLabel(h.hidden)}
                  </Button>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Quitar (motivo privado), reportar (motivo para el superadmin) o esconder (nota de moderación). */
function ReasonModal({
  asking,
  badge,
  onClose,
  onSubmit,
  busy,
}: {
  asking: Asking | null;
  badge: LeagueBadge;
  onClose: () => void;
  onSubmit: (reason: string) => void | Promise<void>;
  busy: boolean;
}) {
  const [reason, setReason] = useState('');
  // Los motivos son privados (los ve el dueño o el superadmin): solo se limita el largo.
  const clean = cleanBadgeText(reason);
  const max = reasonMax(asking);
  const copy = reasonCopy(asking, badge);
  return (
    <Modal
      open={asking != null}
      onClose={onClose}
      title={copy.title}
      footer={
        <>
          <Button className="min-h-11" onClick={onClose}>Cancelar</Button>
          <Button
            className="min-h-11"
            variant={asking?.kind === 'reportar' ? 'primary' : 'danger'}
            loading={busy}
            disabled={textLength(clean) > max}
            onClick={() => void onSubmit(clean)}
          >
            {copy.button}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">{copy.text}</p>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="insignia-motivo" className="text-xs font-medium text-muted">
              {copy.label}
            </label>
            <Counter value={textLength(reason)} max={max} />
          </div>
          <Textarea id="insignia-motivo" rows={2} maxLength={max} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
