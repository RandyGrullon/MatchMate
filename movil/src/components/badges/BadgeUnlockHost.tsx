import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Award, ChevronLeft, ChevronRight, Eye, Lock, Share2, X } from 'lucide-react-native';
import { tierDot } from '@mm/badges/visual/palette';
import { useAuth } from '@mm/lib/auth';
import {
  markBadgesSeen,
  markLeagueBadgesSeen,
  setBadgeHidden,
  useBadgeNotices,
  useBadgeStats,
  useProfileBadges,
  type BadgeAward,
  type LeagueBadgeAward,
} from '@mm/lib/data/badges';
import { unlockGateOpen, useBadgeUnlockHeld } from '@mm/components/badges/hold';
import { levelLine, myBadgesPath, unlockPlan, yearRecap, type UnlockItem, type UnlockPlan, type YearRecapModel } from '@mm/components/badges/logic';
import { HISTORY_SHOWN, canShareUnlock, historyTitle, isPrivateUnlock, recapFacts, unlockHeader, unlockMoreLine, unlockTarget } from '@mm/components/badges/unlock';
import { runAction } from '@/components/swimming/parts';
import { Button, Txt } from '@/components/ui';
import { openOnWeb } from '@/lib/web';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { Insignia, UnlockInsignia } from './Insignia';

/**
 * El aviso al ganar una insignia en la app (BadgeUnlockHost y UnlockModal de la web, docs/insignias.md §6.4): sale
 * cuando `badge_notices` trae insignias sin ver (automáticas o del creador), una a la vez con su animación (hasta 5;
 * después «y 3 más») o la lista del historial. Al cerrarlo (o «Ver mis insignias») se marcan vistas en el servidor, así
 * no vuelve a salir en otro teléfono. Va encima de la app (no es un Modal: si hay una hoja abierta, queda debajo y se ve
 * al cerrarla); se aguanta mientras una pantalla lo pide (`useHoldBadgeUnlock`) y con las puertas de la cuenta abiertas.
 */

/** Espera después de abrir la app (o de cerrar lo que la aguantaba) antes de mostrar el aviso. */
const SETTLE_MS = 1200;

const warn = (e: unknown) => console.warn('[insignias] no se pudieron marcar vistas', e);

/** Va una vez en la raíz (_layout.tsx), después de la navegación y de AccountGates, y antes de ToastHost. */
export function BadgeUnlockHost() {
  const auth = useAuth();
  // Sin la celebración encima de «¿Tienes 18 años?» ni de los Términos (AccountGates).
  if (!auth.user || !unlockGateOpen(auth)) return null;
  return <Host key={auth.user.uid} />;
}

interface Showing {
  awards: readonly BadgeAward[];
  leagueAwards: readonly LeagueBadgeAward[];
}

function Host() {
  const notices = useBadgeNotices();
  const held = useBadgeUnlockHeld();
  // Cada insignia sale una sola vez por sesión aunque el servidor todavía no se entere (sin señal).
  const [seen, setSeen] = useState<ReadonlySet<string>>(new Set());
  const [open, setOpen] = useState<Showing | null>(null);
  const awards = notices.data.awards.filter((a) => !seen.has(a.id));
  const leagueAwards = (notices.data.leagueAwards ?? []).filter((a) => !seen.has(a.id));
  const waiting = awards.length + leagueAwards.length > 0 && !open && !held;

  useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(() => {
      setSeen((s) => new Set([...s, ...awards.map((a) => a.id), ...leagueAwards.map((a) => a.id)]));
      const plan = unlockPlan(awards, leagueAwards);
      // Nada que mostrar (insignias que esta versión no conoce): solo se marcan.
      if (!plan.items.length && !plan.history.length) {
        markBadgesSeen(plan.ids).catch(warn);
        markLeagueBadgesSeen(plan.leagueIds).catch(warn);
        return;
      }
      setOpen({ awards, leagueAwards });
    }, SETTLE_MS);
    return () => clearTimeout(t);
  }, [waiting, awards, leagueAwards]);

  if (!open) return null;
  return <UnlockModal awards={open.awards} leagueAwards={open.leagueAwards} onDone={() => setOpen(null)} />;
}

/** Botón de solo ícono de 44 (flechas y cerrar). */
function IconButton({ label, onPress, disabled, children }: { label: string; onPress: () => void; disabled?: boolean; children: ReactNode }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.icon, { backgroundColor: pressed ? c.surface2 : 'transparent', opacity: disabled ? 0.4 : 1 }]}
    >
      {children}
    </Pressable>
  );
}

/** El resumen del año (§6.4): días, deportes y meses, y la insignia más rara del año. */
export function YearRecapCard({ recap }: { recap: YearRecapModel }) {
  const c = useColors();
  const facts = recapFacts(recap);
  return (
    <View accessibilityLabel={`Tu ${recap.year} en MatchMate`} style={[styles.recap, { backgroundColor: c.surface2 }]}>
      {facts.length > 0 && (
        <View style={{ flexDirection: 'row' }}>
          {facts.map((f) => (
            <View key={f.label} style={{ flex: 1, alignItems: 'center' }}>
              <Txt style={{ fontSize: 24, lineHeight: 30, fontFamily: font.bold }}>{f.n.toLocaleString('es-DO')}</Txt>
              <Txt variant="small" tone="muted">
                {f.label}
              </Txt>
            </View>
          ))}
        </View>
      )}
      {recap.rarest && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Insignia badge={recap.rarest.look} size={40} label={recap.rarest.label} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="small" tone="muted">{`Tu insignia más rara de ${recap.year}`}</Txt>
            <Txt variant="meta" style={{ fontFamily: font.semibold }}>{`${recap.rarest.name} · ${levelLine(recap.rarest)}`}</Txt>
            {!!recap.rarestText && (
              <Txt variant="small" tone="muted">
                {recap.rarestText}
              </Txt>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

/**
 * Lo de adentro del aviso (UnlockContent de la web): una insignia a la vez con su animación (con flechas y puntos), o
 * la lista del historial. Las del creador dicen «Liga Los Pinos te dio una insignia»; las privadas por defecto
 * preguntan «Solo tú la ves. ¿La muestras en tu perfil?».
 */
export function UnlockContent({
  plan,
  index,
  onIndex,
  shown,
  onShow,
  onKeepPrivate,
  showing,
  recap,
}: {
  plan: UnlockPlan;
  index: number;
  onIndex: (i: number) => void;
  shown?: ReadonlySet<string>;
  onShow?: (it: UnlockItem) => void;
  onKeepPrivate?: (it: UnlockItem) => void;
  showing?: string | null;
  recap?: YearRecapModel | null;
}) {
  const c = useColors();
  const { width } = useWindowDimensions();
  const it = plan.items[Math.min(index, plan.items.length - 1)];
  if (!it) {
    const list = plan.history;
    return (
      <View style={{ alignItems: 'center', gap: 16 }}>
        <View style={[styles.historyIcon, { backgroundColor: c.accentSoft }]}>
          <Award size={32} color={c.accent} />
        </View>
        <Txt variant="section" accessibilityRole="header" style={{ textAlign: 'center' }}>
          {historyTitle(list.length)}
        </Txt>
        <Txt variant="meta" tone="muted" style={{ textAlign: 'center' }}>
          Lo que ya habías jugado también cuenta. ¡Míralas en tu perfil!
        </Txt>
        <View accessibilityLabel="Insignias del historial" style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }}>
          {list.slice(0, HISTORY_SHOWN).map((h) => (
            <View key={h.award.id} style={{ width: '25%', alignItems: 'center', gap: 4 }}>
              <Insignia badge={h.look} size={40} label={h.label} />
              <Txt tone="muted" numberOfLines={2} style={{ fontSize: 11, lineHeight: 14, textAlign: 'center' }}>
                {h.name}
              </Txt>
            </View>
          ))}
        </View>
        {list.length > HISTORY_SHOWN && (
          <Txt variant="meta" tone="muted">{`y ${list.length - HISTORY_SHOWN} más`}</Txt>
        )}
      </View>
    );
  }
  const many = plan.items.length > 1;
  const v = it.view;
  const { title, line, where } = unlockHeader(it);
  const moreLine = unlockMoreLine(plan);
  // 220, o lo que quede entre las dos flechas (44 + 44 y los huecos) dentro del aviso.
  const px = Math.max(120, Math.min(220, Math.min(width, 448) - 24 - 40 - 104));
  return (
    <View style={{ alignItems: 'center', gap: 12 }}>
      <Txt variant="section" accessibilityRole="header" style={{ textAlign: 'center' }}>
        {title}
      </Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch' }}>
        {many ? (
          <IconButton label="Anterior" disabled={index <= 0} onPress={() => onIndex(index - 1)}>
            <ChevronLeft size={22} color={c.fg} />
          </IconButton>
        ) : (
          <View style={{ width: 44 }} />
        )}
        <UnlockInsignia key={it.id} badge={v.look} px={px} label={v.label} />
        {many ? (
          <IconButton label="Siguiente" disabled={index >= plan.items.length - 1} onPress={() => onIndex(index + 1)}>
            <ChevronRight size={22} color={c.fg} />
          </IconButton>
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Txt style={{ fontSize: 24, lineHeight: 29, fontFamily: font.bold, textAlign: 'center' }}>{v.name}</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
          <View aria-hidden style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tierDot(v.look.tier) }} />
          <Txt variant="meta" style={{ fontFamily: font.semibold, textAlign: 'center' }}>
            {line}
            {!!where && <Txt variant="meta" tone="muted">{` · ${where}`}</Txt>}
          </Txt>
        </View>
      </View>
      {!!v.description && (
        <Txt variant="meta" tone="muted" style={{ textAlign: 'center' }}>
          {v.description}
        </Txt>
      )}
      {recap && it.kind === 'app' && it.view.award.key === 'year_recap' && <YearRecapCard recap={recap} />}
      {it.kind === 'liga' && !!it.view.award.note && (
        <View style={[styles.note, { backgroundColor: c.surface2 }]}>
          <Txt variant="meta" style={{ fontStyle: 'italic' }}>{`«${it.view.award.note}»`}</Txt>
        </View>
      )}
      {isPrivateUnlock(it, shown) && (
        <View style={[styles.private, { backgroundColor: c.surface2 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Lock size={16} color={c.fg} />
            <Txt variant="meta" style={{ fontFamily: font.medium, flexShrink: 1 }}>
              Solo tú la ves. ¿La muestras en tu perfil?
            </Txt>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
            <Button disabled={showing === it.id} onPress={() => onKeepPrivate?.(it)}>
              Dejarla privada
            </Button>
            <Button variant="primary" icon={<Eye size={18} color={c.accentFg} />} loading={showing === it.id} onPress={() => onShow?.(it)}>
              Mostrar
            </Button>
          </View>
        </View>
      )}
      {many && (
        <View accessible accessibilityLabel={`Insignia ${index + 1} de ${plan.items.length}`} style={{ flexDirection: 'row', gap: 6 }}>
          {plan.items.map((x, i) => (
            <View key={x.id} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: i === index ? c.accent : c.line }} />
          ))}
        </View>
      )}
      {!!moreLine && (
        <Txt variant="meta" tone="muted">
          {moreLine}
        </Txt>
      )}
    </View>
  );
}

/**
 * El aviso al ganar sobre las insignias sin ver (UnlockModal de la web): al cerrarlo (o «Ver mis insignias») se marcan
 * vistas (`mark_badges_seen`, `mark_league_badges_seen`). «Ver mis insignias» abre tu perfil en Insignias (con esa
 * abierta si es una sola, sin repetir la animación). «Compartir» abre esa insignia en la web, donde sale la imagen.
 */
export function UnlockModal({ awards, leagueAwards = [], onDone }: { awards: readonly BadgeAward[]; leagueAwards?: readonly LeagueBadgeAward[]; onDone: () => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const uid = auth.user?.uid;
  const plan = unlockPlan(awards, leagueAwards);
  // El 7 de enero, `year_recap` abre el resumen del año: hace falta la vitrina propia y la rareza.
  const recapAward = plan.items.find((x) => x.kind === 'app' && x.view.award.key === 'year_recap');
  const mine = useProfileBadges(recapAward ? uid : null);
  const stats = useBadgeStats(!!recapAward);
  const recap = recapAward?.kind === 'app' ? yearRecap(recapAward.view.award, mine.data?.awards ?? [], stats.data) : null;
  const [index, setIndex] = useState(0);
  // Las privadas que ya contestó (la pregunta no sale más) y las que mostró (esas sí se pueden compartir).
  const [shown, setShown] = useState<ReadonlySet<string>>(new Set());
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set());
  const [showing, setShowing] = useState<string | null>(null);
  const closed = useRef(false);

  const finish = (go?: boolean) => {
    if (closed.current) return;
    closed.current = true;
    markBadgesSeen(plan.ids).catch(warn);
    markLeagueBadgesSeen(plan.leagueIds).catch(warn);
    onDone();
    const only = unlockTarget(plan);
    // La animación ya se vio aquí: el detalle se abre quieto.
    if (go && uid) router.push({ pathname: '/yo/[parte]', params: { parte: 'insignias', ...(only ? { insignia: only, quieta: '1' } : {}) } } as never);
  };

  // Atrás en Android cierra el aviso (como Esc en la web).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      finish();
      return true;
    });
    return () => sub.remove();
  });

  const current = plan.items[Math.min(index, plan.items.length - 1)];
  const canShare = canShareUnlock(current, revealed);

  const show = async (it: UnlockItem) => {
    if (it.kind !== 'app') return;
    setShowing(it.id);
    const ok = await runAction(() => setBadgeHidden(it.view.award, false), 'Ya se ve en tu perfil');
    setShowing(null);
    if (ok !== undefined) {
      setShown((s) => new Set([...s, it.id]));
      setRevealed((s) => new Set([...s, it.id]));
    }
  };

  return (
    <View accessibilityViewIsModal style={[StyleSheet.absoluteFill, styles.scrim, { backgroundColor: c.scrim, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
      <Animated.View entering={ZoomIn.duration(200)} style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
        <View style={{ flexShrink: 1 }}>
          <View style={{ alignItems: 'flex-end', paddingHorizontal: 8, paddingTop: 8 }}>
            <IconButton label="Cerrar" onPress={() => finish()}>
              <X size={22} color={c.fg} />
            </IconButton>
          </View>
          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}>
            <UnlockContent
              plan={plan}
              index={index}
              onIndex={setIndex}
              shown={shown}
              onShow={(it) => void show(it)}
              onKeepPrivate={(it) => setShown((s) => new Set([...s, it.id]))}
              showing={showing}
              recap={recap}
            />
          </ScrollView>
          <View style={[styles.footer, { borderTopColor: c.line }]}>
            {canShare && current && (
              <Button icon={<Share2 size={18} color={c.fg} />} onPress={() => void openOnWeb(myBadgesPath(current.id, { still: true }))}>
                Compartir
              </Button>
            )}
            <Button variant="primary" icon={<Award size={18} color={c.accentFg} />} onPress={() => finish(true)}>
              Ver mis insignias
            </Button>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Sin zIndex: va después de la navegación y antes de ToastHost (los avisos cortos salen encima).
  scrim: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  card: { width: '100%', maxWidth: 448, maxHeight: '100%', borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  historyIcon: { width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  recap: { alignSelf: 'stretch', gap: 12, borderRadius: 18, padding: 12 },
  note: { alignSelf: 'stretch', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  private: { alignSelf: 'stretch', gap: 8, borderRadius: 14, padding: 12 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingVertical: 12 },
});
