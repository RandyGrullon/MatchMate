/**
 * Piezas chicas de lo que organiza el admin en raqueta (bits.tsx y night/parts.tsx de la web): «•••» y su hoja, el pie
 * Cancelar / Guardar, el número con − y +, la lista para elegir con búsqueda, «Es menor de edad» al agregar a alguien y
 * el aviso de lo que en Lite se organiza en Pro. Y el deporte con lo puro que agrega (extensions.ts de la web).
 */
import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Check, ChevronRight, Ellipsis, Globe, Minus, Plus, Search, type LucideIcon } from 'lucide-react-native';
import type { MinorInput } from '@mm/lib/data/players';
import { useLeagueCtx } from '@mm/lib/league';
import { emptyGuardian, guardianProblem, type GuardianDraft } from '@mm/components/players/logic';
import { racketPureExt } from '@mm/pages/sports/racket/extensions';
import { useRacket, type RacketContext } from '@mm/pages/sports/racket/sport';
import { GuardianFields, MinorCheck } from '../players/fields';
import { Button, Card, Input, Sheet, Txt } from '../ui';
import { openOnWeb } from '@/lib/web';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/**
 * El deporte de la pantalla con lo que agrega (las palabras, las plantillas que esconde, la línea de cada evento): el de
 * RacketProvider o, si no trae nada, lo puro del deporte (extensions.ts).
 */
export function useRacketPhone(): RacketContext {
  const r = useRacket();
  const ext = Object.keys(r.ext).length ? r.ext : racketPureExt(r.sport);
  return ext === r.ext ? r : { ...r, ext };
}

// ---------- «•••» ----------

/** «•••» arriba de la pantalla (MoreButton de la web). */
export function MoreButton({ onPress, label = 'Más opciones' }: { onPress: () => void; label?: string }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={4} onPress={onPress} style={[styles.round, { backgroundColor: c.surface2 }]}>
      <Ellipsis size={22} color={c.fg2} strokeWidth={2.4} />
    </Pressable>
  );
}

export interface MenuItem {
  key: string;
  icon: LucideIcon;
  label: string;
  hint?: string;
  onPress: () => void;
  danger?: boolean;
  /** Se está haciendo (la ruedita en su fila). */
  busy?: boolean;
}

/** La hoja de «•••» (EventMenu de la web): cada opción con su ícono, su nombre y la línea de abajo. */
export function MenuSheet({ open, onClose, title, items }: { open: boolean; onClose: () => void; title: string; items: readonly MenuItem[] }) {
  const c = useColors();
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <Pressable
            key={it.key}
            accessibilityRole="button"
            accessibilityLabel={it.hint ? `${it.label}. ${it.hint}` : it.label}
            accessibilityState={{ busy: !!it.busy }}
            disabled={it.busy}
            onPress={it.onPress}
            style={({ pressed }) => [styles.menuRow, { backgroundColor: pressed ? c.surface2 : 'transparent' }]}
          >
            <View style={[styles.menuIcon, { backgroundColor: it.danger ? c.dangerSoft : c.surface2 }]}>
              <Icon size={20} color={it.danger ? c.danger : c.fg2} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="bodyStrong" tone={it.danger ? 'danger' : 'fg'} numberOfLines={1}>
                {it.label}
              </Txt>
              {!!it.hint && (
                <Txt tone="muted" numberOfLines={1} style={{ fontSize: 13 }}>
                  {it.hint}
                </Txt>
              )}
            </View>
            {it.busy ? <ActivityIndicator color={c.muted} /> : !it.danger && <ChevronRight size={20} color={c.faint} />}
          </Pressable>
        );
      })}
    </Sheet>
  );
}

/** La cabecera de una pantalla de raqueta: el título y lo de ahora, con «•••» a la derecha (`right`) si hay opciones. */
export function ScreenHead({ title, status, meta, right }: { title: string; status?: { text: string; live?: boolean } | null; meta?: string | null; right?: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Txt variant="title" style={{ fontSize: 28, lineHeight: 33 }}>
          {title}
        </Txt>
        {(!!status || !!meta) && (
          <Txt variant="meta" tone="muted">
            {status && (
              <Txt variant="meta" style={{ fontFamily: font.semibold, color: status.live ? c.accent : c.fg2 }}>
                {status.live ? '● ' : ''}
                {status.text}
              </Txt>
            )}
            {status && meta ? ' · ' : ''}
            {meta ?? ''}
          </Txt>
        )}
      </View>
      {right}
    </View>
  );
}

/** «•••» con su hoja (sin opciones no sale). Las hojas de cada opción van aparte (`children`). */
export function EventMenu({ title, items, children }: { title: string; items: readonly MenuItem[]; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  // Al tocar una opción se cierra el menú y la opción sigue cuando ya se fue (dos hojas a la vez no se ven en el iPhone).
  const wrapped = items.map((it) => ({
    ...it,
    onPress: () => {
      setOpen(false);
      setTimeout(it.onPress, SHEET_CLOSE_MS);
    },
  }));
  return (
    <>
      {items.length > 0 && <MoreButton onPress={() => setOpen(true)} />}
      <MenuSheet open={open} onClose={() => setOpen(false)} title={title} items={wrapped} />
      {children}
    </>
  );
}

/** Lo que tarda en irse una hoja antes de abrir otra cosa (otra hoja, la pregunta del sistema). */
export const SHEET_CLOSE_MS = 400;

// ---------- Hojas ----------

/** El pie de las hojas que guardan: Cancelar y Guardar, del mismo tamaño. */
export function SaveFooter({ onClose, busy, disabled, onSave, label = 'Guardar' }: { onClose: () => void; busy: boolean; disabled?: boolean; onSave: () => void; label?: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ flex: 1 }}>
        <Button size="lg" full onPress={onClose}>
          Cancelar
        </Button>
      </View>
      <View style={{ flex: 1 }}>
        <Button variant="primary" size="lg" full loading={busy} disabled={disabled} onPress={onSave}>
          {label}
        </Button>
      </View>
    </View>
  );
}

// ---------- Campos ----------

/** Número con − y + grandes (rondas, canchas, cupo). */
export function Stepper({ value, onChange, min = 0, max = 99, step = 1, label, suffix }: { value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; label: string; suffix?: string }) {
  const c = useColors();
  const btn = (dir: -1 | 1) => {
    const off = dir < 0 ? value <= min : value >= max;
    const Icon = dir < 0 ? Minus : Plus;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${dir < 0 ? 'Menos' : 'Más'} ${label.toLowerCase()}`}
        accessibilityState={{ disabled: off }}
        disabled={off}
        onPress={() => onChange(dir < 0 ? Math.max(min, value - step) : Math.min(max, value + step))}
        style={[styles.round, { backgroundColor: c.surface2, opacity: off ? 0.4 : 1 }]}
      >
        <Icon size={20} color={c.fg} />
      </Pressable>
    );
  };
  return (
    <View style={{ gap: 6, flex: 1, minWidth: 140 }}>
      <Txt tone="muted" style={{ fontSize: 12, fontFamily: font.medium }}>
        {label}
      </Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {btn(-1)}
        <Txt accessibilityLiveRegion="polite" style={{ minWidth: 56, textAlign: 'center', fontSize: 22, fontFamily: font.bold }}>
          {value}
          {!!suffix && <Txt tone="muted" style={{ fontSize: 14, fontFamily: font.medium }}>{` ${suffix}`}</Txt>}
        </Txt>
        {btn(1)}
      </View>
    </View>
  );
}

/** Dos o más campos en filas de dos (la grilla de la web). */
export function Pairs({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{children}</View>;
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Lista para elegir (jugadores o parejas) con búsqueda (más de 8) y filas grandes (PickList de la web). */
export function PickList({
  items,
  selected,
  onToggle,
  empty = 'No hay nadie todavía.',
  max,
}: {
  items: readonly { id: string; name: string; sub?: string }[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  empty?: ReactNode;
  max?: number;
}) {
  const c = useColors();
  const [q, setQ] = useState('');
  const shown = useMemo(() => (q.trim() ? items.filter((x) => norm(x.name).includes(norm(q.trim()))) : items), [items, q]);
  if (!items.length) {
    return (
      <View style={[styles.note, { backgroundColor: c.surface2 }]}>
        {typeof empty === 'string' ? (
          <Txt tone="muted" style={{ fontSize: 14 }}>
            {empty}
          </Txt>
        ) : (
          empty
        )}
      </View>
    );
  }
  return (
    <View style={{ gap: 8 }}>
      {items.length > 8 && (
        <View style={{ justifyContent: 'center' }}>
          <Search size={16} color={c.muted} style={{ position: 'absolute', left: 14, zIndex: 1 }} />
          <Input value={q} onChangeText={setQ} placeholder="Buscar" accessibilityLabel="Buscar" style={{ height: 44, borderRadius: 22, paddingLeft: 40, fontSize: 16 }} />
        </View>
      )}
      <Card padded={false}>
        {shown.map((x, i) => {
          const on = selected.has(x.id);
          const full = !on && max != null && selected.size >= max;
          return (
            <Pressable
              key={x.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled: full }}
              accessibilityLabel={x.sub ? `${x.name}. ${x.sub}` : x.name}
              disabled={full}
              onPress={() => onToggle(x.id)}
              style={({ pressed }) => [
                styles.pickRow,
                { opacity: full ? 0.4 : 1, backgroundColor: pressed ? c.surface2 : 'transparent', borderTopWidth: i > 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: c.line },
              ]}
            >
              <View style={[styles.check, on ? { backgroundColor: c.accent } : { borderWidth: 1.5, borderColor: c.faint }]}>{on && <Check size={16} color={c.accentFg} strokeWidth={3} />}</View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt numberOfLines={1} style={{ fontSize: 15, fontFamily: font.semibold }}>
                  {x.name}
                </Txt>
                {!!x.sub && (
                  <Txt tone="muted" numberOfLines={1} style={{ fontSize: 13 }}>
                    {x.sub}
                  </Txt>
                )}
              </View>
            </Pressable>
          );
        })}
      </Card>
    </View>
  );
}

/** Una nota en su caja gris (o roja, `danger`). */
export function Note({ children, danger }: { children: ReactNode; danger?: boolean }) {
  const c = useColors();
  return (
    <View style={[styles.note, { backgroundColor: danger ? c.dangerSoft : c.surface2 }]}>
      <Txt style={{ fontSize: 14, color: danger ? c.danger : c.fg2 }}>{children}</Txt>
    </View>
  );
}

/**
 * Liga con menores: «Es menor de edad» y su tutor debajo del nombre al agregar a alguien (useQuickMinor de la web).
 * `take()`: null si no es menor, los datos del tutor, o undefined si faltan (y dice qué falta).
 */
export function useQuickMinor(show: boolean): { fields: ReactNode; take: () => MinorInput | null | undefined; reset: () => void } {
  const { league } = useLeagueCtx();
  const on = !!league.hasMinors;
  const [isMinor, setIsMinor] = useState(true);
  const [guardian, setGuardian] = useState<GuardianDraft>(emptyGuardian);
  const [error, setError] = useState<string | null>(null);
  const take = (): MinorInput | null | undefined => {
    if (!on || !isMinor) return null;
    const problem = guardianProblem(guardian);
    setError(problem);
    if (problem) return undefined;
    return { guardianName: guardian.guardianName, guardianPhone: guardian.guardianPhone, consent: guardian.consent };
  };
  const reset = () => {
    setIsMinor(true);
    setGuardian(emptyGuardian);
    setError(null);
  };
  const fields =
    on && show ? (
      <Minor isMinor={isMinor} setIsMinor={setIsMinor} guardian={guardian} setGuardian={setGuardian} error={error} />
    ) : null;
  return { fields, take, reset };
}

function Minor({ isMinor, setIsMinor, guardian, setGuardian, error }: { isMinor: boolean; setIsMinor: (v: boolean) => void; guardian: GuardianDraft; setGuardian: (g: GuardianDraft) => void; error: string | null }) {
  const c = useColors();
  return (
    <View style={{ gap: 12, borderRadius: 16, padding: 16, backgroundColor: c.surface2 }}>
      <MinorCheck checked={isMinor} onChange={setIsMinor} />
      {isMinor && <GuardianFields value={guardian} onChange={setGuardian} />}
      {!!error && isMinor && (
        <Txt accessibilityRole="alert" tone="danger" style={{ fontSize: 14 }}>
          {error}
        </Txt>
      )}
    </View>
  );
}

// ---------- Lo de Pro ----------

/**
 * Lite, quien organiza: lo de organizar (armar las rondas, el calendario, los grupos y el cuadro, cerrar el mes) en la
 * web está en Pro («Organizas esta noche · Las rondas se arman en Pro · Usar Pro»). La app es Lite y no tiene Pro: el
 * mismo aviso, y se abre en la web.
 */
export function ProNotice({ title, text, path }: { title: string; text: string; path: string }) {
  const c = useColors();
  return (
    <Card style={{ gap: 10, backgroundColor: c.accentSoft }}>
      <View style={{ gap: 2 }}>
        <Txt variant="bodyStrong">{title}</Txt>
        <Txt tone="fg2" style={{ fontSize: 14 }}>
          {text}
        </Txt>
      </View>
      <Button size="lg" full icon={<Globe size={18} color={c.fg} />} onPress={() => void openOnWeb(path)}>
        Abrir en la web
      </Button>
    </Card>
  );
}

const styles = StyleSheet.create({
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, borderRadius: 16, paddingHorizontal: 8, paddingVertical: 8 },
  menuIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  note: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingVertical: 8, paddingHorizontal: 20 },
  check: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
