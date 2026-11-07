/**
 * Piezas de Organizar › Equipos de los deportes de equipo en la app (AdminParts.tsx de la web y lo que se repite en
 * sus hojas): correr una acción con su aviso, el aviso en ámbar, las acciones como filas con su ícono, las plantillas
 * de reglas como filas para elegir (✓ la que se usa), la tarjeta de ajustes con su título, un número que se escribe,
 * los equipos para marcar y «Es menor de edad» al crear un jugador al vuelo.
 */
import { Children, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { AlertTriangle, Check, type LucideIcon } from 'lucide-react-native';
import type { SeasonTeam } from '@mm/lib/data/seasonTeams';
import type { MinorInput } from '@mm/lib/data/players';
import { saveErrorMessage } from '@mm/lib/errorText';
import { useLeagueCtx } from '@mm/lib/league';
import { emptyGuardian, guardianProblem, type GuardianDraft } from '@mm/components/players/logic';
import { GuardianFields, MinorCheck } from '@/components/players/fields';
import { toast } from '@/components/feedback';
import { Card, Field, Input, SectionHeader, Txt } from '@/components/ui';
import { TeamDot } from '../TeamBits';
import { useColors } from '@/theme/theme';
import { font, size } from '@/theme/tokens';

/** Lo que hace la web con useAction: corre lo pedido y, si falla, avisa con el mensaje de siempre; `ok`, el aviso. */
export async function act<T>(fn: () => Promise<T>, ok?: string): Promise<T | undefined> {
  try {
    const r = await fn();
    if (ok) toast(ok);
    return r;
  } catch (e) {
    console.warn('[equipos]', e);
    toast(saveErrorMessage(e), 'error');
    return undefined;
  }
}

/** Un aviso en ámbar con su triángulo (Warn de la web). */
export function Warn({ children }: { children: ReactNode }) {
  const c = useColors();
  return (
    <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: c.warnSoft }}>
      <AlertTriangle size={16} color={c.warn} style={{ marginTop: 2 }} />
      <Txt variant="meta" tone="warn" style={{ flex: 1 }}>
        {children}
      </Txt>
    </View>
  );
}

/** Una acción de Organizar como fila: ícono, qué hace y una línea. */
export interface AdminAction {
  key: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  onPress: () => void;
  disabled?: boolean;
}

/** El cuadrito del ícono de una fila: en el color del deporte o neutro. */
export function ToneIcon({ icon: Icon, accent }: { icon: LucideIcon; accent?: boolean }) {
  const c = useColors();
  return (
    <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: accent ? c.accentSoft : c.surface2 }}>
      <Icon size={20} color={accent ? c.accent : c.fg2} />
    </View>
  );
}

/** Una fila de una tarjeta: lo de adelante, el título, la línea de abajo y lo de atrás (ListRow de la web). */
export function Row({
  leading,
  title,
  subtitle,
  trailing,
  onPress,
  me,
  disabled,
  accessibilityLabel,
  top,
}: {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => unknown;
  /** Lo mío (tu jugador, la plantilla en uso): fondo suave del color del deporte. */
  me?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  /** La primera fila de la tarjeta (sin la línea de arriba). */
  top?: boolean;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      disabled={!onPress || disabled}
      onPress={() => void onPress?.()}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        minHeight: size.row,
        paddingLeft: 18,
        paddingRight: 16,
        paddingVertical: 10,
        borderTopWidth: top ? 0 : 1,
        borderTopColor: c.line,
        opacity: disabled ? 0.5 : 1,
        backgroundColor: pressed ? c.surface2 : me ? c.accentSoft : 'transparent',
      })}
    >
      {leading}
      <View style={{ flex: 1, minWidth: 0 }}>
        {typeof title === 'string' ? (
          <Txt variant="bodyStrong" numberOfLines={1}>
            {title}
          </Txt>
        ) : (
          title
        )}
        {typeof subtitle === 'string' ? (
          !!subtitle && (
            <Txt variant="meta" tone="muted" numberOfLines={2}>
              {subtitle}
            </Txt>
          )
        ) : (
          subtitle
        )}
      </View>
      {trailing}
    </Pressable>
  );
}

/** Las acciones como filas en una tarjeta (la primera en el color del deporte) y la pista de abajo. */
export function AdminActions({ actions, hint }: { actions: readonly AdminAction[]; hint?: string }) {
  return (
    <View style={{ gap: 10 }}>
      <Card padded={false} style={{ overflow: 'hidden' }}>
        {actions.map((a, i) => (
          <Row key={a.key} top={i === 0} leading={<ToneIcon icon={a.icon} accent={i === 0} />} title={a.title} subtitle={a.subtitle} disabled={a.disabled} onPress={a.disabled ? undefined : a.onPress} />
        ))}
      </Card>
      {!!hint && (
        <Txt variant="meta" tone="muted" style={{ marginHorizontal: 4 }}>
          {hint}
        </Txt>
      )}
    </View>
  );
}

/** Una plantilla de reglas («Liga FIBA», «Fútbol 7»…). */
export interface TemplateOption<K extends string> {
  id: K;
  name: string;
  description: string;
}

/**
 * Las plantillas como filas para elegir: la que se usa con ✓ en el color del deporte; tocar otra la usa (después de
 * preguntar). Mientras se guarda, la ruedita en su fila.
 */
export function TemplateRows<K extends string>({
  templates,
  active,
  busy,
  disabled,
  onPick,
  footer,
}: {
  templates: readonly TemplateOption<K>[];
  active: K | null | undefined;
  busy: (id: K) => boolean;
  disabled?: boolean;
  onPick: (id: K) => void;
  footer?: string;
}) {
  const c = useColors();
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader title="Plantillas" />
      <Card padded={false} style={{ overflow: 'hidden' }}>
        {templates.map((t, i) => {
          const on = active === t.id;
          return (
            <Row
              key={t.id}
              top={i === 0}
              me={on}
              title={
                <Txt variant="bodyStrong">
                  {t.name}
                  {on && (
                    <Txt variant="meta" tone="accent" style={{ fontFamily: font.semibold }}>
                      {'  · En uso'}
                    </Txt>
                  )}
                </Txt>
              }
              subtitle={t.description}
              onPress={on || disabled ? undefined : () => onPick(t.id)}
              accessibilityLabel={on ? `${t.name} (en uso)` : `Usar ${t.name}`}
              trailing={
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: on ? c.accent : 'transparent',
                    borderWidth: on ? 0 : 1.5,
                    borderColor: c.faint,
                  }}
                >
                  {busy(t.id) ? <ActivityIndicator size="small" color={on ? c.accentFg : c.faint} /> : on ? <Check size={16} strokeWidth={2.6} color={c.accentFg} /> : null}
                </View>
              }
            />
          );
        })}
      </Card>
      {!!footer && (
        <Txt variant="meta" tone="muted" style={{ marginHorizontal: 4 }}>
          {footer}
        </Txt>
      )}
    </View>
  );
}

/** Una tarjeta de ajustes con su título de sección (El partido, La tabla, Disciplina…). */
export function SettingsCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader title={title} />
      <Card style={{ gap: 12 }}>{children}</Card>
    </View>
  );
}

/** Un número que se escribe (los campos `inputMode="numeric"` de la web). */
export function NumField({ label, value, onChange, hint, center }: { label: string; value: string; onChange: (v: string) => void; hint?: string; center?: boolean }) {
  return (
    <Field label={label} hint={hint}>
      <Input keyboardType="number-pad" value={value} onChangeText={onChange} accessibilityLabel={label} style={center ? { textAlign: 'center', fontFamily: font.bold } : undefined} />
    </Field>
  );
}

/** Un sí/no como fila (ToggleRow de la web): el texto y la casilla del color del deporte; `disabled` la apaga. */
export function CheckRow({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 8, opacity: disabled ? 0.5 : 1 }}
    >
      <Txt style={{ flex: 1, fontSize: 15 }}>{label}</Txt>
      <View style={{ width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: checked ? c.accent : c.surface, borderWidth: checked ? 0 : 1.5, borderColor: c.faint }}>
        {checked && <Check size={16} color={c.accentFg} strokeWidth={3} />}
      </View>
    </Pressable>
  );
}

/** Los sí/no de una tarjeta de ajustes, con una línea entre cada uno. */
export function CheckRows({ children }: { children: ReactNode }) {
  const c = useColors();
  const items = Children.toArray(children);
  return (
    <View>
      {items.map((child, i) => (
        <View key={i} style={{ borderTopWidth: i > 0 ? 1 : 0, borderTopColor: c.line }}>
          {child}
        </View>
      ))}
    </View>
  );
}

/** Dos campos lado a lado (la grilla de 2 columnas de la web). */
export function Pair({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>{children}</View>;
}

/** Una mitad de `Pair`. */
export function Half({ children }: { children: ReactNode }) {
  return <View style={{ flex: 1, minWidth: 0 }}>{children}</View>;
}

/** «Equipos (n)»: cada equipo como ficha con su punto; tocarla lo saca o lo vuelve a meter. */
export function TeamChips({ teams, ids, onToggle }: { teams: readonly Pick<SeasonTeam, 'id' | 'name' | 'color' | 'order'>[]; ids: readonly string[]; onToggle: (id: string) => void }) {
  const c = useColors();
  return (
    <Field label={`Equipos (${ids.length})`}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {teams.map((t) => {
          const on = ids.includes(t.id);
          return (
            <Pressable
              key={t.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={t.name}
              onPress={() => onToggle(t.id)}
              hitSlop={{ top: 4, bottom: 4 }}
              style={{ height: 36, borderRadius: 18, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: on ? c.accentSoft : c.surface2 }}
            >
              <TeamDot team={t} />
              <Txt numberOfLines={1} style={{ fontSize: 14, fontFamily: font.semibold, color: on ? c.fg : c.muted }}>
                {t.name}
              </Txt>
            </Pressable>
          );
        })}
      </View>
    </Field>
  );
}

/** Lo que da useQuickMinor: `fields` va debajo del nombre; `take()` antes de crear; `reset()` después. */
export interface QuickMinor {
  fields: ReactNode;
  /** Lo que va a createPlayer: null = adulto; undefined = falta algo del tutor (el error ya se ve en `fields`). */
  take: () => MinorInput | null | undefined;
  reset: () => void;
}

/**
 * Agregar a alguien al vuelo (plantillas) en una liga con menores, como useQuickMinor de la web: pregunta «Es menor de
 * edad» (marcado de entrada) y pide su tutor. `show`: ya hay un nombre escrito.
 */
export function useQuickMinor(show: boolean): QuickMinor {
  const c = useColors();
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
      <View style={{ gap: 12, borderRadius: 16, padding: 16, backgroundColor: c.surface }}>
        <MinorCheck checked={isMinor} onChange={setIsMinor} />
        {isMinor && <GuardianFields value={guardian} onChange={setGuardian} />}
        {!!error && isMinor && (
          <Txt accessibilityRole="alert" variant="meta" tone="danger">
            {error}
          </Txt>
        )}
      </View>
    ) : null;
  return { fields, take, reset };
}
