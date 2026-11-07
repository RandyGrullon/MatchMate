import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { CalendarDays, Eye, EyeOff, Flag, Hourglass, Lock, MapPin, MessageSquareQuote, MoreHorizontal, Share2, Sparkles, Star, StarOff, Trophy, Users } from 'lucide-react-native';
import { tierDot } from '@mm/badges/visual/palette';
import { reportBadge, setBadgeHidden, setFeaturedBadges, setLeagueBadgeHidden, type BadgeStat } from '@mm/lib/data/badges';
import { levelLine, type AwardView, type ProgressModel } from '@mm/components/badges/logic';
import { FEATURED_FULL } from '@mm/components/badges/tab';
import {
  MAX_TIMES,
  awardDetail,
  featuredDone,
  hiddenDone,
  leagueTimeText,
  lockedProgress,
  moreTimesText,
  progressPct,
  reportErrorText,
  reportQuestion,
  sheetActions,
  timeText,
  toggleFeatured as toggledFeatured,
  type SheetSubject,
} from '@mm/components/badges/sheet';
import { confirmAsync, toast } from '@/components/feedback';
import { runAction } from '@/components/swimming/parts';
import { Button, Divider, Sheet, Txt } from '@/components/ui';
import { openOnWeb } from '@/lib/web';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { Insignia, UnlockInsignia } from './Insignia';

/** Barra de progreso (el arco de la insignia en palabras). */
export function ProgressBar({ ratio, text }: { ratio: number; text: string }) {
  const c = useColors();
  const pct = progressPct(ratio);
  return (
    <View style={{ gap: 6 }}>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={text}
        accessibilityValue={{ min: 0, max: 100, now: pct }}
        style={{ height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: c.surface2 }}
      >
        <View style={{ height: '100%', width: `${pct}%`, borderRadius: 4, backgroundColor: c.accent }} />
      </View>
      <Txt variant="meta" style={{ fontFamily: font.medium }}>
        {text}
      </Txt>
    </View>
  );
}

/** El puntito del metal. */
function TierDot({ tier, size = 10 }: { tier: AwardView['look']['tier']; size?: number }) {
  return <View aria-hidden style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tierDot(tier) }} />;
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
      <View style={{ marginTop: 2 }}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="small" tone="muted">
          {label}
        </Txt>
        {typeof children === 'string' ? <Txt variant="meta">{children}</Txt> : children}
      </View>
    </View>
  );
}

/** Un link dentro del detalle: cierra la hoja y abre la pantalla. */
function LinkText({ children, onPress }: { children: string; onPress: () => void }) {
  return (
    <Txt variant="meta" tone="accent" accessibilityRole="link" onPress={onPress} style={{ fontFamily: font.semibold }}>
      {children}
    </Txt>
  );
}

/** Un aviso redondo debajo del nombre («Solo tú la ves», «Tu liga la está confirmando»). */
function Pill({ icon, children, warn }: { icon: ReactNode; children: string; warn?: boolean }) {
  const c = useColors();
  return (
    <View style={[styles.pill, { backgroundColor: warn ? c.warnSoft : c.surface2 }]}>
      {icon}
      <Txt variant="meta" tone={warn ? 'warn' : 'muted'} style={{ fontFamily: font.medium }}>
        {children}
      </Txt>
    </View>
  );
}

function Box({ children }: { children: ReactNode }) {
  const c = useColors();
  return <View style={[styles.box, { borderColor: c.line }]}>{children}</View>;
}

function Caps({ children }: { children: string }) {
  return (
    <Txt tone="muted" style={{ fontSize: 11, fontFamily: font.semibold, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 }}>
      {children}
    </Txt>
  );
}

/**
 * Lo de adentro del detalle (§6.3, BadgeSheetBody de la web): la insignia a 128 (la animación solo la primera vez),
 * nombre, nivel y descripción, dónde y cuándo con la evidencia, la rareza, los niveles (solo el dueño) o las veces
 * (repetibles), y en las bloqueadas cómo se gana y el progreso. `go` abre una pantalla (cerrando la hoja).
 */
export function BadgeSheetBody({
  subject,
  own,
  stats = [],
  progress,
  animate,
  go,
}: {
  subject: SheetSubject;
  own?: boolean;
  stats?: readonly BadgeStat[];
  progress?: ReadonlyMap<string, ProgressModel>;
  animate?: boolean;
  go: (to: { lid: string; eventId?: string }) => void;
}) {
  const c = useColors();
  const icon = (I: typeof MapPin) => <I size={16} color={c.accent} />;

  if (subject.kind === 'locked') {
    const m = subject.model;
    const p = lockedProgress(m);
    return (
      <View style={{ gap: 16 }}>
        <View style={styles.head}>
          <Insignia badge={m.look} size={128} state={p ? 'progress' : 'locked'} progress={p?.ratio} pad label={`${m.name}, bloqueada`} />
          <Txt variant="section" style={{ textAlign: 'center' }}>
            {m.name}
          </Txt>
          <View style={styles.inline}>
            <Lock size={16} color={c.muted} />
            <Txt variant="meta" tone="muted" style={{ fontFamily: font.medium }}>
              Todavía no la tienes
            </Txt>
          </View>
        </View>
        <View style={[styles.how, { backgroundColor: c.surface2 }]}>
          <Caps>Cómo se gana</Caps>
          <Txt variant="meta">{m.how}</Txt>
        </View>
        {p && <ProgressBar ratio={p.ratio} text={p.text} />}
      </View>
    );
  }

  if (subject.kind === 'league') {
    const { tile } = subject;
    const v = tile.top;
    return (
      <View style={{ gap: 16 }}>
        <View style={styles.head}>
          <Insignia badge={v.look} size={128} state={tile.hidden ? 'hidden' : 'unlocked'} label={v.label} />
          <Txt variant="section" style={{ textAlign: 'center' }}>
            {v.name}
          </Txt>
          <Txt variant="meta" style={{ fontFamily: font.semibold, textAlign: 'center' }}>
            {v.givenBy}
            {tile.count > 1 && <Txt variant="meta" tone="muted">{` · ×${tile.count}`}</Txt>}
          </Txt>
          {tile.hidden && <Pill icon={<EyeOff size={16} color={c.muted} />}>Solo tú la ves</Pill>}
          {/* La tuya que los demás todavía no ven en tu perfil (liga nueva o pequeña, o con menores). */}
          {own && !tile.hidden && !tile.onProfile && <Pill icon={<MapPin size={16} color={c.muted} />}>Por ahora solo se ve en tu liga</Pill>}
          {!!v.description && (
            <Txt variant="meta" tone="muted" style={{ textAlign: 'center' }}>
              {v.description}
            </Txt>
          )}
        </View>
        <Box>
          <Row icon={icon(MapPin)} label="Liga">
            <LinkText onPress={() => go({ lid: v.award.leagueId })}>{v.leagueName}</LinkText>
          </Row>
          {v.prizeLine ? (
            <>
              <Row icon={icon(Trophy)} label="Premio del torneo">
                {v.prizeLine}
              </Row>
              {!!v.award.teamName && (
                <Row icon={icon(Users)} label="Equipo">
                  {v.award.teamName}
                </Row>
              )}
            </>
          ) : (
            !!v.detail && (
              <Row icon={icon(Trophy)} label={v.prize ? 'Premio del torneo' : 'Por'}>
                {v.detail}
              </Row>
            )
          )}
          <Row icon={icon(CalendarDays)} label="Cuándo">
            {v.date}
          </Row>
          {/* La nota de un premio es su propia línea: con la fila del premio sobra. */}
          {own && !!v.award.note && !v.prizeLine && (
            <Row icon={icon(MessageSquareQuote)} label="Nota de tu liga">
              {v.award.note}
            </Row>
          )}
        </Box>
        {tile.views.length > 1 && (
          <View accessibilityLabel="Veces" style={[styles.list, { borderColor: c.line }]}>
            {tile.views.slice(0, MAX_TIMES).map((x, i) => (
              <View key={x.award.id}>
                {i > 0 && <Divider />}
                <View style={styles.listRow}>
                  <Txt variant="meta" numberOfLines={1} style={{ flex: 1 }}>
                    {leagueTimeText(x)}
                  </Txt>
                  <Txt variant="small" tone="muted">
                    {x.date}
                  </Txt>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }

  const { tile } = subject;
  const top = tile.top;
  const { rarity, levels, next, times } = awardDetail(tile, { own, stats, progress });
  return (
    <View style={{ gap: 16 }}>
      <View style={styles.head}>
        {animate ? (
          <UnlockInsignia badge={top.look} px={200} label={top.label} />
        ) : (
          <Insignia badge={top.look} size={128} state={tile.state === 'new' ? 'unlocked' : tile.state} label={top.label} />
        )}
        <Txt variant="section" style={{ textAlign: 'center' }}>
          {top.name}
        </Txt>
        <View style={styles.inline}>
          <TierDot tier={top.look.tier} />
          <Txt variant="meta" style={{ fontFamily: font.semibold }}>
            {levelLine(top)}
            {tile.count > 1 && <Txt variant="meta" tone="muted">{` · ×${tile.count}`}</Txt>}
          </Txt>
        </View>
        {tile.bucket === 'review' && (
          <Pill warn icon={<Hourglass size={16} color={c.warn} />}>
            Tu liga la está confirmando
          </Pill>
        )}
        {tile.bucket === 'hidden' && <Pill icon={<EyeOff size={16} color={c.muted} />}>Solo tú la ves</Pill>}
        {!!top.description && (
          <Txt variant="meta" tone="muted" style={{ textAlign: 'center' }}>
            {top.description}
          </Txt>
        )}
      </View>

      <Box>
        {!!top.leagueName && (
          <Row icon={icon(MapPin)} label="Liga">
            {top.leagueId ? <LinkText onPress={() => go({ lid: top.leagueId! })}>{top.leagueName || 'Ver la liga'}</LinkText> : top.leagueName}
          </Row>
        )}
        {top.event && (
          <Row icon={icon(Trophy)} label="Dónde">
            {top.event.id && top.leagueId ? <LinkText onPress={() => go({ lid: top.leagueId!, eventId: top.event!.id })}>{top.event.name || 'Ver el evento'}</LinkText> : top.event.name}
          </Row>
        )}
        <Row icon={icon(CalendarDays)} label="Cuándo">
          {top.date}
        </Row>
        {!!top.evidence && (
          <Row icon={icon(Sparkles)} label="Cómo fue">
            {top.evidence}
          </Row>
        )}
      </Box>

      {!!rarity && (
        <Txt variant="meta" tone="muted" style={{ textAlign: 'center', fontFamily: font.medium }}>
          {rarity}
        </Txt>
      )}

      {own && levels.length > 1 && (
        <View accessibilityLabel="Niveles">
          <Caps>Niveles</Caps>
          <View style={{ gap: 4 }}>
            {levels.map((v) => (
              <View key={v.award.id} style={styles.inline}>
                <TierDot tier={v.look.tier} size={8} />
                <Txt variant="meta" style={{ fontFamily: font.medium }}>
                  {v.levelName}
                </Txt>
                <Txt variant="meta" tone="muted">{`· ${v.date}`}</Txt>
              </View>
            ))}
            {!!next && (
              <Txt variant="meta" tone="muted">
                {next}
              </Txt>
            )}
          </View>
        </View>
      )}
      {own && levels.length <= 1 && !!next && (
        <Txt variant="meta" tone="muted">
          {next}
        </Txt>
      )}

      {times.length > 1 && (
        <View accessibilityLabel="Veces">
          <Caps>{`${times.length} veces`}</Caps>
          <View style={[styles.list, { borderColor: c.line }]}>
            {times.slice(0, MAX_TIMES).map((v, i) => (
              <View key={v.award.id}>
                {i > 0 && <Divider />}
                <View style={styles.listRow}>
                  <TierDot tier={v.look.tier} size={8} />
                  <Txt variant="meta" numberOfLines={1} style={{ flex: 1 }}>
                    {timeText(v)}
                  </Txt>
                  <Txt variant="small" tone="muted">
                    {v.date}
                  </Txt>
                </View>
              </View>
            ))}
          </View>
          {!!moreTimesText(times.length) && (
            <Txt variant="small" tone="muted" style={{ marginTop: 4 }}>
              {moreTimesText(times.length)}
            </Txt>
          )}
        </View>
      )}
    </View>
  );
}

export interface BadgeSheetProps {
  subject: SheetSubject | null;
  onClose: () => void;
  /** Tu vitrina: niveles, progreso y las acciones del dueño. */
  own?: boolean;
  /** Ids de las que se ven debajo de tu nombre (las elegidas o, si no elegiste, las que salen solas). */
  featured?: readonly string[];
  /** `featured` son las que salen solas: destacar o quitar una deja fijas las demás. */
  featuredAuto?: boolean;
  stats?: readonly BadgeStat[];
  progress?: ReadonlyMap<string, ProgressModel>;
  /** Puede compartir sin las acciones del dueño (su propio jugador en la página de la liga). */
  canShare?: boolean;
  /** Un admin de la liga la comparte para anunciarla. */
  announce?: boolean;
  /**
   * Dónde se comparte en la web (la tarjeta con la imagen se arma con canvas: en la app, «Compartir» abre esa página
   * de la web con la insignia, ahí sale la imagen). Recibe la fila de la insignia.
   */
  webPath: (awardId: string) => string;
  /** Quien mira puede reportarla (`canReportAward`): «Reportar» en el menú ⋯ (§6.3). */
  canReport?: boolean;
  animate?: boolean;
}

/**
 * El detalle de una insignia en una hoja (BadgeSheet de la web, §6.3), con las acciones del dueño: «Compartir»,
 * «Destacar en mi perfil» o «Quitar de destacadas», «Ocultar de mi perfil» o «Mostrar en mi perfil». Un admin de la
 * liga puede «Compartir». Quien mira otra cuenta puede «Reportar» en ⋯.
 */
export function BadgeSheet({ subject, onClose, own, featured = [], featuredAuto = false, stats = [], progress, canShare: mayShare, announce, webPath, canReport, animate }: BadgeSheetProps) {
  const c = useColors();
  const [busy, setBusy] = useState<string | null>(null);
  // El menú ⋯ (Reportar) se cierra al cambiar de insignia.
  const subjectId = subject?.kind === 'award' ? subject.tile.top.award.id : subject?.kind === 'league' ? subject.tile.top.award.id : null;
  const [more, setMore] = useState<string | null>(null);
  const moreOpen = more !== null && more === subjectId;

  const tile = subject?.kind === 'award' ? subject.tile : null;
  const leagueTile = subject?.kind === 'league' ? subject.tile : null;
  const actions = sheetActions(subject, { own, featured, featuredAuto, mayShare, announce });
  const { isFeatured, canToggleFeatured, canFeatureLeague, canShare } = actions;

  const go = (to: { lid: string; eventId?: string }) => {
    onClose();
    if (to.eventId) router.push({ pathname: '/l/[lid]/e/[eventId]', params: { lid: to.lid, eventId: to.eventId } });
    else router.push({ pathname: '/l/[lid]', params: { lid: to.lid } });
  };

  const toggleFeatured = async () => {
    const top = tile?.top.award.id ?? leagueTile?.top.award.id;
    if (!top) return;
    const plan = toggledFeatured(featured, actions, top);
    if (plan.full) {
      toast(FEATURED_FULL, 'error');
      return;
    }
    setBusy('featured');
    await runAction(() => setFeaturedBadges(plan.next), featuredDone(isFeatured));
    setBusy(null);
  };

  const toggleHidden = async (hidden: boolean) => {
    if (!tile && !leagueTile) return;
    setBusy('hidden');
    const ok = await runAction(async () => {
      if (tile) for (const v of tile.views) if (v.award.hidden !== hidden) await setBadgeHidden(v.award, hidden);
      if (leagueTile) for (const v of leagueTile.views) if (v.award.hidden !== hidden) await setLeagueBadgeHidden(v.award, hidden);
      return true;
    }, hiddenDone(hidden));
    setBusy(null);
    if (ok) onClose();
  };

  const share = () => {
    const id = tile?.top.award.id ?? leagueTile?.top.award.id;
    if (id) void openOnWeb(webPath(id));
  };

  const report = async () => {
    if (!tile) return;
    if (!(await confirmAsync({ ...reportQuestion(tile.top.name), danger: true }))) return;
    setBusy('report');
    try {
      await reportBadge(tile.top.award.id);
      toast('Reporte enviado. Gracias.');
      setMore(null);
    } catch (e) {
      // «Ya mandaste 5 reportes hoy…», o el permiso de la liga, en palabras del creador (no el genérico de guardar).
      toast(reportErrorText(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const shareButton = (
    <Button variant="primary" icon={<Share2 size={18} color={c.accentFg} />} onPress={share}>
      Compartir
    </Button>
  );
  const closeButton = <Button onPress={onClose}>Cerrar</Button>;

  let footer: ReactNode;
  if (leagueTile) {
    footer = (
      <>
        {own && (
          <Button
            variant={leagueTile.hidden ? 'primary' : 'ghost'}
            loading={busy === 'hidden'}
            icon={leagueTile.hidden ? <Eye size={18} color={c.accentFg} /> : <EyeOff size={18} color={c.fg} />}
            onPress={() => void toggleHidden(!leagueTile.hidden)}
          >
            {leagueTile.hidden ? 'Mostrar en mi perfil' : 'Ocultar de mi perfil'}
          </Button>
        )}
        {own && canFeatureLeague && (
          <Button loading={busy === 'featured'} icon={isFeatured ? <StarOff size={18} color={c.fg} /> : <Star size={18} color={c.fg} />} onPress={() => void toggleFeatured()}>
            {isFeatured ? 'Quitar de destacadas' : 'Destacar en mi perfil'}
          </Button>
        )}
        {canShare ? shareButton : !own && closeButton}
      </>
    );
  } else if (tile) {
    footer = (
      <>
        {own && tile.bucket === 'ok' && (
          <Button variant="ghost" loading={busy === 'hidden'} icon={<EyeOff size={18} color={c.fg} />} onPress={() => void toggleHidden(true)}>
            Ocultar de mi perfil
          </Button>
        )}
        {own && tile.bucket === 'ok' && canToggleFeatured && (
          <Button loading={busy === 'featured'} icon={isFeatured ? <StarOff size={18} color={c.fg} /> : <Star size={18} color={c.fg} />} onPress={() => void toggleFeatured()}>
            {isFeatured ? 'Quitar de destacadas' : 'Destacar en mi perfil'}
          </Button>
        )}
        {own && tile.bucket === 'hidden' && (
          <Button variant="primary" loading={busy === 'hidden'} icon={<Eye size={18} color={c.accentFg} />} onPress={() => void toggleHidden(false)}>
            Mostrar en mi perfil
          </Button>
        )}
        {canShare && shareButton}
        {!own &&
          canReport &&
          tile.bucket === 'ok' &&
          (moreOpen ? (
            <Button variant="ghost" loading={busy === 'report'} icon={<Flag size={18} color={c.fg} />} onPress={() => void report()}>
              Reportar
            </Button>
          ) : (
            <Button variant="ghost" accessibilityLabel="Más opciones" icon={<MoreHorizontal size={20} color={c.fg} />} onPress={() => setMore(subjectId)} />
          ))}
        {!own && !canShare && closeButton}
      </>
    );
  } else footer = closeButton;

  return (
    <Sheet open={!!subject} onClose={onClose} title="Insignia" footer={<View style={styles.footer}>{footer}</View>}>
      {subject && <BadgeSheetBody subject={subject} own={own} stats={stats} progress={progress} animate={animate} go={go} />}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: 8 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  how: { borderRadius: 14, padding: 12 },
  box: { gap: 10, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
  list: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, paddingTop: 4 },
});
