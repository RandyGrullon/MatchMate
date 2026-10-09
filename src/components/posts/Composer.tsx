import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Globe, ImagePlus, Lock, SendHorizontal, Users, X } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { usePublicProfile } from '../../lib/data/follows';
import { POST_TEXT_MAX, VISIBILITY_LABEL, createPost, postProblem, socialErrorText, type Post, type PostVisibility } from '../../lib/data/posts';
import { compressImage, type CompressedImage } from '../../lib/image';
import { leagueSport } from '../../sports/registry';
import { Avatar } from '../Avatar';
import { BusyIcon } from '../busy';
import { useFeedback } from '../feedback';
import { useMyLeagues } from '../home/useHomeData';
import { Button, Card, Segmented, Select, Sheet, cx } from '../ui';
import { COUNTER_FROM, audienceHint, audienceOptions, defaultAudience, firstLine, type ComposerTarget } from './postFormat';
import { readDraft, saveDraft, useAutoGrow } from './useAutoGrow';

/** La liga donde se publica (muro de la liga). */
export type ComposerLeague = ComposerTarget;

const AUDIENCE_ICON: Record<PostVisibility, typeof Globe> = { public: Globe, followers: Users, league: Lock };

/** Dónde se guarda lo que se escribía (por cuenta y por lugar: el feed o el muro de una liga). */
export const draftKey = (uid: string | null | undefined, leagueId: string | null | undefined) => (uid ? `mm:publicar:${uid}:${leagueId ?? 'feed'}` : null);

/** Elige una foto y la deja lista para subir (comprimida). */
function usePhotoInput(onPicked: (img: CompressedImage) => void, onError: (text: string) => void) {
  const input = useRef<HTMLInputElement>(null);
  const [picking, setPicking] = useState(false);
  async function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPicking(true);
    try {
      onPicked(await compressImage(file));
    } catch (err) {
      console.warn('[foto]', err);
      onError('No se pudo abrir esa imagen. Prueba con otra.');
    } finally {
      setPicking(false);
    }
  }
  const element = <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void onChange(e)} />;
  return { element, picking, pick: () => input.current?.click() };
}

/**
 * La tarjeta «¿Qué jugaste hoy?» con tu foto: tocarla abre la hoja para publicar; el botón de la foto elige una y abre
 * la hoja con ella. Con `league`, publica en esa liga (el muro); si no, en tu perfil o en una de tus ligas. Sin cuenta
 * no sale.
 */
export function ComposerCard({ league, onPosted, placeholder }: { league?: ComposerLeague | null; onPosted?: (post: Post) => void; placeholder?: string }) {
  const auth = useAuth();
  const uid = auth.user?.uid;
  const { toast } = useFeedback();
  const me = usePublicProfile(uid);
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState<CompressedImage | null>(null);
  // Al cerrar la hoja se vuelve a leer lo que quedó escrito (se ve en la tarjeta para seguir).
  const [, reread] = useState(0);
  const picker = usePhotoInput(
    (img) => {
      setPhoto(img);
      setOpen(true);
    },
    (text) => toast(text, 'error'),
  );
  if (!uid) return null;
  const draft = readDraft(draftKey(uid, league?.id));
  const name = me.data?.name ?? auth.profile?.name ?? 'Tú';
  const hint = placeholder ?? '¿Qué jugaste hoy?';

  function close() {
    setOpen(false);
    setPhoto(null);
    reread((n) => n + 1);
  }

  return (
    <>
      <Card className="flex items-center gap-3 py-3 pr-2 pl-4">
        <Avatar name={name} photo={me.data?.avatar} className="size-10 text-sm" />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className={cx(
            'min-h-11 min-w-0 flex-1 truncate rounded-full bg-surface-2 px-4 text-left text-meta transition hover:brightness-95 active:scale-[0.99]',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            firstLine(draft) ? 'text-fg' : 'text-muted',
          )}
        >
          {firstLine(draft) || hint}
        </button>
        {picker.element}
        <button
          type="button"
          onClick={picker.pick}
          disabled={picker.picking}
          aria-busy={picker.picking || undefined}
          aria-label="Publicar una foto"
          title="Foto"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-accent transition hover:bg-accent-soft active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
        >
          <BusyIcon busy={picker.picking} icon={<ImagePlus className="size-[22px]" aria-hidden="true" />} className="size-[22px]" />
        </button>
      </Card>
      {open && <ComposerSheet uid={uid} league={league ?? null} initialPhoto={photo} onClose={close} onPosted={onPosted} />}
    </>
  );
}

/** La hoja para publicar con tus ligas (las que no tienen menores) para elegir dónde, si no viene una liga fija. */
function ComposerSheet({
  uid,
  league,
  initialPhoto,
  onClose,
  onPosted,
}: {
  uid: string;
  league: ComposerLeague | null;
  initialPhoto: CompressedImage | null;
  onClose: () => void;
  onPosted?: (post: Post) => void;
}) {
  const mine = useMyLeagues(null);
  const leagues = useMemo<ComposerTarget[]>(
    () =>
      league
        ? []
        : mine.all
            .filter((l) => !l.hasMinors)
            .map((l) => ({ id: l.id, name: l.name, sport: leagueSport(l), visibility: l.visibility }))
            .sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [league, mine.all],
  );
  return <ComposerForm uid={uid} fixedLeague={league} leagues={leagues} initialPhoto={initialPhoto} onClose={onClose} onPosted={onPosted} />;
}

/**
 * La hoja para publicar: el texto (crece con lo que escribes; el contador sale cerca del tope), una foto (con su vista
 * y «Quitar»), dónde (tu perfil o una de tus ligas, si no viene una fija) y a quién le sale: en tu perfil, «Todos» o
 * «Seguidores»; en una liga, «Todos» (si la liga es pública) o «Solo la liga». Lo escrito queda guardado en el teléfono
 * si cierras la hoja. «Publicar» gira mientras sale y no se toca dos veces.
 */
export function ComposerForm({
  uid,
  fixedLeague,
  leagues,
  initialPhoto = null,
  initialText,
  onClose,
  onPosted,
}: {
  uid: string;
  fixedLeague: ComposerTarget | null;
  /** Tus ligas para «Publicar en» (sin liga fija). */
  leagues: readonly ComposerTarget[];
  initialPhoto?: CompressedImage | null;
  /** Para probarla (si no, el borrador guardado). */
  initialText?: string;
  onClose: () => void;
  onPosted?: (post: Post) => void;
}) {
  const { toast } = useFeedback();
  const key = draftKey(uid, fixedLeague?.id);
  const [text, setTextState] = useState(() => initialText ?? readDraft(key));
  const [photo, setPhoto] = useState<CompressedImage | null>(initialPhoto);
  const [targetId, setTargetId] = useState<string | null>(fixedLeague?.id ?? null);
  const target = fixedLeague ?? leagues.find((l) => l.id === targetId) ?? null;
  const options = audienceOptions(target);
  const [chosen, setChosen] = useState<PostVisibility>(() => defaultAudience(target));
  // Si cambia dónde y lo elegido ya no vale ahí, la de entrada de ese lugar.
  const audience = options.includes(chosen) ? chosen : defaultAudience(target);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const box = useRef<HTMLTextAreaElement>(null);
  useAutoGrow(box, text);
  const picker = usePhotoInput(
    (img) => {
      setPhoto(img);
      setError(null);
    },
    setError,
  );

  const setText = (v: string) => {
    setTextState(v);
    saveDraft(key, v);
    if (error) setError(null);
  };

  const problem = postProblem({ text, photo, leagueId: target?.id ?? null, visibility: audience });
  // «Escribe algo o agrega una foto» no se dice: el botón apagado ya lo dice. Lo demás (muy largo), sí.
  const shownProblem = problem && (text.trim() || photo) ? problem : null;
  const near = text.length >= POST_TEXT_MAX - COUNTER_FROM;
  const over = text.length > POST_TEXT_MAX;
  const canSend = !problem && !sending && !picker.picking;

  async function submit() {
    if (!canSend || inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setError(null);
    try {
      const post = await createPost({ text, photo, leagueId: target?.id ?? null, visibility: audience });
      saveDraft(key, '');
      toast('Publicado');
      onPosted?.(post);
      onClose();
    } catch (e) {
      console.error(e);
      setError(socialErrorText(e, 'No se pudo publicar. Inténtalo otra vez.'));
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={fixedLeague ? 'Publicar en la liga' : 'Nueva publicación'}
      subtitle={fixedLeague?.name}
      footer={
        <Button
          variant="primary"
          size="xl"
          className="w-full"
          icon={<SendHorizontal className="size-5" />}
          loading={sending}
          disabled={!canSend}
          onClick={() => void submit()}
        >
          Publicar
        </Button>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="flex flex-col gap-1">
          <textarea
            ref={box}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={4}
            autoFocus
            placeholder="Cuenta cómo te fue…"
            aria-label="Qué quieres publicar"
            aria-invalid={over || undefined}
            className="min-h-28 w-full resize-none rounded-2xl border border-line bg-surface px-3.5 py-3 text-base text-fg outline-none placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/40"
          />
          {near && (
            <span className={cx('self-end text-xs tabular-nums', over ? 'font-semibold text-danger' : 'text-muted')} aria-live="polite">
              {text.length}/{POST_TEXT_MAX}
            </span>
          )}
        </div>

        {photo ? (
          <div className="relative self-start">
            <img
              src={photo.data}
              alt="La foto que vas a publicar"
              className="max-h-64 max-w-full rounded-2xl bg-surface-2 object-contain"
              style={{ aspectRatio: photo.width && photo.height ? `${photo.width} / ${photo.height}` : undefined }}
            />
            <button
              type="button"
              onClick={() => setPhoto(null)}
              aria-label="Quitar la foto"
              title="Quitar la foto"
              className="absolute top-2 right-2 inline-flex size-9 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/75 active:scale-95"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div>
            {picker.element}
            <Button variant="quiet" onClick={picker.pick} loading={picker.picking} icon={<ImagePlus className="size-4" />} className="h-11 rounded-full!">
              {picker.picking ? 'Preparando foto…' : 'Agregar foto'}
            </Button>
          </div>
        )}

        {!fixedLeague && leagues.length > 0 && (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Publicar en</span>
            <Select value={targetId ?? ''} onChange={(e) => setTargetId(e.target.value || null)} className="h-11">
              <option value="">Mi perfil</option>
              {leagues.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </label>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">¿Quién la ve?</span>
          {options.length > 1 ? (
            <Segmented<PostVisibility>
              label="Quién la ve"
              full
              value={audience}
              onChange={setChosen}
              options={options.map((v) => {
                const Icon = AUDIENCE_ICON[v];
                return { key: v, label: VISIBILITY_LABEL[v], icon: <Icon className="size-4" aria-hidden="true" /> };
              })}
            />
          ) : (
            <p className="inline-flex items-center gap-1.5 self-start rounded-[14px] bg-surface-2 px-4 py-2 text-meta font-semibold">
              <Lock className="size-4 text-accent" aria-hidden="true" /> {VISIBILITY_LABEL[audience]}
            </p>
          )}
          <p className="text-[13px] text-muted">{audienceHint(audience, !!target)}</p>
        </div>

        {(error || shownProblem) && (
          <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
            {error ?? shownProblem}
          </p>
        )}
      </form>
    </Sheet>
  );
}
