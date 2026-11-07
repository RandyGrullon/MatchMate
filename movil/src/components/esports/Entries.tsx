/**
 * «Equipos» (o «Jugadores») e «Info» del torneo de esports (EntriesView.tsx de la web, Lite): los inscritos aprobados
 * con su siembra, su plantilla y el check-in; al tocar uno, su plantilla con ID y rango; en «Libre», los agentes libres
 * aparte. «Info»: el aviso o las reglas, el juego, la plataforma, el formato, las fechas, la sede, el premio, el
 * contacto y «Compartir el torneo». Quien organiza: los pendientes con «Aprobar» y «Rechazar» arriba, «Repartir» en
 * los agentes libres y, en la plantilla, «Opciones del organizador» (siembra, check-in y nombre).
 */
import { useState, type ReactNode } from 'react';
import { Linking, Pressable, Share, StyleSheet, View } from 'react-native';
import { CalendarClock, ClipboardCheck, Gamepad2, ListChecks, MapPin, MessageCircle, MonitorSmartphone, Settings2, Share2, Trophy, Users } from 'lucide-react-native';
import type { EsportsEntry, EsportsTournament } from '@mm/lib/data/esports';
import { useLeagueCtx, whatsappUrl } from '@mm/lib/league';
import { shareOrigin } from '@mm/lib/origin';
import { whenText } from '@mm/components/match/format';
import { BR_TIEBREAK_TEXT, GAMES, formatLine, platformInfoText, tiebreakText } from '@mm/sports/esports';
import { competitors, countLine, entryLine, formatDetails, freeAgents, memberRank, memberRoleText, tournamentPathFor } from '@mm/pages/sports/esports/logic';
import { EntryStatusChip, Initials, RankChip, TeamLogo } from './bits';
import { EntryAdminSheet, PendingEntries } from './EntriesAdmin';
import { toast } from '../feedback';
import { Button, Card, Empty, ListRow, SectionHeader, Sheet, Txt } from '../ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

export function EntriesView({
  t,
  entries,
  organizer = false,
  myEntryId,
  onFreeAgents,
}: {
  t: EsportsTournament;
  entries: readonly EsportsEntry[];
  organizer?: boolean;
  myEntryId: string | null;
  onFreeAgents?: () => void;
}) {
  const c = useColors();
  const [open, setOpen] = useState<EsportsEntry | null>(null);
  const [admin, setAdmin] = useState<EsportsEntry | null>(null);
  const list = competitors(entries);
  const agents = freeAgents(entries);
  const showCheckin = !!t.checkinMinutes;
  const row = (e: EsportsEntry, i: number) => (
    <View key={e.id} style={[i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null, e.id === myEntryId && { backgroundColor: c.accentSoft }]}>
      <ListRow
        icon={e.kind === 'team' ? <TeamLogo path={null} name={e.name} tag={e.tag} /> : <Initials name={e.name} />}
        title={e.tag ? `${e.name} [${e.tag}]` : e.name}
        subtitle={[e.seed ? `Siembra ${e.seed}` : null, entryLine(e)].filter(Boolean).join(' · ')}
        right={showCheckin || e.status !== 'approved' ? <EntryStatusChip status={e.status} checkedIn={!!e.checkedInAt} /> : undefined}
        onPress={() => setOpen(e)}
      />
    </View>
  );
  return (
    <View style={{ gap: 26 }}>
      {organizer && <PendingEntries t={t} entries={entries} />}
      <View style={{ gap: 10 }}>
        <SectionHeader title={`Inscritos (${countLine(list.length, t.maxEntries)})`} />
        {list.length ? (
          <Card padded={false}>{list.map(row)}</Card>
        ) : (
          <Empty
            icon={<Users size={28} color={c.accent} />}
            title="Todavía no hay inscritos"
            text={t.status === 'registration' ? 'Cuando el organizador apruebe las inscripciones, salen aquí.' : 'Este torneo no tiene inscritos aprobados.'}
          />
        )}
      </View>
      {t.entryType === 'open' && agents.length > 0 && (
        <View style={{ gap: 10 }}>
          <SectionHeader
            title={`Agentes libres (${agents.length})`}
            action={
              organizer && onFreeAgents ? (
                <Pressable accessibilityRole="button" onPress={onFreeAgents} style={{ minHeight: 44, justifyContent: 'center' }}>
                  <Txt variant="meta" tone="accent" style={{ fontFamily: font.semibold }}>
                    Repartir
                  </Txt>
                </Pressable>
              ) : undefined
            }
          />
          <Card padded={false}>{agents.map(row)}</Card>
        </View>
      )}
      <Sheet
        open={!!open}
        onClose={() => setOpen(null)}
        title={open ? (open.tag ? `${open.name} [${open.tag}]` : open.name) : ''}
        subtitle={open ? entryLine(open) : undefined}
        footer={
          organizer && open ? (
            <Button
              size="lg"
              full
              icon={<Settings2 size={20} color={c.fg} />}
              onPress={() => {
                setAdmin(open);
                setOpen(null);
              }}
            >
              Opciones del organizador
            </Button>
          ) : undefined
        }
      >
        {open && <Roster t={t} entry={open} />}
      </Sheet>
      <EntryAdminSheet key={admin?.id ?? 'ninguno'} t={t} entry={admin} onClose={() => setAdmin(null)} />
    </View>
  );
}

/** La plantilla de un inscrito (la foto): cada uno con su ID de juego, su rango y su rol. */
function Roster({ t, entry }: { t: EsportsTournament; entry: EsportsEntry }) {
  const c = useColors();
  if (!entry.members.length) {
    return (
      <Txt variant="meta" tone="muted">
        Sin plantilla.
      </Txt>
    );
  }
  return (
    <View>
      {entry.members.map((m, i) => (
        <View key={m.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: c.line }}>
          <Initials name={m.displayName} size={36} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Txt numberOfLines={1} style={{ fontSize: 15, fontFamily: font.semibold }}>
              {m.displayName}
            </Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              <Txt tone="muted" numberOfLines={1} style={{ fontSize: 13 }}>
                {m.gamerTag}
              </Txt>
              <RankChip game={t.game} rank={memberRank(t.game, t.mode, m.ranks)} source={m.rankSource} />
            </View>
          </View>
          <Txt tone="muted" style={{ fontSize: 12, fontFamily: font.semibold }}>
            {memberRoleText(m.role)}
          </Txt>
        </View>
      ))}
    </View>
  );
}

function InfoItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
      <View style={{ marginTop: 2 }}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt tone="muted" style={{ fontSize: 12 }}>
          {label}
        </Txt>
        <Txt variant="meta">{value}</Txt>
      </View>
    </View>
  );
}

/**
 * «Info» del torneo: el aviso o las reglas, el juego y el formato completo (mejor de por fase, desempates), las fechas,
 * la sede, el premio, el contacto de la liga y el link para compartir.
 */
export function TournamentInfo({ t }: { t: EsportsTournament }) {
  const c = useColors();
  const { lid, league } = useLeagueCtx();
  const meta = GAMES[t.game];
  const details = formatDetails(t);
  const url = `${shareOrigin(null)}${tournamentPathFor(lid, t.eventId, league.kind)}`;
  const icon = (I: typeof Gamepad2) => <I size={16} color={c.accent} />;
  async function share() {
    try {
      await Share.share({ message: `${t.name}\n${url}`, url });
    } catch {
      toast('No se pudo compartir.', 'error');
    }
  }
  return (
    <View style={{ gap: 12 }}>
      <SectionHeader title="Info" />
      {!!t.announcement.trim() && (
        <Card style={{ paddingVertical: 16, gap: 6 }}>
          <Txt tone="fg2" variant="meta" style={{ fontFamily: font.bold }}>
            Reglas y aviso
          </Txt>
          <Txt style={{ fontSize: 15 }}>{t.announcement}</Txt>
        </Card>
      )}
      <Card style={{ paddingVertical: 16, gap: 12 }}>
        <InfoItem icon={icon(Gamepad2)} label="Juego" value={meta.name} />
        <InfoItem icon={icon(MonitorSmartphone)} label="Plataforma" value={platformInfoText(t.game, t.settings.platform)} />
        <InfoItem icon={icon(ListChecks)} label="Formato" value={formatLine(t)} />
        <InfoItem icon={icon(CalendarClock)} label="Empieza" value={whenText(t.startsAt, league.tz, true) ?? '—'} />
        <InfoItem icon={icon(ClipboardCheck)} label="Cierra la inscripción" value={whenText(t.registrationClosesAt, league.tz, true) ?? '—'} />
        {!!league.venue?.trim() && <InfoItem icon={icon(MapPin)} label="Sede" value={league.venue} />}
        {!!t.prizeText.trim() && <InfoItem icon={icon(Trophy)} label="Premio" value={t.prizeText} />}
        {!!league.contactPhone && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, paddingTop: 12 }}>
            <Txt variant="meta" numberOfLines={1} style={{ flex: 1 }}>
              {league.contactName ? `Contacto: ${league.contactName}` : 'Contacto del torneo'}
            </Txt>
            <Button icon={<MessageCircle size={16} color={c.ok} />} onPress={() => void Linking.openURL(whatsappUrl(league.contactPhone, `Hola, te escribo por ${t.name} (MatchMate).`))}>
              WhatsApp
            </Button>
          </View>
        )}
      </Card>
      {details.length > 0 && (
        <Card style={{ paddingVertical: 16, gap: 6 }}>
          <Txt tone="fg2" variant="meta" style={{ fontFamily: font.bold }}>
            Cómo se juega
          </Txt>
          {details.map((d) => (
            <Txt key={d} style={{ fontSize: 15 }}>{`•  ${d}`}</Txt>
          ))}
          <Txt tone="muted" style={{ fontSize: 13, marginTop: 6 }}>
            {t.format === 'br' ? BR_TIEBREAK_TEXT : tiebreakText(t.game)}
          </Txt>
        </Card>
      )}
      <Button size="lg" full icon={<Share2 size={20} color={c.fg} />} onPress={share}>
        Compartir el torneo
      </Button>
    </View>
  );
}
