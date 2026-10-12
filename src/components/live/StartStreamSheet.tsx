import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ClipboardPaste, Eye, Radio, Share2 } from 'lucide-react';
import { STREAM_TITLE_MAX, startStream, streamErrorText, streamProblem, streamShareUrl, type LiveStream } from '../../lib/data/streams';
import { PLATFORM_LABEL, embedUrl, streamPlatform } from '../../lib/streams';
import { useBusy } from '../busy';
import { useFeedback } from '../feedback';
import { shareLink } from '../share';
import { Button, Field, Input, Sheet } from '../ui';
import { PlatformMark, liveHref, streamTitle } from './LiveParts';

/** ¿Este navegador deja leer el portapapeles (el botón «Pegar»)? */
const canReadClipboard = () => typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function';

/**
 * Lo que dice debajo del link mientras se escribe o se pega: la plataforma que se reconoce (y si se ve dentro de la
 * app o se abre afuera), el problema si no se puede usar, o qué links sirven. `checked`: ya tocó «Empezar» (sin link,
 * se le pide).
 */
export function linkHint(url: string, checked: boolean): { tone: 'ok' | 'error' | 'muted'; text: string; platform: ReturnType<typeof streamPlatform> } {
  const platform = streamPlatform(url);
  if (platform) {
    const inside = embedUrl(url, 'matchmate.app') !== null;
    return { tone: 'ok', platform, text: inside ? `${PLATFORM_LABEL[platform]} · Se ve dentro de MatchMate` : `${PLATFORM_LABEL[platform]} · Se abre en ${PLATFORM_LABEL[platform]}` };
  }
  const problem = url.trim() || checked ? streamProblem({ url, title: null }) : null;
  if (problem) return { tone: 'error', platform: null, text: problem };
  return { tone: 'muted', platform: null, text: 'De YouTube, Twitch, Facebook, Kick, Instagram o TikTok.' };
}

/** El formulario (sin estado, para probarlo solo): el link con «Pegar», lo que se reconoce, el título y el error. */
export function StartStreamForm({
  url,
  title,
  defaultTitle,
  checked,
  error,
  canPaste,
  busy,
  onUrl,
  onTitle,
  onPaste,
}: {
  url: string;
  title: string;
  defaultTitle?: string | null;
  checked: boolean;
  error: string | null;
  canPaste: boolean;
  busy?: boolean;
  onUrl: (v: string) => void;
  onTitle: (v: string) => void;
  onPaste: () => void;
}) {
  const hint = linkHint(url, checked);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="envivo-link" className="text-xs font-medium text-muted">
          Link de la transmisión
        </label>
        <div className="flex gap-2">
          <Input
            id="envivo-link"
            type="url"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="https://youtube.com/live/…"
            value={url}
            disabled={busy}
            aria-invalid={hint.tone === 'error' || undefined}
            aria-describedby="envivo-link-hint"
            onChange={(e) => onUrl(e.target.value)}
            className="h-11 min-w-0 flex-1"
          />
          {canPaste && (
            <Button variant="quiet" className="h-11 shrink-0" icon={<ClipboardPaste className="size-4" />} disabled={busy} onClick={onPaste}>
              Pegar
            </Button>
          )}
        </div>
        <p
          id="envivo-link-hint"
          aria-live="polite"
          className={hint.tone === 'error' ? 'text-xs font-medium text-danger' : hint.tone === 'ok' ? 'flex items-center gap-1.5 text-xs font-semibold text-fg-2' : 'text-xs text-muted'}
        >
          {hint.platform && <PlatformMark platform={hint.platform} className="size-4" />}
          {hint.text}
        </p>
      </div>
      <Field label="Título (opcional)" hint={`Sale en la liga y en el aviso. Hasta ${STREAM_TITLE_MAX} caracteres.`}>
        <Input
          value={title}
          maxLength={STREAM_TITLE_MAX}
          disabled={busy}
          placeholder={defaultTitle || 'Ej.: Final del torneo'}
          onChange={(e) => onTitle(e.target.value)}
          className="h-11"
        />
      </Field>
      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * «Transmitir en vivo»: pegar el link (se reconoce la plataforma al momento; «Pegar» donde el navegador deja), un
 * título opcional (de entrada, el del partido: «Tigres vs Leones») y «Empezar». Ya en vivo: «Ya estás en vivo» con
 * «Compartir link» (la página En vivo de la liga) y «Ver». Avisa a los miembros y seguidores la base (start_stream).
 * Cada vez que se abre empieza de cero.
 */
export function StartStreamSheet(props: { lid: string; matchId?: string | null; eventId?: string | null; defaultTitle?: string | null; open: boolean; onClose: () => void }) {
  if (!props.open) return null;
  return <StartStreamDialog {...props} />;
}

function StartStreamDialog({
  lid,
  matchId,
  eventId,
  defaultTitle,
  onClose,
}: {
  lid: string;
  matchId?: string | null;
  eventId?: string | null;
  defaultTitle?: string | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const busy = useBusy<'empezar' | 'compartir'>();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState((defaultTitle ?? '').slice(0, STREAM_TITLE_MAX));
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState<LiveStream | null>(null);
  const [canPaste] = useState(canReadClipboard);

  const paste = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) {
        setUrl(text);
        setError(null);
      } else toast('No hay nada copiado.', 'error');
    } catch {
      toast('No se pudo leer lo copiado: pégalo en el campo.', 'error');
    }
  };

  const start = () =>
    busy.run('empezar', async () => {
      setChecked(true);
      const problem = streamProblem({ url, title });
      if (problem) {
        setError(problem);
        return;
      }
      setError(null);
      try {
        // El título de entrada (el del partido o el evento) ya lo pone la base como `label`: solo se manda si lo cambió.
        const own = title.trim() && title.trim() !== (defaultTitle ?? '').trim() ? title.trim() : null;
        setStarted(await startStream({ leagueId: lid, url, title: own, matchId: matchId ?? null, eventId: eventId ?? null }));
      } catch (e) {
        console.error(e);
        setError(streamErrorText(e));
      }
    });

  const share = (s: LiveStream) =>
    busy.run('compartir', async () => {
      try {
        if (await shareLink(streamShareUrl(lid), `🔴 En vivo: ${streamTitle(s)}`)) toast('Link copiado');
      } catch {
        toast('No se pudo compartir. Copia el link desde la página En vivo.', 'error');
      }
    });

  if (started) {
    return (
      <Sheet
        open
        onClose={onClose}
        title="Transmitir en vivo"
        footer={
          <div className="flex gap-2.5">
            <Button
              variant="quiet"
              size="lg"
              className="flex-1"
              icon={<Eye className="size-5" />}
              onClick={() => {
                onClose();
                navigate(liveHref(lid, started.id));
              }}
            >
              Ver
            </Button>
            <Button variant="primary" size="lg" className="flex-1" icon={<Share2 className="size-5" />} loading={busy.isBusy('compartir')} onClick={() => void share(started)}>
              Compartir link
            </Button>
          </div>
        }
      >
        <div className="flex flex-col items-center py-4 text-center">
          <span aria-hidden="true" className="grid size-16 place-items-center rounded-full bg-danger-soft text-danger">
            <Radio className="size-8" />
          </span>
          <h3 className="mt-4 text-card-title-pro">Ya estás en vivo</h3>
          <p className="mt-1.5 max-w-sm text-meta text-muted">
            «{streamTitle(started)}» sale arriba en la liga y avisamos a los miembros y seguidores. Comparte el link para que lo vean más.
          </p>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Transmitir en vivo"
      subtitle={defaultTitle || undefined}
      footer={
        <div className="flex gap-2.5">
          <Button variant="quiet" size="lg" className="flex-1" disabled={busy.isBusy()} onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="lg" className="flex-1" icon={<Radio className="size-5" />} loading={busy.isBusy('empezar')} onClick={() => void start()}>
            Empezar
          </Button>
        </div>
      }
    >
      <StartStreamForm
        url={url}
        title={title}
        defaultTitle={defaultTitle}
        checked={checked}
        error={error}
        canPaste={canPaste}
        busy={busy.isBusy('empezar')}
        onUrl={(v) => {
          setUrl(v);
          setError(null);
        }}
        onTitle={setTitle}
        onPaste={() => void paste()}
      />
    </Sheet>
  );
}
