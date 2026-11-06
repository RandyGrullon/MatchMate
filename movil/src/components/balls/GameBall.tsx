import { memo, useCallback, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Check, ChevronDown, Plus } from 'lucide-react-native';
import { BALL_MAX, ballDetail, ballLabel, gameBallTitle, pickableBalls, type Ball } from '@mm/lib/balls';
import { toIsoDate } from '@mm/lib/format';
import { useNow } from '@mm/lib/useNow';
import { Button, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { BallArt } from './BallArt';
import { BallSheet } from './BallSheet';

/** «Ya tienes 30 bolas…» (FULL_TEXT de la web). */
const FULL_TEXT = `Ya tienes ${BALL_MAX} bolas: borra una que ya no uses para agregar otra.`;

/** La bola dibujada con su diseño (o el círculo punteado sin bola, con + si toca agregar una). */
function BallMark({ ball, size, add }: { ball: Ball | null; size: number; add?: boolean }) {
  const c = useColors();
  if (ball) return <BallArt ball={ball} size={size} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderStyle: 'dashed', borderColor: c.muted, alignItems: 'center', justifyContent: 'center' }}>
      {add && <Plus size={size / 2} color={c.muted} />}
    </View>
  );
}

/** Una bola de la lista de la hoja (o «Sin bola», con `noneText` debajo): su nombre y lo que se sabe de ella. */
function BallOptionRow({ ball, checked, noneText, onSelect }: { ball: Ball | null; checked: boolean; noneText?: string; onSelect: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked }}
      onPress={onSelect}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: checked ? c.accentSoft : 'transparent' }}
    >
      <BallMark ball={ball} size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt numberOfLines={1} style={{ fontFamily: font.medium, fontSize: 15 }}>
          {ball?.name ?? 'Sin bola'}
        </Txt>
        <Txt numberOfLines={1} tone="muted" style={{ fontSize: 12 }}>
          {ball ? `${ballDetail(ball)}${ball.retired ? ' · retirada' : ''}` : noneText}
        </Txt>
      </View>
      {checked && <Check size={20} color={c.accent} />}
    </Pressable>
  );
}

/**
 * Hoja para elegir la bola de un juego (o de todos), BallPickSheet de la web: «Sin bola» y las que no están retiradas (y
 * la que ya tenía), cada una dibujada con su nombre. Elegir cierra la hoja. «Agregar bola» abre la hoja de una bola
 * nueva encima (lo anotado no se pierde) y, al guardarla, queda elegida.
 */
export function BallPickSheet({
  game,
  balls,
  value,
  onPick,
  onClose,
}: {
  game: number | 'all';
  balls: readonly Ball[];
  /** null = sin bola; undefined solo con 'all' = los juegos tienen bolas distintas. */
  value: string | null | undefined;
  onPick: (id: string | null) => void;
  onClose: () => void;
}) {
  const c = useColors();
  const today = toIsoDate(useNow());
  const [adding, setAdding] = useState(false);
  const options = pickableBalls(balls, value ?? null);
  const full = balls.length >= BALL_MAX;
  const title = gameBallTitle(game);
  // «Sin bola» también si la que tenía ya no existe (se borró).
  const noBall = value === null || (value !== undefined && !balls.some((b) => b.id === value));
  const pick = (id: string | null) => {
    onPick(id);
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={title} subtitle={game === 'all' ? 'La misma para todos tus juegos' : '¿Con cuál bola lo tiraste?'}>
      {!options.length && (
        <Txt tone="muted" style={{ fontSize: 14, borderRadius: 12, backgroundColor: c.surface2, paddingHorizontal: 12, paddingVertical: 10 }}>
          {balls.length
            ? 'Tus bolas están retiradas. Agrega otra o vuelve a usar una en «Mis bolas».'
            : 'Todavía no tienes bolas. Agrega la tuya y anota con cuál tiras cada juego: verás con cuál te va mejor.'}
        </Txt>
      )}
      <View accessibilityRole="radiogroup" accessibilityLabel={title} style={{ borderRadius: 16, borderWidth: 1, borderColor: c.line, overflow: 'hidden' }}>
        <BallOptionRow ball={null} checked={noBall} noneText={game === 'all' ? 'No la anoto en estos juegos' : 'No la anoto en este juego'} onSelect={() => pick(null)} />
        {options.map((b) => (
          <View key={b.id} style={{ borderTopWidth: 1, borderTopColor: c.line }}>
            <BallOptionRow ball={b} checked={value === b.id} onSelect={() => pick(b.id)} />
          </View>
        ))}
      </View>
      <Button icon={<Plus size={16} color={c.fg} />} disabled={full} onPress={() => setAdding(true)}>
        Agregar bola
      </Button>
      <Txt tone="muted" style={{ fontSize: 12 }}>
        {full ? FULL_TEXT : 'Queda en «Mis bolas». Necesitas señal para agregarla.'}
      </Txt>
      {/* La que agregó aquí queda elegida (y se cierran las dos hojas). */}
      {adding && <BallSheet ball={null} today={today} onSaved={pick} onClose={() => setAdding(false)} />}
    </Sheet>
  );
}

/**
 * La bola de un juego al anotar (GameBallChip de la web): un botón con la bola (o el círculo punteado sin bola, con un +
 * si la cuenta no tiene ninguna) y su nombre, que abre la hoja para elegirla. 'compact': la bola y ▾ con el nombre
 * debajo; 'full': la bola con su nombre al lado.
 */
export const GameBallChip = memo(function GameBallChip({
  game,
  balls,
  value,
  onPick,
  variant = 'compact',
}: {
  game: number | 'all';
  balls: readonly Ball[];
  value: string | null | undefined;
  /** Siempre la misma función (useCallback): si no, `memo` no sirve. */
  onPick: (game: number | 'all', id: string | null) => void;
  variant?: 'compact' | 'full';
}) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const current = value ? (balls.find((b) => b.id === value) ?? null) : null;
  const none = !current && !pickableBalls(balls).length;
  const what = current ? ballLabel(current) : value === undefined ? 'varias bolas' : 'sin bola';
  const label = `${gameBallTitle(game)}: ${what}${none ? '. Toca para agregar una' : ''}`;
  const pick = useCallback((id: string | null) => onPick(game, id), [onPick, game]);
  const close = useCallback(() => setOpen(false), []);
  const full = variant === 'full';
  const name = current?.name ?? (value === undefined ? (full ? 'Varias bolas' : 'Varias') : 'Sin bola');
  const art: ReactNode = <BallMark ball={current} size={24} add={!current && value !== undefined && none} />;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          { borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, opacity: pressed ? 0.8 : 1 },
          full
            ? { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, borderRadius: 12, paddingLeft: 8, paddingRight: 12, alignSelf: 'flex-start', maxWidth: '100%' }
            : { minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 4, paddingVertical: 4 },
        ]}
      >
        {full ? (
          <>
            {art}
            <Txt numberOfLines={1} style={{ flexShrink: 1, fontFamily: font.medium, fontSize: 14 }}>
              {name}
            </Txt>
            <ChevronDown size={12} color={c.muted} />
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              {art}
              <ChevronDown size={12} color={c.muted} />
            </View>
            <Txt numberOfLines={1} tone={current ? 'fg' : 'muted'} style={{ fontSize: 11, fontFamily: font.medium, textAlign: 'center' }}>
              {name}
            </Txt>
          </>
        )}
      </Pressable>
      {open && <BallPickSheet game={game} balls={balls} value={value} onPick={pick} onClose={close} />}
    </>
  );
});

/** La bola de todos los juegos en una hoja de varios juegos (AllGamesBall de la web). */
export function AllGamesBall({ balls, value, onPick }: { balls: readonly Ball[]; value: string | null | undefined; onPick: (game: number | 'all', id: string | null) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <Txt tone="muted" style={{ fontSize: 12, fontFamily: font.medium }} importantForAccessibility="no">
        Bola para todos los juegos
      </Txt>
      <GameBallChip game="all" variant="full" balls={balls} value={value} onPick={onPick} />
      <Txt tone="muted" style={{ fontSize: 12 }}>
        Toca la bola de un juego para cambiar solo esa.
      </Txt>
    </View>
  );
}
