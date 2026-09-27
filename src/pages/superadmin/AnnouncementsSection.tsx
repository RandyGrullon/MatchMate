import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Bell, Megaphone, Send, Trophy, Users, Volleyball, UserCog, X } from 'lucide-react';
import { Logo } from '../../components/Logo';
import { asBackendError } from '../../lib/db/errors';
import { useFeedback } from '../../components/feedback';
import { Badge, Button, Card, Empty, Field, Input, Select, Skeleton, cx } from '../../components/ui';
import {
  countAnnouncementRecipients,
  sendAnnouncement,
  useAdminAudit,
  useAdminLeagues,
  type AdminAuditEntry,
  type AnnouncementAudience,
} from '../../lib/data/admin';
import { SPORT_LIST, sportMeta } from '../../sports/registry';
import { SportBadge } from '../sports/SportBits';
import { Counter, ErrorRetry, Pager, Panel, SearchBox, SectionHeader, TextArea } from './bits';
import { fmtDateTime, fmtNum, plural, relativeTime } from './format';
import { intParam, useDebounced, useRun, useSearchState } from './hooks';
import { BODY_MAX, TITLE_MAX, audienceKey, audienceLabel, cleanAnnouncement, validateAnnouncement } from './model';
import { sectionMeta } from './sections';

type AudienceKind = AnnouncementAudience['kind'];

const AUDIENCES: readonly { kind: AudienceKind; label: string; hint: string; icon: typeof Users }[] = [
  { kind: 'all', label: 'Todos', hint: 'Todas las cuentas con avisos activados', icon: Users },
  { kind: 'sport', label: 'Un deporte', hint: 'Miembros de ligas de ese deporte', icon: Volleyball },
  { kind: 'league', label: 'Una liga', hint: 'Los miembros de una liga o torneo', icon: Trophy },
  { kind: 'admins', label: 'Admins de ligas', hint: 'Dueños y admins de todas las ligas', icon: UserCog },
];

/** Cuántas cuentas recibirían el anuncio (se vuelve a contar un momento después de cambiar el público). */
function useRecipients(audience: AnnouncementAudience | null) {
  const key = audience ? audienceKey(audience) : null;
  const debouncedKey = useDebounced(key, 400);
  const [state, setState] = useState<{ key: string | null; count: number | null; error: boolean }>({ key: null, count: null, error: false });
  useEffect(() => {
    if (!debouncedKey || !audience || audienceKey(audience) !== debouncedKey) return;
    let alive = true;
    countAnnouncementRecipients(audience).then(
      (count) => alive && setState({ key: debouncedKey, count, error: false }),
      (e) => {
        console.error(e);
        if (alive) setState({ key: debouncedKey, count: null, error: true });
      },
    );
    return () => {
      alive = false;
    };
    // El público se identifica por su clave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedKey]);
  const fresh = state.key === key;
  return { count: fresh ? state.count : null, loading: !!key && !fresh, error: fresh && state.error };
}

/** Anuncios: escribir un aviso push, elegir a quién, ver cómo se ve, mandarlo y ver los anteriores. */
export default function AnnouncementsSection() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [kind, setKind] = useState<AudienceKind>('all');
  const [sport, setSport] = useState<string>(SPORT_LIST[0]?.id ?? 'bowling');
  const [league, setLeague] = useState<{ id: string; name: string } | null>(null);
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const run = useRun();
  const { confirm, toast } = useFeedback();

  const audience: AnnouncementAudience | null =
    kind === 'sport' ? { kind, sport } : kind === 'league' ? (league ? { kind, leagueId: league.id } : null) : { kind };
  const input = { title, body, url, audience: audience ?? { kind: 'league' as const, leagueId: '' } };
  const errors = validateAnnouncement(input);
  const valid = Object.keys(errors).length === 0;
  const recipients = useRecipients(audience);
  const who = audience ? audienceLabel(audience, league?.name) : 'Elige la liga';

  async function send() {
    setTouched(true);
    if (!valid || !audience) return;
    const n = recipients.count;
    const ok = await confirm({
      title: '¿Mandar el anuncio?',
      message: (
        <>
          <span className="block">
            Le llega a <strong className="text-fg">{n == null ? 'las cuentas elegidas' : plural(n, 'cuenta', 'cuentas')}</strong> ({who.toLowerCase()}).
          </span>
          <span className="mt-2 block">No se puede deshacer. Máximo 5 anuncios por hora.</span>
        </>
      ),
      confirmText: n == null ? 'Mandar' : `Mandar a ${fmtNum(n)}`,
    });
    if (!ok) return;
    setSending(true);
    let sent = 0;
    const done = await run(
      async () => {
        sent = (await sendAnnouncement(cleanAnnouncement({ ...input, audience }))).recipients;
      },
      undefined,
      (e) => (asBackendError(e)?.kind === 'rate_limited' ? 'Ya se mandaron 5 anuncios en la última hora. Espera un rato.' : null),
    );
    setSending(false);
    if (done) {
      // El aviso de «listo» con el número que devolvió la base.
      toast(`Anuncio en camino a ${plural(sent, 'cuenta', 'cuentas')}`);
      setTitle('');
      setBody('');
      setUrl('');
      setTouched(false);
    }
  }

  return (
    <>
      <SectionHeader title="Anuncios" hint={sectionMeta('anuncios').hint} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="Nuevo anuncio" subtitle="Llega como aviso al teléfono de quienes activaron los avisos">
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <Field label="Título" hint={<Counter value={title} max={TITLE_MAX} />}>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej.: Ya llegó el pádel a MatchMate"
                maxLength={TITLE_MAX + 20}
                aria-invalid={touched && !!errors.title}
                className="max-sm:h-11"
              />
            </Field>
            {touched && errors.title && <p className="-mt-3 text-xs text-danger">{errors.title}</p>}

            <Field label="Mensaje" hint={<Counter value={body} max={BODY_MAX} />}>
              <TextArea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Lo que quieres decir, corto y claro."
                maxLength={BODY_MAX + 40}
                rows={3}
                aria-invalid={touched && !!errors.body}
              />
            </Field>
            {touched && errors.body && <p className="-mt-3 text-xs text-danger">{errors.body}</p>}

            <Field label="Al tocarlo, abrir (opcional)" hint="Una ruta de la app, por ejemplo /ligas o /l/<id>. Vacío = la portada.">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="/ligas" inputMode="url" autoCapitalize="off" spellCheck={false} aria-invalid={!!errors.url} className="max-sm:h-11" />
            </Field>
            {errors.url && url.trim() && <p className="-mt-3 text-xs text-danger">{errors.url}</p>}

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-xs font-medium text-muted">¿A quién?</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {AUDIENCES.map((a) => (
                  <label
                    key={a.kind}
                    className={cx(
                      'flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition',
                      kind === a.kind ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2',
                    )}
                  >
                    <input type="radio" name="mm-audience" value={a.kind} checked={kind === a.kind} onChange={() => setKind(a.kind)} className="mt-0.5 size-4 accent-[var(--accent)]" />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        <a.icon className="size-4 text-muted" aria-hidden="true" />
                        {a.label}
                      </span>
                      <span className="block text-xs text-muted">{a.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              {kind === 'sport' && (
                <Field label="Deporte">
                  <Select value={sport} onChange={(e) => setSport(e.target.value)} className="max-sm:h-11">
                    {SPORT_LIST.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {kind === 'league' && <LeaguePicker value={league} onChange={setLeague} />}
              {touched && errors.audience && <p className="text-xs text-danger">{errors.audience}</p>}
            </fieldset>

            <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm" aria-live="polite">
                {!audience ? (
                  <span className="text-muted">Elige la liga para contar a quién le llega.</span>
                ) : recipients.loading ? (
                  <span className="inline-flex items-center gap-2 text-muted">
                    <Skeleton className="inline-block h-4 w-10 align-middle" /> contando…
                  </span>
                ) : recipients.error ? (
                  <span className="text-warn">No se pudo contar a quién le llega.</span>
                ) : (
                  <>
                    Le llega a <strong>{plural(recipients.count ?? 0, 'cuenta', 'cuentas')}</strong>
                    <span className="block text-xs text-muted">{who}</span>
                  </>
                )}
              </p>
              <Button type="submit" variant="primary" icon={<Send className="size-4" />} loading={sending} disabled={recipients.count === 0} className="max-sm:min-h-11">
                Mandar anuncio
              </Button>
            </div>
          </form>
        </Panel>

        <div className="flex flex-col gap-3 lg:sticky lg:top-20 lg:self-start">
          <p className="text-xs font-medium text-muted">Así se ve en el teléfono</p>
          <PhonePreview title={title.trim() || 'Título del anuncio'} body={body.trim() || 'El mensaje sale aquí.'} empty={!title.trim() && !body.trim()} />
          <p className="text-xs text-muted">Cada teléfono lo muestra un poco distinto. Los textos largos se cortan.</p>
        </div>
      </div>

      <History />
    </>
  );
}

/** Buscar y elegir una liga (para mandar el anuncio solo a sus miembros). */
function LeaguePicker({ value, onChange }: { value: { id: string; name: string } | null; onChange: (v: { id: string; name: string } | null) => void }) {
  const [text, setText] = useState('');
  const q = useDebounced(text.trim());
  const results = useAdminLeagues(!value && q.length > 0, { search: q, sort: 'activity', page: 0, pageSize: 8 });
  if (value)
    return (
      <div className="flex min-h-11 items-center gap-2 rounded-xl border border-accent bg-accent-soft px-3 py-2">
        <Trophy className="size-4 text-accent" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{value.name}</span>
        <Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={() => onChange(null)} aria-label="Cambiar la liga" className="max-sm:size-11" />
      </div>
    );
  return (
    <div className="flex flex-col gap-2">
      <SearchBox label="Buscar la liga" placeholder="Buscar la liga por nombre" value={text} onChange={setText} />
      {q.length > 0 &&
        (results.error ? (
          <ErrorRetry error={results.error} compact />
        ) : results.loading && !results.data.rows.length ? (
          <Skeleton className="h-24" />
        ) : !results.data.rows.length ? (
          <p className="px-1 text-sm text-muted">No hay ligas con «{q}».</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line" aria-label="Ligas encontradas">
            {results.data.rows.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => onChange({ id: l.id, name: l.name })}
                  className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{l.name}</span>
                  <SportBadge sport={l.sport} />
                  <span className="text-xs text-muted tabular-nums">{fmtNum(l.members)} miembros</span>
                </button>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

/** Vista previa del aviso como sale en la pantalla bloqueada. */
export function PhonePreview({ title, body, empty }: { title: string; body: string; empty?: boolean }) {
  return (
    <div className="rounded-[2rem] border border-line bg-surface-2 p-3 shadow-inner" aria-label="Vista previa del aviso">
      <div className="mb-10 text-center text-3xl font-light tracking-tight text-muted tabular-nums" aria-hidden="true">
        9:41
      </div>
      <div className={cx('rounded-2xl bg-surface/95 p-3 shadow-lg backdrop-blur', empty && 'opacity-60')}>
        <div className="mb-1 flex items-center gap-2 text-[11px] text-muted">
          <Logo className="size-4" />
          <span className="font-medium tracking-wide uppercase">MatchMate</span>
          <span className="ml-auto">ahora</span>
        </div>
        <p className="line-clamp-1 text-sm font-semibold break-words">{title}</p>
        <p className="line-clamp-3 text-sm break-words text-fg/90">{body}</p>
      </div>
    </div>
  );
}

const detailStr = (d: Record<string, unknown>, k: string) => (typeof d[k] === 'string' ? (d[k] as string) : null);

/** Texto del público guardado en la auditoría (lo que se pueda leer). */
function historyAudience(d: Record<string, unknown>): string | null {
  const a = d.audience;
  if (a && typeof a === 'object') {
    const kind = (a as { kind?: unknown }).kind;
    if (kind === 'all') return 'Todos';
    if (kind === 'admins') return 'Admins de ligas';
    if (kind === 'sport') return sportMeta(String((a as { sport?: unknown }).sport ?? ''))?.label ?? 'Un deporte';
    if (kind === 'league') return detailStr(d, 'league_name') ?? 'Una liga';
  }
  return detailStr(d, 'audience');
}

/** Anuncios mandados (de la auditoría). */
function History() {
  const s = useSearchState();
  const page = Math.max(0, intParam(s.get('p'), 1) - 1);
  const audit = useAdminAudit(true, { action: 'announce', page, pageSize: 10 });
  const { rows, total } = audit.data;
  return (
    <Panel title="Anuncios mandados" subtitle="Los últimos primero">
      {audit.error && !rows.length ? (
        <ErrorRetry error={audit.error} compact />
      ) : audit.loading && !rows.length ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : !rows.length ? (
        <Empty icon={<Megaphone className="size-8" />} title="Todavía no se ha mandado ningún anuncio" />
      ) : (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-2">
            {rows.map((e) => (
              <HistoryRow key={e.id} e={e} />
            ))}
          </ul>
          <Pager page={page} pageSize={10} total={total} noun="anuncios" onPage={(p) => s.patch({ p: p > 0 ? p + 1 : null })} />
        </div>
      )}
    </Panel>
  );
}

function HistoryRow({ e }: { e: AdminAuditEntry }) {
  const d = e.detail ?? {};
  const title = detailStr(d, 'title');
  const body = detailStr(d, 'body');
  const link = detailStr(d, 'url');
  const n = typeof d.recipients === 'number' ? d.recipients : null;
  const aud = historyAudience(d);
  return (
    <li>
      <Card className="flex gap-3 px-3 py-2.5 shadow-none">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Bell className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{title ?? 'Anuncio'}</p>
          {body && <p className="line-clamp-2 text-sm text-muted">{body}</p>}
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            {aud && <Badge tone="neutral">{aud}</Badge>}
            {n != null && <span>{plural(n, 'cuenta', 'cuentas')}</span>}
            {link && <span className="font-mono">{link}</span>}
            <span>
              por{' '}
              {e.actorId ? (
                <Link to={`/superadmin/cuentas?u=${encodeURIComponent(e.actorId)}`} className="hover:underline">
                  {e.actorName ?? 'alguien'}
                </Link>
              ) : (
                (e.actorName ?? 'el sistema')
              )}
            </span>
            <time dateTime={e.at} title={fmtDateTime(e.at)}>
              {relativeTime(e.at)}
            </time>
          </p>
        </div>
      </Card>
    </li>
  );
}
