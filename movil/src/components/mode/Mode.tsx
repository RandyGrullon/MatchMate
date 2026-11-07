import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Check, ChevronDown, ClipboardCheck, Leaf, Zap } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import type { UiMode } from '@mm/lib/mode';
import type { Notice } from '@mm/lib/notices';
import { useIsPro, useMode } from '@mm/lib/useMode';
import { MODE_CARDS, useOrganizedLabel } from '@mm/components/mode/cards';
import { closeModeSheet, modeSheetSeen, openModeSheet, pickAction, useModeSheetState } from '@mm/components/mode/modeSheet';
import { MODE_TOAST_COPY, hideModeToast, modeToastSnapshot, subscribeModeToast, useSwitchMode } from '@mm/components/mode/toast';
import { Button, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/**
 * El modo de la app (Lite | Pro), como src/components/mode de la web, con su misma lógica (src/lib/mode.ts y
 * useMode.ts, src/components/mode/{modeSheet,toast,cards}.ts): el selector de Yo, el aviso «Modo Pro activado ·
 * Deshacer», la hoja «Elige cómo ver la app», la etiqueta «PRO ▾» de Hoy y el aviso «Usar Pro» de lo que es de Pro.
 * El modo solo muestra u oculta secciones: los permisos siguen siendo los de cada liga.
 */

/** Solo en Pro (o `fallback`). */
export function ProOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return <>{useIsPro() ? children : fallback}</>;
}

/** Solo en Lite (la versión corta de algo que Pro muestra completo). */
export function LiteOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return <>{useIsPro() ? fallback : children}</>;
}

const MODE_ICON = { lite: Leaf, pro: Zap } as const;

/**
 * El selector «Lite | Pro» de arriba de Yo (ModeSwitch de la web). La primera vez que se toca «Pro» abre la hoja «Elige
 * cómo ver la app» con Pro marcado; después cambia al momento y lo anuncia abajo con «Deshacer».
 */
export function ModeSwitch() {
  const c = useColors();
  const { mode } = useMode();
  const { user } = useAuth();
  const switchMode = useSwitchMode();
  const pick = (next: UiMode) => {
    if (pickAction(next, modeSheetSeen(user?.uid)) === 'sheet') return openModeSheet(next, user?.uid);
    void switchMode(next);
  };
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Cómo ver la app" style={[styles.switch, { backgroundColor: c.surface2 }]}>
      {(['lite', 'pro'] as const).map((key) => {
        const on = mode === key;
        const Icon = MODE_ICON[key];
        return (
          <Pressable
            key={key}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={MODE_CARDS[key].label}
            onPress={() => pick(key)}
            style={[styles.switchItem, on && { backgroundColor: c.segOn, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } }]}
          >
            <Icon size={17} color={on ? c.accent : c.muted} />
            <Txt variant="bodyStrong" tone={on ? 'fg' : 'muted'}>
              {MODE_CARDS[key].label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** La etiqueta «PRO ▾» junto a la fecha de Hoy: solo en Pro; abre la hoja del modo. */
export function ModeTag() {
  const c = useColors();
  const { mode } = useMode();
  const { user } = useAuth();
  if (mode !== 'pro') return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Modo Pro: cambiar cómo ver la app"
      hitSlop={10}
      onPress={() => openModeSheet(mode, user?.uid)}
      style={[styles.tag, { backgroundColor: c.accentSoft }]}
    >
      <Txt style={{ color: c.accent, fontFamily: font.bold, fontSize: 11.5, letterSpacing: 0.7 }}>PRO</Txt>
      <ChevronDown size={12} color={c.accent} strokeWidth={3} />
    </Pressable>
  );
}

/** Abre la hoja del modo con el de ahora marcado (Configuración › «Cómo ver la app»). */
export function useOpenModeSheet(): () => void {
  const { mode } = useMode();
  const { user } = useAuth();
  return () => openModeSheet(mode, user?.uid);
}

/**
 * El aviso de abajo al cambiar de modo (ModeToast de la web), una vez, en el marco de la app: oscuro en claro y claro en
 * oscuro, encima de la barra de abajo. «Deshacer» vuelve al modo de antes.
 */
export function ModeToastHost() {
  const c = useColors();
  const s = useSyncExternalStore(subscribeModeToast, modeToastSnapshot, modeToastSnapshot);
  const { setMode } = useMode();
  if (!s) return null;
  const copy = MODE_TOAST_COPY[s.to];
  const Icon = MODE_ICON[s.to];
  return (
    <View pointerEvents="box-none" style={styles.toastWrap}>
      <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.toast, { backgroundColor: c.fg }]}>
        <View style={[styles.toastIcon, { backgroundColor: c.accent }]}>
          <Icon size={19} color={c.accentFg} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt style={{ color: c.bg, fontFamily: font.semibold, fontSize: 15 }}>{copy.title}</Txt>
          <Txt style={{ color: c.bg, opacity: 0.75, fontSize: 13.5 }}>{copy.text}</Txt>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            hideModeToast();
            void setMode(s.from);
          }}
          style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 }}
        >
          <Txt style={{ color: c.accentSoft, fontFamily: font.bold, fontSize: 15 }}>Deshacer</Txt>
        </Pressable>
      </View>
    </View>
  );
}

/** La hoja «Elige cómo ver la app» de cualquier pantalla (ModeSheetHost de la web), una vez, en el marco de la app. */
export function ModeSheetHost() {
  const state = useModeSheetState();
  if (!state) return null;
  return (
    <Sheet open onClose={closeModeSheet} title="Elige cómo ver la app">
      <ModeChoice initial={state.initial} onDone={closeModeSheet} />
    </Sheet>
  );
}

/**
 * Lite (lo esencial) o Pro (todo el detalle), en dos tarjetas (ModeChoice de la web): a quien organiza una liga y está
 * en Lite, Pro sale marcado «Para ti» con «Organizas …: en Pro ves en Hoy lo que espera por ti». «Usar Pro» cambia al
 * momento (con «Deshacer» abajo); «Seguir en Lite» la cierra.
 */
function ModeChoice({ initial, onDone }: { initial?: UiMode; onDone: () => void }) {
  const c = useColors();
  const { mode, suggestedPro } = useMode();
  const switchMode = useSwitchMode();
  const organized = useOrganizedLabel();
  const forYou = suggestedPro && mode === 'lite';
  const [pick, setPick] = useState<UiMode>(initial ?? (forYou ? 'pro' : mode));
  const changes = pick !== mode;
  const PickIcon = MODE_ICON[pick];
  return (
    <View style={{ gap: 14 }}>
      <Txt variant="meta" tone="muted">
        La misma app, con más o menos detalle. Se guarda en tu cuenta y cambias cuando quieras.
      </Txt>
      <View accessibilityRole="radiogroup" accessibilityLabel="Cómo ver la app" style={{ flexDirection: 'row', gap: 10 }}>
        {(['lite', 'pro'] as const).map((key) => {
          const card = MODE_CARDS[key];
          const on = pick === key;
          const Icon = MODE_ICON[key];
          return (
            <Pressable
              key={key}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => setPick(key)}
              style={[styles.card, on ? { backgroundColor: c.accentSoft, borderColor: c.accent, borderWidth: 2 } : { borderColor: c.line, borderWidth: 1.5 }]}
            >
              {key === 'pro' && forYou && (
                <View style={[styles.forYou, { backgroundColor: c.accent }]}>
                  <Txt style={{ color: c.accentFg, fontFamily: font.bold, fontSize: 11.5 }}>Para ti</Txt>
                </View>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon size={20} color={on ? c.accent : c.muted} />
                <Txt variant="cardTitle">{card.label}</Txt>
              </View>
              <Txt tone="muted" style={{ fontSize: 13 }}>
                {card.tagline}
              </Txt>
              <ModeSketch mode={key} on={on} />
              <View style={{ gap: 7 }}>
                {card.items.map((it) => (
                  <View key={it} style={{ flexDirection: 'row', gap: 6 }}>
                    <Check size={14} color={c.accent} strokeWidth={2.6} style={{ marginTop: 2 }} />
                    <Txt tone="fg2" style={{ fontSize: 13, flex: 1 }}>
                      {it}
                    </Txt>
                  </View>
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>
      {forYou && !!organized && (
        <View style={[styles.organized, { backgroundColor: c.surface2 }]}>
          <ClipboardCheck size={22} color={c.accent} />
          <Txt tone="fg2" style={{ fontSize: 14, flex: 1 }}>
            {'Organizas '}
            <Txt style={{ fontSize: 14, fontFamily: font.semibold }}>{organized}</Txt>
            {': en Pro ves en Hoy lo que espera por ti.'}
          </Txt>
        </View>
      )}
      <Button
        variant="primary"
        size="xl"
        full
        icon={<PickIcon size={19} color={c.accentFg} />}
        onPress={() => {
          if (changes) void switchMode(pick);
          onDone();
        }}
      >
        {changes ? `Usar ${MODE_CARDS[pick].label}` : `Seguir en ${MODE_CARDS[mode].label}`}
      </Button>
      {changes && (
        <Pressable accessibilityRole="button" onPress={onDone} style={{ minHeight: 46, alignItems: 'center', justifyContent: 'center' }}>
          <Txt variant="meta" tone="fg2" style={{ fontFamily: font.medium }}>{`Seguir en ${MODE_CARDS[mode].label}`}</Txt>
        </Pressable>
      )}
    </View>
  );
}

/** El dibujito de cada modo (adorno, como la web): Lite, una tarjeta y un botón; Pro, cuatro fichas, dos botones y líneas. */
function ModeSketch({ mode, on }: { mode: UiMode; on: boolean }) {
  const c = useColors();
  const soft = on ? c.accentSoft : c.surface2;
  const box = (style: object) => <View style={[{ borderRadius: 5 }, style]} />;
  return (
    <View importantForAccessibility="no-hide-descendants" style={[styles.sketch, { backgroundColor: on ? c.surface : c.bg }]}>
      {mode === 'lite' ? (
        <>
          {box({ height: 38, backgroundColor: soft })}
          {box({ height: 12, backgroundColor: c.accent, opacity: 0.9 })}
          {box({ height: 8, width: '70%', backgroundColor: c.surface2 })}
          {box({ height: 8, width: '50%', backgroundColor: c.surface2 })}
        </>
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 4 }}>{[0, 1, 2, 3].map((i) => <View key={i} style={{ flex: 1, height: 16, borderRadius: 5, backgroundColor: soft }} />)}</View>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <View style={{ flex: 1.4, height: 10, borderRadius: 5, backgroundColor: c.accent, opacity: 0.9 }} />
            <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: c.surface2 }} />
          </View>
          {box({ height: 7, backgroundColor: c.surface2 })}
          {box({ height: 7, backgroundColor: c.surface2 })}
          {box({ height: 7, width: '80%', backgroundColor: c.surface2 })}
        </>
      )}
    </View>
  );
}

/**
 * Lo de Pro para quien está en Lite (useOrganizePro de la web): el aviso de la pantalla con «Usar Pro» (cambia el modo,
 * con «Deshacer»). null en Pro o si no aplica (`on` = false). Va al aviso de la pantalla (ScreenNotice).
 */
export function useProUpsell(on: boolean, notice: { id: string; title: string; text: string }): Notice | null {
  const pro = useIsPro();
  const switchMode = useSwitchMode();
  if (!on || pro) return null;
  return { id: notice.id, kind: 'admin', title: notice.title, text: notice.text, action: { label: 'Usar Pro', onClick: () => void switchMode('pro') } };
}

const styles = StyleSheet.create({
  switch: { flexDirection: 'row', borderRadius: 14, padding: 3, alignSelf: 'flex-start' },
  switchItem: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 18, borderRadius: 11 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 24, borderRadius: 12, paddingLeft: 9, paddingRight: 6 },
  toastWrap: { position: 'absolute', left: 14, right: 14, bottom: 96, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    maxWidth: 448,
    borderRadius: 20,
    paddingVertical: 12,
    paddingLeft: 16,
    paddingRight: 10,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  toastIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  card: { flex: 1, minWidth: 0, borderRadius: 22, padding: 14, gap: 2 },
  forYou: { position: 'absolute', top: 12, right: 12, height: 22, borderRadius: 11, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  sketch: { marginVertical: 12, height: 88, borderRadius: 14, padding: 9, gap: 5 },
  organized: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 },
});
