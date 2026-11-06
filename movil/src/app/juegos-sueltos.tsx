import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CloudUpload, Heart, Lock, Plus } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { soloByMonth, soloHigh, soloSeries, soloSummary, soloVenues, useMySoloSessions, type SoloSession } from '@mm/lib/data/solo';
import { formatDate, toIsoDate } from '@mm/lib/format';
import { useNow } from '@mm/lib/useNow';
import { sportMeta } from '@mm/sports/registry';
import { soloScoresLine } from '@mm/components/solo/logic';
import { DateBlock } from '@/components/DateBlock';
import { SoloGameSheet } from '@/components/solo/SoloGameSheet';
import { BackBar, Button, Card, Empty, LoadError, Loading, Screen, SectionHeader, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/**
 * Juegos sueltos (`/juegos-sueltos`, SoloGamesPage de la web, Lite): «‹ Yo», el título y una línea, tu promedio y tu
 * mejor juego, un solo botón «Anotar juego suelto» y la lista por mes (la fecha, la bolera, los juegos y la serie; el
 * candado si no sale en tu perfil y la nube si falta enviarlo). Tocar uno lo abre para cambiarlo o borrarlo.
 * `?juego=<id>` abre ese; `?nuevo=1`, uno nuevo. Sin cuenta, invita a entrar. Las estadísticas (Pro), en la web.
 */
export default function SoloGamesScreen() {
  const auth = useAuth();
  const c = useColors();
  if (auth.loading) return <Loading />;
  if (!auth.user) {
    const Icon = sportMeta('bowling')?.icon;
    return (
      <Screen>
        <BackBar label="Yo" fallback="/yo" />
        <Txt variant="title">Juegos sueltos</Txt>
        <Empty
          icon={Icon ? <Icon size={28} color={c.accent} /> : undefined}
          title="Entra para anotar tus juegos sueltos"
          text="Lleva tu promedio y tus mejores juegos de boliche fuera de una liga."
          action={
            <Button variant="primary" full onPress={() => router.push('/login')}>
              Entrar
            </Button>
          }
        />
      </Screen>
    );
  }
  return <SoloGames />;
}

function SoloGames() {
  const c = useColors();
  const sessions = useMySoloSessions();
  const { juego, nuevo } = useLocalSearchParams<{ juego?: string; nuevo?: string }>();
  const today = toIsoDate(useNow());
  const summary = useMemo(() => soloSummary(sessions.data), [sessions.data]);
  const months = useMemo(() => soloByMonth(sessions.data), [sessions.data]);
  const venues = useMemo(() => soloVenues(sessions.data), [sessions.data]);
  const editing = juego ? (sessions.data.find((s) => s.id === juego) ?? null) : null;
  const isNew = nuevo === '1';
  const setOpen = (id: string | 'nuevo' | null) => router.setParams({ juego: id && id !== 'nuevo' ? id : undefined, nuevo: id === 'nuevo' ? '1' : undefined });

  const add = (
    <Button variant="primary" size="xl" full icon={<Plus size={20} color={c.accentFg} />} onPress={() => setOpen('nuevo')}>
      Anotar juego suelto
    </Button>
  );
  const Icon = sportMeta('bowling')?.icon;
  let content;
  if (sessions.loading && !sessions.data.length) content = <Loading label="Cargando tus juegos sueltos" />;
  else if (sessions.error && !sessions.data.length) content = <LoadError error={sessions.error} />;
  else if (!sessions.data.length) {
    content = <Empty icon={Icon ? <Icon size={28} color={c.accent} /> : undefined} title="Todavía no tienes juegos sueltos" text="Tu promedio y tus mejores juegos salen aquí y en tu perfil." action={add} />;
  } else {
    content = (
      <>
        <View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Stat value={summary.average ?? '—'} label="Promedio" accent />
            <Stat value={summary.high || '—'} label="Más alto" />
          </View>
          <Txt variant="meta" tone="muted" style={{ marginHorizontal: 4, marginTop: 10 }}>
            {`${summary.games} ${summary.games === 1 ? 'juego' : 'juegos'} en ${summary.sessions} ${summary.sessions === 1 ? 'día' : 'días'}${summary.bestSeries ? ` · mejor serie ${summary.bestSeries}` : ''}`}
          </Txt>
        </View>
        {add}
        {months.map((m) => (
          <View key={m.month} style={{ gap: 8 }}>
            <SectionHeader title={m.label.charAt(0).toUpperCase() + m.label.slice(1)} />
            <Card padded={false} style={{ overflow: 'hidden' }}>
              {m.sessions.map((s, i) => (
                <View key={s.id} style={i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null}>
                  <SoloRow session={s} onOpen={() => setOpen(s.id)} />
                </View>
              ))}
            </Card>
          </View>
        ))}
      </>
    );
  }

  return (
    <Screen>
      <BackBar label="Yo" fallback="/yo" />
      <View style={{ gap: 4 }}>
        <Txt variant="title">Juegos sueltos</Txt>
        <Txt variant="meta" tone="muted">
          Boliche sin liga ni torneo
        </Txt>
      </View>
      <View style={{ gap: 22, marginTop: 6 }}>{content}</View>
      {(isNew || editing) && <SoloGameSheet key={editing?.id ?? 'nuevo'} session={editing} venues={venues} today={today} onClose={() => setOpen(null)} />}
    </Screen>
  );
}

/** Un número grande con su nombre (StatDuo de la web). */
function Stat({ value, label, accent }: { value: string | number; label: string; accent?: boolean }) {
  const c = useColors();
  return (
    <Card style={{ flex: 1, gap: 2 }}>
      <Txt style={{ fontFamily: font.bold, fontSize: 34, lineHeight: 40, color: accent ? c.accent : c.fg }}>{String(value)}</Txt>
      <Txt variant="meta" tone="muted">
        {label}
      </Txt>
    </Card>
  );
}

/**
 * Un día de juegos sueltos en la lista (SoloRow de la web): la fecha, la bolera, los juegos y, a la derecha, la serie (o
 * los pinos de un solo juego). El candado dice que no sale en tu perfil y la nube, que falta enviarlo.
 */
function SoloRow({ session: s, onOpen }: { session: SoloSession; onOpen: () => void }) {
  const c = useColors();
  const many = s.scores.length > 1;
  const label = [
    `${s.venue || 'Juego suelto'}, ${formatDate(s.playedOn)}`,
    many ? `${s.scores.join(', ')}: serie ${soloSeries(s)}` : `${soloHigh(s)} pinos`,
    !s.shared && 'solo lo ves tú',
    s.pending && 'por enviar',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onOpen} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}>
      <DateBlock date={s.playedOn} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="bodyStrong" numberOfLines={1}>
          {s.venue || 'Juego suelto'}
        </Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Txt variant="meta" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
            {soloScoresLine(s)}
          </Txt>
          {!s.shared && <Lock size={14} color={c.faint} />}
          {s.pending && <CloudUpload size={14} color={c.accent} />}
          {s.likes > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Heart size={14} color={c.faint} />
              <Txt variant="meta" tone="faint">
                {String(s.likes)}
              </Txt>
            </View>
          )}
        </View>
      </View>
      <Txt style={{ fontFamily: font.bold, fontSize: 20 }}>{String(many ? soloSeries(s) : soloHigh(s))}</Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingHorizontal: 16, paddingVertical: 10 },
});
