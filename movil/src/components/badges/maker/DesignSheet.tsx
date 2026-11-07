/**
 * El detalle de una insignia de la liga en la app (DesignSheet de la web, §5.6 y §6.5): el dibujo, qué hay que hacer,
 * el cupo y «Quién la tiene», con lo que cada uno puede hacer: dar, cambiar, duplicar, archivar o borrar (quien
 * diseña); deshacer (quien la dio, en 24 h) o quitar (el dueño); ocultarla de su perfil (el jugador); reportar el
 * diseño (los miembros) y esconderlo (el superadmin). Qué sale y qué dice: src/components/badges/maker/view.ts.
 */
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Archive, ArchiveRestore, Copy, Eye, EyeOff, Flag, Gift, Pencil, ShieldAlert, ShieldCheck, Trash2, Undo2, UserMinus } from 'lucide-react-native';
import { badgeLabel } from '@mm/badges/visual/period';
import { useAuth } from '@mm/lib/auth';
import { setLeagueBadgeHidden } from '@mm/lib/data/badges';
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
} from '@mm/lib/data/leagueBadges';
import { useLeagueCtx } from '@mm/lib/league';
import { leagueSport } from '@mm/sports/registry';
import { cleanBadgeText, textLength } from '@mm/components/badges/text';
import { limitLine, makerErrorText } from '@mm/components/badges/maker/design';
import { designLook } from '@mm/components/badges/maker/look';
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
} from '@mm/components/badges/maker/view';
import { Insignia } from '@/components/badges/Insignia';
import { confirmAsync, toast } from '@/components/feedback';
import { LogoSpinner } from '@/components/Logo';
import { Badge, Button, Input, LoadError, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { Counter, FieldLabel } from './parts';

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
    <Sheet open={badge != null} onClose={onClose} title={badge?.name ?? 'Insignia'}>
      {badge && <SheetContent key={badge.id} badge={badge} onClose={onClose} onEdit={onEdit} onDuplicate={onDuplicate} onGive={onGive} />}
    </Sheet>
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
  const c = useColors();
  const ctx = useLeagueCtx();
  const { user, isSuper } = useAuth();
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
    if (archived && !(await confirmAsync(archiveConfirm(badge.name)))) return;
    await act('archivar', () => archiveLeagueBadge(badge, archived), archivedToast(archived));
  }

  async function remove() {
    if (!(await confirmAsync(deleteConfirm(badge.name)))) return;
    if (await act('borrar', () => deleteLeagueBadge(badge), DELETED_TOAST, 'borrar')) onClose();
  }

  async function toggleMine(h: BadgeHolder) {
    await act(`ocultar-${h.id}`, () => setLeagueBadgeHidden({ id: h.id, leagueId: badge.leagueId }, !h.hidden), mineHiddenToast(h.hidden));
  }

  async function submitReason(reason: string) {
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
  const iconOf = (k: DesignAction, color: string): ReactNode => {
    const Icon = {
      dar: Gift,
      editar: Pencil,
      duplicar: Copy,
      archivar: badge.status === 'activa' ? Archive : ArchiveRestore,
      borrar: Trash2,
      esconder: hidden ? ShieldCheck : ShieldAlert,
      reportar: Flag,
    }[k];
    return <Icon size={16} color={color} />;
  };
  const press: Record<DesignAction, () => void> = {
    dar: () => onGive?.(badge),
    editar: () => onEdit?.(badge),
    duplicar: () => onDuplicate?.(badge),
    archivar: () => void archive(),
    borrar: () => void remove(),
    esconder: () => setAsking({ kind: 'esconder' }),
    reportar: () => setAsking({ kind: 'reportar' }),
  };

  return (
    <View style={{ gap: 16 }}>
      <DesignHeader badge={badge} sport={sport} isAdmin={ctx.isAdmin} />
      {keys.length > 0 && (
        <View style={styles.actions}>
          {keys.map((k) => {
            const variant = k === 'dar' ? 'primary' : k === 'borrar' || k === 'esconder' || k === 'reportar' ? 'ghost' : 'quiet';
            const color = k === 'dar' ? c.accentFg : k === 'borrar' ? c.danger : c.fg;
            return (
              <Button key={k} variant={variant} icon={iconOf(k, color)} loading={(k === 'archivar' || k === 'borrar') && busy === k} onPress={press[k]}>
                {designActionLabel(k, badge)}
              </Button>
            );
          })}
        </View>
      )}

      <View style={{ gap: 8 }}>
        <Txt variant="meta" accessibilityRole="header" style={{ fontFamily: font.semibold }}>
          {holdersHeading(holders.data?.awards ?? null, badge.active)}
        </Txt>
        {!user ? (
          <Txt variant="meta" tone="muted">
            {signedOutHolders(badge.active)}
          </Txt>
        ) : holders.loading && !holders.data ? (
          <View style={{ alignItems: 'center', paddingVertical: 12 }}>
            <LogoSpinner size={28} />
          </View>
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
          <Txt variant="meta" tone="muted">
            {NOBODY_TEXT}
          </Txt>
        )}
      </View>

      <ReasonSheet
        key={askingKey(asking)}
        asking={asking}
        badge={badge}
        onClose={() => setAsking(null)}
        onSubmit={submitReason}
        busy={busy != null && (busy.startsWith('quitar') || busy === 'reportar' || busy === 'esconder')}
      />
    </View>
  );
}

/** El dibujo, el nombre, qué hay que hacer y el cupo, con su estado. */
function DesignHeader({ badge, sport, isAdmin }: { badge: LeagueBadge; sport: string; isAdmin: boolean }) {
  const look = designLook(badge, sport);
  const reports = badge.openReports ?? 0;
  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <Insignia badge={look} size={128} label={badgeLabel(badge.name, look)} />
      {(badge.status !== 'activa' || (isAdmin && reports > 0)) && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 4 }}>
          {badge.status === 'archivada' && <Badge tone="muted">Archivada</Badge>}
          {badge.status === 'oculta' && <Badge tone="danger">Escondida por moderación</Badge>}
          {isAdmin && reports > 0 && <Badge tone="warn">{reportsText(reports)}</Badge>}
        </View>
      )}
      {badge.description ? (
        <Txt variant="meta" style={{ textAlign: 'center' }}>
          {badge.description}
        </Txt>
      ) : (
        <Txt variant="meta" tone="muted">
          Sin descripción.
        </Txt>
      )}
      <Txt variant="small" tone="muted" style={{ textAlign: 'center', fontFamily: font.regular }}>
        {limitLine(badge.limitKind, badge.byTeam)}
        {badge.periodText ? ` · ${badge.periodText}` : ''}
      </Txt>
      {badge.status === 'oculta' && (
        <Txt variant="small" tone="muted" style={{ textAlign: 'center', fontFamily: font.regular }}>
          {HIDDEN_NOTE}
        </Txt>
      )}
    </View>
  );
}

/** «Quién la tiene»: vigentes primero; las retiradas (solo admins) al final, tachadas. */
function HoldersList({
  holders,
  me,
  owner,
  tz,
  busy,
  prizes,
  onRevoke,
  onToggleMine,
}: {
  holders: readonly BadgeHolder[];
  me: string | null;
  owner: boolean;
  tz?: string;
  busy: string | null;
  prizes: ReadonlySet<string>;
  onRevoke: (h: BadgeHolder) => void;
  onToggleMine: (h: BadgeHolder) => void;
}) {
  const c = useColors();
  const list = sortHolders(holders);
  return (
    <View style={[styles.holders, { borderColor: c.line }]}>
      {list.map((h, i) => {
        const mine = !!me && h.userId === me;
        const undo = undoes(h, me, owner);
        return (
          <View key={h.id} style={[styles.holder, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }, !!h.revokedAt && { opacity: 0.7 }]}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              <Txt variant="meta" style={{ fontFamily: font.semibold, textDecorationLine: h.revokedAt ? 'line-through' : 'none' }}>
                {h.playerName}
              </Txt>
              {mine && <Badge tone="muted">Tú</Badge>}
              {!h.userId && <Badge tone="muted">Sin cuenta</Badge>}
              {prizes.has(h.id) && <Badge>Premio del torneo</Badge>}
              {h.hidden && !h.revokedAt && <Badge tone="muted">Oculta en su perfil</Badge>}
            </View>
            <Txt variant="small" tone="muted" style={{ fontFamily: font.regular }}>
              {holderSub(h, tz)}
            </Txt>
            {!!h.awardedByName && (
              <Txt variant="small" tone="muted" style={{ fontFamily: font.regular }}>
                {`Se la dio ${h.awardedByName}`}
              </Txt>
            )}
            {!!h.revokedAt && (
              <Txt variant="small" tone="muted">
                {revokedLine(h, tz)}
              </Txt>
            )}
            {!!h.note && <Txt variant="meta" style={{ fontStyle: 'italic', marginTop: 2 }}>{`“${h.note}”`}</Txt>}
            {(h.canUndo || (mine && !h.revokedAt)) && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                {h.canUndo && (
                  <Button
                    variant="ghost"
                    loading={busy === `quitar-${h.id}`}
                    icon={undo ? <Undo2 size={16} color={c.danger} /> : <UserMinus size={16} color={c.danger} />}
                    onPress={() => onRevoke(h)}
                  >
                    {holderUndoLabel(h, me, owner)}
                  </Button>
                )}
                {mine && !h.revokedAt && (
                  <Button
                    variant="ghost"
                    loading={busy === `ocultar-${h.id}`}
                    icon={h.hidden ? <Eye size={16} color={c.fg} /> : <EyeOff size={16} color={c.fg} />}
                    onPress={() => onToggleMine(h)}
                  >
                    {mineToggleLabel(h.hidden)}
                  </Button>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

/** Quitar (motivo privado), reportar (motivo para el superadmin) o esconder (nota de moderación). */
function ReasonSheet({
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
    <Sheet
      open={asking != null}
      onClose={onClose}
      title={copy.title}
      footer={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button onPress={onClose} style={{ flex: 1 }}>
            Cancelar
          </Button>
          <Button
            variant={asking?.kind === 'reportar' ? 'primary' : 'danger'}
            loading={busy}
            disabled={textLength(clean) > max}
            onPress={() => void onSubmit(clean)}
            style={{ flex: 1 }}
          >
            {copy.button}
          </Button>
        </View>
      }
    >
      <Txt variant="meta" tone="muted">
        {copy.text}
      </Txt>
      <View style={{ gap: 6 }}>
        <FieldLabel label={copy.label} count={<Counter value={textLength(reason)} max={max} />} />
        <Input
          accessibilityLabel={copy.label}
          value={reason}
          maxLength={max}
          multiline
          textAlignVertical="top"
          onChangeText={setReason}
          style={{ height: 80, paddingTop: 12, paddingBottom: 12 }}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  holders: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  holder: { gap: 2, paddingHorizontal: 12, paddingVertical: 10 },
});
