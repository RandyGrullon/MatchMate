import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Plus, Search, Trophy } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { BALL_MAX, ballStats, bestBallText, resurfaceQuestion, type Ball } from '@mm/lib/balls';
import { ballErrorText, ballTags, resurfaceBall, retireBall, useMyBallGames, useMyBalls } from '@mm/lib/data/balls';
import { invalidate } from '@mm/lib/data/client';
import { formatDate, toIsoDate } from '@mm/lib/format';
import { useNow } from '@mm/lib/useNow';
import { hasBallCatalog } from '@mm/components/balls/catalog';
import { BallCard } from '@/components/balls/BallCard';
import { CatalogSearchSheet } from '@/components/balls/BallCatalog';
import { BallSheet } from '@/components/balls/BallSheet';
import { BallIcon } from '@/components/balls/bits';
import { SignInCard } from '@/components/esports/EsportsIndex';
import { confirmAsync, toast } from '@/components/feedback';
import { BackBar, Button, Card, LoadError, Loading, Screen, SectionHeader, Txt } from '@/components/ui';
import { openOnWeb } from '@/lib/web';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

type Params = { bola?: string; nueva?: string; catalogo?: string; buscar?: string; disenar?: string };

/** El título de la pantalla con su línea (ScreenTitle de la web). */
function Title({ hint }: { hint?: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Txt variant="title" accessibilityRole="header">
        Mis bolas
      </Txt>
      {!!hint && <Txt tone="muted">{hint}</Txt>}
    </View>
  );
}

/**
 * Mis bolas (/bolas, BallsPage de la web): «‹ Yo», el título y una línea; con cuál tiras mejor (una sola línea), cada
 * bola en su tarjeta (dibujada con su diseño, sus números y cuántos juegos lleva desde la última pulida, con «La pulí
 * hoy»; Editar, Diseñar y Retirar en su «•••»), un solo botón «Agregar bola» y las retiradas aparte. Arriba, «Buscar
 * bolas» en el catálogo: «Agregar a mi arsenal» abre la hoja de una nueva ya llena. `?bola=<id>` abre esa; `?nueva=1`,
 * una nueva (con `&catalogo=<modelo>`, ya llena); `?buscar=<texto>`, el buscador. El creador («Diseñar»,
 * `?disenar=<id>`) está en la web. Solo la cuenta ve sus bolas; sin cuenta, invita a entrar.
 */
export default function BallsScreen() {
  const auth = useAuth();
  const c = useColors();
  if (auth.loading) return <Loading />;
  if (!auth.user) {
    return (
      <Screen>
        <BackBar label="Yo" fallback="/yo" />
        <Title />
        <SignInCard icon={<BallIcon size={28} color={c.accent} />} title="Entra para registrar tus bolas" text="Mira con cuál te va mejor y cuándo toca pulirla." />
      </Screen>
    );
  }
  return <Balls />;
}

/** El creador abre la web cuando ya se cerró la hoja que estaba abierta (encima de una hoja que se cierra no se ve). */
const SHEET_CLOSE_MS = 400;

function Balls() {
  const c = useColors();
  const mine = useMyBalls();
  const balls = mine.data.balls;
  const games = useMyBallGames(null, balls.length > 0);
  const params = useLocalSearchParams<Params>();
  const today = toIsoDate(useNow());
  const [busy, setBusy] = useState<string | null>(null);

  const stats = useMemo(() => ballStats(balls, games.data), [balls, games.data]);
  const active = stats.filter((s) => !s.ball.retired);
  const retired = stats.filter((s) => s.ball.retired);
  const best = bestBallText(active.length >= 2 ? active : stats);

  const openId = params.bola ?? null;
  const isNew = params.nueva === '1';
  const catalogId = params.catalogo ?? null;
  const searching = params.buscar != null;
  const editing = openId ? (balls.find((b) => b.id === openId) ?? null) : null;
  const full = balls.length >= BALL_MAX;

  /** Abre la hoja de una bola o una nueva (con `catalog`, ya llena con ese modelo); null cierra (también el buscador). */
  const setOpen = useCallback((id: string | 'nueva' | null, catalog?: string) => {
    router.setParams({
      bola: id && id !== 'nueva' ? id : undefined,
      nueva: id === 'nueva' ? '1' : undefined,
      catalogo: id === 'nueva' && catalog ? catalog : undefined,
      buscar: undefined,
      disenar: undefined,
    });
  }, []);

  /** «Diseñar»: el creador está en la web (al volver, la lista se vuelve a leer con el diseño nuevo). */
  const design = useCallback(
    (id: string) => {
      setOpen(null);
      setTimeout(() => {
        void openOnWeb(`/bolas?disenar=${encodeURIComponent(id)}`).then(() => invalidate(ballTags.all));
      }, SHEET_CLOSE_MS);
    },
    [setOpen],
  );

  // Un link al creador (`?disenar=<id>`) también va a la web.
  const designId = params.disenar ?? null;
  useEffect(() => {
    if (designId) design(designId);
  }, [designId, design]);

  async function act(id: string, what: () => Promise<void>, done: string) {
    if (busy) return;
    setBusy(id);
    try {
      await what();
      toast(done);
    } catch (e) {
      toast(ballErrorText(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  /** «La pulí hoy»: pregunta antes (la fecha de antes se pierde y los juegos se vuelven a contar). */
  async function resurface(b: Ball) {
    const q = resurfaceQuestion(b, today, formatDate);
    if (!q) {
      toast(`La ${b.name} ya dice que la puliste hoy`);
      return;
    }
    const ok = await confirmAsync({ title: q.title, message: q.message, confirmText: 'Sí, la pulí' });
    if (!ok) return;
    await act(b.id, () => resurfaceBall(b.id), `La ${b.name} quedó pulida hoy`);
  }

  async function retire(id: string, name: string, on: boolean) {
    if (on) {
      const ok = await confirmAsync({
        title: `¿Retirar la ${name}?`,
        message: 'Ya no sale al anotar. Sus números se quedan y la puedes volver a usar cuando quieras.',
        confirmText: 'Retirar',
      });
      if (!ok) return;
    }
    await act(id, () => retireBall(id, on), on ? 'Bola retirada' : 'Bola de vuelta');
  }

  // Buscar en el catálogo (sin catálogo no sale).
  const search = hasBallCatalog() && (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Buscar bolas. Marca o modelo"
      onPress={() => router.setParams({ buscar: '' })}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, height: 52, borderRadius: 16, paddingHorizontal: 16, backgroundColor: c.surface, transform: [{ scale: pressed ? 0.99 : 1 }] })}
    >
      <Search size={20} color={c.muted} />
      <Txt numberOfLines={1} style={{ flex: 1, fontSize: 16, color: c.fg }}>
        Buscar bolas
      </Txt>
      <Txt style={{ fontSize: 13, color: c.faint }}>Marca o modelo</Txt>
    </Pressable>
  );

  // El único botón principal de la pantalla.
  const add = (
    <Button variant="primary" size="xl" full icon={<Plus size={20} color={c.accentFg} strokeWidth={2.4} />} disabled={full} onPress={() => setOpen('nueva')}>
      Agregar bola
    </Button>
  );

  const card = (s: (typeof stats)[number]) => (
    <BallCard
      key={s.ball.id}
      stats={s}
      busy={busy === s.ball.id}
      onEdit={() => setOpen(s.ball.id)}
      onDesign={() => design(s.ball.id)}
      onResurface={s.ball.retired ? () => undefined : () => void resurface(s.ball)}
      onRetire={() => void retire(s.ball.id, s.ball.name, !s.ball.retired)}
    />
  );

  let content;
  if (mine.loading && !balls.length) {
    content = (
      <>
        <View style={{ height: 120, borderRadius: 22, backgroundColor: c.surface }} />
        <View style={{ height: 120, borderRadius: 22, backgroundColor: c.surface }} />
      </>
    );
  } else if (mine.error && !balls.length) {
    content = <LoadError error={mine.error} />;
  } else if (!balls.length) {
    content = (
      <Card style={{ alignItems: 'center', paddingTop: 28 }}>
        <View style={{ width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accentSoft }}>
          <BallIcon size={28} color={c.accent} />
        </View>
        <Txt variant="cardTitle" style={{ marginTop: 16, textAlign: 'center' }}>
          Todavía no tienes bolas
        </Txt>
        <Txt tone="muted" style={{ marginTop: 8, textAlign: 'center', maxWidth: 360 }}>
          Elige con cuál tiras cada juego al anotarlo y verás con cuál te va mejor.
        </Txt>
        <View style={{ alignSelf: 'stretch', marginTop: 24 }}>{add}</View>
      </Card>
    );
  } else {
    content = (
      <>
        {!!best && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, paddingVertical: 12, paddingLeft: 14, paddingRight: 16, backgroundColor: c.accentSoft }}>
            <Trophy size={20} color={c.accent} />
            <Txt style={{ flex: 1, fontSize: 14, fontFamily: font.semibold, color: c.accent }}>{best}</Txt>
          </View>
        )}
        {games.error && !games.data.length && <LoadError error={games.error} />}
        {active.map(card)}
        {add}
        {full && (
          <Txt tone="muted" style={{ fontSize: 13, textAlign: 'center', marginTop: -8 }}>
            {`Ya tienes ${BALL_MAX} bolas: borra una que ya no uses para agregar otra.`}
          </Txt>
        )}
        {retired.length > 0 && (
          <View style={{ gap: 14 }}>
            <SectionHeader title="Retiradas" />
            {retired.map(card)}
          </View>
        )}
        <Txt tone="muted" style={{ fontSize: 13, marginHorizontal: 4 }}>
          Elige la bola al anotar cada juego. Strikes y spares salen de los juegos anotados por cuadros.
        </Txt>
      </>
    );
  }

  return (
    <>
      <Screen onRefresh={() => invalidate(ballTags.all)} contentStyle={{ gap: 14 }}>
        <BackBar label="Yo" fallback="/yo" />
        <Title hint="Solo tú ves tus bolas" />
        <View style={{ height: 6 }} />
        {search}
        {content}
      </Screen>
      {isNew || editing ? (
        <BallSheet
          key={editing?.id ?? `nueva:${catalogId ?? ''}`}
          ball={editing}
          today={today}
          catalog={editing ? null : catalogId}
          onClose={() => setOpen(null)}
          onDesign={editing ? () => design(editing.id) : undefined}
        />
      ) : (
        searching && (
          <CatalogSearchSheet initialQuery={params.buscar ?? ''} full={full} onAdd={(id) => setOpen('nueva', id)} onManual={() => setOpen('nueva')} onClose={() => setOpen(null)} />
        )
      )}
    </>
  );
}
