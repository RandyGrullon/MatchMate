import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AlertTriangle, Archive, MoreHorizontal, Palette, Pencil, RotateCcw, Sparkles } from 'lucide-react-native';
import { catalogBall } from '@mm/lib/ballCatalog';
import { RESURFACE_EVERY, ballDetail, catalogSpecs, layoutText, pctText, resurfaceText, type BallStats } from '@mm/lib/balls';
import { formatDate } from '@mm/lib/format';
import { ballGamesNote } from '@mm/components/balls/stats';
import { MenuRow } from '@/components/esports/inputs';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { Button, Card, Sheet, Txt } from '../ui';
import { BallArt } from './BallArt';

/** Un número de la tarjeta de una bola (los cuatro en una fila, como en la web). */
function Mini({ label, value }: { label: string; value: string | number }) {
  const c = useColors();
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={{ flex: 1, minWidth: 0 }}>
      <Txt numberOfLines={1} style={{ fontSize: 22, lineHeight: 25, fontFamily: font.bold, color: c.fg }}>
        {value}
      </Txt>
      <Txt numberOfLines={1} style={{ fontSize: 12, fontFamily: font.medium, color: c.muted }}>
        {label}
      </Txt>
    </View>
  );
}

/**
 * Una bola en «Mis bolas» (BallCard de la web): la bola dibujada (tocarla abre «Diseñar»), nombre y detalle (con lo que
 * dice el catálogo de su modelo y su perforación, si los tiene), y «•••» con Editar, Diseñar y Retirar (o Volver a
 * usarla); sus números (juegos, promedio, el más alto y strikes) en una fila, y cuántos juegos lleva desde la última
 * pulida con una barrita (en ámbar cuando ya le toca) y «La pulí hoy» al lado. Una retirada trae «Volver a usarla».
 */
export function BallCard({
  stats: s,
  busy,
  onEdit,
  onDesign,
  onResurface,
  onRetire,
}: {
  stats: BallStats;
  busy?: boolean;
  onEdit: () => void;
  /** Abre el creador de la bola (en la web). */
  onDesign?: () => void;
  onResurface: () => void;
  onRetire: () => void;
}) {
  const c = useColors();
  const b = s.ball;
  const model = catalogBall(b.catalog);
  const specs = model ? catalogSpecs(model) : null;
  const layout = layoutText(b.layout);
  const notes = b.layout?.notes?.trim();
  const gamesNote = ballGamesNote(s);
  // `busy` dice que la bola espera; la ruedita va en lo que se tocó.
  const [pressed, setPressed] = useState<'resurface' | 'retire' | null>(null);
  const [menu, setMenu] = useState(false);
  const wear = Math.min(1, s.sinceResurface / RESURFACE_EVERY);
  const retire = () => {
    setMenu(false);
    setPressed('retire');
    onRetire();
  };
  const menuIcon = (Icon: typeof Pencil) => <Icon size={20} color={c.fg2} />;

  return (
    <Card style={{ gap: 16, opacity: b.retired ? 0.8 : 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        {onDesign ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Diseñar la ${b.name}`} onPress={onDesign} style={({ pressed: p }) => ({ alignItems: 'center', gap: 2, margin: -4, padding: 4, borderRadius: 16, transform: [{ scale: p ? 0.97 : 1 }] })}>
            <BallArt ball={b} size={64} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Palette size={12} color={c.accent} />
              <Txt style={{ fontSize: 12, fontFamily: font.semibold, color: c.accent }}>Diseñar</Txt>
            </View>
          </Pressable>
        ) : (
          <BallArt ball={b} size={64} />
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt accessibilityRole="header" numberOfLines={1} style={{ fontSize: 19, lineHeight: 23, fontFamily: font.bold, letterSpacing: -0.3, color: c.fg }}>
            {b.name}
          </Txt>
          <Txt numberOfLines={1} tone="muted" style={{ fontSize: 14, marginTop: 2 }}>
            {ballDetail(b)}
            {b.retired && ' · retirada'}
          </Txt>
          {!!specs && (
            <Txt numberOfLines={1} tone="muted" style={{ fontSize: 13, marginTop: 2 }}>
              {specs}
            </Txt>
          )}
          {!!(layout || notes) && (
            <Txt numberOfLines={2} tone="fg2" style={{ fontSize: 13, marginTop: 4 }}>
              <Txt tone="muted" style={{ fontSize: 13 }}>
                Perforación{' '}
              </Txt>
              {!!layout && <Txt style={{ fontSize: 13, fontFamily: font.semibold, color: c.fg2 }}>{layout}</Txt>}
              {!!layout && !!notes && (
                <Txt tone="muted" style={{ fontSize: 13 }}>
                  {' · '}
                </Txt>
              )}
              {notes}
            </Txt>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Más opciones de la ${b.name}`}
          onPress={() => setMenu(true)}
          style={({ pressed: p }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface2, transform: [{ scale: p ? 0.95 : 1 }] })}
        >
          <MoreHorizontal size={22} color={c.fg2} strokeWidth={2.4} />
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, paddingTop: 16 }}>
        <Mini label="Juegos" value={s.games} />
        <Mini label="Promedio" value={s.average ?? '—'} />
        <Mini label="Más alto" value={s.high || '—'} />
        <Mini label="Strikes" value={pctText(s.strikePct)} />
      </View>
      {!!gamesNote && (
        <Txt tone="muted" style={{ fontSize: 13, marginTop: -4 }}>
          {gamesNote}
        </Txt>
      )}

      {!b.retired ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12, borderRadius: 16, paddingVertical: 12, paddingLeft: 16, paddingRight: 12, backgroundColor: s.needsResurface ? c.warnSoft : c.surface2 }}>
          <View style={{ flex: 1, minWidth: 160 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
              {s.needsResurface && <AlertTriangle size={16} color={c.warn} style={{ marginTop: 2 }} />}
              <Txt style={{ flex: 1, fontSize: 14, color: s.needsResurface ? c.warn : c.fg2 }}>
                {resurfaceText(s)}
                {b.resurfacedOn && ` La puliste el ${formatDate(b.resurfacedOn)}.`}
              </Txt>
            </View>
            <View style={{ marginTop: 8, height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: s.needsResurface ? `${c.warn}33` : c.line }}>
              <View style={{ height: '100%', width: `${Math.round(wear * 100)}%`, borderRadius: 3, backgroundColor: s.needsResurface ? c.warn : c.accent }} />
            </View>
          </View>
          <Button
            variant={s.needsResurface ? 'primary' : 'soft'}
            icon={<Sparkles size={16} color={s.needsResurface ? c.accentFg : c.accent} />}
            disabled={busy}
            loading={busy && pressed === 'resurface'}
            onPress={() => {
              setPressed('resurface');
              onResurface();
            }}
          >
            La pulí hoy
          </Button>
        </View>
      ) : (
        <Button
          size="lg"
          full
          icon={<RotateCcw size={16} color={c.fg} />}
          disabled={busy}
          loading={busy && pressed === 'retire'}
          onPress={() => {
            setPressed('retire');
            onRetire();
          }}
        >
          Volver a usarla
        </Button>
      )}
      {!!s.lastUsedOn && (
        <Txt tone="muted" style={{ fontSize: 13, marginTop: -4 }}>
          {`Último juego con ella: ${formatDate(s.lastUsedOn)}`}
        </Txt>
      )}

      <Sheet open={menu} onClose={() => setMenu(false)} title={b.name}>
        <MenuRow
          icon={menuIcon(Pencil)}
          label="Editar"
          hint="Nombre, peso, cubierta, fechas y perforación"
          onPress={() => {
            setMenu(false);
            onEdit();
          }}
        />
        {onDesign && (
          <MenuRow
            icon={menuIcon(Palette)}
            label="Diseñar"
            hint="Su color y su dibujo"
            onPress={() => {
              setMenu(false);
              onDesign();
            }}
          />
        )}
        {b.retired ? (
          <MenuRow icon={menuIcon(RotateCcw)} label="Volver a usarla" onPress={retire} disabled={busy} />
        ) : (
          <MenuRow icon={menuIcon(Archive)} label="Retirar" hint="Ya no sale al anotar; sus números se quedan" onPress={retire} disabled={busy} />
        )}
      </Sheet>
    </Card>
  );
}
