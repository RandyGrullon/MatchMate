/**
 * Piezas de la Tabla de los deportes de equipo en la app (LeadersTable.tsx, HowItCounts de TeamUi.tsx, PillSelect,
 * SeasonView.tsx y SeasonSelect.tsx de la web, en Lite): la lista de líderes con «Tú», la regla en una línea con «Cómo
 * se cuenta», la píldora para elegir qué números ver, la tarjeta amarilla o roja, y la temporada (elegirla, sus premios
 * y la tabla que se guardó al cerrarla). La lógica es la de la web (src/pages/sports/team/leaders.ts,
 * src/components/season/standingsSeason.ts y logic.ts).
 */
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Award, ChevronDown, History, ListOrdered, Trophy } from 'lucide-react-native';
import { useLeagueSeasons } from '@mm/lib/data/seasons';
import { formatDate } from '@mm/lib/format';
import { useLeagueCtx } from '@mm/lib/league';
import { pickSeason, type Season } from '@mm/lib/seasons';
import { parseSnapshot, seasonDates } from '@mm/components/season/logic';
import { sortedAwards } from '@mm/components/season/awardOrder';
import { hasSavedTable } from '@mm/components/season/standingsSeason';
import { rankLeaders, type LeaderColumn } from '@mm/pages/sports/team/leaders';
import { Initials } from '@/components/esports/bits';
import { SnapshotTables } from '@/components/seasonAdmin/SnapshotTables';
import { TuTag } from '@/components/swimming/parts';
import { Card, ChoiceRow, Divider, Empty, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font, radius } from '@/theme/tokens';

/** Lo que se muestra de un número de la lista (el `show` de la columna o el número). */
const shown = (v: ReactNode) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');

/**
 * Los líderes de la temporada en Lite (LeadersTable con `full={false}`): el puesto, las iniciales, el nombre con «Tú»,
 * su equipo y lo suyo en una línea, y el número de la primera columna al final. Tocar una fila abre al jugador.
 */
export function LeadersList<R extends { player: string; team: string }>({
  rows,
  columns,
  nameOf,
  teamOf,
  onOpen,
  highlight,
  empty = 'Todavía no hay partidos con la lista de presentes.',
  limit,
  line,
}: {
  rows: readonly R[];
  columns: LeaderColumn<R>[];
  nameOf: (playerId: string) => string;
  teamOf?: (teamKey: string) => string;
  onOpen?: (playerId: string) => void;
  highlight?: string | null;
  empty?: string;
  limit?: number;
  line?: (row: R) => string | null;
}) {
  const c = useColors();
  const col = columns[0];
  if (!rows.length) return <Empty title="Sin estadísticas todavía" text={empty} />;
  const sorted = rankLeaders(rows, columns, col, nameOf, limit);
  return (
    <Card padded={false}>
      {sorted.map(({ r, rank }, i) => {
        const me = highlight === r.player;
        const sub = [teamOf?.(r.team) || null, line?.(r) ?? null].filter(Boolean).join(' · ');
        return (
          <View key={r.player}>
            {i > 0 && <Divider inset={me ? 0 : 16} />}
            <Pressable
              accessibilityRole={onOpen ? 'button' : undefined}
              accessibilityLabel={`${rank}.º ${nameOf(r.player)}: ${col.value(r)} ${col.title.toLowerCase()}`}
              disabled={!onOpen}
              onPress={() => onOpen?.(r.player)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                minHeight: 64,
                paddingHorizontal: 16,
                paddingVertical: 10,
                backgroundColor: pressed ? c.surface2 : me ? c.accentSoft : 'transparent',
              })}
            >
              <Txt style={{ width: 18, textAlign: 'center', fontSize: 15, fontFamily: font.semibold, color: c.muted }}>{rank}</Txt>
              <Initials name={nameOf(r.player)} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Txt variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {nameOf(r.player)}
                  </Txt>
                  {me && <TuTag />}
                </View>
                {!!sub && (
                  <Txt variant="meta" tone="muted" numberOfLines={1}>
                    {sub}
                  </Txt>
                )}
              </View>
              <Txt style={{ fontSize: 19, fontFamily: font.bold }}>{shown(col.show ? col.show(r) : col.value(r))}</Txt>
            </Pressable>
          </View>
        );
      })}
    </Card>
  );
}

/**
 * Debajo de la tabla: la regla en una línea («Ganar 2 · perder 1 · desempate FIBA») y «Cómo se cuenta», que abre una
 * hoja con todo (HowItCounts de la web).
 */
export function HowItCounts({ line, paragraphs, title = 'Cómo se cuenta' }: { line: string; paragraphs: readonly string[]; title?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 12, marginHorizontal: 4 }}>
      <Txt variant="meta" tone="muted" style={{ flexShrink: 1 }}>
        {line}
      </Txt>
      <Txt variant="meta" tone="accent" accessibilityRole="button" style={{ fontFamily: font.semibold }} onPress={() => setOpen(true)}>
        {title}
      </Txt>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        {paragraphs.map((p) => (
          <Txt key={p} tone="fg2">
            {p}
          </Txt>
        ))}
      </Sheet>
    </View>
  );
}

/** La píldora «Goleadores ▾» para elegir qué números ver (PillSelect de la web): tocarla abre las opciones. */
export function PillPick<K extends string>({ options, value, onChange, label }: { options: readonly { key: K; label: string }[]; value: K; onChange: (k: K) => void; label: string }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.key === value) ?? options[0];
  if (!current) return null;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current.label}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          height: 36,
          paddingLeft: 13,
          paddingRight: 12,
          borderRadius: radius.pill,
          backgroundColor: c.surface2,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        })}
      >
        <Txt style={{ fontSize: 14, fontFamily: font.semibold }}>{current.label}</Txt>
        <ChevronDown size={16} color={c.fg} strokeWidth={2.25} />
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        {options.map((o) => (
          <ChoiceRow
            key={o.key}
            title={o.label}
            selected={o.key === value}
            onPress={() => {
              setOpen(false);
              onChange(o.key);
            }}
          />
        ))}
      </Sheet>
    </>
  );
}

/** La tarjeta amarilla, la roja o la doble amarilla (amarilla sobre roja), como CardIcon de la web. */
export function CardIcon({ kind }: { kind: 'yellow' | 'second_yellow' | 'red' }) {
  const card = (color: string, extra?: object) => <View style={{ width: 10, height: 14, borderRadius: 2, backgroundColor: color, borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.12)', ...extra }} />;
  if (kind === 'second_yellow') {
    return (
      <View accessibilityLabel="Doble amarilla" style={{ width: 14, height: 16 }}>
        {card('#facc15', { position: 'absolute', left: 0, top: 0 })}
        {card('#dc2626', { position: 'absolute', right: 0, bottom: 0 })}
      </View>
    );
  }
  return <View accessibilityLabel={kind === 'yellow' ? 'Amarilla' : 'Roja'}>{card(kind === 'yellow' ? '#facc15' : '#dc2626')}</View>;
}

// ---------- La temporada ----------

/**
 * Las temporadas de la liga y la elegida (la de ahora al entrar, o la de `?temporada=`), como useStandingsSeason de la
 * web. `closed` = la elegida, si está cerrada y tiene tabla guardada (si no, la pantalla la calcula con sus partidos).
 */
export function useSeasonPick(initialId?: string | null) {
  const { lid } = useLeagueCtx();
  const seasons = useLeagueSeasons(lid);
  const [id, setId] = useState<string | null>(initialId ?? null);
  const selected = pickSeason(seasons.data, id);
  return {
    seasons: seasons.data,
    loading: seasons.loading && !seasons.data.length,
    error: seasons.data.length ? null : seasons.error,
    selected,
    setSelected: setId,
    closed: hasSavedTable(selected) ? selected : null,
  };
}

export type SeasonPick = ReturnType<typeof useSeasonPick>;

/**
 * Arriba de la tabla (SeasonBar de la web): la temporada con sus fechas (con más de una, tocarla la cambia). Una
 * cerrada sin tabla guardada (la tabla de abajo se calcula con sus partidos) muestra debajo sus premios, salvo con
 * `awards={false}`.
 */
export function SeasonBar({ pick, awards = true }: { pick: SeasonPick; awards?: boolean }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const s = pick.selected;
  if (!s) return null;
  const many = pick.seasons.length > 1;
  const unsaved = awards && s.status === 'closed' && !hasSavedTable(s);
  return (
    <View style={{ gap: 12 }}>
      <Pressable
        accessibilityRole={many ? 'button' : undefined}
        accessibilityLabel={`Temporada: ${s.name}`}
        disabled={!many}
        onPress={() => setOpen(true)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: many ? 12 : 0, borderRadius: 12, borderWidth: many ? 1 : 0, borderColor: c.line, backgroundColor: many ? c.surface : 'transparent' }}>
          <Txt numberOfLines={1} style={{ fontSize: 14, fontFamily: font.medium, color: many ? c.fg : c.muted }}>
            {s.name}
          </Txt>
          {many && <ChevronDown size={16} color={c.muted} />}
        </View>
        <Txt numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 12, color: c.muted }}>
          {`${s.status === 'closed' ? 'Cerrada · ' : ''}${seasonDates(s)}`}
        </Txt>
      </Pressable>
      {unsaved && <SeasonAwardsCard season={s} />}
      <Sheet open={open} onClose={() => setOpen(false)} title="Temporada">
        {pick.seasons.map((x) => (
          <ChoiceRow
            key={x.id}
            title={`${x.name}${x.status === 'active' ? ' (en curso)' : ''}`}
            subtitle={seasonDates(x)}
            selected={x.id === s.id}
            onPress={() => {
              pick.setSelected(x.id);
              setOpen(false);
            }}
          />
        ))}
      </Sheet>
    </View>
  );
}

/** Los premios de una temporada cerrada (el campeón arriba) con la fecha del cierre (SeasonAwardsCard de la web). */
export function SeasonAwardsCard({ season }: { season: Season }) {
  const c = useColors();
  if (season.status !== 'closed') return null;
  const { champion, rest } = sortedAwards(season.awards);
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accentSoft }}>
          <Trophy size={20} color={c.accent} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt tone="muted" style={{ fontSize: 12 }}>
            {`${season.name} · terminó${season.endsOn ? ` el ${formatDate(season.endsOn)}` : ''}`}
          </Txt>
          <Txt variant="bodyStrong" numberOfLines={1}>
            {champion ? `Campeón: ${champion.name}` : 'Temporada cerrada'}
          </Txt>
        </View>
      </View>
      {rest.length > 0 && (
        <View style={{ gap: 6 }}>
          {rest.map((a) => (
            <View key={a.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <Award size={16} color={c.muted} style={{ marginTop: 2 }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt style={{ fontSize: 14 }}>
                  <Txt tone="muted" style={{ fontSize: 14 }}>{`${a.label}: `}</Txt>
                  <Txt style={{ fontSize: 14, fontFamily: font.medium }}>{a.name}</Txt>
                </Txt>
                {!!a.note && (
                  <Txt tone="muted" style={{ fontSize: 12 }}>
                    {a.note}
                  </Txt>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

/** Una temporada cerrada: sus premios y la tabla que se guardó al cerrarla, con «Todas las temporadas». */
export function ClosedSeasonView({ season, highlight = [] }: { season: Season; highlight?: readonly string[] }) {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const snapshot = parseSnapshot(season.standings);
  return (
    <View style={{ gap: 16 }}>
      <SeasonAwardsCard season={season} />
      {snapshot ? <SnapshotTables snapshot={snapshot} highlight={highlight} /> : <Empty icon={<ListOrdered size={28} color={c.accent} />} title="Sin tabla guardada" text="Esta temporada se cerró sin tabla." />}
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push({ pathname: '/l/[lid]/temporadas', params: { lid } })}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start' }}
      >
        <History size={16} color={c.accent} />
        <Txt tone="accent" style={{ fontSize: 14, fontFamily: font.medium }}>
          Todas las temporadas
        </Txt>
      </Pressable>
    </View>
  );
}
