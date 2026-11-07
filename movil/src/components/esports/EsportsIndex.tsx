/**
 * Esports (`/esports`, EsportsHomePage de la web): «‹ Ligas», el título y una línea, el aviso de la pantalla (un ID tuyo
 * que pasó a otra cuenta gana; si no tienes ningún ID, «Pon tu ID de juego»), «Mis torneos», «Mis equipos», los 15
 * juegos en tres secciones y «Mi ID de juego» al final. Es un índice: no tiene botón principal. `?crear=torneo` o
 * `?crear=liga` pregunta «¿De qué juego?» y lleva a crear el torneo (`/esports/<juego>/nuevo-torneo`) o a la página del
 * juego con la hoja de la liga (`?crear=liga`). Sin cuenta se ve todo menos lo tuyo.
 */
import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Gamepad2, IdCard, LogIn } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { useMyEsportsEntries, useMyEsportsTeams } from '@mm/lib/data/esports';
import { seenIdMove, useMyGameIds, useMyIdMoves } from '@mm/lib/data/esportsIds';
import type { Notice } from '@mm/lib/notices';
import { useNow } from '@mm/lib/useNow';
import { GAMES, GAME_IDS, type GameId } from '@mm/sports/esports';
import { entryPhase, esportsNotice, gameSections, idMoveNoticeOf, liveEntries, myEntrySubtitle, myIdsSubtitle, myTeamSubtitle, teamTitle } from '@mm/pages/esports/logic';
import { BackBar, Button, Card, ListRow, Loading, RowIcon, SectionHeader, Sheet, Txt } from '../ui';
import { GameMark, PhaseChip, ScreenNotice, TeamLogo } from './bits';
import { RichRow, RowText } from './inputs';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** El aviso de un ID tuyo que pasó a otra cuenta (el mismo de Hoy en la web); al cerrarlo, queda visto. */
export function useIdMoveNotice(uid: string | null): Notice | null {
  const moves = useMyIdMoves(uid);
  const n = idMoveNoticeOf(moves.data);
  if (!n) return null;
  return { ...n, onDismiss: () => void seenIdMove(n.moveId).catch((e: unknown) => console.warn('[esports] aviso del ID', e)) };
}

/** Entrar sin cuenta (SignInCard de la web): el ícono, el título, una línea, «Crear cuenta» y «Entrar». */
export function SignInCard({ icon, title, text, createLabel = 'Crear cuenta', loginLabel = 'Entrar' }: { icon: ReactNode; title: string; text?: string; createLabel?: string; loginLabel?: string }) {
  const c = useColors();
  return (
    <Card style={{ alignItems: 'center', gap: 8, paddingTop: 28 }}>
      <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
      <Txt variant="cardTitle" style={{ textAlign: 'center', marginTop: 8 }}>
        {title}
      </Txt>
      {!!text && (
        <Txt tone="muted" style={{ textAlign: 'center' }}>
          {text}
        </Txt>
      )}
      <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 16 }}>
        <Button variant="primary" size="xl" full onPress={() => router.push({ pathname: '/login', params: { modo: 'registro' } })}>
          {createLabel}
        </Button>
        <Button size="xl" full icon={<LogIn size={20} color={c.fg} />} onPress={() => router.push('/login')}>
          {loginLabel}
        </Button>
      </View>
    </Card>
  );
}

/** El título de una pantalla de esports con su línea de abajo (ScreenTitle de la web). */
export function ScreenTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={{ gap: 4, flex: 1, minWidth: 0 }}>
      <Txt variant="title">{title}</Txt>
      {!!hint && <Txt tone="muted">{hint}</Txt>}
    </View>
  );
}

/**
 * «¿De qué juego?»: los 15 juegos en una grilla de 3 (el monograma y el nombre). `marked`: los que ya tienen algo (un
 * ID), con una marca. `children`: lo que va en lugar de la grilla (entrar sin cuenta).
 */
export function GamePickerSheet({
  open,
  onClose,
  onPick,
  title = '¿De qué juego?',
  subtitle,
  marked,
  markLabel = 'Ya lo tienes',
  children,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (game: GameId) => void;
  title?: string;
  subtitle?: string;
  marked?: ReadonlySet<GameId>;
  markLabel?: string;
  children?: ReactNode;
}) {
  const c = useColors();
  return (
    <Sheet open={open} onClose={onClose} title={title} subtitle={subtitle}>
      {children ?? (
        <View accessibilityLabel="Juegos" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {GAME_IDS.map((g) => {
            const meta = GAMES[g];
            const on = marked?.has(g) ?? false;
            return (
              <Pressable
                key={g}
                accessibilityRole="button"
                accessibilityLabel={on ? `${meta.name} · ${markLabel}` : meta.name}
                onPress={() => onPick(g)}
                style={({ pressed }) => ({
                  width: '31.5%',
                  minHeight: 92,
                  borderRadius: 16,
                  paddingHorizontal: 6,
                  paddingVertical: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  backgroundColor: c.surface2,
                  borderWidth: on ? 1.5 : 0,
                  borderColor: c.accent,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                })}
              >
                <GameMark game={g} size="md" decorative />
                <Txt numberOfLines={2} style={{ fontSize: 12.5, lineHeight: 15, fontFamily: font.semibold, textAlign: 'center' }}>
                  {meta.name}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      )}
    </Sheet>
  );
}

export function EsportsIndex() {
  const auth = useAuth();
  if (auth.loading) return <Loading />;
  return <EsportsHome uid={auth.user?.uid ?? null} />;
}

function EsportsHome({ uid }: { uid: string | null }) {
  const c = useColors();
  const params = useLocalSearchParams<{ crear?: string }>();
  const now = useNow().getTime();
  const ids = useMyGameIds(uid);
  const teams = useMyEsportsTeams(uid);
  const entries = useMyEsportsEntries(uid);
  const sections = useMemo(() => gameSections(), []);
  const mine = useMemo(() => liveEntries(entries.data), [entries.data]);
  const moved = useIdMoveNotice(uid);
  const crear = params.crear;
  const picking = crear === 'torneo' || crear === 'liga';
  const loadingMine = !!uid && ((teams.loading && !teams.data.length) || (entries.loading && !entries.data.length));
  const go = (href: string) => router.push(href as Href);

  return (
    <View style={{ gap: 26 }}>
      <View style={{ gap: 12 }}>
        <BackBar label="Ligas" fallback="/ligas" />
        <ScreenTitle title="Esports" hint="Torneos y equipos por juego" />
      </View>
      <ScreenNotice notices={[moved, esportsNotice({ signedIn: !!uid, ids: ids.data, idsLoading: ids.loading })]} />

      {loadingMine && <Loading label="Cargando lo tuyo" />}

      {mine.length > 0 && (
        <View style={{ gap: 10 }}>
          <SectionHeader title="Mis torneos" />
          <Card padded={false}>
            {mine.map((e, i) => (
              <View key={e.entryId} style={i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null}>
                <RichRow
                  icon={<GameMark game={e.game} size="md" />}
                  title={e.tournament}
                  subtitle={
                    <>
                      <RowText>{myEntrySubtitle(e)}</RowText>
                      <PhaseChip phase={entryPhase(e, now)} />
                    </>
                  }
                  onPress={() => router.push({ pathname: '/l/[lid]', params: { lid: e.leagueId } })}
                />
              </View>
            ))}
          </Card>
        </View>
      )}

      {teams.data.length > 0 && (
        <View style={{ gap: 10 }}>
          <SectionHeader title="Mis equipos" />
          <Card padded={false}>
            {teams.data.map((t, i) => (
              <View key={t.id} style={i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null}>
                <ListRow
                  icon={<TeamLogo path={t.logoPath} name={t.name} tag={t.tag} />}
                  title={teamTitle(t)}
                  subtitle={myTeamSubtitle(t, t.myRole)}
                  onPress={() => go(`/esports/equipo/${t.id}`)}
                />
              </View>
            ))}
          </Card>
        </View>
      )}

      {sections.map((s) => (
        <View key={s.kind} style={{ gap: 10 }}>
          <SectionHeader title={s.title} />
          <Card padded={false}>
            {s.games.map((g, i) => (
              <View key={g.id} style={i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null}>
                <ListRow icon={<GameMark game={g.id} size="md" />} title={g.name} subtitle={g.blurb} onPress={() => go(`/esports/${g.id}`)} />
              </View>
            ))}
          </Card>
        </View>
      ))}

      <Card padded={false}>
        <ListRow
          icon={
            <RowIcon>
              <IdCard size={20} color={c.accent} />
            </RowIcon>
          }
          title="Mi ID de juego"
          subtitle={myIdsSubtitle(ids.data, !!uid)}
          onPress={() => go('/esports/mi-id')}
        />
      </Card>

      <GamePickerSheet
        open={picking}
        onClose={() => router.setParams({ crear: undefined })}
        title="¿De qué juego?"
        subtitle={crear === 'liga' ? 'La liga es de un solo juego' : 'El torneo es de un solo juego'}
        onPick={(g) => {
          router.setParams({ crear: undefined });
          if (crear === 'liga') router.push({ pathname: '/esports/[game]', params: { game: g, crear: 'liga' } });
          else router.push({ pathname: '/esports/[game]/nuevo-torneo', params: { game: g } } as never);
        }}
      >
        {!uid ? (
          <SignInCard
            icon={<Gamepad2 size={28} color={c.accent} />}
            title={crear === 'liga' ? 'Entra para crear una liga' : 'Entra para crear un torneo'}
            text="Con tu cuenta organizas torneos de tu juego y apruebas a los equipos."
          />
        ) : undefined}
      </GamePickerSheet>
    </View>
  );
}
