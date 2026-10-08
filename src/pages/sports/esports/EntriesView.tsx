import { useState } from 'react';
import { CalendarClock, ClipboardCheck, Gamepad2, ListChecks, MapPin, Settings2, Share2, Trophy, Users } from 'lucide-react';
import type { EsportsEntry, EsportsTournament } from '../../../lib/data/esports';
import { useLeagueCtx } from '../../../lib/league';
import { BR_TIEBREAK_TEXT, GAMES, formatLine, tiebreakText } from '../../../sports/esports';
import { RankChip, TeamLogo } from '../../../components/esports/bits';
import { useFeedback } from '../../../components/feedback';
import { InfoItem, WhatsAppLink } from '../../../components/league/LeagueInfo';
import { whenText } from '../../../components/match';
import { shareLink } from '../../../components/share';
import { Button, Card, Empty, ListRow, SectionHeader, Sheet } from '../../../components/ui';
import { EntryAdminSheet, EntryChip, PendingEntries, entryLine } from './admin/EntriesAdmin';
import { competitors, countLine, formatDetails, freeAgents, memberRank, tournamentPathFor } from './logic';
import { Initials } from './parts';

/**
 * «Equipos» (o «Jugadores» en modo individual) del torneo (§12.8): los inscritos aprobados con su siembra, su
 * plantilla y el check-in; al tocar uno, su plantilla con ID y rango. En «Libre», los agentes libres aparte. Quien
 * organiza (Pro + admin): los pendientes con «Aprobar» y «Rechazar» arriba y el menú de cada inscrito.
 */
export function EntriesView({
  t,
  entries,
  organizer,
  myEntryId,
  onFreeAgents,
}: {
  t: EsportsTournament;
  entries: readonly EsportsEntry[];
  organizer: boolean;
  myEntryId: string | null;
  onFreeAgents?: () => void;
}) {
  const [open, setOpen] = useState<EsportsEntry | null>(null);
  const [admin, setAdmin] = useState<EsportsEntry | null>(null);
  const list = competitors(entries);
  const agents = freeAgents(entries);
  const showCheckin = !!t.checkinMinutes;
  const row = (e: EsportsEntry) => (
    <ListRow
      key={e.id}
      me={e.id === myEntryId}
      dense={organizer}
      leading={e.kind === 'team' ? <TeamLogo path={null} name={e.name} tag={e.tag} className="size-10" /> : <Initials name={e.name} />}
      title={e.tag ? `${e.name} [${e.tag}]` : e.name}
      subtitle={[e.seed ? `Siembra ${e.seed}` : null, entryLine(e)].filter(Boolean).join(' · ')}
      trailing={showCheckin || e.status !== 'approved' ? <EntryChip entry={e} /> : undefined}
      onClick={() => setOpen(e)}
    />
  );
  return (
    <div className="flex flex-col gap-[26px]">
      {organizer && <PendingEntries t={t} entries={entries} />}
      <section aria-labelledby="esp-inscritos">
        <SectionHeader id="esp-inscritos" title={`Inscritos (${countLine(list.length, t.maxEntries)})`} />
        {list.length ? (
          <Card className="overflow-hidden">{list.map(row)}</Card>
        ) : (
          <Empty icon={<Users className="size-8" />} title="Todavía no hay inscritos">
            {t.status === 'registration' ? 'Cuando el organizador apruebe las inscripciones, salen aquí.' : 'Este torneo no tiene inscritos aprobados.'}
          </Empty>
        )}
      </section>
      {t.entryType === 'open' && agents.length > 0 && (
        <section aria-labelledby="esp-agentes">
          <SectionHeader
            id="esp-agentes"
            title={`Agentes libres (${agents.length})`}
            action={
              organizer && onFreeAgents ? (
                <button type="button" onClick={onFreeAgents} className="inline-flex min-h-11 -my-3 items-center text-meta font-[550] text-accent">
                  Repartir
                </button>
              ) : undefined
            }
          />
          <Card className="overflow-hidden">{agents.map(row)}</Card>
        </section>
      )}
      <Sheet
        open={!!open}
        onClose={() => setOpen(null)}
        title={open ? (open.tag ? `${open.name} [${open.tag}]` : open.name) : ''}
        subtitle={open ? entryLine(open) : undefined}
        footer={
          organizer && open ? (
            <Button
              variant="quiet"
              size="lg"
              className="w-full"
              icon={<Settings2 className="size-5" />}
              onClick={() => {
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
    </div>
  );
}

/** La plantilla de un inscrito (la foto): cada uno con su ID de juego, su rango y su rol. */
function Roster({ t, entry }: { t: EsportsTournament; entry: EsportsEntry }) {
  if (!entry.members.length) return <p className="pb-2 text-sm text-muted">Sin plantilla.</p>;
  return (
    <ul className="-mx-1 flex flex-col pb-1">
      {entry.members.map((m, i) => (
        <li key={m.userId} className={i > 0 ? 'border-t border-line' : undefined}>
          <div className="flex min-h-14 items-center gap-3 px-1 py-2">
            <Initials name={m.displayName} className="size-9" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold">{m.displayName}</span>
              <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[13px] text-muted">
                <span className="truncate">{m.gamerTag}</span>
                <RankChip game={t.game} rank={memberRank(t.game, t.mode, m.ranks)} source={m.rankSource} />
              </span>
            </span>
            <span className="shrink-0 text-[12px] font-semibold text-muted">{m.role === 'captain' ? 'Capitán' : m.role === 'sub' ? 'Suplente' : 'Titular'}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * «Info» del torneo: el aviso o las reglas, el juego y el formato completo (mejor de por fase, desempates), las fechas,
 * la sede, el premio, el contacto de la liga y el link para compartir.
 */
export function TournamentInfo({ t, className }: { t: EsportsTournament; className?: string }) {
  const { lid, league } = useLeagueCtx();
  const { toast } = useFeedback();
  const meta = GAMES[t.game];
  const details = formatDetails(t);
  const url = `${typeof location !== 'undefined' ? location.origin : ''}${tournamentPathFor(lid, t.eventId, league.kind)}`;
  const share = async () => {
    if (await shareLink(url, t.name)) toast('Link copiado');
  };
  return (
    <section aria-labelledby="esp-info" className={className}>
      <SectionHeader id="esp-info" title="Info" />
      <div className="flex flex-col gap-3">
        {t.announcement.trim() && (
          <Card className="px-5 py-4">
            <p className="text-sm font-[650] text-fg-2">Reglas y aviso</p>
            <p className="mt-1.5 text-[15px] whitespace-pre-line">{t.announcement}</p>
          </Card>
        )}
        <Card className="px-5 py-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <InfoItem icon={<Gamepad2 className="size-4" />} label="Juego" value={meta.name} />
            <InfoItem icon={<ListChecks className="size-4" />} label="Formato" value={formatLine(t)} />
            <InfoItem icon={<CalendarClock className="size-4" />} label="Empieza" value={whenText(t.startsAt, league.tz, true) ?? '—'} />
            <InfoItem icon={<ClipboardCheck className="size-4" />} label="Cierra la inscripción" value={whenText(t.registrationClosesAt, league.tz, true) ?? '—'} />
            {league.venue?.trim() && <InfoItem icon={<MapPin className="size-4" />} label="Sede" value={league.venue} />}
            {t.prizeText.trim() && <InfoItem icon={<Trophy className="size-4" />} label="Premio" value={t.prizeText} />}
          </dl>
          {league.contactPhone && (
            <div className="mt-3 flex items-center gap-3 border-t border-line pt-3">
              <span className="min-w-0 flex-1 truncate text-sm">{league.contactName ? `Contacto: ${league.contactName}` : 'Contacto del torneo'}</span>
              <WhatsAppLink phone={league.contactPhone} leagueName={t.name} className="h-11" />
            </div>
          )}
        </Card>
        {details.length > 0 && (
          <Card className="px-5 py-4">
            <p className="text-sm font-[650] text-fg-2">Cómo se juega</p>
            <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-[15px]">
              {details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
            <p className="mt-3 text-[13px] text-muted">{t.format === 'br' ? BR_TIEBREAK_TEXT : tiebreakText(t.game)}</p>
          </Card>
        )}
        <Button variant="quiet" size="lg" className="w-full" icon={<Share2 className="size-5" />} onClick={() => void share()}>
          Compartir el torneo
        </Button>
      </div>
    </section>
  );
}
