import { useEffect, useState, type FormEvent } from 'react';
import { Check } from 'lucide-react';
import { checkUsername, normalizeUsername, setUsername, USERNAME_MAX, usernameErrorText, usernameProblem } from '../../lib/data/people';
import { useFeedback } from '../feedback';
import { Button, Field, Input, cx } from '../ui';
import { usernameHint, type UsernameCheck } from './socialFormat';

/** Espera después de la última tecla antes de preguntar si está libre. */
export const USERNAME_CHECK_MS = 350;

const HINT_TONE = { muted: 'text-muted', ok: 'text-ok', danger: 'text-danger' } as const;

/**
 * Cambiar el @usuario en /cuenta: el campo «Tu usuario» con la @ delante; mientras escribe dice si está
 * disponible (pregunta a la base 350 ms después de la última tecla) o qué le falta al formato. «Guardar» solo con
 * uno libre o el de ahora (ese solo cierra).
 */
export function UsernameForm({ uid, current, onDone }: { uid: string; current: string; onDone: () => void }) {
  const { toast } = useFeedback();
  const [value, setValue] = useState(current);
  const [check, setCheck] = useState<UsernameCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const v = normalizeUsername(value);

  useEffect(() => {
    if (!v || v === normalizeUsername(current) || usernameProblem(v)) return;
    let alive = true;
    const t = setTimeout(() => {
      // Si no se pudo preguntar (sin señal, muchas veces seguidas) no se dice nada: al guardar se revisa otra vez.
      checkUsername(v).then(
        (status) => alive && setCheck({ value: v, status }),
        () => alive && setCheck({ value: v, status: 'unknown' }),
      );
    }, USERNAME_CHECK_MS);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [v, current]);

  const hint = usernameHint(value, current, check);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy || !hint.canSave) return;
    if (v === normalizeUsername(current)) {
      onDone();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await setUsername(uid, v);
      toast(`Tu usuario ahora es @${saved}`);
      onDone();
    } catch (err) {
      setError(usernameErrorText(err, v));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <Field
        label="Tu usuario"
        hint={
          <span className={cx(HINT_TONE[hint.tone], hint.tone !== 'muted' && 'font-medium')} aria-live="polite">
            {hint.text}
          </span>
        }
      >
        <span className="relative block">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-base text-muted sm:text-sm" aria-hidden="true">
            @
          </span>
          <Input
            value={value}
            // Como lo guarda la base: minúsculas, sin espacios y sin la @ (ya está delante).
            onChange={(e) => {
              setValue(e.target.value.toLowerCase().replace(/\s+/g, '').replace(/^@+/, ''));
              setError(null);
            }}
            maxLength={USERNAME_MAX}
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            // No es el usuario para entrar (ese es el correo): que el gestor de contraseñas no lo llene.
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="done"
            aria-invalid={hint.tone === 'danger' || undefined}
            placeholder="tu_usuario"
            className="h-11 pl-7"
          />
        </span>
      </Field>
      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone} className="max-sm:h-11">
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={busy} disabled={!hint.canSave} icon={<Check className="size-4" />} className="max-sm:h-11">
          Guardar
        </Button>
      </div>
    </form>
  );
}
