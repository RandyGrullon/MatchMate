import { Link } from 'react-router';
import { ChevronRight, Megaphone, MessageCircle } from 'lucide-react';
import { eventLabel, formatDateLong, parseDate, toIsoDate } from '../lib/format';
import { useLeagueCtx, whatsappUrl } from '../lib/league';
import type { BowlingEvent } from '../lib/types';
import { Card } from './ui';

function countdown(date: string) {
  const days = Math.round((parseDate(date).getTime() - parseDate(toIsoDate(new Date())).getTime()) / 86400_000);
  if (days <= 0) return '¡Es hoy!';
  if (days === 1) return 'Mañana';
  if (days < 7) return `En ${days} días`;
  const weeks = Math.round(days / 7);
  return days < 45 ? `En ${weeks} ${weeks === 1 ? 'semana' : 'semanas'}` : `En ${Math.round(days / 30)} meses`;
}

/** Torneos que vienen: los ve toda la liga (también quien entró después del anuncio), con el contacto del admin. */
export function Announcements({ events, hideLink }: { events: BowlingEvent[]; hideLink?: boolean }) {
  const { league, base } = useLeagueCtx();
  const today = toIsoDate(new Date());
  const upcoming = events
    .filter((e) => e.type === 'torneo' && e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 2);
  if (!upcoming.length) return null;

  return (
    <div className="flex flex-col gap-3">
      {upcoming.map((e) => {
        const name = eventLabel(e);
        const contact = league.contactName?.trim();
        return (
          <Card key={e.id} className="animate-fade-up relative overflow-hidden border-accent/30 p-0">
            <div className="bg-gradient-to-br from-accent-soft via-surface to-surface p-4">
              <div className="flex items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-fg shadow-sm">
                  <Megaphone className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold tracking-wide text-accent uppercase">{countdown(e.date)} · Torneo</p>
                  <h3 className="text-lg leading-tight font-bold">{name}</h3>
                  <p className="text-sm text-muted first-letter:uppercase">{formatDateLong(e.date)}</p>
                </div>
              </div>
              {e.announcement?.trim() && <p className="mt-3 text-sm whitespace-pre-line">{e.announcement.trim()}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {league.contactPhone ? (
                  <a
                    href={whatsappUrl(league.contactPhone, `Hola${contact ? ` ${contact}` : ''}, quiero participar en ${name} (${league.name}).`)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#25D366] px-4 text-sm font-semibold text-white shadow-sm transition active:scale-[0.97]"
                  >
                    <MessageCircle className="size-4" /> Escribir a {contact || 'el admin'}
                  </a>
                ) : (
                  contact && <span className="text-sm text-muted">Pregúntale a {contact} para participar.</span>
                )}
                {!hideLink && (
                  <Link to={`${base}/e/${e.id}`} className="inline-flex h-10 items-center gap-1 rounded-xl px-3 text-sm font-medium text-accent hover:bg-accent-soft">
                    Ver torneo <ChevronRight className="size-4" />
                  </Link>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
