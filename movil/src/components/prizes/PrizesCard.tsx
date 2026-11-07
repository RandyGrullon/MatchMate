/**
 * «Premios del torneo» (PrizesCard de la web, docs/premios-torneo.md §6.1): lo ven todos. Sin premios, quien diseña
 * insignias ve «Elegir premios»; elegidos, «El campeón se lleva…» con la insignia de cada lugar por categoría (y quién
 * va ganando); ya entregados, «Campeones» con quién ganó (tocar un jugador abre su página). Los admins además
 * entregan, corrigen y cierran. Lo que se decide (textos, botones, plazos) es lo de la web: src/components/prizes/view.ts.
 * El detalle de una insignia (DesignSheet de la web) todavía se abre en la web.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { AlertTriangle, Gift, Lock, Pencil, Trophy } from 'lucide-react-native';
import { badgeLabel } from '@mm/badges/visual/period';
import { useLeagueBadges, type LeagueBadge } from '@mm/lib/data/leagueBadges';
import { usePlayers } from '@mm/lib/data/players';
import { canDeliverPrizes, canPickPrizes, closeTournamentPrizes, prizeErrorText, type PrizeWinner, type TournamentPrize } from '@mm/lib/data/prizes';
import { saveErrorMessage } from '@mm/lib/errorText';
import { useLeagueCtx } from '@mm/lib/league';
import { useNow } from '@mm/lib/useNow';
import { cardModel, correctionWindow, type CardRow } from '@mm/prizes/card';
import { PLACE_LABEL } from '@mm/prizes/catalog';
import { designLook } from '@mm/components/badges/maker/look';
import { adminBarView, cardHidden, CLOSE_PRIZES_CONFIRM, currentLine, nameJoiner, PODIUM_CHANGED_TEXT, soloWinner, winnerPlayerName, winnerShortLine, type AdminBarView } from '@mm/components/prizes/view';
import { Insignia } from '@/components/badges/Insignia';
import { confirmAsync, toast } from '@/components/feedback';
import { Button, Card, SectionHeader, Txt } from '@/components/ui';
import { openOnWeb } from '@/lib/web';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { AwardPrizesSheet } from './AwardPrizesSheet';
import { NoBadge } from './parts';
import { PrizePicker } from './PrizePicker';
import type { TournamentPrizesProps } from './TournamentPrizes';

export function PrizesCard({ comp, prize, ready, waitText, podium, warnings, webPath }: TournamentPrizesProps & { prize: TournamentPrize | null }) {
  const c = useColors();
  const ctx = useLeagueCtx();
  const made = useLeagueBadges(ctx.lid);
  const players = usePlayers(ctx.lid);
  const now = useNow().getTime();
  const [picking, setPicking] = useState(false);
  const [awarding, setAwarding] = useState(false);
  const [closing, setClosing] = useState(false);
  const canPick = canPickPrizes(ctx);
  const canDeliver = canDeliverPrizes(ctx);
  const admin = canPick || canDeliver;
  const designs = made.data.designs;
  const model = cardModel(comp, prize, designs, { podium, admin });
  const names = new Map(players.data.map((p) => [p.id, p.name] as const));
  const nameOf = (id: string) => names.get(id) ?? 'Jugador';
  // Mientras llegan los diseños no se dibuja nada (la tarjeta saldría sin insignias y luego con ellas).
  if (made.loading) return null;
  if (cardHidden(model, canPick)) return null;

  const closed = model.state === 'cerrados';
  // Lugar por lugar, como la base: un lugar sin entregar se entrega aunque otro ya pasó sus 14 días.
  const bar = adminBarView({ model, correction: correctionWindow(model, now), tz: ctx.league.tz, canPick, canDeliver, isOwner: ctx.isOwner, ready, waitText });

  async function close() {
    if (!prize) return;
    if (!(await confirmAsync({ ...CLOSE_PRIZES_CONFIRM }))) return;
    setClosing(true);
    try {
      await closeTournamentPrizes(prize);
      toast('Premios cerrados');
    } catch (e) {
      console.error(e);
      toast(prizeErrorText(e, saveErrorMessage), 'error');
    } finally {
      setClosing(false);
    }
  }

  return (
    <View style={{ gap: 10 }}>
      <SectionHeader
        title="Premios del torneo"
        action={
          closed && admin ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Lock size={14} color={c.muted} />
              <Txt variant="small" tone="muted" style={{ fontFamily: font.semibold }}>
                Premios cerrados
              </Txt>
            </View>
          ) : undefined
        }
      />
      <Card style={{ gap: 16 }}>
        {model.state === 'sin_premios' ? (
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Trophy size={20} color={c.accent} />
              <Txt variant="meta" tone="fg2" style={{ flex: 1 }}>
                Elige qué insignia se lleva el campeón.
              </Txt>
            </View>
            <Button variant="soft" size="lg" full icon={<Gift size={20} color={c.accent} />} onPress={() => setPicking(true)}>
              Elegir premios
            </Button>
          </View>
        ) : (
          <>
            <Txt variant="bodyStrong">{model.heading}</Txt>
            {model.sections.map((sec) => (
              <View key={sec.key} style={{ gap: 10 }}>
                <Txt variant="small" tone="muted" accessibilityRole="header" style={{ fontFamily: font.semibold }}>
                  {sec.title}
                </Txt>
                {sec.rows.map((r) => (
                  <PrizeRow key={r.slot.id} row={r} sport={comp.sport} period={prize?.period ?? ''} lid={ctx.lid} nameOf={nameOf} onOpenBadge={() => void openOnWeb(webPath)} />
                ))}
              </View>
            ))}
            {admin && <AdminBar v={bar} closing={closing} onPick={() => setPicking(true)} onAward={() => setAwarding(true)} onClosePrizes={() => void close()} />}
          </>
        )}
      </Card>
      {canPick && picking && <PrizePicker onClose={() => setPicking(false)} comp={comp} prize={prize} designs={designs} />}
      {canDeliver && prize && awarding && <AwardPrizesSheet onClose={() => setAwarding(false)} comp={comp} prize={prize} designs={designs} podium={podium} warnings={warnings} />}
    </View>
  );
}

function PrizeRow({ row, sport, period, lid, nameOf, onOpenBadge }: { row: CardRow; sport: string; period: string; lid: string; nameOf: (id: string) => string; onOpenBadge: (b: LeagueBadge) => void }) {
  const { slot, design } = row;
  const look = design ? designLook(design, sport, period) : null;
  const big = slot.place === 1;
  const current = currentLine(row);
  const textSize = big ? 16 : 14;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {design && look ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${PLACE_LABEL[slot.place]}: ${badgeLabel(design.name, look)}`}
          onPress={() => onOpenBadge(design)}
          style={({ pressed }) => ({ borderRadius: 12, transform: [{ scale: pressed ? 0.97 : 1 }] })}
        >
          <Insignia badge={look} size={big ? 64 : 40} />
        </Pressable>
      ) : (
        <NoBadge size={big ? 64 : 40} />
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt style={{ fontFamily: font.semibold, fontSize: textSize, lineHeight: textSize + 6 }}>
          {PLACE_LABEL[slot.place]}
          <Txt tone="muted" style={{ fontFamily: font.regular, fontSize: textSize, lineHeight: textSize + 6 }}>
            {` · ${design?.name ?? 'Insignia no disponible'}`}
          </Txt>
        </Txt>
        {row.delivered ? (
          row.winners.length ? (
            <View style={{ gap: 2 }}>
              {row.winners.map((w) => (
                <Winner key={w.ref} winner={w} lid={lid} nameOf={nameOf} />
              ))}
            </View>
          ) : (
            <Txt variant="small" tone="muted">
              Nadie en este lugar.
            </Txt>
          )
        ) : current ? (
          <Txt variant="small" tone="muted" numberOfLines={current.truncate ? 1 : undefined}>
            {current.text}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

/** «Equipo Uno · Juan Pérez y Jugador Uno» (tocar un jugador abre su página). */
function Winner({ winner, lid, nameOf }: { winner: PrizeWinner; lid: string; nameOf: (id: string) => string }) {
  const solo = soloWinner(winner);
  const short = winnerShortLine(winner, nameOf);
  const open = (playerId: string) => router.push({ pathname: '/l/[lid]/j/[playerId]', params: { lid, playerId } });
  return (
    <Txt variant="meta">
      {!solo && !!winner.name && <Txt style={{ fontFamily: font.semibold }}>{`${winner.name} · `}</Txt>}
      {short ??
        winner.players.map((id, i) => (
          <Txt key={id}>
            {nameJoiner(i, winner.players.length)}
            <Txt accessibilityRole="link" onPress={() => open(id)}>
              {winnerPlayerName(winner, id, nameOf)}
            </Txt>
          </Txt>
        ))}
    </Txt>
  );
}

function AdminBar({ v, closing, onPick, onAward, onClosePrizes }: { v: AdminBarView; closing: boolean; onPick: () => void; onAward: () => void; onClosePrizes: () => void }) {
  const c = useColors();
  return (
    <View style={[styles.bar, { borderTopColor: c.line }]}>
      {v.podiumWarning && (
        <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <AlertTriangle size={16} color={c.warn} />
          <Txt variant="meta" tone="warn" style={{ flex: 1, fontFamily: font.medium }}>
            {PODIUM_CHANGED_TEXT}
          </Txt>
        </View>
      )}
      {v.notes.map((n) => (
        <Txt key={n} variant="small" tone="muted">
          {n}
        </Txt>
      ))}
      {/* Un solo botón principal (Entregar, o Revisar si falta alguno); lo demás en gris. */}
      {v.award && (
        <Button
          variant={v.award.quiet ? 'quiet' : 'primary'}
          size="lg"
          full
          icon={<Gift size={16} color={v.award.quiet ? c.fg : c.accentFg} />}
          disabled={v.award.disabled}
          onPress={onAward}
        >
          {v.award.label}
        </Button>
      )}
      {(v.change || v.close) && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {v.change && (
            <Button icon={<Pencil size={16} color={c.fg} />} onPress={onPick} style={{ flex: 1 }}>
              Cambiar premios
            </Button>
          )}
          {v.close && (
            <Button icon={<Lock size={16} color={c.fg} />} loading={closing} onPress={onClosePrizes} style={{ flex: 1 }}>
              Cerrar premios
            </Button>
          )}
        </View>
      )}
      {!!v.wait && (
        <Txt variant="small" tone="muted">
          {v.wait}
        </Txt>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
});
