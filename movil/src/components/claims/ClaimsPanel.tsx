import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Check, ChevronDown, Inbox, MessageSquareText, X } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { useLeagueClaims, type PlayerClaim } from '@mm/lib/data/claims';
import { useLeagueMembers, useUsers } from '@mm/lib/data/members';
import { useLeagueCtx } from '@mm/lib/league';
import { useNow } from '@mm/lib/useNow';
import { usePlayerHistory } from '@mm/components/claims/data';
import { ago, historyText, statusLabel } from '@mm/components/claims/logic';
import { claimAccounts, claimMeta, ownPlayerOf, type ClaimAccount } from '@mm/components/claims/panel';
import { Avatar } from '@/components/social/Avatar';
import { Badge, Button, Card, Divider, Empty, LoadError, Loading, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { DecideSheet } from './DecideSheet';

/**
 * Organizar › Jugadores y miembros › Reclamos (ClaimsPanel de la web, con su misma lógica): quien se hizo una cuenta y
 * dice «ese soy yo» de un jugador que el admin anotó sin cuenta. El dueño o un admin lo aprueba (los dos jugadores se
 * juntan en uno: juegos, partidos, tarjetas…) o lo rechaza (sigue con su propio jugador). Pendientes arriba, el más
 * viejo primero; abajo, «Ya decididos». Va dentro de LeagueScope.
 */
export function ClaimsPanel() {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const { isSuper } = useAuth();
  const claims = useLeagueClaims(lid);
  const members = useLeagueMembers(lid);
  // Los correos solo los puede leer el superadmin (profiles); los demás ven el nombre de la cuenta.
  const users = useUsers(isSuper);
  const now = useNow().getTime();
  const [showDone, setShowDone] = useState(false);
  const pending = claims.data.filter((x) => x.status === 'pending');
  const done = claims.data.filter((x) => x.status !== 'pending');
  const account = claimAccounts(members.data, users.data);

  if (claims.error) return <LoadError error={claims.error} />;
  if (claims.loading && !claims.data.length) return <Loading />;

  return (
    <View style={{ gap: 16 }}>
      <Txt variant="meta" tone="muted" style={{ marginHorizontal: 4 }}>
        Cuando alguien se une y dice «ese soy yo» de un jugador que anotaste sin cuenta, sale aquí. Al aprobar, su cuenta queda con ese jugador y todo
        lo que jugó.
      </Txt>
      {pending.length === 0 ? (
        <Empty icon={<Inbox size={24} color={c.accent} />} title="No hay reclamos por decidir" text="Si alguien pide ser uno de tus jugadores, te avisamos en la campana." />
      ) : (
        <View style={{ gap: 12 }}>
          {pending.map((x) => (
            <PendingClaim key={x.id} lid={lid} claim={x} account={account.get(x.userId) ?? null} now={now} />
          ))}
        </View>
      )}
      {done.length > 0 && (
        <View style={{ gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showDone }}
            onPress={() => setShowDone((v) => !v)}
            style={({ pressed }) => [styles.toggle, { backgroundColor: pressed ? c.surface2 : 'transparent' }]}
          >
            <ChevronDown size={16} color={c.muted} style={{ transform: [{ rotate: showDone ? '180deg' : '0deg' }] }} />
            <Txt tone="muted" style={{ fontSize: 14, fontFamily: font.medium }}>{`Ya decididos (${done.length})`}</Txt>
          </Pressable>
          {showDone && (
            <Card padded={false}>
              {done.map((x, i) => {
                const s = statusLabel(x);
                return (
                  <View key={x.id}>
                    {i > 0 && <Divider />}
                    <View style={styles.done}>
                      <Avatar name={x.claimantName} size={32} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Txt style={{ fontSize: 14 }}>
                          <Txt style={{ fontSize: 14, fontFamily: font.medium }}>{x.claimantName}</Txt>
                          <Txt tone="muted" style={{ fontSize: 14 }}>
                            {' pidió ser '}
                          </Txt>
                          <Txt style={{ fontSize: 14, fontFamily: font.medium }}>{x.playerName}</Txt>
                        </Txt>
                        {!!x.decisionNote && (
                          <Txt tone="muted" style={{ fontSize: 12, marginTop: 2 }}>
                            {`«${x.decisionNote}»`}
                          </Txt>
                        )}
                        <Txt tone="muted" style={{ fontSize: 12 }}>
                          {ago(x.decidedAt ?? x.changedAt, now)}
                        </Txt>
                      </View>
                      <Badge tone={s.tone === 'neutral' ? 'muted' : s.tone}>{s.text}</Badge>
                    </View>
                  </View>
                );
              })}
            </Card>
          )}
        </View>
      )}
    </View>
  );
}

/** Un pedido por decidir: quién dice que es quién, lo que jugó cada uno, su nota y Aprobar · Rechazar. */
function PendingClaim({ lid, claim: x, account, now }: { lid: string; claim: PlayerClaim; account: ClaimAccount | null; now: number }) {
  const c = useColors();
  const claimed = usePlayerHistory(lid, x.playerId);
  const ownPlayer = ownPlayerOf(x, account);
  const own = usePlayerHistory(lid, ownPlayer);
  const [deciding, setDeciding] = useState<'approve' | 'reject' | null>(null);
  return (
    <Card style={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <Avatar name={x.claimantName} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt>
            <Txt style={{ fontFamily: font.semibold }}>{x.claimantName}</Txt>
            <Txt tone="muted">{' dice que es '}</Txt>
            <Txt tone="accent" style={{ fontFamily: font.semibold }}>
              {x.playerName}
            </Txt>
          </Txt>
          <Txt tone="muted" style={{ fontSize: 12 }}>
            {claimMeta(x, account, now)}
          </Txt>
        </View>
        <Badge tone="warn">Por aprobar</Badge>
      </View>

      <View style={[styles.history, { backgroundColor: c.surface2 }]}>
        <View>
          <Txt tone="muted" style={{ fontSize: 12 }}>{`${x.playerName} (sin cuenta)`}</Txt>
          <Txt style={{ fontSize: 14 }}>{claimed.data ? historyText(claimed.data) : '…'}</Txt>
        </View>
        <View>
          <Txt tone="muted" style={{ fontSize: 12 }}>
            Lo que ya jugó con su cuenta
          </Txt>
          <Txt style={{ fontSize: 14 }}>{!ownPlayer ? 'Nada todavía' : own.data ? historyText(own.data) : '…'}</Txt>
        </View>
      </View>

      {!!x.note && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <MessageSquareText size={16} color={c.muted} style={{ marginTop: 2 }} />
          <Txt style={{ flex: 1, fontSize: 14 }}>{`«${x.note}»`}</Txt>
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button variant="primary" full icon={<Check size={16} color={c.accentFg} />} onPress={() => setDeciding('approve')}>
            Aprobar
          </Button>
        </View>
        <View style={{ flex: 1 }}>
          <Button full icon={<X size={16} color={c.fg} />} onPress={() => setDeciding('reject')}>
            Rechazar
          </Button>
        </View>
      </View>

      {deciding && <DecideSheet key={deciding} lid={lid} claim={x} approve={deciding === 'approve'} onClose={() => setDeciding(null)} />}
    </Card>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', height: 44, borderRadius: 12, paddingHorizontal: 8 },
  done: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 12 },
  history: { borderRadius: 12, padding: 12, gap: 8 },
});
