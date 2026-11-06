import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Users } from 'lucide-react-native';
import { respondErrorText, respondInvite, useMyInvites, type LeagueInvite } from '@mm/lib/data/invites';
import { respondSquadInvite, squadPath, useMySquadInvites, type MySquadInvite } from '@mm/lib/data/squads';
import { relativeTime } from '@mm/lib/notifications';
import { invitedByLine, leagueTypeLabel, respondedText, scorerInvitedLine } from '@mm/components/notifications/inviteText';
import { squadInviteErrorText, squadKindLabel, squadRespondedText, squadTitle } from '@mm/components/squads/logic';
import { sportMeta } from '@mm/sports/registry';
import { toast } from '@/components/feedback';
import { Button, Card, SectionHeader, Txt } from '@/components/ui';
import { openLink } from '@/lib/links';
import { useColors } from '@/theme/theme';

/** Una invitación de la tarjeta: a una liga (o a anotar) o a un equipo. */
type Item = { kind: 'league'; id: string; at: number; inv: LeagueInvite } | { kind: 'squad'; id: string; at: number; inv: MySquadInvite };

const timeOf = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};

/**
 * «Invitaciones» arriba de Avisos (InvitesCard de la web): las pendientes de la cuenta a una liga y a un equipo, la
 * más nueva primero, con Aceptar y Rechazar ahí mismo y «Ver» para la pantalla completa (/invitacion/<id>, con
 * «¿Quién eres?»). Aceptar lleva a la liga (o al torneo donde anota); los equipos todavía abren la web. Sin
 * invitaciones no sale.
 */
export function InvitesCard({ uid, now }: { uid: string; now: number }) {
  const invites = useMyInvites(uid);
  const squadInvites = useMySquadInvites();
  const c = useColors();
  const [busy, setBusy] = useState<{ id: string; accept: boolean } | null>(null);

  const items = useMemo<Item[]>(
    () =>
      [
        ...invites.data.map((inv): Item => ({ kind: 'league', id: inv.id, at: timeOf(inv.createdAt), inv })),
        ...squadInvites.data.map((inv): Item => ({ kind: 'squad', id: inv.id, at: timeOf(inv.createdAt), inv })),
      ].sort((a, b) => b.at - a.at),
    [invites.data, squadInvites.data],
  );
  if (!items.length) return null;

  async function respond(inv: LeagueInvite, accept: boolean) {
    if (busy) return;
    setBusy({ id: inv.id, accept });
    try {
      const r = await respondInvite(inv.id, accept);
      toast(respondedText(r.status, inv.leagueName, r.scorer ? r.scorer.title : null), r.status === 'cancelled' ? 'error' : 'ok');
      if (r.status === 'accepted') openLink(r.scorer?.path ?? `/l/${r.leagueId || inv.leagueId}`);
    } catch (e) {
      toast(respondErrorText(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function respondSquad(inv: MySquadInvite, accept: boolean) {
    if (busy) return;
    setBusy({ id: inv.id, accept });
    try {
      const r = await respondSquadInvite(inv.id, accept);
      toast(squadRespondedText(accept, inv.squad.name));
      if (accept) openLink(squadPath(r.squadId || inv.squad.id));
    } catch (e) {
      toast(squadInviteErrorText(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  const buttons = (id: string, name: string, onRespond: (accept: boolean) => void) => {
    const mine = busy?.id === id;
    return (
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button full accessibilityLabel={`Rechazar la invitación a ${name}`} loading={mine && !busy?.accept} disabled={!!busy} onPress={() => onRespond(false)}>
            Rechazar
          </Button>
        </View>
        <View style={{ flex: 1 }}>
          <Button variant="primary" full accessibilityLabel={`Aceptar la invitación a ${name}`} loading={mine && busy?.accept} disabled={!!busy} onPress={() => onRespond(true)}>
            Aceptar
          </Button>
        </View>
      </View>
    );
  };

  return (
    <View style={{ gap: 10 }}>
      <SectionHeader title={`Invitaciones (${items.length})`} />
      <Card padded={false} style={{ overflow: 'hidden' }}>
        {items.map((item, i) => {
          const divider = i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null;
          if (item.kind === 'squad') {
            const inv = item.inv;
            const name = inv.squad.name || 'el equipo';
            return (
              <InviteRow
                key={item.id}
                style={divider}
                logo={<Users size={20} color={c.accent} />}
                title={squadTitle(inv.squad)}
                line={`${invitedByLine({ ...inv.invitedBy, username: inv.invitedBy.username ?? '' })} · ${squadKindLabel(inv.squad.sport)}`}
                time={item.at ? relativeTime(item.at, now) : null}
                onView={() => openLink(squadPath(inv.squad.id))}
                viewLabel={`Ver el equipo ${name}`}
                buttons={buttons(item.id, name, (accept) => void respondSquad(inv, accept))}
              />
            );
          }
          const inv = item.inv;
          const league = inv.leagueName || 'la liga';
          const Icon = sportMeta(inv.sport)?.icon;
          return (
            <InviteRow
              key={item.id}
              style={divider}
              logo={Icon ? <Icon size={20} color={c.accent} /> : null}
              title={inv.leagueName || 'Una liga'}
              line={`${inv.scorer ? scorerInvitedLine(inv.invitedBy, inv.scorer.title || league) : invitedByLine(inv.invitedBy)} · ${leagueTypeLabel(inv.kind, inv.visibility)}`}
              time={item.at ? relativeTime(item.at, now) : null}
              onView={() => router.push({ pathname: '/invitacion/[inviteId]', params: { inviteId: inv.id } })}
              viewLabel={`Ver la invitación a ${league}`}
              buttons={buttons(item.id, league, (accept) => void respond(inv, accept))}
            />
          );
        })}
      </Card>
    </View>
  );
}

/** Una fila: el logo, el nombre, quién invitó y qué es, hace cuánto, «Ver» y los botones debajo. */
function InviteRow({
  logo,
  title,
  line,
  time,
  onView,
  viewLabel,
  buttons,
  style,
}: {
  logo: ReactNode;
  title: string;
  line: string;
  time: string | null;
  onView: () => void;
  viewLabel: string;
  buttons: ReactNode;
  style?: object | null;
}) {
  const c = useColors();
  return (
    <View style={[{ gap: 14, paddingVertical: 16, paddingLeft: 18, paddingRight: 16 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
        <View style={[styles.logo, { backgroundColor: c.accentSoft }]}>{logo}</View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="bodyStrong">{title}</Txt>
          <Txt variant="meta" tone="muted">
            {line}
          </Txt>
          {!!time && (
            <Txt tone="muted" style={{ fontSize: 13 }}>
              {time}
            </Txt>
          )}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={viewLabel} hitSlop={8} onPress={onView} style={{ height: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
          <Txt tone="accent" variant="bodyStrong">
            Ver
          </Txt>
        </Pressable>
      </View>
      {buttons}
    </View>
  );
}

const styles = StyleSheet.create({
  logo: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
