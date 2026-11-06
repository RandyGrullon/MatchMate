import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { BadgeCheck, ChevronRight, ExternalLink, Link2, Merge, Trash2, Unlink } from 'lucide-react-native';
import type { SeasonAverage } from '@mm/lib/bowlingSeason';
import { deletePlayer, linkAccountToPlayer, unlinkAccount, updatePlayer } from '@mm/lib/data';
import { setPlayerMinor, useGuardians } from '@mm/lib/data/players';
import { roleLabel, useLeagueCtx } from '@mm/lib/league';
import type { PlayerStats } from '@mm/lib/stats';
import type { Member, Player } from '@mm/lib/types';
import { leagueSport } from '@mm/sports/registry';
import { saveSportStats } from '@mm/components/players/data';
import { draftFromAttrs, guardianProblem, parseStats, statKind, type GuardianDraft, type StatDraft } from '@mm/components/players/logic';
import {
  accountOptionLabel,
  averageHint,
  deletePlayerMessage,
  guardianDraftOf,
  handicapSubtitle,
  linkCandidates,
  linkMessage,
  minorChanged,
  unlinkMessage,
} from '@mm/components/players/list';
import { confirmAsync } from '@/components/feedback';
import { runAction } from '@/components/swimming/parts';
import { Button, Field, Input, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { size } from '@/theme/tokens';
import { GuardianFields, MinorCheck, PickField, SportStatFields } from './fields';

/** Una fila de la hoja (las filas de abajo de la web): su ícono en la caja, qué hace y una línea. */
function SheetRow({
  icon,
  title,
  subtitle,
  onPress,
  danger,
  busy,
  chevron = true,
  accessibilityLabel,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  onPress: () => unknown;
  danger?: boolean;
  busy?: boolean;
  chevron?: boolean;
  accessibilityLabel?: string;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}. ${subtitle}` : title)}
      accessibilityState={{ busy: !!busy }}
      onPress={() => void onPress()}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surface2 : 'transparent' }]}
    >
      <View style={[styles.rowIcon, { backgroundColor: danger ? c.dangerSoft : c.accentSoft }]}>{busy ? <ActivityIndicator color={danger ? c.danger : c.accent} /> : icon}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="bodyStrong" tone={danger ? 'danger' : 'fg'} numberOfLines={1}>
          {title}
        </Txt>
        {!!subtitle && (
          <Txt variant="meta" tone="muted" numberOfLines={2}>
            {subtitle}
          </Txt>
        )}
      </View>
      {chevron && <ChevronRight size={18} color={c.faint} />}
    </Pressable>
  );
}

/**
 * La hoja de un jugador (PlayerFormModal de la web, con su misma lógica): su nombre, el número de su deporte, menor y
 * tutor, su cuenta (vincular o separar) y, en filas, compartir su link, ver su página, juntarlo con otro y eliminarlo.
 * «Guardar» abajo. Se monta abierta en un jugador: empieza de lo guardado. `onDone(id)`: terminó con ese jugador (se
 * cierra si sigue abierta en él).
 */
export function PlayerSheet({
  player,
  account,
  stats,
  handicap,
  attrs,
  members,
  players,
  onClose,
  onDone,
  onShare,
  onOpenPage,
  onMerge,
}: {
  player: Player;
  account: Member | null;
  stats: PlayerStats;
  handicap: SeasonAverage | undefined;
  attrs: unknown;
  members: Member[];
  players: Player[];
  onClose: () => void;
  onDone: (playerId: string) => void;
  /** «Compartir su link» (la hoja de compartir del teléfono). */
  onShare: () => void;
  /** «Ver su página» (/l/<liga>/j/<jugador>). */
  onOpenPage: () => void;
  /** «Juntar con…»: cierra la hoja y abre la de juntar. */
  onMerge: () => void;
}) {
  const c = useColors();
  const { lid, league } = useLeagueCtx();
  const sport = leagueSport(league);
  const bowling = sport === 'bowling';
  const swimming = statKind(sport) === 'swimming';
  const [name, setName] = useState(player.name);
  const [draft, setDraft] = useState<StatDraft>(() => draftFromAttrs(sport, attrs, player.averageOverride ?? null));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'guardar' | 'eliminar' | null>(null);
  // Liga con menores (menos natación, que lo hace en Nadadores): marcar o desmarcar a un jugador sin cuenta como menor,
  // con su tutor y el permiso (set_player_minor). Los datos del tutor solo los leen los admins y no se guardan.
  const minorsOk = !!league.hasMinors && !swimming && !player.uid;
  const guardians = useGuardians(lid, minorsOk);
  const saved = guardians.data[player.id];
  const [isMinor, setIsMinor] = useState(!!player.isMinor);
  // El tutor guardado llega aparte (solo admins): se ve cuando llega, hasta que se escribe encima.
  const [typed, setTyped] = useState<GuardianDraft | null>(null);
  const guardian = typed ?? guardianDraftOf(saved);

  async function submit() {
    if (busy) return;
    const parsed = parseStats(sport, draft);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    const changed = minorChanged({ minorsOk, isMinor, wasMinor: !!player.isMinor, guardian, saved });
    const problem = changed && isMinor ? guardianProblem(guardian) : null;
    if (problem) {
      setError(problem);
      return;
    }
    const before = parseStats(sport, draftFromAttrs(sport, attrs, player.averageOverride ?? null));
    setError(null);
    setBusy('guardar');
    await runAction(async () => {
      await updatePlayer(lid, player.id, bowling ? { name: name.trim(), averageOverride: parsed.stats.averageOverride } : { name: name.trim() });
      if (!bowling && !swimming) await saveSportStats(lid, sport, player.id, parsed.stats, before.ok ? before.stats : undefined);
      if (changed) await setPlayerMinor(lid, player.id, isMinor ? guardian : null);
    }, 'Jugador actualizado');
    setBusy(null);
    onDone(player.id);
  }

  async function remove() {
    if (busy) return;
    const ok = await confirmAsync({ title: `¿Eliminar a ${player.name}?`, message: deletePlayerMessage(bowling, stats), confirmText: 'Eliminar', danger: true });
    if (!ok) return;
    // Se cierra al terminar: mientras, «Eliminar» da vueltas.
    setBusy('eliminar');
    await runAction(() => deletePlayer(lid, player.id, player.uid), 'Jugador eliminado');
    setBusy(null);
    onDone(player.id);
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={player.name || 'Editar jugador'}
      subtitle={handicapSubtitle(handicap)}
      footer={
        // El nombre es obligatorio (el `required` de la web).
        <Button variant="primary" size="xl" full loading={busy === 'guardar'} disabled={!!busy || !name.trim()} onPress={() => void submit()}>
          Guardar
        </Button>
      }
    >
      <View style={{ gap: 16 }}>
        <Field label="Nombre">
          <Input maxLength={60} value={name} onChangeText={setName} placeholder="Nombre y apellido" accessibilityLabel="Nombre" />
        </Field>
        {!swimming && <SportStatFields sport={sport} draft={draft} onChange={setDraft} averageHint={averageHint(handicap)} />}
        {minorsOk && <MinorCheck checked={isMinor} onChange={setIsMinor} />}
        {minorsOk && isMinor && <GuardianFields value={guardian} onChange={setTyped} />}
        {!!error && (
          <Txt variant="meta" tone="danger" accessibilityRole="alert" accessibilityLiveRegion="polite">
            {error}
          </Txt>
        )}
      </View>
      <AccountSection player={player} account={account} members={members} players={players} onDone={onDone} />
      <View style={{ marginHorizontal: -20, marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }}>
        <SheetRow icon={<Link2 size={19} color={c.accent} />} title="Compartir su link" subtitle="Su página con sus números" onPress={onShare} />
        <SheetRow icon={<ExternalLink size={19} color={c.accent} />} title="Ver su página" onPress={onOpenPage} />
        {players.length > 1 && (
          <SheetRow icon={<Merge size={19} color={c.accent} />} title="Juntar con…" subtitle="Si está dos veces en la lista: queda uno solo, con todo" onPress={onMerge} />
        )}
        <SheetRow
          icon={<Trash2 size={19} color={c.danger} />}
          title="Eliminar"
          subtitle="Se borran también sus resultados"
          onPress={remove}
          danger
          busy={busy === 'eliminar'}
          chevron={false}
          accessibilityLabel={`Eliminar a ${player.name}`}
        />
      </View>
    </Sheet>
  );
}

/**
 * Cuenta del jugador (AccountSection de la web). Cada cuenta juega con su propio jugador (se crea al unirse); un jugador
 * sin cuenta (lo agregó el admin o vino de un torneo importado) se puede unir con la cuenta de quien es, y una cuenta
 * mal vinculada se separa. Los roles se cambian en Miembros.
 */
function AccountSection({
  player,
  account,
  members,
  players,
  onDone,
}: {
  player: Player;
  account: Member | null;
  members: Member[];
  players: Player[];
  /** Terminó (con el id del jugador): se cierra la ficha. */
  onDone: (playerId: string) => void;
}) {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const [who, setWho] = useState('');
  const [busy, setBusy] = useState<'vincular' | 'desvincular' | null>(null);
  const nameOf = (id: string | null) => players.find((p) => p.id === id)?.name ?? null;

  if (!player.uid) {
    const candidates = linkCandidates(members, player.id);
    const link = async () => {
      const picked = candidates.find((m) => m.id === who);
      if (!picked || busy) return;
      const ok = await confirmAsync({ title: 'Vincular con la cuenta', message: linkMessage(player.name, picked, nameOf), confirmText: 'Vincular' });
      if (!ok) return;
      // La cuenta como está ahora (pudo cambiar mientras se confirmaba); el resto se decide con el servidor.
      const m = members.find((x) => x.id === picked.id) ?? picked;
      setBusy('vincular');
      await runAction(() => linkAccountToPlayer(lid, m, player.id), `${player.name} ahora es de ${m.name}`);
      setBusy(null);
      onDone(player.id);
    };
    return (
      <View style={[styles.account, { backgroundColor: c.surface2 }]}>
        <Txt variant="bodyStrong">Sin cuenta</Txt>
        <Txt variant="meta" tone="muted">
          Si ya se unió (quizá con otro nombre), vincúlalo con su cuenta: sus juegos pasan a su perfil.
        </Txt>
        {candidates.length > 0 && (
          <View style={{ gap: 10 }}>
            <PickField
              label="Cuenta"
              options={[{ key: '', label: '— Elegir cuenta —' }, ...candidates.map((m) => ({ key: m.id, label: accountOptionLabel(m, nameOf) }))]}
              value={who}
              onChange={setWho}
            />
            <Button variant="primary" full icon={<Link2 size={16} color={c.accentFg} />} loading={busy === 'vincular'} disabled={!who || !!busy} onPress={() => void link()}>
              Vincular
            </Button>
          </View>
        )}
      </View>
    );
  }

  const uid = player.uid;
  const unlink = async () => {
    if (busy) return;
    const ok = await confirmAsync({ title: 'Desvincular cuenta', message: unlinkMessage(account?.name, player.name), confirmText: 'Desvincular', danger: true });
    if (!ok) return;
    setBusy('desvincular');
    await runAction(() => unlinkAccount(lid, player.id, { uid, name: account?.name ?? player.name }), 'Cuenta desvinculada');
    setBusy(null);
    onDone(player.id);
  };

  return (
    <View style={[styles.account, styles.linked, { backgroundColor: c.surface2 }]}>
      <BadgeCheck size={20} color={c.accent} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="bodyStrong" numberOfLines={1}>
          {account?.name ?? 'Cuenta vinculada'}
        </Txt>
        <Txt variant="meta" tone="muted">
          {account && account.role !== 'member' ? `${roleLabel(account.role)} · con cuenta` : 'Con cuenta'}
        </Txt>
      </View>
      <Button icon={<Unlink size={16} color={c.fg} />} loading={busy === 'desvincular'} disabled={!!busy} onPress={() => void unlink()} style={{ backgroundColor: c.surface }}>
        Desvincular
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: size.row, paddingHorizontal: 20, paddingVertical: 10 },
  rowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  account: { marginTop: 8, borderRadius: 16, padding: 16, gap: 10 },
  linked: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingRight: 12 },
});
