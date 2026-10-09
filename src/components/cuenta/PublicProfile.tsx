import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { Ban, Check, ImageUp, Quote, Trash2 } from 'lucide-react';
import { invalidate, type Live } from '../../lib/data/client';
import type { PublicProfile } from '../../lib/data/follows';
import { BIO_MAX, blockKeys, prepareAvatar, removeAvatar, setBio, setBlocked, uploadAvatar, useMyBlocks, type BlockedPerson } from '../../lib/data/profileSocial';
import type { CompressedLogo } from '../../lib/image';
import { Avatar } from '../Avatar';
import { useBusy } from '../busy';
import { saveErrorMessage, useFeedback } from '../feedback';
import { ProfileAvatar } from '../profile/ProfileAvatar';
import { atUsername, plural } from '../social/socialFormat';
import { Button, Card, Empty, ListRow, ListSkeleton, LoadError, RowIcon, SectionHeader, Sheet } from '../ui';
import { BigField, BigTextarea, ErrorNote } from './kit';

/**
 * «Perfil público» en Configuración (docs/red-social.md): lo que ven los demás en tu perfil y en tus publicaciones (tu
 * foto y tu biografía) y las personas que bloqueaste. Como el resto de la pantalla, filas en una tarjeta y cada cosa en
 * su hoja: la foto (elegir, ver cómo queda y guardarla, o quitarla), la biografía (hasta 160) y la lista de bloqueadas
 * con «Desbloquear». `/cuenta?foto=1` (tocar tu foto en Yo) abre la hoja de la foto.
 */

type Part = 'foto' | 'bio' | 'bloqueadas';

/** El error de guardar la biografía en palabras simples. */
export function bioErrorText(e: unknown): string {
  const code = e && typeof e === 'object' ? (e as { code?: unknown }).code : undefined;
  const message = e instanceof Error ? e.message.trim() : '';
  if (code === 'palabras' || /^palabras\b/.test(message)) return 'Tu texto tiene palabras que no se permiten';
  return saveErrorMessage(e);
}

/** El error de preparar, subir o quitar la foto de perfil en palabras simples. */
export function avatarErrorText(e: unknown): string {
  const code = e && typeof e === 'object' ? (e as { code?: unknown }).code : undefined;
  const kind = e && typeof e === 'object' ? (e as { kind?: unknown }).kind : undefined;
  if (code === 'imagen') return 'No se pudo usar esa imagen. Prueba con otra (JPG, PNG o WebP).';
  if (kind === 'rate_limited' || code === 'rate_limited') return 'Cambiaste tu foto muchas veces hoy. Prueba mañana.';
  return saveErrorMessage(e);
}

/** Debajo de «Personas bloqueadas»: cuántas, o que no hay. */
export const blockedLine = (n: number): string => (n > 0 ? plural(n, 'persona', 'personas') : 'No has bloqueado a nadie');

/** La biografía sin espacios de más (como la guarda la base). */
const cleanBio = (s: string) => s.replace(/\s+/g, ' ').trim();

export function PublicProfileSection({
  name,
  profile,
  dense,
  icon,
  className,
}: {
  name: string;
  /** Tu perfil público (null mientras llega). */
  profile: PublicProfile | null;
  dense: boolean;
  /** Tamaño de los íconos de las filas. */
  icon: string;
  className?: string;
}) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const wantsPhoto = params.get('foto') === '1';
  const [sheet, setSheet] = useState<Part | null>(wantsPhoto ? 'foto' : null);
  const blocks = useMyBlocks();
  const photo = profile?.avatar ?? null;
  const bio = profile?.bio?.trim() || null;

  // Llegó tocando la foto en Yo con la pantalla ya abierta: la hoja se abre igual.
  useEffect(() => {
    if (wantsPhoto) setSheet('foto');
  }, [wantsPhoto]);

  const close = () => {
    setSheet(null);
    if (wantsPhoto) {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('foto');
          return next;
        },
        // Sin perder que se llegó desde Yo («‹ Yo» vuelve atrás).
        { replace: true, state: location.state },
      );
    }
  };

  return (
    <section aria-labelledby="cfg-perfil" className={className}>
      <SectionHeader id="cfg-perfil" title="Perfil público" />
      <Card className="overflow-hidden">
        <ListRow
          dense={dense}
          leading={<Avatar name={name} photo={photo} className="size-10 text-sm" />}
          title="Foto de perfil"
          subtitle={photo ? 'Cámbiala o quítala' : 'Que te reconozcan en tus publicaciones'}
          onClick={() => setSheet('foto')}
        />
        <ListRow
          dense={dense}
          leading={
            <RowIcon>
              <Quote className={icon} />
            </RowIcon>
          }
          title="Tu biografía"
          subtitle={bio ?? 'Cuéntales algo de ti'}
          onClick={() => setSheet('bio')}
        />
        <ListRow
          dense={dense}
          leading={
            <RowIcon>
              <Ban className={icon} />
            </RowIcon>
          }
          title="Personas bloqueadas"
          subtitle={blocks.loading && !blocks.data.length ? 'Las que no ven tu perfil' : blockedLine(blocks.data.length)}
          onClick={() => setSheet('bloqueadas')}
        />
      </Card>

      <Sheet open={sheet === 'foto'} onClose={close} title="Foto de perfil" subtitle="Sale en tu perfil y en lo que publicas">
        {sheet === 'foto' && <AvatarEditor name={name} photo={photo} onDone={close} />}
      </Sheet>
      <Sheet open={sheet === 'bio'} onClose={close} title="Tu biografía" subtitle="Sale en tu perfil, debajo de tu nombre">
        {sheet === 'bio' && <BioForm current={bio} onDone={close} />}
      </Sheet>
      <Sheet open={sheet === 'bloqueadas'} onClose={close} title="Personas bloqueadas" subtitle="No ven tu perfil ni tus publicaciones">
        {sheet === 'bloqueadas' && <BlockedPeople list={blocks} />}
      </Sheet>
    </section>
  );
}

/**
 * La foto de perfil: cómo se ve ahora, «Elegir foto» (se recorta al cuadrado del centro y se comprime en el teléfono),
 * cómo va a quedar con «Guardar foto», y «Quitar foto» (vuelven las iniciales). Necesita señal.
 */
export function AvatarEditor({ name, photo, onDone }: { name: string; photo: string | null; onDone: () => void }) {
  const { confirm, toast } = useFeedback();
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<CompressedLogo | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<'preparar' | 'subir' | 'quitar' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!picked || typeof URL.createObjectURL !== 'function') {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(picked.blob);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [picked]);

  async function pick(file: File | undefined) {
    if (input.current) input.current.value = '';
    if (!file || busy) return;
    setBusy('preparar');
    setError(null);
    try {
      setPicked(await prepareAvatar(file));
    } catch (e) {
      console.warn('[foto de perfil]', e);
      setError(avatarErrorText({ code: 'imagen' }));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!picked || busy) return;
    setBusy('subir');
    setError(null);
    try {
      await uploadAvatar(picked);
      toast(photo ? 'Foto cambiada' : 'Foto lista');
      onDone();
    } catch (e) {
      setError(avatarErrorText(e));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (busy) return;
    const ok = await confirm({ title: '¿Quitar tu foto?', message: 'Vuelven a salir tus iniciales. Puedes poner otra cuando quieras.', confirmText: 'Quitar', danger: true });
    if (!ok) return;
    setBusy('quitar');
    setError(null);
    try {
      await removeAvatar();
      toast('Foto quitada');
      onDone();
    } catch (e) {
      setError(avatarErrorText(e));
    } finally {
      setBusy(null);
    }
  }

  const choose = () => input.current?.click();

  return (
    <div className="flex flex-col items-center gap-4 pt-2 pb-1">
      {preview ? (
        <img src={preview} alt="Tu foto nueva" className="size-32 shrink-0 rounded-full bg-surface-2 object-cover" />
      ) : (
        <ProfileAvatar name={name} photo={photo} className="size-32 text-[40px]" />
      )}
      <p className="max-w-xs text-center text-meta text-muted">
        {picked ? 'Así se va a ver. ¿La guardas?' : 'Se recorta al cuadrado del centro. La ve cualquiera que vea tu perfil.'}
      </p>
      {error && <ErrorNote className="w-full">{error}</ErrorNote>}
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
      <div className="flex w-full flex-col gap-2.5">
        {picked ? (
          <>
            <Button variant="primary" size="xl" className="w-full" loading={busy === 'subir'} disabled={!!busy} icon={<Check className="size-5" />} onClick={() => void save()}>
              {busy === 'subir' ? 'Subiendo…' : 'Guardar foto'}
            </Button>
            <Button variant="quiet" size="xl" className="w-full" loading={busy === 'preparar'} disabled={!!busy} icon={<ImageUp className="size-5" />} onClick={choose}>
              {busy === 'preparar' ? 'Preparando…' : 'Elegir otra'}
            </Button>
          </>
        ) : (
          <>
            <Button variant="primary" size="xl" className="w-full" loading={busy === 'preparar'} disabled={!!busy} icon={<ImageUp className="size-5" />} onClick={choose}>
              {busy === 'preparar' ? 'Preparando…' : photo ? 'Cambiar foto' : 'Elegir foto'}
            </Button>
            {photo && (
              <Button variant="quiet" size="xl" className="w-full text-danger" loading={busy === 'quitar'} disabled={!!busy} icon={<Trash2 className="size-5" />} onClick={() => void remove()}>
                Quitar foto
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** La biografía: hasta 160 caracteres con la cuenta a la vista; vacía, se quita. */
export function BioForm({ current, onDone }: { current: string | null | undefined; onDone: () => void }) {
  const { toast } = useFeedback();
  const [value, setValue] = useState(current ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const over = value.length > BIO_MAX;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy || over) return;
    if (cleanBio(value) === cleanBio(current ?? '')) {
      onDone();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await setBio(value);
      toast(saved ? 'Biografía guardada' : 'Biografía quitada');
      onDone();
    } catch (err) {
      setError(bioErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  const counter: ReactNode = (
    <span className="flex items-start justify-between gap-3">
      <span>Qué juegas, dónde o desde cuándo. Vacía, se quita.</span>
      <span aria-live="polite" className="num shrink-0 tabular-nums">
        {value.length}/{BIO_MAX}
      </span>
    </span>
  );

  return (
    <form onSubmit={save} className="flex flex-col gap-4 pt-1">
      <BigField label="Sobre ti" hint={counter} error={over}>
        <BigTextarea
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          maxLength={BIO_MAX}
          rows={3}
          autoFocus
          enterKeyHint="done"
          placeholder="Cuéntales qué juegas y dónde"
          aria-invalid={!!error || over || undefined}
        />
      </BigField>
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex gap-2.5">
        <Button variant="quiet" size="xl" className="flex-1" disabled={busy} onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" size="xl" className="flex-1" loading={busy} disabled={over}>
          Guardar
        </Button>
      </div>
    </form>
  );
}

/** Las personas que bloqueaste (la más nueva primero), cada una con «Desbloquear». */
export function BlockedPeople({ list }: { list: Live<BlockedPerson[]> }) {
  const { toast } = useFeedback();
  const busy = useBusy<string>();

  if (list.loading && !list.data.length) return <ListSkeleton rows={3} />;
  if (list.error && !list.data.length) return <LoadError error={list.error} onRetry={() => invalidate(blockKeys.mine)} />;
  if (!list.data.length) {
    return (
      <Empty icon={<Ban className="size-7" aria-hidden="true" />} title="No has bloqueado a nadie">
        Si bloqueas a alguien desde su perfil, sale aquí para desbloquearlo cuando quieras.
      </Empty>
    );
  }

  const unblock = (p: BlockedPerson) =>
    busy.run(p.id, async () => {
      try {
        await setBlocked(p.id, false);
        toast(`Desbloqueaste a ${p.name}`);
      } catch (e) {
        toast(saveErrorMessage(e), 'error');
      }
    });

  return (
    <ul className="-mx-2 flex flex-col pb-1" aria-label="Personas bloqueadas">
      {list.data.map((p) => {
        const handle = atUsername(p.username);
        return (
          <li key={p.id} className="flex min-h-14 items-center gap-3 rounded-xl px-2 py-1.5">
            <Avatar name={p.name} photo={p.avatar} className="size-10 text-sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{p.name}</p>
              {handle && <p className="truncate text-xs text-muted">{handle}</p>}
            </div>
            <Button
              className="h-11 sm:h-9"
              loading={busy.isBusy(p.id)}
              disabled={busy.isBusy() && !busy.isBusy(p.id)}
              aria-label={`Desbloquear a ${p.name}`}
              onClick={() => void unblock(p)}
            >
              Desbloquear
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
