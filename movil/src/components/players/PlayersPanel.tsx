import { useMemo, useState, type ReactNode } from 'react';
import { Platform, Pressable, Share, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { BadgeCheck, ChevronRight, Plus, Search, ShieldCheck, UserRound } from 'lucide-react-native';
import { handicapAverages } from '@mm/lib/bowlingSeason';
import { useAllEntries, useEvents, useLeagueMembers, usePlayers } from '@mm/lib/data';
import { useLeagueSeasons } from '@mm/lib/data/seasons';
import { roleLabel, useLeagueCtx } from '@mm/lib/league';
import { shareOrigin } from '@mm/lib/origin';
import { MIN_RANK_GAMES } from '@mm/lib/stats';
import type { Player } from '@mm/lib/types';
import { useNow } from '@mm/lib/useNow';
import { todayIn } from '@mm/pages/sports/racket/logic/time';
import { leagueSport } from '@mm/sports/registry';
import { peopleWord } from '@mm/components/league/logic';
import { usePlayerAttrs } from '@mm/components/players/data';
import { statSummary } from '@mm/components/players/logic';
import { filterPlayers, handicapValue, membersWithoutPlayer, noStats, playerLine, statsByPlayer } from '@mm/components/players/list';
import { toast } from '@/components/feedback';
import { Avatar } from '@/components/social/Avatar';
import { Button, Card, Divider, Empty, Input, LoadError, Loading, SectionHeader, Txt } from '@/components/ui';
import { openOnWeb } from '@/lib/web';
import { useColors } from '@/theme/theme';
import { font, size } from '@/theme/tokens';
import { AddPlayerSheet } from './AddPlayerSheet';
import { MergePlayerSheet } from './MergePlayerSheet';
import { PlayerClaimBadge } from './PlayerClaimBadge';
import { PlayerSheet } from './PlayerSheet';

/** Lo que tarda en irse una hoja antes de abrir otra encima (dos Modal a la vez no se abren en el iPhone). */
const SHEET_CLOSE_MS = 400;

/** Una fila de la lista (la ListRow `dense` de la web): sus iniciales, su nombre con la marca, su línea y el número. */
function Row({
  leading,
  title,
  subtitle,
  value,
  trailing,
  chevron,
  onPress,
  accessibilityLabel,
}: {
  leading: ReactNode;
  title: ReactNode;
  subtitle: ReactNode;
  value?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surface2 : 'transparent' }]}
    >
      {leading}
      <View style={{ flex: 1, minWidth: 0 }}>
        {title}
        {subtitle}
      </View>
      {value}
      {trailing}
      {chevron && <ChevronRight size={18} color={c.faint} />}
    </Pressable>
  );
}

/**
 * Organizar › Jugadores (PlayersPage de la web, con su misma lógica): «Agregar jugador» (el único botón principal), el
 * buscador si son más de 5 y la lista (cada jugador en una fila: sus iniciales, su nombre con la marca de su cuenta,
 * «prom. fijo · 12 juegos · mejor 245» y, en el boliche, el promedio del handicap grande). Tocar a alguien abre su hoja:
 * nombre, el número de su deporte, menor y tutor, su cuenta (vincular o separar), compartir su link, ver su página,
 * juntarlo con otro y eliminarlo. Abajo, los miembros sin jugador. Va dentro de LeagueScope.
 */
export function PlayersPanel({ variant = 'full', addWhere }: { variant?: 'full' | 'accounts'; addWhere?: string | null } = {}) {
  const c = useColors();
  const { lid, league } = useLeagueCtx();
  const accounts = variant === 'accounts';
  const people = peopleWord(league.sport);
  const peopleTitle = people[1].charAt(0).toUpperCase() + people[1].slice(1);
  // Promedio, juegos y mejor son del boliche; los otros deportes muestran sus números en Tabla y en cada jugador.
  const sport = leagueSport(league);
  const bowling = sport === 'bowling';
  const players = usePlayers(lid);
  const members = useLeagueMembers(lid);
  const memberByUid = useMemo(() => new Map(members.data.map((m) => [m.uid, m])), [members.data]);
  // Cuentas sin jugador (quien entró solo para anotar no juega: no sale para vincular).
  const unlinked = membersWithoutPlayer(members.data);
  const entries = useAllEntries(bowling ? lid : undefined);
  const stats = useMemo(() => statsByPlayer(entries.data), [entries.data]);
  // El promedio que toma una inscripción de hoy (el del handicap): la temporada, la anterior, el fijo o el de entrada.
  const events = useEvents(bowling ? lid : undefined);
  const seasons = useLeagueSeasons(bowling ? lid : undefined);
  const now = useNow();
  const today = todayIn(league.tz, now.getTime());
  const handicap = useMemo(
    () => handicapAverages(players.data, entries.data, new Map(events.data.map((e) => [e.id, e.date])), seasons.data, today),
    [players.data, entries.data, events.data, seasons.data, today],
  );
  const [q, setQ] = useState('');
  // El número del deporte de cada uno (nivel, Index, posición y dorsal): sale debajo del nombre.
  const attrs = usePlayerAttrs(bowling ? undefined : lid);
  // Por id: la hoja muestra el jugador en vivo (si alguien se vincula mientras está abierta, se ve).
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = editingId ? (players.data.find((p) => p.id === editingId) ?? null) : null;
  const [adding, setAdding] = useState(false);
  // «Juntar con…» (se abre desde la hoja del jugador, que se cierra: uno de los dos se borra al juntar).
  const [mergingId, setMergingId] = useState<string | null>(null);
  const merging = mergingId ? (players.data.find((p) => p.id === mergingId) ?? null) : null;
  const names = useMemo(() => players.data.map((p) => p.name), [players.data]);

  const filtered = filterPlayers(players.data, q);
  // Terminó con un jugador: su hoja se cierra si sigue abierta en él (mientras esperaba se pudo abrir otra).
  const doneWith = (id: string) => setEditingId((cur) => (cur === id ? null : cur));

  async function share(p: Player) {
    // Con el dominio de la app (no el de la vista previa): es el link que abre la app en el teléfono de quien lo recibe.
    const url = `${shareOrigin(null)}/l/${lid}/j/${p.id}`;
    const title = `${p.name} · MatchMate`;
    try {
      await Share.share(Platform.OS === 'ios' ? { url, title } : { message: url, title }, { dialogTitle: title, subject: title });
    } catch {
      toast('No se pudo compartir.', 'error');
    }
  }

  // La página de un jugador de la app: boliche, golf, natación, raqueta y los deportes de equipo; la de esports, en la web.
  function openPage(p: Player) {
    setEditingId(null);
    if (sport === 'esports') {
      setTimeout(() => void openOnWeb(`/l/${lid}/j/${p.id}`), SHEET_CLOSE_MS);
      return;
    }
    setTimeout(() => router.push({ pathname: '/l/[lid]/j/[playerId]', params: { lid, playerId: p.id } }), SHEET_CLOSE_MS);
  }

  function openMerge(p: Player) {
    setEditingId(null);
    setTimeout(() => setMergingId(p.id), SHEET_CLOSE_MS);
  }

  return (
    <View style={{ gap: 14 }}>
      {accounts && <SectionHeader title={`${peopleTitle} y sus cuentas`} />}
      {/* Una línea, no tres: lo demás se ve en la hoja de cada uno. */}
      <Txt variant="meta" tone="muted" style={{ marginHorizontal: 4 }}>
        {accounts
          ? `Toca a alguien para vincularlo con su cuenta.${addWhere ? ` Para agregar ${people[1]}, usa «${addWhere}».` : ''}`
          : bowling
            ? `El número es el promedio del handicap (con ${MIN_RANK_GAMES} juegos verificados en la temporada).`
            : 'Toca a alguien para cambiar su nombre o su cuenta.'}
      </Txt>
      <Button
        variant={accounts ? 'quiet' : 'primary'}
        size="lg"
        full
        icon={<Plus size={20} color={accounts ? c.fg : c.accentFg} strokeWidth={2.4} />}
        onPress={() => setAdding(true)}
      >
        {`Agregar ${people[0]}`}
      </Button>

      {players.data.length > 5 && (
        <View style={{ justifyContent: 'center' }}>
          <Search size={20} color={c.muted} style={{ position: 'absolute', left: 16, zIndex: 1 }} />
          <Input
            value={q}
            onChangeText={setQ}
            placeholder="Buscar jugador"
            accessibilityLabel="Buscar jugador"
            returnKeyType="search"
            clearButtonMode="while-editing"
            style={{ paddingLeft: 48, backgroundColor: c.surface }}
          />
        </View>
      )}

      {players.error ? (
        <LoadError error={players.error} />
      ) : players.loading && !players.data.length ? (
        <Loading />
      ) : players.data.length === 0 ? (
        <Empty
          icon={<UserRound size={28} color={c.accent} />}
          title={`Todavía no hay ${people[1]}`}
          text={accounts && addWhere ? `Agrégalos en «${addWhere}», o deja que cada miembro cree el suyo al unirse.` : 'Agrégalos o deja que cada miembro cree el suyo al unirse.'}
        />
      ) : (
        <Card padded={false}>
          {filtered.map((p, i) => {
            const s = stats.get(p.id) ?? noStats;
            const avg = handicap.get(p.id);
            const account = p.uid ? memberByUid.get(p.uid) : undefined;
            const summary = bowling ? null : statSummary(sport, attrs.data[p.id]);
            const value = handicapValue(avg);
            const line = playerLine({ bowling, hasAccount: !!p.uid, isMinor: p.isMinor, games: s.games, high: s.high, pending: 0, source: avg?.source, summary });
            return (
              <View key={p.id}>
                {i > 0 && <Divider inset={64} />}
                <Row
                  onPress={() => setEditingId(p.id)}
                  accessibilityLabel={`Editar a ${p.name}`}
                  leading={<Avatar name={p.name} size={36} />}
                  title={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Txt numberOfLines={1} style={{ flexShrink: 1, fontSize: 15, fontFamily: font.semibold }}>
                        {p.name}
                      </Txt>
                      {!!p.uid &&
                        (account && account.role !== 'member' ? (
                          <ShieldCheck size={16} color={c.accent} accessibilityLabel="Admin" />
                        ) : (
                          <BadgeCheck size={16} color={c.accent} accessibilityLabel="Con cuenta" />
                        ))}
                    </View>
                  }
                  subtitle={
                    <Txt tone="muted" numberOfLines={2} style={{ fontSize: 13, marginTop: 2 }}>
                      {line}
                      {s.pending > 0 && (
                        <>
                          {' · '}
                          <Txt style={{ fontSize: 13, fontFamily: font.semibold, color: c.warn }}>{`${s.pending} sin foto`}</Txt>
                        </>
                      )}
                    </Txt>
                  }
                  value={
                    bowling ? (
                      <Txt style={{ fontSize: 19, lineHeight: 21, letterSpacing: -0.4, fontFamily: font.semibold, color: value == null ? c.faint : c.fg }}>{value ?? '—'}</Txt>
                    ) : undefined
                  }
                  trailing={!p.uid && !p.isMinor ? <PlayerClaimBadge playerId={p.id} /> : undefined}
                  chevron={!bowling}
                />
              </View>
            );
          })}
          {filtered.length === 0 && (
            <Txt variant="meta" tone="muted" style={{ textAlign: 'center', paddingHorizontal: 20, paddingVertical: 24 }}>
              {`Nadie coincide con «${q}».`}
            </Txt>
          )}
        </Card>
      )}

      {unlinked.length > 0 && (
        <View style={{ gap: 8, marginTop: 12 }}>
          <SectionHeader title={`Miembros sin jugador (${unlinked.length})`} />
          <Card padded={false}>
            {unlinked.map((u, i) => (
              <View key={u.id}>
                {i > 0 && <Divider inset={64} />}
                <Row
                  leading={<Avatar name={u.name} size={36} />}
                  title={
                    <Txt numberOfLines={1} style={{ fontSize: 15, fontFamily: font.semibold }}>
                      {u.name}
                    </Txt>
                  }
                  subtitle={
                    <Txt tone="muted" numberOfLines={2} style={{ fontSize: 13, marginTop: 2 }}>
                      {[u.role !== 'member' && roleLabel(u.role), 'Su jugador se crea al abrir la liga'].filter(Boolean).join(' · ')}
                    </Txt>
                  }
                />
              </View>
            ))}
          </Card>
        </View>
      )}

      {adding && <AddPlayerSheet onClose={() => setAdding(false)} existingNames={names} />}
      {editing && (
        <PlayerSheet
          key={editing.id}
          player={editing}
          account={editing.uid ? (memberByUid.get(editing.uid) ?? null) : null}
          stats={stats.get(editing.id) ?? noStats}
          handicap={handicap.get(editing.id)}
          attrs={attrs.data[editing.id]}
          members={members.data}
          players={players.data}
          onClose={() => setEditingId(null)}
          onDone={doneWith}
          onShare={() => void share(editing)}
          onOpenPage={() => openPage(editing)}
          onMerge={() => openMerge(editing)}
        />
      )}
      {merging && <MergePlayerSheet key={merging.id} player={merging} players={players.data} onClose={() => setMergingId(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: size.row, paddingHorizontal: 16, paddingVertical: 8 },
});
