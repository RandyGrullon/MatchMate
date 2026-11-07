/**
 * Mi ID de juego (`/esports/mi-id`, GameIdsPage + ids/GameIdSheet + RankPicker + PlatformChips de la web, con su misma
 * lógica: src/pages/esports/logic.ts): tu ID en cada juego (el monograma, el ID, el rango y su chip) y «Agregar un ID».
 * Tocar un ID abre su hoja: lo que hay, escribir el ID en un solo paso (plataforma, «¿Dónde juegas?», región, el campo
 * con su error en vivo y el rango), «¿Eres tú?» (la búsqueda de Riot), «Ese ID está conectado a otra cuenta» y el rango.
 * `?juego=<g>` abre la hoja de ese juego; `&plataforma=` es la del torneo de donde viene; `?volver=` vuelve ahí al
 * guardar. «Conectar con Epic/Steam/Riot» (entrar con la cuenta del juego) abre la web.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Check, ChevronDown, IdCard, Link2, MonitorSmartphone, Pencil, Plus, Repeat, Save, Search, ShieldAlert, ShieldCheck, Trash2, Trophy } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import {
  confirmGameId,
  deleteGameId,
  gameIdErrorText,
  lookupGameId,
  saveGameId,
  setGamePlatforms,
  setRanks,
  useMyGameIds,
  useProviders,
  type GameIdRecord,
  type ProvidersStatus,
} from '@mm/lib/data/esportsIds';
import { GAMES, LADDERS, idPlatforms, idRegions, normalizeGameId, rankLabel, validateRank, validateRankMap, type GameId, type Ladder, type RankMap, type RankSource, type RankValue } from '@mm/sports/esports';
import { PLATFORM_LABEL, gamePlatforms, idPlatforms as platformsOfId, platformProblem, platformsText, type Platform } from '@mm/sports/esports/platforms';
import {
  PROVIDER_NAME,
  RANK_KEY_LABEL,
  STEAM_SWITCH_NOTE,
  afterLookup,
  asksPlatforms,
  canLookup,
  connectLabel,
  defaultRankKey,
  divsOf,
  gameParam,
  idActions,
  idFor,
  idKeyFor,
  idSubtitle,
  idWord,
  initialIdSheetState,
  isNumberRank,
  isTakenError,
  isTextRank,
  isTierRank,
  linkBackPath,
  linkProviderFor,
  listRank,
  mmrProposal,
  numberRank,
  numericId,
  pickTier,
  platformChips,
  rankKeysFor,
  ranksToSend,
  safeBack,
  samePlatforms,
  setRank,
  sortIds,
  takenText,
  togglePlatform,
  wantedPlatform,
  type IdSheetState,
  type RankKey,
} from '@mm/pages/esports/logic';
import { useIsPro } from '@mm/lib/useMode';
import { openOnWeb } from '@/lib/web';
import { confirmAsync, toast } from '../feedback';
import { BackBar, Button, Card, ChoiceRow, Field, Input, LoadError, Loading, Segmented, SectionHeader, Sheet, Txt } from '../ui';
import { GameMark, IdChip, RankChip, ScreenNotice } from './bits';
import { GamePickerSheet, ScreenTitle, SignInCard, useIdMoveNotice } from './EsportsIndex';
import { MenuRow, RichRow, RowText } from './inputs';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

export function GameIdsScreen() {
  const c = useColors();
  const auth = useAuth();
  const params = useLocalSearchParams<{ volver?: string }>();
  const back = safeBack(params.volver);
  if (auth.loading) return <Loading />;
  if (!auth.user) {
    return (
      <View style={{ gap: 20 }}>
        <BackBar label="Esports" fallback="/esports" />
        <ScreenTitle title="Mi ID de juego" />
        <SignInCard icon={<IdCard size={28} color={c.accent} />} title="Entra para poner tu ID de juego" text="Con tu ID de juego te suman a equipos y te inscribes en torneos." />
      </View>
    );
  }
  return <GameIds uid={auth.user.uid} back={back} />;
}

function GameIds({ uid, back }: { uid: string; back: string | null }) {
  const c = useColors();
  const pro = useIsPro();
  const params = useLocalSearchParams<{ juego?: string; plataforma?: string }>();
  const ids = useMyGameIds(uid);
  const providers = useProviders();
  const moved = useIdMoveNotice(uid);
  const [picking, setPicking] = useState(false);
  const list = useMemo(() => sortIds(ids.data), [ids.data]);
  const game = gameParam(params.juego ?? null);
  const platform = params.plataforma ?? null;
  const record = game ? idFor(ids.data, game, idKeyFor(game, platform) || null) : null;
  const wanted = game ? wantedPlatform(game, platform) : null;
  const marked = useMemo(() => new Set(ids.data.map((r) => r.game)), [ids.data]);

  const openGame = (g: GameId, plat?: string) => router.setParams({ juego: g, plataforma: plat || undefined });
  const closeGame = () => router.setParams({ juego: undefined, plataforma: undefined });

  let content: ReactNode;
  if (ids.loading && !ids.data.length) content = <Loading label="Cargando tus IDs" />;
  else if (ids.error && !ids.data.length) content = <LoadError error={ids.error} />;
  else if (!list.length) {
    content = (
      <Card style={{ alignItems: 'center', gap: 8, paddingTop: 28 }}>
        <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <IdCard size={28} color={c.accent} />
        </View>
        <Txt variant="cardTitle" style={{ textAlign: 'center', marginTop: 8 }}>
          Todavía no tienes IDs de juego
        </Txt>
        <Txt tone="muted" style={{ textAlign: 'center' }}>
          Pon tu ID del juego que juegas: así te suman a equipos y te inscribes en torneos.
        </Txt>
      </Card>
    );
  } else {
    content = (
      <View style={{ gap: 10 }}>
        <SectionHeader title="Tus IDs" />
        <Card padded={false}>
          {list.map((r, i) => {
            const rank = listRank(r);
            return (
              <View key={`${r.game}:${r.platform}`} style={i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null}>
                <RichRow
                  icon={<GameMark game={r.game} size="md" />}
                  title={r.idDisplay}
                  accessibilityLabel={`${GAMES[r.game].name}: ${r.idDisplay}`}
                  subtitle={
                    <>
                      <RowText>{idSubtitle(r)}</RowText>
                      <IdChip ownership={r.ownership} />
                      {rank && <RankChip game={r.game} rank={rank} source={r.rankSource} />}
                    </>
                  }
                  onPress={() => openGame(r.game, r.platform)}
                />
              </View>
            );
          })}
        </Card>
      </View>
    );
  }

  return (
    <View style={{ gap: 20 }}>
      <BackBar label={back ? 'Volver' : 'Esports'} fallback={back ?? '/esports'} />
      <ScreenTitle title="Mi ID de juego" hint="Tu ID en cada juego, para equipos y torneos" pro={pro} />
      <ScreenNotice notices={[moved]} />
      {content}
      <Button variant="primary" size={pro ? 'lg' : 'xl'} full icon={<Plus size={20} color={c.accentFg} strokeWidth={2.4} />} onPress={() => setPicking(true)}>
        Agregar un ID
      </Button>
      <Txt tone="muted" style={{ fontSize: 13, marginHorizontal: 4, marginTop: -8 }}>
        Algunos juegos lo comprueban (entrando con Epic o Steam, o buscándolo en Riot). En los demás queda como lo escribiste.
      </Txt>

      <GamePickerSheet
        open={picking}
        onClose={() => setPicking(false)}
        marked={marked}
        onPick={(g) => {
          setPicking(false);
          openGame(g);
        }}
      />

      {/* Con los IDs ya leídos: así la hoja abre en lo que tienes y no en un campo vacío. */}
      {game && (!ids.loading || ids.data.length > 0) && (
        <GameIdSheet
          key={`${game}:${platform ?? ''}`}
          onClose={closeGame}
          game={game}
          record={record}
          providers={providers.data}
          wanted={wanted}
          linkBack={linkBackPath(game, back, platform)}
          onDone={() => {
            if (!back) return closeGame();
            if (router.canGoBack()) router.back();
            else router.replace(back as Href);
          }}
        />
      )}
    </View>
  );
}

/** Un campo para elegir de una lista (el `<select>` de la web): se abre la lista debajo y se cierra al elegir. */
function SelectField({ label, value, placeholder, options, onChange, hint, error }: { label: string; value: string; placeholder?: string; options: readonly { id: string; label: string }[]; onChange: (id: string) => void; hint?: string | null; error?: boolean }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === value)?.label ?? placeholder ?? '';
  return (
    <Field label={label} hint={hint} error={error}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label}: ${current}`}
        onPress={() => setOpen((v) => !v)}
        style={{ flexDirection: 'row', alignItems: 'center', height: 48, borderRadius: 14, paddingHorizontal: 14, backgroundColor: c.surface2, borderWidth: error ? 1.5 : 0, borderColor: c.danger }}
      >
        <Txt numberOfLines={1} tone={options.some((o) => o.id === value) ? 'fg' : 'muted'} style={{ flex: 1 }}>
          {current}
        </Txt>
        <ChevronDown size={18} color={c.muted} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
      </Pressable>
      {open && (
        <View style={{ gap: 6 }}>
          {options.map((o) => (
            <ChoiceRow
              key={o.id || 'ninguno'}
              title={o.label}
              selected={o.id === value}
              onPress={() => {
                onChange(o.id);
                setOpen(false);
              }}
            />
          ))}
        </View>
      )}
    </Field>
  );
}

/** «¿Dónde juegas?»: las plataformas del juego en fichas que se marcan varias; la del torneo dice «torneo». */
function PlatformChips({ game, value, onChange, wanted, disabled }: { game: GameId; value: readonly string[]; onChange: (next: Platform[]) => void; wanted?: Platform | null; disabled?: boolean }) {
  const c = useColors();
  return (
    <View accessibilityLabel="Dónde juegas" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {platformChips(game).map((p) => {
        const on = value.includes(p.key);
        return (
          <Pressable
            key={p.key}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on, disabled }}
            accessibilityLabel={wanted === p.key ? `${PLATFORM_LABEL[p.key]} (la del torneo)` : undefined}
            disabled={disabled}
            onPress={() => onChange(togglePlatform(game, value, p.key))}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, minWidth: 56, borderRadius: 22, paddingHorizontal: 16, backgroundColor: on ? c.accentSoft : c.surface2, borderWidth: on ? 1.5 : 0, borderColor: c.accent, opacity: disabled ? 0.6 : 1 }}
          >
            {on && <Check size={16} color={c.accent} strokeWidth={3} />}
            <Txt style={{ fontSize: 15, fontFamily: font.semibold, color: on ? c.accent : c.fg2 }}>{p.label}</Txt>
            {wanted === p.key && (
              <Txt tone="muted" style={{ fontSize: 12 }}>
                torneo
              </Txt>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/** El rango declarado de un juego (RankPicker de la web): la escalera, un número o un texto; Rocket League por modo y con el MMR. */
function RankPicker({ game, value, onChange }: { game: GameId; value: RankMap; onChange: (v: RankMap) => void }) {
  const keys = rankKeysFor(game);
  const [key, setKey] = useState<RankKey>(defaultRankKey(game));
  const ladder = LADDERS[game];
  const current = value[key] ?? null;
  const set = (v: RankValue | null) => onChange(setRank(value, key, v));
  const error = current ? validateRank(game, key, current) : null;
  return (
    <View style={{ gap: 12 }}>
      {keys.length > 1 && <Segmented<RankKey> label="Modo del rango" value={key} onChange={setKey} options={keys.map((k) => ({ key: k, label: RANK_KEY_LABEL[k] }))} />}
      {ladder.kind === 'tiers' ? (
        <TierInput key={key} game={game} ladder={ladder} rankKey={key} value={current} onChange={set} />
      ) : ladder.kind === 'number' ? (
        <NumberInput key={key} ladder={ladder} value={current} onChange={set} />
      ) : (
        <Field label="Tu rango (opcional)" hint="Como sale en el juego.">
          <Input maxLength={24} value={isTextRank(current) ? current.text : ''} placeholder="Por ejemplo: Tekken King" onChangeText={(v) => set(v.trim() ? { text: v.slice(0, 24) } : null)} />
        </Field>
      )}
      {!!error && (
        <Txt accessibilityRole="alert" tone="danger" style={{ fontSize: 12 }}>
          {error}
        </Txt>
      )}
    </View>
  );
}

function TierInput({ game, ladder, rankKey, value, onChange }: { game: GameId; ladder: Extract<Ladder, { kind: 'tiers' }>; rankKey: RankKey; value: RankValue | null; onChange: (v: RankValue | null) => void }) {
  const tier = isTierRank(value) ? value : null;
  const divs = tier ? divsOf(ladder, tier.tier) : [];
  const perMode = ladder.perMode && rankKey !== 'main';
  const [mmr, setMmr] = useState(tier?.mmr != null ? String(tier.mmr) : '');
  const proposal = perMode ? mmrProposal(rankKey as '1v1' | '2v2' | '3v3', mmr) : null;
  return (
    <View style={{ gap: 12 }}>
      <SelectField
        label="Tu rango (opcional)"
        value={tier?.tier ?? ''}
        options={[{ id: '', label: 'Sin rango' }, ...ladder.tiers.map((t) => ({ id: t.id, label: t.label }))]}
        onChange={(id) => {
          setMmr('');
          onChange(pickTier(ladder, id));
        }}
      />
      {tier && divs.length > 0 && (
        <SelectField
          label={ladder.divWord || 'División'}
          value={String(tier.div ?? divs[0])}
          options={divs.map((d) => ({ id: String(d), label: rankLabel(game, { tier: tier.tier, div: d }) }))}
          onChange={(id) => onChange({ tier: tier.tier, div: Number(id) })}
        />
      )}
      {perMode && (
        <Field
          label="Tu MMR (opcional)"
          hint={
            proposal
              ? `Con ${Number(mmr).toLocaleString('es-DO')} de MMR: ${rankLabel(game, proposal)} (aprox., temporada actual).`
              : mmr.trim()
                ? 'Escribe un número de −100 a 3000.'
                : 'Si lo sabes, te proponemos el rango (aprox., temporada actual).'
          }
        >
          <Input
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            value={mmr}
            placeholder="1250"
            onChangeText={(v) => {
              const raw = v.replace(/[^\d-]/g, '');
              setMmr(raw);
              const p = mmrProposal(rankKey as '1v1' | '2v2' | '3v3', raw);
              if (p) onChange(p);
            }}
          />
        </Field>
      )}
      {perMode && (
        <Txt tone="muted" style={{ fontSize: 12 }}>
          Pon el de cada modo que juegas: los torneos piden el de su modo.
        </Txt>
      )}
    </View>
  );
}

function NumberInput({ ladder, value, onChange }: { ladder: Extract<Ladder, { kind: 'number' }>; value: RankValue | null; onChange: (v: RankValue | null) => void }) {
  const [raw, setRaw] = useState(isNumberRank(value) ? String(value.value) : '');
  return (
    <Field label={`Tu ${ladder.label} (opcional)`} hint={`De ${ladder.min.toLocaleString('es-DO')} a ${ladder.max.toLocaleString('es-DO')}.`}>
      <Input
        keyboardType="number-pad"
        maxLength={8}
        value={raw}
        placeholder="0"
        onChangeText={(v) => {
          const s = v.replace(/[^\d]/g, '');
          setRaw(s);
          onChange(numberRank(s));
        }}
      />
    </Field>
  );
}

/**
 * La hoja del ID de un juego (§12.6): lo que hay, escribir el ID (un solo paso), «¿Eres tú?», el ID conectado a otra
 * cuenta y el rango. «Conectar con…» abre la web (allí se entra con la cuenta del juego).
 */
function GameIdSheet({
  game,
  record,
  providers,
  onClose,
  onDone,
  wanted,
  linkBack,
}: {
  game: GameId;
  record: GameIdRecord | null;
  providers: ProvidersStatus;
  onClose: () => void;
  onDone: () => void;
  wanted: Platform | null;
  linkBack: string;
}) {
  const c = useColors();
  const pro = useIsPro();
  const size = pro ? 'lg' : 'xl';
  const meta = GAMES[game];
  const [busy, setBusy] = useState<null | 'save' | 'found' | 'lookup' | 'rank' | 'delete' | 'platforms'>(null);
  const [s, setS] = useState<IdSheetState>(() => initialIdSheetState(game, record, wanted));
  const [tried, setTried] = useState(false);
  const patch = (p: Partial<IdSheetState>) => setS((prev) => ({ ...prev, ...p }));

  const platforms = idPlatforms(game);
  const regions = idRegions(game);
  const lookupOn = canLookup(game, providers);
  const provider = linkProviderFor(game, providers);
  const norm = normalizeGameId(game, s.raw, s.platform || undefined);
  const normError = 'error' in norm ? norm.error : null;
  const platformLabel = (id: string) => platforms.find((p) => p.id === id)?.label ?? id;
  const rankError = validateRankMap(game, s.ranks);
  const label = idWord(meta.idInfo.label);
  const asks = asksPlatforms(game);
  const wantedText = wanted && asks ? `Este torneo es de ${PLATFORM_LABEL[wanted]}.` : null;

  async function run(key: NonNullable<typeof busy>, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }
  const saved = () => {
    toast('Listo: guardaste tu ID');
    onDone();
  };

  /** Guarda el ID (declarado) y el rango si cambió; con búsqueda, además lo busca. */
  async function submit() {
    const n = normalizeGameId(game, s.raw, s.platform || undefined);
    if ('error' in n || rankError) {
      setTried(true);
      return;
    }
    await run('save', async () => {
      try {
        const res = await saveGameId(game, s.raw, s.platform || undefined, s.region || undefined, asks ? s.platforms : null);
        const display = res.idDisplay || n.display;
        // Si cambia el ID, el rango de antes ya no cuenta: se manda lo elegido.
        const before = record && record.idDisplay === display ? record.ranks : null;
        const ranks = ranksToSend(s.ranks, before);
        if (ranks) await setRanks(game, ranks, s.platform || undefined);
        if (!lookupOn) return saved();
        const r = await lookupGameId(game, s.raw, s.platform || undefined, s.region || undefined);
        const next = afterLookup(r, label);
        if (next.next === 'saved') return saved();
        patch({ display, step: next.next, message: next.message, found: r.status === 'found' ? r : null });
      } catch (e) {
        if (isTakenError(e)) return patch({ step: 'taken', display: n.display, message: null });
        console.error(e);
        toast(gameIdErrorText(e, game), 'error');
      }
    });
  }

  /** «Comprobar con Riot» desde lo que hay: busca el ID guardado. */
  async function check() {
    if (!record) return;
    await run('lookup', async () => {
      try {
        const r = await lookupGameId(game, record.idDisplay, record.platform || undefined, record.region || undefined);
        const next = afterLookup(r, label);
        if (next.next === 'saved') {
          toast(r.status === 'rate_limited' ? 'Hiciste muchas búsquedas seguidas. Prueba en un rato.' : 'No se pudo buscar ahora. Prueba más tarde.', 'error');
          return;
        }
        patch({ display: record.idDisplay, raw: record.idDisplay, step: next.next, message: next.message, found: r.status === 'found' ? r : null });
      } catch (e) {
        console.error(e);
        toast(gameIdErrorText(e, game), 'error');
      }
    });
  }

  async function confirmFound(lookupId: string) {
    await run('found', async () => {
      try {
        await confirmGameId(game, lookupId, s.platform || undefined);
        toast('Listo: tu ID quedó comprobado');
        onDone();
      } catch (e) {
        if (isTakenError(e)) return patch({ step: 'taken', message: null });
        console.error(e);
        toast(gameIdErrorText(e, game), 'error');
      }
    });
  }

  async function saveRanks() {
    await run('rank', async () => {
      try {
        await setRanks(game, s.ranks, s.platform || undefined);
        toast('Rango guardado');
        patch({ step: 'summary' });
      } catch (e) {
        console.error(e);
        toast(gameIdErrorText(e, game), 'error');
      }
    });
  }

  async function remove() {
    const ok = await confirmAsync({
      title: `¿Quitar tu ID de ${meta.name}?`,
      message: 'Sin él no te pueden sumar a un equipo ni te inscribes en torneos de este juego. Lo puedes volver a poner.',
      confirmText: 'Quitar',
      danger: true,
    });
    if (!ok) return;
    await run('delete', async () => {
      try {
        await deleteGameId(game, s.platform || undefined);
        toast('Listo: quitaste tu ID');
        onClose();
      } catch (e) {
        console.error(e);
        toast(gameIdErrorText(e, game), 'error');
      }
    });
  }

  /** «Guardar dónde juego» desde lo que hay (también con la cuenta conectada). */
  async function savePlatforms() {
    await run('platforms', async () => {
      try {
        await setGamePlatforms(game, s.platforms, s.platform || undefined);
        toast('Listo: guardaste dónde juegas');
        onDone();
      } catch (e) {
        console.error(e);
        toast(gameIdErrorText(e, game), 'error');
      }
    });
  }

  // Entrar con la cuenta del juego abre la misma hoja en la web (con expo-web-browser): esports-auth solo deja pasar el
  // paso «go» con un formulario POST desde la página de la app (revisa la cabecera Origin y deja una cookie con el
  // `state` que la vuelta del proveedor pide), y al final vuelve a la web (APP_URL), no al teléfono. Sin cambiar la Edge
  // Function, una pestaña del teléfono (openAuthSessionAsync) no puede hacer ese POST ni recibir la vuelta.
  const connect = () => void openOnWeb(linkBack);

  const idCard = (display: string, extra?: ReactNode) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, backgroundColor: c.surface2, padding: 16 }}>
      <GameMark game={game} size="md" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt tone="muted" style={{ fontSize: 12 }}>
          {s.platform ? `${meta.idInfo.label} · ${platformLabel(s.platform)}` : meta.idInfo.label}
        </Txt>
        <Txt style={{ fontSize: 19, fontFamily: font.semibold }}>{display}</Txt>
        {extra}
      </View>
    </View>
  );
  const ranksLine = (ranks: RankMap, source: RankSource) => {
    const keys = rankKeysFor(game).filter((k) => ranks[k]);
    if (!keys.length) return null;
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 6 }}>
        {keys.map((k) => (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {k !== 'main' && (
              <Txt tone="muted" style={{ fontSize: 12, fontFamily: font.semibold }}>
                {k}
              </Txt>
            )}
            <RankChip game={game} rank={ranks[k]} source={source} />
          </View>
        ))}
      </View>
    );
  };
  const heading = (text: string) => (
    <Txt variant="meta" style={{ fontFamily: font.semibold }}>
      {text}
    </Txt>
  );

  let body: ReactNode;
  let footer: ReactNode = null;
  // Sin lo que hace falta para un paso (un ID guardado, lo que encontró la búsqueda), escribir el ID.
  const step = (s.step === 'summary' || s.step === 'rank') && !record ? 'edit' : s.step === 'found' && !s.found ? 'edit' : s.step;

  switch (step) {
    case 'summary': {
      const r = record!;
      const actions = idActions(r, providers);
      const login = r.ownership === 'login';
      const hasRank = Object.keys(r.ranks).length > 0;
      const changed = asks && !samePlatforms(s.platforms, r.platforms ?? []);
      // Lo que dice si el ID no sirve para el torneo de donde viene (con lo marcado ahora).
      const marked = platformsOfId(game, { platform: r.platform, platforms: s.platforms });
      const playsOn = gamePlatforms(game).filter((p) => marked.includes(p));
      const problem = wanted && asks ? platformProblem(game, wanted, playsOn) : null;
      body = (
        <View style={{ gap: 16 }}>
          {idCard(
            r.idDisplay,
            r.lookupName ? (
              <Txt variant="meta" tone="muted" numberOfLines={1}>
                En el juego: {r.lookupName}
              </Txt>
            ) : null,
          )}
          <View style={{ flexDirection: 'row' }}>
            <IdChip ownership={r.ownership} />
          </View>
          {login && !!meta.link && (
            <Txt variant="meta" tone="muted" style={{ marginTop: -4 }}>{`Lo conectaste con tu cuenta de ${PROVIDER_NAME[meta.link]}.`}</Txt>
          )}
          {asks && (
            <View style={{ gap: 8 }}>
              {heading('¿Dónde juegas?')}
              <PlatformChips game={game} value={s.platforms} wanted={wanted} onChange={(platforms) => patch({ platforms })} disabled={busy === 'platforms'} />
              <Txt variant="meta" tone={problem ? 'warn' : 'muted'} style={problem ? { fontFamily: font.semibold } : undefined}>
                {problem === 'otra_plataforma'
                  ? `Tu ID es de ${platformsText(playsOn)} y el torneo es de ${PLATFORM_LABEL[wanted!]}: márcala si también juegas ahí, o usa otra cuenta.`
                  : problem === 'sin_plataforma'
                    ? `${wantedText} Marca dónde juegas.`
                    : (wantedText ?? 'Los torneos que no son crossplay lo piden.')}
              </Txt>
            </View>
          )}
          <View style={{ gap: 8 }}>
            {heading('Rango')}
            {ranksLine(r.ranks, r.rankSource) ?? (
              <Txt variant="meta" tone="muted">
                Sin rango. Ponlo para que te siembren mejor en los torneos.
              </Txt>
            )}
          </View>
          <View style={{ marginHorizontal: -8 }}>
            {actions.map((a) => {
              switch (a) {
                case 'rank':
                  return <MenuRow key={a} icon={<Trophy size={20} color={c.fg2} />} label={hasRank ? 'Cambiar mi rango' : 'Poner mi rango'} onPress={() => patch({ step: 'rank', ranks: { ...r.ranks } })} />;
                case 'lookup':
                  return <MenuRow key={a} icon={<ShieldCheck size={20} color={c.fg2} />} label="Comprobar con Riot" hint="Buscamos tu Riot ID y queda comprobado" onPress={() => void check()} disabled={busy !== null} />;
                case 'link':
                  return <MenuRow key={a} icon={<Link2 size={20} color={c.fg2} />} label={connectLabel(provider!)} hint="Entra con tu cuenta y tu ID queda conectado" onPress={connect} disabled={busy !== null} />;
                case 'relink':
                  return (
                    <MenuRow
                      key={a}
                      icon={<Repeat size={20} color={c.fg2} />}
                      label="Conectar otra cuenta"
                      hint={provider === 'steam' ? STEAM_SWITCH_NOTE : `Entra con otra cuenta de ${PROVIDER_NAME[provider!]}`}
                      onPress={connect}
                      disabled={busy !== null}
                    />
                  );
                case 'change':
                  return <MenuRow key={a} icon={<Pencil size={20} color={c.fg2} />} label="Cambiar mi ID" onPress={() => patch({ step: 'edit', raw: r.idDisplay, message: null })} />;
                case 'delete':
                  return <MenuRow key={a} danger icon={<Trash2 size={20} color={c.danger} />} label="Quitar mi ID" onPress={() => void remove()} disabled={busy !== null} />;
              }
            })}
          </View>
        </View>
      );
      if (changed) {
        footer = (
          <Button variant="primary" size={size} full loading={busy === 'platforms'} onPress={savePlatforms} icon={<MonitorSmartphone size={20} color={c.accentFg} />}>
            Guardar dónde juego
          </Button>
        );
      }
      break;
    }

    case 'edit': {
      const showError = !!normError && !/plataforma/i.test(normError) && (tried || (s.raw.trim() !== '' && !/^Escribe/.test(normError)));
      body = (
        <View style={{ gap: 16 }}>
          {provider && (
            <>
              <View style={{ gap: 12, borderRadius: 16, backgroundColor: c.accentSoft, padding: 16 }}>
                <Txt variant="meta" style={{ fontFamily: font.semibold }}>{`Entra con tu cuenta de ${PROVIDER_NAME[provider]} y tu ID queda conectado.`}</Txt>
                <Button variant="secondary" full onPress={connect} icon={<Link2 size={16} color={c.fg} />}>
                  {connectLabel(provider)}
                </Button>
                {provider === 'steam' && (
                  <Txt tone="muted" style={{ fontSize: 13 }}>
                    {STEAM_SWITCH_NOTE}
                  </Txt>
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: c.line }} />
                <Txt tone="muted" style={{ fontSize: 13, fontFamily: font.medium }}>
                  o escribe tu ID
                </Txt>
                <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: c.line }} />
              </View>
            </>
          )}
          {platforms.length > 0 && (
            <SelectField
              label="Plataforma"
              value={s.platform}
              placeholder="Elige la plataforma"
              options={platforms}
              onChange={(platform) => patch({ platform })}
              hint={tried && !s.platform ? 'Elige la plataforma.' : null}
              error={tried && !s.platform}
            />
          )}
          {asks && (
            <View style={{ gap: 6 }}>
              <Txt tone="muted" style={{ fontSize: 12, fontFamily: font.medium }}>
                ¿Dónde juegas?
              </Txt>
              <PlatformChips game={game} value={s.platforms} wanted={wanted} onChange={(platforms) => patch({ platforms })} />
              <Txt tone="muted" style={{ fontSize: 12 }}>
                {wantedText ?? 'Marca todas: los torneos que no son crossplay lo piden.'}
              </Txt>
            </View>
          )}
          {regions.length > 0 && (
            <SelectField
              label="Región"
              value={s.region}
              options={[...(!meta.idInfo.defaultRegion ? [{ id: '', label: 'Sin región' }] : []), ...regions]}
              onChange={(region) => patch({ region })}
              hint="Dónde juegas: tu ID es el mismo en todas."
            />
          )}
          <Field label={`Tu ${label}`} hint={showError ? normError : meta.idInfo.hint} error={showError}>
            <Input
              value={s.raw}
              placeholder={meta.idInfo.placeholder}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              keyboardType={numericId(game) ? 'number-pad' : 'default'}
              maxLength={60}
              invalid={showError}
              onChangeText={(raw) => patch({ raw, message: null })}
            />
          </Field>
          {!!s.message && (
            <View style={{ gap: 8, borderRadius: 16, backgroundColor: c.warnSoft, paddingHorizontal: 16, paddingVertical: 12 }}>
              <Txt accessibilityRole="text" tone="warn" variant="meta">
                {s.message}
              </Txt>
              <Pressable accessibilityRole="button" onPress={saved} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
                <Txt tone="accent" variant="meta" style={{ fontFamily: font.semibold }}>
                  Guardarlo así
                </Txt>
              </Pressable>
            </View>
          )}
          <View style={{ gap: 8 }}>
            {heading('Tu rango (opcional)')}
            <RankPicker game={game} value={s.ranks} onChange={(ranks) => patch({ ranks })} />
          </View>
        </View>
      );
      footer = (
        <Button
          variant="primary"
          size={size}
          full
          disabled={!!rankError}
          loading={busy === 'save'}
          onPress={submit}
          icon={lookupOn ? <Search size={20} color={c.accentFg} /> : <Save size={20} color={c.accentFg} />}
        >
          {lookupOn ? 'Buscar' : 'Guardar'}
        </Button>
      );
      break;
    }

    case 'found': {
      const f = s.found!;
      body = (
        <View style={{ gap: 16 }}>
          <Txt variant="meta" tone="muted">
            Buscamos {s.display || s.raw} en {meta.name} y encontramos esta cuenta:
          </Txt>
          <View style={{ alignItems: 'center', gap: 10, borderRadius: 24, backgroundColor: c.surface2, paddingHorizontal: 16, paddingVertical: 24 }}>
            <GameMark game={game} size="lg" />
            <Txt style={{ fontSize: 22, fontFamily: font.semibold, textAlign: 'center' }}>{f.displayName}</Txt>
            {ranksLine(f.ranks, 'verificado')}
          </View>
          <Txt variant="cardTitle" style={{ textAlign: 'center' }}>
            ¿Eres tú?
          </Txt>
        </View>
      );
      footer = (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button size={size} disabled={busy !== null} onPress={() => patch({ step: 'edit', found: null, message: null })}>
            No soy yo
          </Button>
          <Button variant="primary" size={size} style={{ flex: 1 }} loading={busy === 'found'} onPress={() => confirmFound(f.lookupId)}>
            Sí, soy yo
          </Button>
        </View>
      );
      break;
    }

    case 'taken': {
      const display = s.display || s.raw.trim();
      body = (
        <View style={{ alignItems: 'center', gap: 8, paddingTop: 8 }}>
          <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: c.warnSoft, alignItems: 'center', justifyContent: 'center' }}>
            <ShieldAlert size={28} color={c.warn} />
          </View>
          <Txt variant="cardTitle" style={{ textAlign: 'center', marginTop: 8 }}>
            Ese ID está conectado a otra cuenta
          </Txt>
          {!!display && (
            <Txt variant="meta" style={{ fontFamily: font.semibold }}>
              {display}
            </Txt>
          )}
          <Txt tone="muted" style={{ textAlign: 'center' }}>
            {takenText(game)}
          </Txt>
        </View>
      );
      const other = (
        <Button variant={provider ? 'ghost' : 'primary'} size={provider ? 'md' : size} full disabled={busy !== null} onPress={() => patch({ step: 'edit', message: null })}>
          Prueba con otro ID
        </Button>
      );
      footer = provider ? (
        <View style={{ gap: 8 }}>
          <Button variant="primary" size={size} full onPress={connect} icon={<Link2 size={20} color={c.accentFg} />}>
            {connectLabel(provider)}
          </Button>
          {other}
        </View>
      ) : (
        other
      );
      break;
    }

    case 'rank': {
      body = (
        <View style={{ gap: 16 }}>
          <Txt variant="meta" tone="muted">
            El rango que pongas sale como «Declarado».
          </Txt>
          <RankPicker game={game} value={s.ranks} onChange={(ranks) => patch({ ranks })} />
        </View>
      );
      footer = (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button size={size} disabled={busy !== null} onPress={() => patch({ step: 'summary' })}>
            Volver
          </Button>
          <Button variant="primary" size={size} style={{ flex: 1 }} disabled={!!rankError} loading={busy === 'rank'} onPress={saveRanks} icon={<Trophy size={20} color={c.accentFg} />}>
            Guardar rango
          </Button>
        </View>
      );
      break;
    }
  }

  return (
    <Sheet open onClose={onClose} title={meta.name} subtitle={meta.idInfo.label} footer={footer}>
      {body}
    </Sheet>
  );
}
