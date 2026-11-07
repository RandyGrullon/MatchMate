/**
 * Equipos (`/equipos`, SquadsPage de la web, con su misma lógica: src/components/squads/logic.ts): «Crear equipo»,
 * buscar equipos (nombre, tag o ciudad: cada uno con Seguir o «Tu equipo»), «Mis equipos» (los míos con mi papel y los
 * de esports con su juego), «Equipos que sigo» y «Unirme con código» (8 letras y números → /equipos/unirse/<código>).
 * `?crear=1` abre «Crear equipo» (con `?deporte=`, ese deporte ya elegido). Sin cuenta: entrar.
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Gamepad2, Search, SearchX, Shield, Ticket, X } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { invalidate } from '@mm/lib/data/client';
import { useMyEsportsTeams } from '@mm/lib/data/esports';
import { squadTags, useFollowedSquads, useMySquads, useSquadSearch, type SquadSearch } from '@mm/lib/data/squads';
import { myTeamSubtitle, teamTitle } from '@mm/pages/esports/logic';
import { CODE_LENGTH, cleanCode, mySquadLine, squadsHomeState } from '@mm/components/squads/logic';
import { GameMark, TeamLogo } from '../esports/bits';
import { SignInCard } from '../esports/EsportsIndex';
import { RichRow, RowText } from '../esports/inputs';
import { BackBar, Button, Card, ListRow, LoadError, Loading, RowIcon, Screen, SectionHeader, Txt } from '../ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { Quiet, SquadFollowButton, SquadResultRow, SquadRow } from './bits';
import { CreateSquadSheet } from './CreateSquadSheet';

const line = (i: number, color: string) => (i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color } : null);

export function SquadsHome() {
  const auth = useAuth();
  const c = useColors();
  const params = useLocalSearchParams<{ crear?: string; deporte?: string }>();
  const creating = params.crear === '1';
  const setCreating = (on: boolean) => router.setParams(on ? { crear: '1' } : { crear: undefined, deporte: undefined });
  const uid = auth.user?.uid ?? null;

  if (auth.loading) return <Loading />;

  return (
    <Screen onRefresh={uid ? () => invalidate(squadTags.all) : undefined}>
      <BackBar label="Ligas" fallback="/ligas" />
      <View style={{ gap: 4 }}>
        <Txt variant="title">Equipos</Txt>
        <Txt tone="muted">Tu equipo competitivo, con o sin liga</Txt>
      </View>
      {/* Sin cuenta, el botón principal es el de crear la cuenta (la tarjeta de abajo). */}
      {uid && (
        <Button variant="primary" size="xl" full icon={<Shield size={20} color={c.accentFg} />} onPress={() => setCreating(true)}>
          Crear equipo
        </Button>
      )}

      {uid ? (
        <SignedIn uid={uid} />
      ) : (
        <SignInCard icon={<Shield size={28} color={c.accent} />} title="Entra para ver tus equipos" text="Crea tu equipo, invita a los tuyos con un link, sigue a otros equipos y búscale liga." />
      )}

      <CreateSquadSheet open={creating} onClose={() => setCreating(false)} sport={params.deporte ?? null} />
    </Screen>
  );
}

function SignedIn({ uid }: { uid: string }) {
  const c = useColors();
  const [query, setQuery] = useState('');
  const mine = useMySquads();
  const esports = useMyEsportsTeams(uid);
  const followed = useFollowedSquads();
  const search = useSquadSearch(query);
  const mineIds = useMemo(() => new Set(mine.data.map((s) => s.id)), [mine.data]);
  const followedIds = useMemo(() => new Set(followed.data.map((s) => s.id)), [followed.data]);
  const q = query.trim();
  const searching = q.length >= 2;
  const { loadingMine, nothing } = squadsHomeState({ mine, esports, followed });

  return (
    <>
      <SearchBox value={query} onChange={setQuery} />

      {searching ? (
        <View style={{ gap: 10 }}>
          <SectionHeader title="Equipos" />
          <SearchResults search={search} query={q} mineIds={mineIds} followedIds={followedIds} />
        </View>
      ) : (
        <>
          {loadingMine ? (
            <View style={{ gap: 10 }}>
              <SectionHeader title="Mis equipos" />
              <Loading label="Cargando tus equipos" />
            </View>
          ) : mine.error && !mine.data.length ? (
            <LoadError error={mine.error} />
          ) : (
            (mine.data.length > 0 || esports.data.length > 0) && (
              <View style={{ gap: 10 }}>
                <SectionHeader title="Mis equipos" />
                <Card padded={false}>
                  {mine.data.map((s, i) => (
                    <View key={s.id} style={line(i, c.line)}>
                      <SquadRow squad={s} subtitle={mySquadLine(s)} />
                    </View>
                  ))}
                  {esports.data.map((t, i) => (
                    <View key={`esports-${t.id}`} style={line(mine.data.length + i, c.line)}>
                      <RichRow
                        icon={<TeamLogo path={t.logoPath} name={t.name} tag={t.tag} />}
                        title={teamTitle(t)}
                        subtitle={
                          <>
                            <GameMark game={t.game} size="sm" />
                            <RowText>{myTeamSubtitle(t, t.myRole)}</RowText>
                          </>
                        }
                        onPress={() => router.push({ pathname: '/esports/equipo/[teamId]', params: { teamId: t.id } } as never)}
                      />
                    </View>
                  ))}
                </Card>
              </View>
            )
          )}

          {followed.data.length > 0 && (
            <View style={{ gap: 10 }}>
              <SectionHeader title="Equipos que sigo" />
              <Card padded={false}>
                {followed.data.map((s, i) => (
                  <View key={s.id} style={line(i, c.line)}>
                    <SquadRow squad={s} right={<SquadFollowButton squadId={s.id} name={s.name} following size="sm" />} />
                  </View>
                ))}
              </Card>
            </View>
          )}

          {nothing && <Quiet icon={<Shield size={24} color={c.muted} />} title="Todavía no tienes equipo" text="Crea el tuyo y pásale el link a los tuyos, o únete con el código que te dé el capitán." />}

          <JoinWithCode />
          <Card padded={false}>
            <ListRow
              icon={
                <RowIcon>
                  <Gamepad2 size={20} color={c.accent} />
                </RowIcon>
              }
              title="Equipos de esports"
              subtitle="Van por juego, con tu ID de juego"
              onPress={() => router.push('/esports' as never)}
            />
          </Card>
        </>
      )}
    </>
  );
}

/** La caja para buscar equipos (nombre, tag o ciudad). */
function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: 52, borderRadius: 16, backgroundColor: c.surface, paddingLeft: 16 }}>
      <Search size={20} color={c.muted} />
      <TextInput
        accessibilityLabel="Buscar equipos"
        value={value}
        onChangeText={(v) => onChange(v.slice(0, 60))}
        placeholder="Buscar equipos por nombre, tag o ciudad"
        placeholderTextColor={c.faint}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        style={{ flex: 1, height: 52, paddingHorizontal: 12, fontSize: 16, fontFamily: font.medium, color: c.fg }}
      />
      {!!value && (
        <Pressable accessibilityRole="button" accessibilityLabel="Borrar búsqueda" onPress={() => onChange('')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <X size={18} color={c.faint} />
        </Pressable>
      )}
    </View>
  );
}

/** Los equipos encontrados: «Tu equipo» si es tuyo; si no, Seguir. */
function SearchResults({ search, query, mineIds, followedIds }: { search: SquadSearch; query: string; mineIds: ReadonlySet<string>; followedIds: ReadonlySet<string> }) {
  const c = useColors();
  if (search.loading && !search.data.length) return <Loading label="Buscando equipos" />;
  if (search.error && !search.data.length) return <LoadError error={search.error} />;
  if (!search.data.length) {
    if (!search.settled) return <Loading label="Buscando equipos" />;
    return <Quiet icon={<SearchX size={24} color={c.muted} />} title={`No encontramos equipos con «${query}»`} text="Busca por el nombre, el tag (como TGR) o la ciudad." />;
  }
  const stale = !search.settled || search.loading;
  return (
    <Card padded={false} style={{ opacity: stale ? 0.6 : 1 }}>
      {search.data.map((s, i) => (
        <View key={s.id} style={line(i, c.line)}>
          <SquadResultRow squad={s} mine={mineIds.has(s.id)} following={followedIds.has(s.id)} />
        </View>
      ))}
    </Card>
  );
}

/** «Unirme con código»: las 8 letras y números que da el capitán → la pantalla de unirse. */
function JoinWithCode() {
  const c = useColors();
  const [code, setCode] = useState('');
  const ready = code.length === CODE_LENGTH;
  const submit = () => {
    if (ready) router.push({ pathname: '/equipos/unirse/[code]', params: { code } } as never);
  };
  return (
    <View style={{ borderRadius: 22, backgroundColor: c.accentSoft, padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ticket size={22} color={c.accent} />
        <Txt variant="bodyStrong" accessibilityRole="header">
          Unirme con código
        </Txt>
      </View>
      <Txt variant="meta" tone="fg2" style={{ marginTop: 3, marginBottom: 12, paddingLeft: 32 }}>
        Te lo da el capitán del equipo
      </Txt>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          accessibilityLabel="Código del equipo"
          value={code}
          onChangeText={(v) => setCode(cleanCode(v))}
          placeholder="EJ. ABCD2345"
          placeholderTextColor={c.faint}
          maxLength={CODE_LENGTH}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={submit}
          style={{ flex: 1, minWidth: 0, height: 52, borderRadius: 15, backgroundColor: c.surface, paddingHorizontal: 16, fontSize: 16, fontFamily: font.semibold, letterSpacing: 1.6, color: c.fg }}
        />
        <Button variant="primary" disabled={!ready} onPress={submit} style={{ height: 52, width: 104 }}>
          Unirme
        </Button>
      </View>
    </View>
  );
}
