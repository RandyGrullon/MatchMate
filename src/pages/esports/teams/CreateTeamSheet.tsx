import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { IdCard, ImagePlus, ImageUp, Users, X } from 'lucide-react';
import { createTeam, esportsErrorText, uploadTeamLogo } from '../../../lib/data/esports';
import type { CompressedLogo } from '../../../lib/image';
import { logoErrorText, prepareLogo } from '../../../lib/logos';
import { GAMES, type GameId } from '../../../sports/esports';
import { TeamLogo } from '../../../components/esports/bits';
import { useFeedback } from '../../../components/feedback';
import { useIsPro } from '../../../components/mode';
import { SignInCard, linkButton } from '../../../components/screens/ScreenBits';
import { Button, Field, Input, Sheet, Spinner, Textarea } from '../../../components/ui';
import { cleanTag, createTeamLink, idWord, myIdLink, suggestTag, teamFormErrors, withQuery, type TeamForm } from '../logic';

/**
 * Crear un equipo de esports (`?crear=equipo` en la página del juego, §12.3): nombre, tag (mayúsculas, 2–5; sale solo
 * del nombre hasta que escribes el tuyo), descripción y logo (opcionales; el logo se sube después de crear). Sin su ID
 * de ese juego, en lugar del formulario: «Primero pon tu ID de {juego}» con «Poner mi ID» (vuelve aquí).
 * Al crear: a la página del equipo con la hoja de invitar abierta, o a `back` (`?volver=`) con `?equipo=<id>`.
 */
export function CreateTeamSheet({
  open,
  onClose,
  game,
  signedIn,
  hasId,
  idsLoading,
  back,
}: {
  open: boolean;
  onClose: () => void;
  game: GameId;
  signedIn: boolean;
  /** Tiene su ID de ese juego puesto (sin él la base no deja: `sin_id`). */
  hasId: boolean;
  idsLoading: boolean;
  /** `?volver=`: a dónde ir al crear (con `?equipo=<id>`). */
  back: string | null;
}) {
  const meta = GAMES[game];
  return (
    <Sheet open={open} onClose={onClose} title="Crear equipo" subtitle={meta.name}>
      {open && <CreateTeamBody game={game} signedIn={signedIn} hasId={hasId} idsLoading={idsLoading} back={back} />}
    </Sheet>
  );
}

function CreateTeamBody({ game, signedIn, hasId, idsLoading, back }: { game: GameId; signedIn: boolean; hasId: boolean; idsLoading: boolean; back: string | null }) {
  const meta = GAMES[game];
  const pro = useIsPro();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useFeedback();
  const [form, setForm] = useState<TeamForm>({ name: '', tag: '', description: '' });
  const [tagEdited, setTagEdited] = useState(false);
  const [logo, setLogo] = useState<CompressedLogo | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!signedIn) {
    return (
      <SignInCard
        className="mb-2"
        icon={<Users />}
        title="Entra para crear tu equipo"
        text={`Arma tu equipo de ${meta.name} e invita a los tuyos con un link.`}
        next={encodeURIComponent(location.pathname + location.search)}
      />
    );
  }

  if (idsLoading) {
    return (
      <div className="grid place-items-center py-10" aria-busy="true">
        <Spinner />
      </div>
    );
  }

  if (!hasId) {
    return (
      <div className="flex flex-col items-center pt-2 pb-2 text-center">
        <span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
          <IdCard className="size-7" />
        </span>
        <h3 className="mt-4 text-card-title">Primero pon tu ID de {meta.name}</h3>
        <p className="mt-2 max-w-sm text-body text-muted">En el equipo se ve tu {idWord(meta.idInfo.label)}: así los demás saben con quién juegan.</p>
        <Link to={myIdLink(game, createTeamLink(game, back))} className={linkButton('primary', 'mt-6 w-full')}>
          <span className="min-w-0 truncate">Poner mi ID</span>
        </Link>
      </div>
    );
  }

  const errors = teamFormErrors(form);
  const ok = Object.keys(errors).length === 0;
  const show = (k: keyof TeamForm) => (tried ? errors[k] : undefined);

  async function create() {
    setTried(true);
    if (!ok || busy) return;
    setBusy(true);
    try {
      const r = await createTeam({ game, name: form.name.trim(), tag: form.tag, description: form.description.trim() });
      if (logo) {
        try {
          await uploadTeamLogo(r.teamId, logo);
        } catch (e) {
          console.warn('[logo del equipo]', e);
          toast('El equipo quedó creado, pero el logo no se pudo subir. Pruébalo en «Editar equipo».', 'error');
        }
      }
      toast(`Listo: ${form.name.trim()} quedó creado`);
      navigate(back ? withQuery(back, 'equipo', r.teamId) : `/esports/equipo/${r.teamId}?invitar=1`);
    } catch (e) {
      console.error(e);
      toast(esportsErrorText(e, game, 'equipo'), 'error');
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-4 pb-1"
      onSubmit={(e) => {
        e.preventDefault();
        void create();
      }}
      noValidate
    >
      <Field label="Nombre del equipo" hint={show('name') ? <span className="text-danger">{show('name')}</span> : undefined}>
        <Input
          className="h-11"
          maxLength={40}
          autoComplete="off"
          value={form.name}
          placeholder="Los Tigres"
          aria-invalid={!!show('name') || undefined}
          onChange={(e) => {
            const name = e.target.value;
            setForm((f) => ({ ...f, name, tag: tagEdited ? f.tag : suggestTag(name) }));
          }}
        />
      </Field>
      <Field
        label="Tag"
        hint={show('tag') ? <span className="text-danger">{show('tag')}</span> : 'De 2 a 5 letras o números: sale como [TGR] al lado del nombre.'}
      >
        <Input
          className="h-11 font-semibold tracking-[0.08em] uppercase"
          maxLength={5}
          autoComplete="off"
          autoCapitalize="characters"
          value={form.tag}
          placeholder="TGR"
          aria-invalid={!!show('tag') || undefined}
          onChange={(e) => {
            setTagEdited(true);
            setForm((f) => ({ ...f, tag: cleanTag(e.target.value) }));
          }}
        />
      </Field>
      <Field label="Descripción (opcional)" hint={show('description') ? <span className="text-danger">{show('description')}</span> : undefined}>
        <Textarea rows={2} maxLength={200} value={form.description} placeholder="Jugamos los fines de semana, buscamos un suplente…" onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
      </Field>
      <TeamLogoField value={logo} onChange={setLogo} name={form.name || 'Equipo'} tag={form.tag} />
      <Button type="submit" variant="primary" size={pro ? 'lg' : 'xl'} className="mt-1 w-full" loading={busy} icon={<Users className="size-5" />}>
        Crear equipo
      </Button>
    </form>
  );
}

/**
 * «Logo (opcional)» de un equipo: se elige la imagen, se recorta al cuadrado del centro y se comprime de una (así un
 * archivo que no sirve se avisa aquí); se sube después (al crear o al guardar). Sin uno nuevo, el de ahora (`current`).
 * `onRemove`: «Quitar» el de ahora (al editar).
 */
export function TeamLogoField({
  value,
  onChange,
  name,
  tag,
  current = null,
  removed = false,
  onRemove,
}: {
  value: CompressedLogo | null;
  onChange: (logo: CompressedLogo | null) => void;
  name: string;
  tag: string;
  current?: string | null;
  removed?: boolean;
  onRemove?: (removed: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!value || typeof URL.createObjectURL !== 'function') {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(value.blob);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  async function pick(file: File | undefined) {
    if (input.current) input.current.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await prepareLogo(file));
      onRemove?.(false);
    } catch (e) {
      setError(logoErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  const showCurrent = !value && !removed && !!current;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">Logo (opcional)</span>
      <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
        {preview ? (
          <img src={preview} alt="" className="size-14 shrink-0 rounded-full bg-surface object-cover" />
        ) : showCurrent ? (
          <TeamLogo path={current} name={name} tag={tag} className="size-14" />
        ) : (
          <span className="grid size-14 shrink-0 place-items-center rounded-full border border-dashed border-line text-muted" aria-hidden="true">
            <ImagePlus className="size-6" />
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <Button className="h-11" loading={busy} onClick={() => input.current?.click()} icon={<ImageUp className="size-4" />}>
            {busy ? 'Preparando…' : value || showCurrent ? 'Cambiar' : 'Elegir logo'}
          </Button>
          {(value || showCurrent) && !busy && (
            <Button
              className="h-11"
              variant="ghost"
              onClick={() => {
                if (value) onChange(null);
                else onRemove?.(true);
              }}
              icon={<X className="size-4" />}
            >
              Quitar
            </Button>
          )}
        </div>
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : (
        <span className="text-xs text-muted">Se recorta al cuadrado del centro. Es una imagen pública.</span>
      )}
    </div>
  );
}
