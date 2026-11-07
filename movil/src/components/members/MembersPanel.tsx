import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { ClipboardList, ClipboardX, Palette, ShieldCheck, ShieldOff, UserMinus } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { removeMember, setMemberRole, setMemberScorer, useLeagueMembers, usePlayers } from '@mm/lib/data';
import { badgeMakersOf, setMemberBadgeMaker } from '@mm/lib/data/leagueBadges';
import { roleLabel, useLeagueCtx } from '@mm/lib/league';
import type { Member } from '@mm/lib/types';
import {
  adminConfirm,
  kickConfirm,
  makerConfirm,
  memberLabels,
  memberPlayerBadge,
  memberRights,
  membersIntro,
  membersScope,
  scorerConfirm,
  sortMembers,
  type MemberConfirm,
} from '@mm/components/league/members';
import { confirmAsync } from '@/components/feedback';
import { Avatar } from '@/components/social/Avatar';
import { runAction } from '@/components/swimming/parts';
import { Badge, Button, Card, Divider, LoadError, Loading, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { PlayersPanel } from '@/components/players/PlayersPanel';

/**
 * Organizar › Jugadores y miembros › Miembros (MembersPanel de la web, con su misma lógica:
 * src/components/league/members.ts): todas las cuentas de la liga, el dueño y los admins arriba, cada una con su papel,
 * si anota, si diseña insignias y su jugador. El dueño nombra admins (y quién diseña insignias); el dueño o un admin,
 * anotadores; un admin puede dejar de serlo; sacar de la liga. Cada cambio se confirma antes. `accountsOf`: el deporte
 * maneja a su gente en su propia pestaña (ese es su nombre); abajo queda lo de vincular cada cuenta con su jugador. Va
 * dentro de LeagueScope.
 */
export function MembersPanel({ accountsOf = null }: { accountsOf?: string | null }) {
  const c = useColors();
  const { lid, league, isOwner, isAdmin } = useLeagueCtx();
  const uid = useAuth().user?.uid;
  const members = useLeagueMembers(lid);
  const players = usePlayers(lid);
  const playerName = new Map(players.data.map((p) => [p.id, p.name]));
  const sorted = sortMembers(members.data);
  const scope = membersScope(league, badgeMakersOf(league) === 'chosen');
  const viewer = { uid, isOwner, isAdmin };
  // Qué permiso de quién se está guardando (`${m.id}:admin`…): ese botón da vueltas y los demás esperan.
  const [busy, setBusy] = useState<string | null>(null);

  async function act(key: string, ask: MemberConfirm, fn: () => Promise<unknown>) {
    if (busy) return;
    const ok = await confirmAsync(ask);
    if (!ok) return;
    setBusy(key);
    await runAction(fn, ask.done);
    setBusy(null);
  }

  function toggleAdmin(m: Member) {
    const ask = adminConfirm(m, scope, uid);
    return act(`${m.id}:admin`, ask, () => setMemberRole(m, ask.role));
  }
  function toggleScorer(m: Member) {
    const ask = scorerConfirm(m, scope);
    return act(`${m.id}:scorer`, ask, () => setMemberScorer(m, ask.make));
  }
  function toggleMaker(m: Member) {
    const ask = makerConfirm(m, scope);
    return act(`${m.id}:maker`, ask, () => setMemberBadgeMaker(m, ask.make));
  }
  function kick(m: Member) {
    return act(`${m.id}:kick`, kickConfirm(m, scope), () => removeMember(m));
  }

  return (
    <View style={{ gap: 16 }}>
      <Txt variant="meta" tone="muted" style={{ marginHorizontal: 4 }}>
        {membersIntro(scope, isOwner).map((p, i) =>
          p.strong ? (
            <Txt key={i} variant="meta" style={{ fontFamily: font.bold }}>
              {p.text}
            </Txt>
          ) : (
            p.text
          ),
        )}
      </Txt>
      {members.error ? (
        <LoadError error={members.error} />
      ) : members.loading && !members.data.length ? (
        <Loading />
      ) : (
        <Card padded={false}>
          {sorted.map((m, i) => {
            const me = m.uid === uid;
            const can = memberRights(m, viewer);
            const label = memberLabels(m, scope);
            const player = memberPlayerBadge(m, m.playerId ? playerName.get(m.playerId) : undefined);
            const buttons: ReactNode[] = [];
            const button = (key: 'admin' | 'scorer' | 'maker', text: string, icon: ReactNode, onPress: () => unknown) => (
              <Button key={`${key}:${text}`} icon={icon} loading={busy === `${m.id}:${key}`} disabled={!!busy} onPress={onPress}>
                {text}
              </Button>
            );
            if (can.canStepDown) buttons.push(button('admin', label.stepDown, <ShieldOff size={16} color={c.fg} />, () => toggleAdmin(m)));
            if (can.canManage)
              buttons.push(
                button('admin', label.admin, m.role === 'admin' ? <ShieldOff size={16} color={c.fg} /> : <ShieldCheck size={16} color={c.fg} />, () => toggleAdmin(m)),
              );
            if (can.canScorer)
              buttons.push(
                button('scorer', label.scorer, m.scorer ? <ClipboardX size={16} color={c.fg} /> : <ClipboardList size={16} color={c.fg} />, () => toggleScorer(m)),
              );
            if (can.canManage && scope.chosen) buttons.push(button('maker', label.maker, <Palette size={16} color={c.fg} />, () => toggleMaker(m)));
            if (can.canKick)
              buttons.push(
                <Button
                  key="kick"
                  variant="ghost"
                  accessibilityLabel={label.kick}
                  icon={<UserMinus size={18} color={c.danger} />}
                  loading={busy === `${m.id}:kick`}
                  disabled={!!busy}
                  onPress={() => kick(m)}
                />,
              );
            return (
              <View key={m.id}>
                {i > 0 && <Divider inset={68} />}
                <View style={styles.row}>
                  <View style={styles.who}>
                    <Avatar name={m.name} size={36} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.line}>
                        <Txt numberOfLines={1} style={{ flexShrink: 1, fontSize: 15, fontFamily: font.medium }}>
                          {m.name}
                        </Txt>
                        {me && <Badge tone="muted">Tú</Badge>}
                      </View>
                      <View style={[styles.line, { marginTop: 4, gap: 4 }]}>
                        {m.role !== 'member' && <Badge tone="accent">{roleLabel(m.role)}</Badge>}
                        {m.scorer && <Badge tone="warn">Anotador</Badge>}
                        {scope.chosen && m.badgeMaker && <Badge tone="accent">Diseña insignias</Badge>}
                        <Badge tone={player.tone === 'ok' ? 'ok' : 'muted'}>{player.text}</Badge>
                      </View>
                    </View>
                  </View>
                  {buttons.length > 0 && <View style={styles.buttons}>{buttons}</View>}
                </View>
              </View>
            );
          })}
        </Card>
      )}
      {accountsOf && (
        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, paddingTop: 20 }}>
          <PlayersPanel variant="accounts" addWhere={accountsOf} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 12, paddingLeft: 20, paddingRight: 18, gap: 10 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 4 },
});
