import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Pencil, Target } from 'lucide-react-native';
import { useEvents, usePlayer } from '@mm/lib/data';
import { setGolfIndex, useGolfIndexes, useGolfPlayer } from '@mm/lib/data/golf';
import { eventLabel, formatDate } from '@mm/lib/format';
import { useLeagueCtx } from '@mm/lib/league';
import { isValidIndex, MAX_INDEX, MIN_INDEX } from '@mm/sports/golf/course';
import { indexInput, indexText, parseIndex, playedRounds, playerStats, type PlayedRound } from '@mm/pages/sports/golf/logic';
import { liteNumbers, recentRounds, roundLine, roundsCount } from '@mm/pages/sports/golf/profile';
import { BackBar, Button, Card, Divider, Empty, Field, Input, ListRow, LoadError, Loading, SectionHeader, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { NumbersGrid, golfAction, openRound } from './parts';

/** Últimas rondas que se ven antes de «Ver las N» (ShowMore de la web). */
const SHOWN = 3;

/** Mi golf en la liga (`/l/<liga>/perfil`, GolfMyProfile de la web): Index (no oficial), mis números y mis rondas. */
export function GolfMyProfile() {
  const c = useColors();
  const { myPlayerId } = useLeagueCtx();
  if (!myPlayerId) {
    return (
      <View style={{ gap: 20 }}>
        <Txt variant="title">Mi golf</Txt>
        <Empty icon={<Target size={28} color={c.accent} />} title="No juegas en esta liga" text="Únete a la liga para anotar tus rondas y ver tus números." />
      </View>
    );
  }
  return <GolfPlayerView playerId={myPlayerId} own />;
}

/** La página de golf de un jugador (`/l/<liga>/j/<jugador>`, GolfPlayerPage de la web): «‹ Golf del Club» vuelve. */
export function GolfPlayerPage({ playerId }: { playerId: string }) {
  const { lid, league, myPlayerId } = useLeagueCtx();
  return (
    <View style={{ gap: 4 }}>
      <BackBar label={league.name} fallback={`/l/${lid}/tabla`} />
      <GolfPlayerView playerId={playerId} own={playerId === myPlayerId} />
    </View>
  );
}

/**
 * Los números de golf de un jugador (GolfPlayerView de la web, Lite, con su misma lógica: profile.ts): el título, su
 * Handicap Index con «Cambiar» (él o el admin), Mejor bruto · Promedio · Birdies y sus últimas rondas (3 y «Ver las
 * 10»; tocar una abre su leaderboard). Solo cuentan las tarjetas firmadas o de rondas cerradas.
 */
function GolfPlayerView({ playerId, own }: { playerId: string; own: boolean }) {
  const c = useColors();
  const { lid, isAdmin } = useLeagueCtx();
  const player = usePlayer(lid, playerId);
  const data = useGolfPlayer(lid, playerId);
  const indexes = useGolfIndexes(lid);
  const events = useEvents(lid);
  const [editing, setEditing] = useState(false);
  const [all, setAll] = useState(false);

  if (data.error) return <LoadError error={data.error} />;
  const rounds = playedRounds(data.data);
  const stats = playerStats(rounds);
  const byEvent = new Map(events.data.map((e) => [e.id, e] as const));
  const recent = recentRounds(rounds, (id) => byEvent.get(id)?.date);
  const idx = indexes.data[playerId] ?? null;
  const canEdit = own || isAdmin;
  const name = player.data?.name ?? (own ? 'Mi golf' : 'Jugador');
  const nameOfRound = (r: PlayedRound) => {
    const e = byEvent.get(r.eventId);
    return e ? eventLabel({ type: e.type, name: e.name, date: e.date }, 'golf') : r.round.courseName;
  };
  const shown = all ? recent : recent.slice(0, SHOWN);

  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 6 }}>
        <Txt variant="title">{own ? 'Mi golf' : name}</Txt>
        <Txt variant="meta" tone="muted">
          {[own && player.data ? name : null, roundsCount(rounds.length)].filter(Boolean).join(' · ')}
        </Txt>
      </View>

      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Txt variant="meta" tone="muted" style={{ fontFamily: font.medium, flexShrink: 1 }}>
            Handicap Index (no oficial)
          </Txt>
          {canEdit && (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setEditing(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36 }}>
              <Pencil size={16} color={c.accent} />
              <Txt tone="accent" variant="bodyStrong">
                {idx ? 'Cambiar' : 'Anotar'}
              </Txt>
            </Pressable>
          )}
        </View>
        <Txt style={{ fontFamily: font.bold, fontSize: 40, lineHeight: 46 }}>{idx ? indexText(idx.index) : '–'}</Txt>
        <Txt tone="muted" style={{ fontSize: 13, lineHeight: 18 }}>{`${idx?.at ? `Anotado el ${formatDate(idx.at)} · ` : ''}el de FEDOGOLF o GHIN; se congela al inscribirte`}</Txt>
      </Card>

      {data.loading && !data.data.cards.length ? (
        <Loading label="Cargando los números" />
      ) : !rounds.length ? (
        <Empty icon={<Target size={28} color={c.accent} />} title="Todavía no hay rondas" text="Cuentan cuando la tarjeta está firmada o la ronda se cerró." />
      ) : (
        <>
          <NumbersGrid items={liteNumbers(stats)} />
          <View style={{ gap: 8, marginTop: 12 }}>
            <SectionHeader title="Últimas rondas" />
            {events.loading && !events.data.length ? (
              <Loading label="Cargando las rondas" />
            ) : (
              <>
                <Card padded={false}>
                  {shown.map((r, i) => (
                    <View key={r.eventId}>
                      {i > 0 && <Divider inset={16} />}
                      <ListRow
                        title={nameOfRound(r)}
                        subtitle={roundLine(r)}
                        right={<Txt style={{ fontFamily: font.bold, fontSize: 20 }}>{String(r.stableford.gross ?? '–')}</Txt>}
                        onPress={() => openRound(lid, r.eventId, 'leaderboard')}
                      />
                    </View>
                  ))}
                </Card>
                {recent.length > SHOWN && <Button onPress={() => setAll((v) => !v)}>{all ? 'Ver menos' : `Ver las ${recent.length} rondas`}</Button>}
              </>
            )}
          </View>
        </>
      )}
      {canEdit && editing && <IndexSheet onClose={() => setEditing(false)} playerId={playerId} current={idx?.index ?? null} />}
    </View>
  );
}

/** «Handicap Index» (IndexModal de la web): el Index del perfil del jugador en la liga; vacío = sin Index. */
function IndexSheet({ onClose, playerId, current }: { onClose: () => void; playerId: string; current: number | null }) {
  const { lid } = useLeagueCtx();
  const [text, setText] = useState(indexInput(current));
  const [busy, setBusy] = useState(false);
  const value = parseIndex(text);
  const bad = value != null && !isValidIndex(value);

  async function save() {
    setBusy(true);
    const ok = await golfAction(async () => {
      await setGolfIndex(lid, playerId, value);
      return true;
    }, 'Index guardado');
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Handicap Index"
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button onPress={onClose} style={{ flex: 1 }}>
            Cancelar
          </Button>
          <Button variant="primary" loading={busy} disabled={bad} onPress={() => void save()} style={{ flex: 1.4 }}>
            Guardar
          </Button>
        </View>
      }
    >
      <Field label="Index (no oficial)" hint={`De +${Math.abs(MIN_INDEX)} a ${MAX_INDEX}. Plus: +1.2. Vacío = sin Index.`} error={bad}>
        <Input keyboardType="numbers-and-punctuation" value={text} onChangeText={setText} placeholder="Ej.: 14.2" invalid={bad} autoFocus />
      </Field>
      <Txt tone="muted" style={{ fontSize: 12 }}>
        Con el Index sale tu handicap de campo en cada ronda. Las rondas en las que ya estás inscrito no cambian.
      </Txt>
    </Sheet>
  );
}
