import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CircleStop, ExternalLink, Radio, Share2 } from 'lucide-react';
import { endStream, streamErrorText, streamShareUrl, useLeagueStreams, type LiveStream } from '../lib/data/streams';
import { useLeagueCtx } from '../lib/league';
import { PLATFORM_LABEL, embedUrl } from '../lib/streams';
import { relativeTime } from '../lib/notifications';
import { useBusy } from '../components/busy';
import { useFeedback } from '../components/feedback';
import { LiveTag, PlatformMark, canStartStream, liveHref, streamLine, streamTitle } from '../components/live/LiveParts';
import { StartStreamSheet } from '../components/live/StartStreamSheet';
import { useIsPro } from '../components/mode';
import { ScreenTitle } from '../components/screens/ScreenBits';
import { shareLink } from '../components/share';
import { Button, Card, ListRow, LoadError, RowIcon, Skeleton, cx } from '../components/ui';

/** El dominio de la app (Twitch lo pide para dejarse ver adentro). */
const appHost = () => (typeof location === 'undefined' ? 'matchmate-oficial.vercel.app' : location.hostname);

/**
 * En vivo (`/l/:lid/vivo`, dentro de la liga; es el link que se comparte y el del aviso): la transmisión elegida
 * (`?s=<id>`, si no la primera) dentro de la app cuando la plataforma lo deja (YouTube, Twitch, Kick, Facebook), si no un
 * botón grande «Ver en Instagram» que la abre afuera. Debajo, el título, «Compartir» y, para quien puede,
 * «Terminar transmisión»; las otras transmisiones de la liga; y para quien transmite (admins y anotadores, con la liga
 * en vivo activada), «Transmitir en vivo». Sin nada en vivo: «No hay nada en vivo ahora» (al admin de una liga sin las
 * transmisiones activadas, dónde activarlas). Se ve sin cuenta en una liga pública.
 */
export default function LiveStreamPage() {
  const ctx = useLeagueCtx();
  const { lid, league, isAdmin, base } = ctx;
  const pro = useIsPro();
  const [params] = useSearchParams();
  const streams = useLeagueStreams(lid);
  const [starting, setStarting] = useState(false);
  const can = canStartStream(ctx);
  const torneo = league.kind === 'torneo';

  const wanted = params.get('s');
  const current = streams.data.find((s) => s.id === wanted) ?? streams.data[0] ?? null;
  const others = streams.data.filter((s) => s.id !== current?.id);

  const startButton = can && (
    <Button variant={current ? 'quiet' : 'primary'} size={pro ? 'lg' : 'xl'} className="w-full" icon={<Radio className="size-5" />} onClick={() => setStarting(true)}>
      Transmitir en vivo
    </Button>
  );

  let body;
  if (streams.error && !streams.data.length) {
    body = <LoadError error={streams.error} />;
  } else if (streams.loading && !streams.data.length) {
    body = <Skeleton className="aspect-video w-full rounded-3xl" />;
  } else if (!current) {
    body = (
      <Card className="flex flex-col items-center px-5 pt-7 pb-6 text-center">
        <span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-surface-2 text-muted">
          <Radio className="size-7" />
        </span>
        <h2 className="mt-4 text-section">No hay nada en vivo ahora</h2>
        <p className="mt-1.5 max-w-sm text-meta text-muted">
          {league.liveEnabled
            ? `Cuando ${torneo ? 'el torneo' : 'la liga'} transmita un partido, se ve aquí.`
            : `${torneo ? 'Este torneo' : 'Esta liga'} no tiene activadas las transmisiones en vivo.`}
        </p>
        {startButton && <div className="mt-5 w-full">{startButton}</div>}
        {!league.liveEnabled && isAdmin && (
          <Link
            to={`${base}/admin?tab=liga`}
            className="mt-4 inline-flex min-h-11 items-center rounded-xl px-3 text-meta font-[650] text-accent focus-visible:outline-2 focus-visible:outline-accent"
          >
            {`Actívalas en Ajustes ${torneo ? 'del torneo' : 'de la liga'}`}
          </Link>
        )}
      </Card>
    );
  } else {
    body = (
      <>
        <StreamView stream={current} />
        {others.length > 0 && (
          <section aria-labelledby="envivo-otras" className="mt-[30px]">
            <h2 id="envivo-otras" className="mx-1 mb-3 text-section">
              También en vivo
            </h2>
            <Card className="overflow-hidden">
              {others.map((s) => (
                <ListRow
                  key={s.id}
                  leading={
                    <RowIcon>
                      <PlatformMark platform={s.platform} />
                    </RowIcon>
                  }
                  title={streamTitle(s)}
                  subtitle={streamLine(s)}
                  to={liveHref(lid, s.id)}
                  dense={pro}
                />
              ))}
            </Card>
          </section>
        )}
        {startButton && <div className="mt-[30px]">{startButton}</div>}
      </>
    );
  }

  return (
    <div className="flex flex-col px-2">
      <ScreenTitle title="En vivo" hint={league.name} pro={pro} />
      <div className="mt-5 flex flex-col">{body}</div>
      {/* Una transmisión de la liga (sin partido); la de un partido o un evento se pone desde su «•••». */}
      {can && <StartStreamSheet lid={lid} open={starting} onClose={() => setStarting(false)} />}
    </div>
  );
}

/**
 * La transmisión: el video dentro de la app (16:9) o el botón para abrirla en su plataforma; el título, la plataforma,
 * cuándo empezó y quién; «Compartir» y, para quien puede, «Terminar transmisión».
 */
function StreamView({ stream: s }: { stream: LiveStream }) {
  const { toast, confirm } = useFeedback();
  const busy = useBusy<'compartir' | 'terminar'>();
  const platform = PLATFORM_LABEL[s.platform];
  const src = embedUrl(s.url, appHost());
  const title = streamTitle(s);
  const started = Date.parse(s.startedAt);

  const share = () =>
    busy.run('compartir', async () => {
      try {
        if (await shareLink(streamShareUrl(s.leagueId), `🔴 En vivo: ${title}`)) toast('Link copiado');
      } catch {
        toast('No se pudo compartir.', 'error');
      }
    });
  const end = async () => {
    const yes = await confirm({
      title: '¿Terminar la transmisión?',
      message: `Deja de salir en la liga y en Hoy. El video sigue en ${platform}.`,
      confirmText: 'Terminar',
      danger: true,
    });
    if (!yes) return;
    await busy.run('terminar', async () => {
      try {
        await endStream(s);
        toast('Transmisión terminada');
      } catch (e) {
        console.error(e);
        toast(streamErrorText(e), 'error');
      }
    });
  };

  return (
    <>
      {src ? (
        <div className="overflow-hidden rounded-3xl bg-black shadow-sm">
          <iframe
            key={s.id}
            src={src}
            title={`${title} en ${platform}`}
            className="block aspect-video w-full border-0"
            loading="lazy"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      ) : (
        <Card className="flex flex-col items-center px-5 pt-7 pb-6 text-center">
          <PlatformMark platform={s.platform} className="size-12" />
          <p className="mt-3 max-w-sm text-meta text-muted">{`${platform} no deja ver la transmisión dentro de otra app: se abre allá.`}</p>
          <a
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cx(
              'mt-5 inline-flex h-btn w-full min-w-0 items-center justify-center gap-2.5 rounded-btn bg-danger px-6 text-[17px] font-semibold text-on-danger shadow-sm transition active:scale-[0.97]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger',
            )}
          >
            <ExternalLink aria-hidden="true" className="size-5" />
            <span className="min-w-0 truncate">{`Ver en ${platform}`}</span>
          </a>
        </Card>
      )}

      <div className="mt-4 px-1">
        <LiveTag />
        <h2 className="mt-1 text-card-title-pro break-words">{title}</h2>
        <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 text-meta text-muted">
          <PlatformMark platform={s.platform} className="size-4" />
          <span>{streamLine(s)}</span>
          {Number.isFinite(started) && (
            <>
              <span aria-hidden="true">·</span>
              <span>{`Empezó ${relativeTime(started, Date.now())}`}</span>
            </>
          )}
          {s.startedBy?.name && (
            <>
              <span aria-hidden="true">·</span>
              <span className="min-w-0 truncate">{s.startedBy.name}</span>
            </>
          )}
        </p>
        {src && (
          <a
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-meta font-[550] text-accent focus-visible:outline-2 focus-visible:outline-accent"
          >
            <ExternalLink aria-hidden="true" className="size-4" />
            {`Abrir en ${platform}`}
          </a>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-2.5">
        <Button variant="soft" size="lg" className="w-full" icon={<Share2 className="size-5" />} loading={busy.isBusy('compartir')} onClick={() => void share()}>
          Compartir
        </Button>
        {s.canEnd && (
          <Button variant="quiet" size="lg" className="w-full text-danger!" icon={<CircleStop className="size-5" />} loading={busy.isBusy('terminar')} onClick={() => void end()}>
            Terminar transmisión
          </Button>
        )}
      </div>
    </>
  );
}
