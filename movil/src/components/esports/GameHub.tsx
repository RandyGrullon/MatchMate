/**
 * La página de un juego (`/esports/<juego>`, GameHubPage de la web, Lite): «‹ Esports», el monograma grande, el nombre y
 * «5 contra 5 · Riot ID»; «Torneos abiertos | Equipos»; «Crear equipo» si todavía no tienes equipo de ese juego (y al
 * final «¿Organizas? Crear torneo», el asistente de `/esports/<juego>/nuevo-torneo`); «Torneos | Equipos» (los duelos
 * solo tienen torneos). Los torneos en «Inscripción abierta», «En curso» y «Terminados»; los equipos con un buscador y
 * los tuyos primero. `?crear=equipo` abre «Crear equipo» (`&volver=` a dónde ir después; con su logo) y `?crear=liga`,
 * «Crear liga».
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Redirect, router, useLocalSearchParams, type Href } from 'expo-router';
import { IdCard, Lock, Plus, Search, Trophy, Users } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { createTeam, esportsErrorText, uploadTeamLogo, useEsportsHub, useMyEsportsTeams, type HubTournament } from '@mm/lib/data/esports';
import { useMyGameIds } from '@mm/lib/data/esportsIds';
import { useNow } from '@mm/lib/useNow';
import { GAMES, isGameId, modeLabel, type GameId } from '@mm/sports/esports';
import {
  cleanTag,
  createTeamLink,
  gameHubActions,
  gameLine,
  hasGameId,
  hubPhase,
  hubSections,
  idWord,
  membersText,
  myIdLink,
  myTeamSubtitle,
  openTournamentCount,
  safeBack,
  suggestTag,
  teamFormErrors,
  teamLists,
  teamTitle,
  tournamentSubtitle,
  type TeamForm,
} from '@mm/pages/esports/logic';
import { DateBlock } from '../DateBlock';
import { toast } from '../feedback';
import { BackBar, Button, Card, Empty, Field, Input, LoadError, Loading, Segmented, SectionHeader, Sheet, Txt } from '../ui';
import { GameMark, PhaseChip, TeamLogo } from './bits';
import { CreateLeagueSheet } from './CreateLeagueSheet';
import { ScreenTitle, SignInCard } from './EsportsIndex';
import { TeamLogoField, type PickedLogo } from './TeamLogoField';
import { RichRow, RowText } from './inputs';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

type HubView = 'torneos' | 'equipos';

export function GameHub({ game }: { game: string }) {
  const auth = useAuth();
  if (!isGameId(game)) return <Redirect href={"/esports" as Href} />;
  if (auth.loading) return <Loading />;
  return <Hub key={game} game={game} uid={auth.user?.uid ?? null} />;
}

/** «Torneos abiertos | Equipos» (StatDuo de la web): dos cifras en una tarjeta; tocar una cambia la vista. */
function StatDuo({ left, right }: { left: { value: number; label: string; onPress?: () => void }; right: { value: number; label: string; onPress?: () => void } }) {
  const c = useColors();
  const half = (it: { value: number; label: string; onPress?: () => void }) => (
    <Pressable accessibilityRole={it.onPress ? 'button' : undefined} disabled={!it.onPress} onPress={it.onPress} style={{ flex: 1, paddingVertical: 18, alignItems: 'center', gap: 2 }}>
      <Txt variant="stat">{it.value.toLocaleString('es-DO')}</Txt>
      <Txt variant="meta" tone="muted">
        {it.label}
      </Txt>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'stretch', borderRadius: 24, backgroundColor: c.surface }}>
      {half(left)}
      <View style={{ width: StyleSheet.hairlineWidth, marginVertical: 18, backgroundColor: c.line }} />
      {half(right)}
    </View>
  );
}

function Hub({ game, uid }: { game: GameId; uid: string | null }) {
  const c = useColors();
  const meta = GAMES[game];
  const now = useNow().getTime();
  const params = useLocalSearchParams<{ ver?: string; crear?: string; volver?: string }>();
  const hub = useEsportsHub(game);
  const myTeams = useMyEsportsTeams(uid);
  const ids = useMyGameIds(uid);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<HubView | null>(null);

  const teamsOn = meta.kind !== 'duel';
  const view: HubView = teamsOn && (picked ?? (params.ver === 'equipos' ? 'equipos' : 'torneos')) === 'equipos' ? 'equipos' : 'torneos';
  const crear = params.crear;
  const back = safeBack(params.volver);
  const mine = useMemo(() => myTeams.data.filter((t) => t.game === game), [myTeams.data, game]);
  const sections = useMemo(() => hubSections(hub.data.tournaments), [hub.data.tournaments]);
  const lists = useMemo(() => teamLists(mine, hub.data.teams, query), [mine, hub.data.teams, query]);
  // En el teléfono no hay Pro: la acción de Lite («Crear equipo») y «¿Organizas? Crear torneo».
  const actions = gameHubActions({ pro: false, kind: meta.kind, hasTeam: mine.length > 0 });
  const newTournament = () => router.push({ pathname: '/esports/[game]/nuevo-torneo', params: { game } } as never);
  const teamCount = Math.max(hub.data.teams.length, mine.length);
  const liveCount = hub.data.tournaments.filter((t) => t.status === 'live').length;
  const go = (href: string) => router.push(href as Href);
  const closeCreate = () => router.setParams({ crear: undefined, volver: undefined });

  let body: ReactNode;
  if (view === 'torneos') {
    if (hub.loading && !hub.data.tournaments.length) body = <Loading label="Cargando los torneos" />;
    else if (hub.error && !hub.data.tournaments.length) body = <LoadError error={hub.error} />;
    else if (!sections.length)
      body = (
        <Empty
          icon={<Trophy size={28} color={c.accent} />}
          title={`Todavía no hay torneos de ${meta.name}`}
          text="Arma el primero: eliges el formato y los equipos se inscriben."
          action={
            <Button variant="soft" icon={<Plus size={16} color={c.accent} />} onPress={newTournament}>
              Crear torneo
            </Button>
          }
        />
      );
    else
      body = (
        <View style={{ gap: 26 }}>
          {sections.map((s) => (
            <View key={s.key} style={{ gap: 10 }}>
              <SectionHeader title={s.title} />
              <Card padded={false}>
                {s.items.map((t, i) => (
                  <View key={t.eventId} style={i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null}>
                    <TournamentRow t={t} now={now} />
                  </View>
                ))}
              </Card>
            </View>
          ))}
        </View>
      );
  } else {
    const nothing = !lists.mine.length && !lists.others.length;
    body = (
      <View style={{ gap: 26 }}>
        <View style={{ justifyContent: 'center' }}>
          <Input accessibilityLabel="Buscar equipo" value={query} placeholder="Buscar por nombre o tag" onChangeText={setQuery} style={{ height: 44, paddingLeft: 36 }} autoCorrect={false} />
          <View pointerEvents="none" style={{ position: 'absolute', left: 12 }}>
            <Search size={16} color={c.muted} />
          </View>
        </View>
        {lists.mine.length > 0 && (
          <View style={{ gap: 10 }}>
            <SectionHeader title="Tus equipos" />
            <Card padded={false}>
              {lists.mine.map((t, i) => (
                <View key={t.id} style={i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null}>
                  <RichRow me icon={<TeamLogo path={t.logoPath} name={t.name} tag={t.tag} />} title={teamTitle(t)} subtitle={<RowText>{myTeamSubtitle(t, t.myRole)}</RowText>} onPress={() => go(`/esports/equipo/${t.id}`)} />
                </View>
              ))}
            </Card>
          </View>
        )}
        {lists.others.length > 0 && (
          <View style={{ gap: 10 }}>
            <SectionHeader title={lists.mine.length ? 'Otros equipos' : 'Equipos'} />
            <Card padded={false}>
              {lists.others.map((t, i) => (
                <View key={t.id} style={i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null}>
                  <RichRow icon={<TeamLogo path={t.logoPath} name={t.name} tag={t.tag} />} title={teamTitle(t)} subtitle={<RowText>{membersText(t.memberCount)}</RowText>} onPress={() => go(`/esports/equipo/${t.id}`)} />
                </View>
              ))}
            </Card>
          </View>
        )}
        {hub.loading && nothing && <Loading label="Cargando los equipos" />}
        {!hub.loading && nothing && (
          <Empty
            icon={<Users size={28} color={c.accent} />}
            title={query.trim() ? 'Ningún equipo se llama así' : `Todavía no hay equipos de ${meta.name}`}
            text={query.trim() ? 'Prueba con otro nombre o con el tag.' : 'Crea el tuyo e invita a los demás con un link.'}
          />
        )}
      </View>
    );
  }

  return (
    <View style={{ gap: 20 }}>
      <BackBar label="Esports" fallback="/esports" />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <GameMark game={game} size="lg" />
        <ScreenTitle title={meta.name} hint={gameLine(meta, modeLabel(meta.defaultMode))} />
      </View>

      <StatDuo
        left={{ value: openTournamentCount(hub.data.tournaments, now), label: 'Torneos abiertos', onPress: teamsOn ? () => setPicked('torneos') : undefined }}
        right={teamsOn ? { value: teamCount, label: 'Equipos', onPress: () => setPicked('equipos') } : { value: liveCount, label: 'En curso' }}
      />

      {actions.primary === 'team' && (
        <Button variant="primary" size="xl" full icon={<Users size={20} color={c.accentFg} />} onPress={() => router.setParams({ crear: 'equipo' })}>
          Crear equipo
        </Button>
      )}

      {teamsOn && (
        <Segmented<HubView>
          label="Qué ver"
          value={view}
          onChange={setPicked}
          options={[
            { key: 'torneos', label: 'Torneos' },
            { key: 'equipos', label: 'Equipos' },
          ]}
        />
      )}

      {body}

      {/* Sin torneos, el cartel ya trae «Crear torneo»: no se repite abajo. */}
      {actions.organizeLink && !(view === 'torneos' && !hub.loading && !sections.length) && (
        <Pressable accessibilityRole="button" onPress={newTournament} style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 }}>
          <Txt variant="meta" tone="muted" style={{ fontFamily: font.semibold }}>
            {'¿Organizas? '}
            <Txt variant="meta" tone="accent" style={{ fontFamily: font.semibold }}>
              Crear torneo
            </Txt>
          </Txt>
        </Pressable>
      )}

      <CreateTeamSheet
        open={crear === 'equipo' && teamsOn}
        onClose={closeCreate}
        game={game}
        signedIn={!!uid}
        hasId={hasGameId(ids.data, game)}
        idsLoading={!!uid && ids.loading && !ids.data.length}
        back={back}
      />
      <CreateLeagueSheet open={crear === 'liga'} onClose={closeCreate} game={game} signedIn={!!uid} />
    </View>
  );
}

function TournamentRow({ t, now }: { t: HubTournament; now: number }) {
  const c = useColors();
  const priv = t.visibility === 'private';
  return (
    <RichRow
      icon={<DateBlock date={t.startsAt} />}
      title={t.name}
      accessibilityLabel={priv ? `${t.name} (privado)` : undefined}
      // La fase va en la línea de abajo: a la derecha no cabe en el teléfono («Inscripción abierta»).
      subtitle={
        <>
          <PhaseChip phase={hubPhase(t, now)} />
          <RowText>{tournamentSubtitle(t)}</RowText>
        </>
      }
      right={priv ? <Lock size={14} color={c.muted} accessibilityLabel="Privado" /> : undefined}
      onPress={() => router.push({ pathname: '/l/[lid]', params: { lid: t.leagueId } })}
    />
  );
}

/**
 * Crear un equipo de esports (CreateTeamSheet de la web): nombre, tag (mayúsculas, 2–5; sale solo del nombre hasta que
 * escribes el tuyo) y descripción (opcional). Sin su ID de ese juego, «Primero pon tu ID de {juego}» con «Poner mi ID»
 * (vuelve aquí), y el logo (opcional; se sube después de crear). Al crear: a la página del equipo con la hoja de
 * invitar abierta, o de vuelta a `back`.
 */
function CreateTeamSheet({
  open,
  onClose,
  game,
  signedIn,
  hasId,
  idsLoading,
  back,
}: {
  open: boolean;
  onClose: () => void;
  game: GameId;
  signedIn: boolean;
  hasId: boolean;
  idsLoading: boolean;
  back: string | null;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Crear equipo" subtitle={GAMES[game].name}>
      {open && <CreateTeamBody game={game} signedIn={signedIn} hasId={hasId} idsLoading={idsLoading} back={back} onClose={onClose} />}
    </Sheet>
  );
}

function CreateTeamBody({ game, signedIn, hasId, idsLoading, back, onClose }: { game: GameId; signedIn: boolean; hasId: boolean; idsLoading: boolean; back: string | null; onClose: () => void }) {
  const c = useColors();
  const meta = GAMES[game];
  const [form, setForm] = useState<TeamForm>({ name: '', tag: '', description: '' });
  const [tagEdited, setTagEdited] = useState(false);
  const [logo, setLogo] = useState<PickedLogo | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!signedIn) {
    return <SignInCard icon={<Users size={28} color={c.accent} />} title="Entra para crear tu equipo" text={`Arma tu equipo de ${meta.name} e invita a los tuyos con un link.`} />;
  }
  if (idsLoading) return <Loading />;
  if (!hasId) {
    return (
      <View style={{ alignItems: 'center', gap: 8, paddingVertical: 8 }}>
        <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <IdCard size={28} color={c.accent} />
        </View>
        <Txt variant="cardTitle" style={{ textAlign: 'center', marginTop: 8 }}>{`Primero pon tu ID de ${meta.name}`}</Txt>
        <Txt tone="muted" style={{ textAlign: 'center' }}>{`En el equipo se ve tu ${idWord(meta.idInfo.label)}: así los demás saben con quién juegan.`}</Txt>
        <View style={{ alignSelf: 'stretch', marginTop: 16 }}>
          <Button
            variant="primary"
            size="xl"
            full
            onPress={() => {
              onClose();
              router.push(myIdLink(game, createTeamLink(game, back)) as Href);
            }}
          >
            Poner mi ID
          </Button>
        </View>
      </View>
    );
  }

  const errors = teamFormErrors(form);
  const ok = Object.keys(errors).length === 0;
  const show = (k: keyof TeamForm) => (tried ? errors[k] : undefined);

  async function create() {
    setTried(true);
    if (!ok || busy) return;
    setBusy(true);
    try {
      const r = await createTeam({ game, name: form.name.trim(), tag: form.tag, description: form.description.trim() });
      if (logo) {
        try {
          await uploadTeamLogo(r.teamId, logo.logo);
        } catch (e) {
          console.warn('[logo del equipo]', e);
          toast('El equipo quedó creado, pero el logo no se pudo subir. Pruébalo en «Editar equipo».', 'error');
        }
      }
      toast(`Listo: ${form.name.trim()} quedó creado`);
      onClose();
      // Con `?volver=` (inscribir el equipo en un torneo): vuelve ahí; si no, al equipo con «Invitar» abierto.
      if (back) {
        if (router.canGoBack()) router.back();
        else router.replace(back as Href);
      } else {
        router.replace({ pathname: '/esports/equipo/[teamId]', params: { teamId: r.teamId, invitar: '1' } } as never);
      }
    } catch (e) {
      console.error(e);
      toast(esportsErrorText(e, game, 'equipo'), 'error');
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 16 }}>
      <Field label="Nombre del equipo" hint={show('name')} error={!!show('name')}>
        <Input
          maxLength={40}
          autoComplete="off"
          value={form.name}
          placeholder="Los Tigres"
          invalid={!!show('name')}
          onChangeText={(name) => setForm((f) => ({ ...f, name, tag: tagEdited ? f.tag : suggestTag(name) }))}
        />
      </Field>
      <Field label="Tag" hint={show('tag') ?? 'De 2 a 5 letras o números: sale como [TGR] al lado del nombre.'} error={!!show('tag')}>
        <Input
          maxLength={5}
          autoComplete="off"
          autoCapitalize="characters"
          value={form.tag}
          placeholder="TGR"
          invalid={!!show('tag')}
          style={{ fontFamily: font.semibold, letterSpacing: 1.2 }}
          onChangeText={(v) => {
            setTagEdited(true);
            setForm((f) => ({ ...f, tag: cleanTag(v) }));
          }}
        />
      </Field>
      <Field label="Descripción (opcional)" hint={show('description')} error={!!show('description')}>
        <Input
          multiline
          maxLength={200}
          value={form.description}
          placeholder="Jugamos los fines de semana, buscamos un suplente…"
          onChangeText={(description) => setForm((f) => ({ ...f, description }))}
          style={{ height: 80, paddingTop: 14, textAlignVertical: 'top' }}
        />
      </Field>
      <TeamLogoField value={logo} onChange={setLogo} name={form.name || 'Equipo'} tag={form.tag} />
      <Button variant="primary" size="xl" full loading={busy} icon={<Users size={20} color={c.accentFg} />} onPress={create}>
        Crear equipo
      </Button>
    </View>
  );
}
