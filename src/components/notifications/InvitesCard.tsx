import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { MailPlus } from 'lucide-react';
import { respondErrorText, respondInvite, useMyInvites, type LeagueInvite } from '../../lib/data/invites';
import { relativeTime } from '../../lib/notifications';
import { SportIcon } from '../../pages/sports/SportBits';
import { useFeedback } from '../feedback';
import { Badge, Button, Card } from '../ui';
import { invitedByLine, leagueTypeLabel, respondedText } from './inviteText';

/**
 * «Invitaciones» arriba de la lista de Avisos: las invitaciones pendientes de la cuenta a una liga, con Aceptar y
 * Rechazar ahí mismo (aceptar lleva a la liga) y «Ver» para la pantalla completa (/invitacion/<id>, con «¿Quién
 * eres?»). Sin invitaciones no sale.
 */
export function InvitesCard({ uid, now }: { uid: string; now: number }) {
  const invites = useMyInvites(uid);
  const { toast } = useFeedback();
  const navigate = useNavigate();
  // La que se está respondiendo (una a la vez) y con qué botón.
  const [busy, setBusy] = useState<{ id: string; accept: boolean } | null>(null);

  if (!invites.data.length) return null;

  async function respond(inv: LeagueInvite, accept: boolean) {
    if (busy) return;
    setBusy({ id: inv.id, accept });
    try {
      const r = await respondInvite(inv.id, accept);
      toast(respondedText(r.status, inv.leagueName), r.status === 'cancelled' ? 'error' : 'ok');
      if (r.status === 'accepted') navigate(`/l/${r.leagueId || inv.leagueId}`);
    } catch (e) {
      toast(respondErrorText(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="animate-fade-up overflow-hidden">
      <section aria-labelledby="avisos-invitaciones">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <MailPlus className="size-4 text-accent" aria-hidden="true" />
          <h2 id="avisos-invitaciones" className="flex-1 font-semibold">
            Invitaciones
          </h2>
          <Badge tone="accent">{invites.data.length}</Badge>
        </div>
        <ul className="divide-y divide-line">
          {invites.data.map((inv) => {
            const time = Date.parse(inv.createdAt);
            const mine = busy?.id === inv.id;
            const league = inv.leagueName || 'la liga';
            return (
              <li key={inv.id} className="flex flex-col gap-3 px-4 py-3.5">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                    <SportIcon sport={inv.sport} className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="leading-snug font-semibold break-words">{inv.leagueName || 'Una liga'}</p>
                    <p className="text-sm text-muted">
                      {invitedByLine(inv.invitedBy)} · {leagueTypeLabel(inv.kind, inv.visibility)}
                    </p>
                    {Number.isFinite(time) && <p className="text-xs text-muted">{relativeTime(time, now)}</p>}
                  </div>
                  <Link
                    to={`/invitacion/${inv.id}`}
                    aria-label={`Ver la invitación a ${league}`}
                    className="-mr-2 inline-flex h-11 shrink-0 items-center rounded-xl px-3 text-sm font-medium text-accent transition hover:bg-accent-soft"
                  >
                    Ver
                  </Link>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    className="h-11 flex-1"
                    aria-label={`Aceptar la invitación a ${league}`}
                    loading={mine && busy?.accept}
                    disabled={!!busy}
                    onClick={() => void respond(inv, true)}
                  >
                    Aceptar
                  </Button>
                  <Button
                    className="h-11 flex-1"
                    aria-label={`Rechazar la invitación a ${league}`}
                    loading={mine && !busy?.accept}
                    disabled={!!busy}
                    onClick={() => void respond(inv, false)}
                  >
                    Rechazar
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </Card>
  );
}
