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
  type BadgeHolder,
  type LeagueBadge,
} from '../../../lib/data/leagueBadges';
import { useLeagueCtx } from '../../../lib/league';
import { leagueSport } from '../../../sports/registry';
import { useFeedback } from '../../feedback';
import { Badge, Button, ListSkeleton, LoadError, Modal, Textarea, cx } from '../../ui';
import { BADGE_TEXT_MAX, cleanBadgeText, textLength } from '../text';
import { dayText, limitLine, makerErrorText } from './design';
import { designLook } from './look';
import { Counter } from './parts';

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

type Asking =
  | { kind: 'quitar'; holder: BadgeHolder; undo: boolean }
  | { kind: 'reportar' }
  | { kind: 'esconder' };

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
      const ok = await confirm({
        title: `¿Archivar “${badge.name}”?`,
        message: 'Deja de salir para dar. Quienes ya la tienen la conservan. La puedes activar otra vez cuando quieras.',
        confirmText: 'Archivar',
      });
      if (!ok) return;
    }
    await act('archivar', () => archiveLeagueBadge(badge, archived), archived ? 'Insignia archivada' : 'Insignia activa otra vez');
  }

  async function remove() {
    const ok = await confirm({
      title: `¿Borrar “${badge.name}”?`,
      message: 'Nunca se dio, así que se borra del todo. No se puede deshacer.',
      confirmText: 'Borrar',
      danger: true,
    });
    if (ok && (await act('borrar', () => deleteLeagueBadge(badge), 'Insignia borrada', 'borrar'))) onClose();
  }

  async function toggleMine(h: BadgeHolder) {
    await act(`ocultar-${h.id}`, () => setLeagueBadgeHidden({ id: h.id, leagueId: badge.leagueId }, !h.hidden), h.hidden ? 'Ya sale en tu perfil' : 'Ya no sale en tu perfil');
  }

  const actions: ReactNode[] = [];
  if (maker && !hidden) {
    if (badge.status === 'activa' && onGive)
      actions.push(
        <Button key="dar" className="min-h-11" variant="primary" icon={<Gift className="size-4" />} onClick={() => onGive(badge)}>
          Dar insignia
        </Button>,
      );
    if (onEdit)
      actions.push(
        <Button key="editar" className="min-h-11" icon={<Pencil className="size-4" />} onClick={() => onEdit(badge)}>
          {badge.locked ? 'Cambiar descripción' : 'Cambiar'}
        </Button>,
      );
    if (onDuplicate)
      actions.push(
        <Button key="duplicar" className="min-h-11" icon={<Copy className="size-4" />} onClick={() => onDuplicate(badge)}>
          Duplicar
        </Button>,
      );
    actions.push(
      <Button
        className="min-h-11"
        key="archivar"
        icon={badge.status === 'activa' ? <Archive className="size-4" /> : <ArchiveRestore className="size-4" />}
        loading={busy === 'archivar'}
        onClick={() => void archive()}
      >
        {badge.status === 'activa' ? 'Archivar' : 'Activar'}
      </Button>,
    );
    if (holders.data && !holders.data.badge.given)
      actions.push(
        <Button key="borrar" variant="ghost" className="min-h-11 text-danger" icon={<Trash2 className="size-4" />} loading={busy === 'borrar'} onClick={() => void remove()}>
          Borrar
        </Button>,
      );
  }
  if (isSuper)
    actions.push(
      <Button key="esconder" className="min-h-11" variant="ghost" icon={hidden ? <ShieldCheck className="size-4" /> : <ShieldAlert className="size-4" />} onClick={() => setAsking({ kind: 'esconder' })}>
        {hidden ? 'Dejar de esconder' : 'Esconder (moderación)'}
      </Button>,
    );
  if (ctx.member && !hidden)
    actions.push(
      <Button key="reportar" className="min-h-11" variant="ghost" icon={<Flag className="size-4" />} onClick={() => setAsking({ kind: 'reportar' })}>
        Reportar
      </Button>,
    );

  return (
    <div className="flex flex-col gap-4">
      <DesignHeader badge={badge} look={look} isAdmin={ctx.isAdmin} />
      {actions.length > 0 && <div className="flex flex-wrap gap-2">{actions}</div>}

      <section aria-labelledby="quien-la-tiene" className="flex flex-col gap-2">
        <h3 id="quien-la-tiene" className="text-sm font-semibold">
          Quién la tiene{holders.data ? ` (${holders.data.awards.filter((a) => !a.revokedAt).length})` : badge.active ? ` (${badge.active})` : ''}
        </h3>
        {!user ? (
          <p className="text-sm text-muted">{badge.active ? `${badge.active === 1 ? 'La tiene 1 jugador' : `La tienen ${badge.active} jugadores`}. Entra a tu cuenta para ver quiénes.` : 'Todavía nadie la tiene.'}</p>
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
            onRevoke={(h) => setAsking({ kind: 'quitar', holder: h, undo: undoes(h, user.uid, ctx.isOwner) })}
            onToggleMine={(h) => void toggleMine(h)}
          />
        ) : (
          <p className="text-sm text-muted">Todavía nadie la tiene.</p>
        )}
      </section>

      <ReasonModal
        key={asking ? `${asking.kind}-${asking.kind === 'quitar' ? asking.holder.id : ''}` : 'cerrado'}
        asking={asking}
        badge={badge}
        onClose={() => setAsking(null)}
        onSubmit={async (reason) => {
          if (!asking) return;
          if (asking.kind === 'quitar') {
            const ok = await act(`quitar-${asking.holder.id}`, () => revokeLeagueBadgeAward(badge.leagueId, asking.holder.id, reason), asking.undo ? 'Deshecho' : `Se la quitamos a ${asking.holder.playerName}`, 'quitar');
            if (ok) setAsking(null);
          } else if (asking.kind === 'reportar') {
            setBusy('reportar');
            try {
              await reportLeagueBadge(badge, reason);
              toast('Gracias: el equipo de MatchMate la va a revisar');
              setAsking(null);
            } catch (e) {
              console.error(e);
              toast(makerErrorText(e, { action: 'reportar' }), 'error');
            } finally {
              setBusy(null);
            }
          } else {
            const ok = await act('esconder', () => hideLeagueBadge(badge, !hidden, reason), hidden ? 'La liga la puede activar otra vez' : 'Escondida: la liga ya no la ve ni la puede dar');
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
        {isAdmin && (badge.openReports ?? 0) > 0 && <Badge tone="warn">{badge.openReports === 1 ? '1 reporte' : `${badge.openReports} reportes`}</Badge>}
      </div>
      {badge.description ? <p className="max-w-sm text-sm">{badge.description}</p> : <p className="text-sm text-muted">Sin descripción.</p>}
      <p className="text-xs text-muted">
        {limitLine(badge.limitKind, badge.byTeam)}
        {badge.periodText ? ` · ${badge.periodText}` : ''}
      </p>
      {badge.status === 'oculta' && (
        <p className="text-xs text-muted">El equipo de MatchMate la escondió: nadie de la liga la ve ni la puede dar. Solo la ven los admins.</p>
      )}
    </div>
  );
}

/**
 * ¿Es deshacer lo propio (y no quitar)? Solo el dueño quita lo de otros; los demás solo deshacen lo que dieron (quien
 * no es admin no ve quién la dio: si la puede deshacer, es suya).
 */
const undoes = (h: BadgeHolder, me: string | null, owner: boolean) => h.awardedBy === me || !owner;

/** «Quién la tiene»: vigentes primero; las retiradas (solo admins) al final, tachadas. */
export function HoldersList({
  holders,
  me,
  owner = false,
  tz,
  busy,
  onRevoke,
  onToggleMine,
}: {
  holders: readonly BadgeHolder[];
  me: string | null;
  owner?: boolean;
  tz?: string;
  busy?: string | null;
  onRevoke: (h: BadgeHolder) => void;
  onToggleMine: (h: BadgeHolder) => void;
}) {
  const sorted = [...holders].sort((a, b) => Number(!!a.revokedAt) - Number(!!b.revokedAt));
  return (
    <ul className="divide-y divide-line rounded-xl border border-line">
      {sorted.map((h) => {
        const mine = !!me && h.userId === me;
        const sub = [h.period, h.division, h.teamName, dayText(h.awardedAt, tz)].filter(Boolean).join(' · ');
        return (
          <li key={h.id} className={cx('flex flex-col gap-1 px-3 py-2.5', h.revokedAt && 'opacity-70')}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className={cx('flex flex-wrap items-center gap-1.5 text-sm font-semibold', h.revokedAt && 'line-through')}>
                  {h.playerName}
                  {mine && <Badge>Tú</Badge>}
                  {!h.userId && <Badge>Sin cuenta</Badge>}
                  {h.hidden && !h.revokedAt && <Badge>Oculta en su perfil</Badge>}
                </p>
                <p className="text-xs text-muted">{sub}</p>
                {h.awardedByName && <p className="text-xs text-muted">Se la dio {h.awardedByName}</p>}
                {h.revokedAt && (
                  <p className="text-xs font-medium text-muted">
                    Retirada · {dayText(h.revokedAt, tz)}
                    {h.revokeReason ? ` · ${h.revokeReason}` : ''}
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
                    {undoes(h, me, owner) ? 'Deshacer' : 'Quitar'}
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
                    {h.hidden ? 'Mostrar en mi perfil' : 'Ocultar de mi perfil'}
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
  const max = asking?.kind === 'esconder' ? 200 : BADGE_TEXT_MAX.reason;
  const copy =
    asking?.kind === 'quitar'
      ? {
          title: asking.undo ? `¿Deshacer “${badge.name}” de ${asking.holder.playerName}?` : `¿Quitarle “${badge.name}” a ${asking.holder.playerName}?`,
          text: 'Se le quita de su perfil. No se le manda notificación.',
          label: 'Motivo (privado, opcional)',
          button: asking.undo ? 'Deshacer' : 'Quitar',
        }
      : asking?.kind === 'reportar'
        ? {
            title: `Reportar “${badge.name}”`,
            text: 'Le llega al equipo de MatchMate, que la revisa. Máximo 5 reportes por día.',
            label: '¿Qué tiene de malo? (opcional)',
            button: 'Reportar',
          }
        : {
            title: badge.status === 'oculta' ? `¿Dejar de esconder “${badge.name}”?` : `¿Esconder “${badge.name}”?`,
            text:
              badge.status === 'oculta'
                ? 'Queda archivada: la liga la puede volver a activar. Queda en la auditoría.'
                : 'Nadie de la liga la ve ni la puede dar, y sale de los perfiles. Cierra sus reportes. Queda en la auditoría.',
            label: 'Nota (opcional)',
            button: badge.status === 'oculta' ? 'Dejar de esconder' : 'Esconder',
          };
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
