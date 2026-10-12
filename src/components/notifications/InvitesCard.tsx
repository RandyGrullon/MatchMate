import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { respondErrorText, respondInvite, useMyInvites, type LeagueInvite } from '../../lib/data/invites';
import { respondSquadInvite, squadPath, useMySquadInvites, type MySquadInvite } from '../../lib/data/squads';
import { relativeTime } from '../../lib/notifications';
import { SportIcon } from '../../pages/sports/SportBits';
import { useFeedback } from '../feedback';
import { LeagueLogo } from '../home/LeagueCard';
import { squadInviteErrorText, squadKindLabel, squadRespondedText, squadTitle } from '../squads/logic';
import { SquadLogo } from '../squads/SquadBits';
import { Badge, Button, Card, SectionHeader } from '../ui';
import { invitedByLine, leagueTypeLabel, respondedText, scorerInvitedLine } from './inviteText';

/** Una invitación de la tarjeta: a una liga (o a anotar) o a un equipo. */
type Item = { kind: 'league'; id: string; at: number; inv: LeagueInvite } | { kind: 'squad'; id: string; at: number; inv: MySquadInvite };

const timeOf = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};

/**
 * «Invitaciones» arriba de la lista de Avisos: las invitaciones pendientes de la cuenta a una liga y a un equipo (la
 * más nueva primero), con Aceptar y Rechazar ahí mismo (aceptar lleva a la liga o al equipo) y «Ver» para la pantalla
 * completa (/invitacion/<id>, con «¿Quién eres?»; la de un equipo abre el equipo). La de anotador dice «te invitó a
 * anotar en …» y al aceptar lleva a ese torneo. Sin invitaciones no sale.
 */
export function InvitesCard({ uid, now }: { uid: string; now: number }) {
  const invites = useMyInvites(uid);
  const squadInvites = useMySquadInvites();
  const { toast } = useFeedback();
  const navigate = useNavigate();
  // La que se está respondiendo (una a la vez) y con qué botón.
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
      if (r.status === 'accepted') navigate(r.scorer?.path ?? `/l/${r.leagueId || inv.leagueId}`);
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
      if (accept) navigate(squadPath(r.squadId || inv.squad.id));
    } catch (e) {
      toast(squadInviteErrorText(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    // Como las secciones del rediseño: el título con cuántas son y, en la tarjeta, una fila por invitación con
    // «Rechazar» (gris) y «Aceptar».
    <section aria-labelledby="avisos-invitaciones" className="animate-fade-up">
      <SectionHeader
        id="avisos-invitaciones"
        title={
          <span className="inline-flex items-center gap-2">
            Invitaciones <Badge tone="accent">{items.length}</Badge>
          </span>
        }
      />
      <Card className="overflow-hidden">
        <ul>
          {items.map((item) => {
            const mine = busy?.id === item.id;
            const buttons = (name: string, onRespond: (accept: boolean) => void) => (
              <div className="flex gap-2.5">
                <Button
                  variant="quiet"
                  size="lg"
                  className="flex-1"
                  aria-label={`Rechazar la invitación a ${name}`}
                  loading={mine && !busy?.accept}
                  disabled={!!busy}
                  onClick={() => onRespond(false)}
                >
                  Rechazar
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  className="flex-1"
                  aria-label={`Aceptar la invitación a ${name}`}
                  loading={mine && busy?.accept}
                  disabled={!!busy}
                  onClick={() => onRespond(true)}
                >
                  Aceptar
                </Button>
              </div>
            );
            if (item.kind === 'squad') {
              const inv = item.inv;
              const name = inv.squad.name || 'el equipo';
              return (
                <InviteRow
                  key={item.id}
                  logo={<SquadLogo squad={inv.squad} className="size-10" />}
                  title={squadTitle(inv.squad)}
                  line={`${invitedByLine({ ...inv.invitedBy, username: inv.invitedBy.username ?? '' })} · ${squadKindLabel(inv.squad.sport)}`}
                  time={item.at ? relativeTime(item.at, now) : null}
                  view={{ to: squadPath(inv.squad.id), label: `Ver el equipo ${name}` }}
                  buttons={buttons(name, (accept) => void respondSquad(inv, accept))}
                />
              );
            }
            const inv = item.inv;
            const league = inv.leagueName || 'la liga';
            return (
              <InviteRow
                key={item.id}
                logo={
                  <LeagueLogo path={inv.logoPath} className="size-10 rounded-xl">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                      <SportIcon sport={inv.sport} className="size-5" />
                    </span>
                  </LeagueLogo>
                }
                title={inv.leagueName || 'Una liga'}
                line={`${inv.scorer ? scorerInvitedLine(inv.invitedBy, inv.scorer.title || league) : invitedByLine(inv.invitedBy)} · ${leagueTypeLabel(inv.kind, inv.visibility)}`}
                time={item.at ? relativeTime(item.at, now) : null}
                view={{ to: `/invitacion/${inv.id}`, label: `Ver la invitación a ${league}` }}
                buttons={buttons(league, (accept) => void respond(inv, accept))}
              />
            );
          })}
        </ul>
      </Card>
    </section>
  );
}

/** Una fila: el logo, el nombre, quién invitó y qué es, hace cuánto, «Ver» y los botones debajo. */
function InviteRow({
  logo,
  title,
  line,
  time,
  view,
  buttons,
}: {
  logo: ReactNode;
  title: string;
  line: string;
  time: string | null;
  view: { to: string; label: string };
  buttons: ReactNode;
}) {
  return (
    <li className="mm-row relative flex flex-col gap-3.5 py-4 pr-[18px] pl-5">
      <div className="flex items-start gap-3.5">
        {logo}
        <div className="min-w-0 flex-1">
          <p className="text-body leading-snug font-semibold break-words">{title}</p>
          <p className="mt-0.5 text-sm text-muted">{line}</p>
          {time && <p className="text-[13px] text-muted">{time}</p>}
        </div>
        <Link
          to={view.to}
          aria-label={view.label}
          className="-my-1 -mr-2 inline-flex h-11 shrink-0 items-center rounded-xl px-3 text-meta font-semibold text-accent transition active:opacity-70"
        >
          Ver
        </Link>
      </div>
      {buttons}
    </li>
  );
}
