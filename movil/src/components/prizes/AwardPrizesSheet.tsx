/**
 * «Entregar premios» (AwardPrizesSheet de la web, docs/premios-torneo.md §6.3): carga el podio (el del servidor; en
 * golf, natación y noches, el del teléfono), muestra cada lugar con sus jugadores marcados, la diferencia con lo que ya
 * se entregó y los avisos, y manda el estado deseado a deliver_tournament_prizes. Entregar otra vez no duplica nada.
 * Necesita conexión. Se monta al abrirse.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AlertTriangle, ArrowRight, Info, RotateCw } from 'lucide-react-native';
import { badgeLabel } from '@mm/badges/visual/period';
import type { LeagueBadge } from '@mm/lib/data/leagueBadges';
import { usePlayers } from '@mm/lib/data/players';
import { deliverTournamentPrizes, fetchTournamentPodium, podiumLoadErrorText, prizeCode, prizeErrorText, type TournamentPodium, type TournamentPrize } from '@mm/lib/data/prizes';
import { saveErrorMessage } from '@mm/lib/errorText';
import { useLeagueCtx } from '@mm/lib/league';
import { useNow } from '@mm/lib/useNow';
import { changeOf, deliveredText, hasChanges, initialPicks, namesLine, payloadOf, planDelivery, planNotes, prizesGiven, toggleSlot, togglePlayer, type Picks } from '@mm/prizes/award';
import { PLACE_LABEL, type PrizeComp } from '@mm/prizes/catalog';
import type { PodiumProvider } from '@mm/prizes/providers';
import { designLook } from '@mm/components/badges/maker/look';
import { awardButtonLabel, awardNames, awardTitle, NOTIFY_HINT, NOTIFY_LABEL, PODIUM_RETRY_TEXT, removeHint, showUnits, unitTitle } from '@mm/components/prizes/view';
import { Insignia } from '@/components/badges/Insignia';
import { toast } from '@/components/feedback';
import { LogoSpinner } from '@/components/Logo';
import { Button, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { CheckRow, NoBadge, SwitchRow } from './parts';

export interface AwardPrizesSheetProps {
  onClose: () => void;
  comp: PrizeComp;
  prize: TournamentPrize;
  /** Los diseños de la liga (para dibujar la insignia de cada lugar). */
  designs: readonly LeagueBadge[];
  /** El podio del teléfono: lo que se entrega en los lugares que el servidor no calcula (golf, natación, noches). */
  podium?: PodiumProvider | null;
  /** Avisos arriba (boliche: «Hay 3 juegos por verificar: pueden cambiar el podio.»). */
  warnings?: readonly string[];
}

type Loaded = { attempt: number; podium: TournamentPodium | null; error: string | null };

export function AwardPrizesSheet({ onClose, comp, prize, designs, podium: phone, warnings = [] }: AwardPrizesSheetProps) {
  const c = useColors();
  const { lid, league, isOwner, myPlayerId } = useLeagueCtx();
  const players = usePlayers(lid);
  const now = useNow().getTime();
  // Cada carga del podio (al abrir, «Reintentar» o «El podio cambió») es un intento; lo marcado va con su intento.
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [edited, setEdited] = useState<{ attempt: number; picks: Picks } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notify, setNotify] = useState(!league.hasMinors);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchTournamentPodium(prize.id).then(
      (res) => alive && setLoaded({ attempt, podium: res, error: null }),
      (e: unknown) => {
        console.error(e);
        // Es una lectura: «No se pudo cargar el podio», nunca «No se pudo guardar».
        if (alive) setLoaded({ attempt, podium: null, error: podiumLoadErrorText(e) });
      },
    );
    return () => {
      alive = false;
    };
  }, [prize.id, attempt]);

  const current = loaded?.attempt === attempt ? loaded : null;
  const server = current?.podium ?? null;
  const plans = server ? planDelivery(prize, server, { comp, phone, myPlayers: myPlayerId ? [myPlayerId] : [], owner: isOwner, now }) : [];
  // Con cada podio que llega (al abrir o al recargar), lo marcado vuelve a lo de siempre.
  const picks = edited?.attempt === attempt ? edited.picks : initialPicks(plans);
  const setPicks = (next: Picks) => setEdited({ attempt, picks: next });
  const payload = payloadOf(plans, picks);
  const changes = hasChanges(plans, payload);
  const names = awardNames(players.data, plans);
  const nameOf = (id: string) => names.get(id) ?? 'Jugador';
  const byId = new Map(designs.map((d) => [d.id, d] as const));

  async function submit() {
    if (busy || !changes) return;
    setBusy(true);
    setError(null);
    try {
      const res = await deliverTournamentPrizes(prize, payload, notify && !league.hasMinors);
      toast(deliveredText(res, prizesGiven(plans, payload)));
      onClose();
    } catch (err) {
      console.error(err);
      // El podio cambió mientras mirabas: se vuelve a cargar solo y se muestra otra vez (el aviso no pide recargar).
      if (prizeCode(err) === 'podio_cambio') {
        setError(PODIUM_RETRY_TEXT);
        setAttempt((a) => a + 1);
      } else {
        setError(prizeErrorText(err, saveErrorMessage));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={awardTitle(prize)}
      subtitle={comp.name}
      footer={
        // Un solo botón (la X de arriba cierra sin entregar).
        <Button variant="primary" size="xl" full loading={busy} disabled={!server || !changes} onPress={submit}>
          {awardButtonLabel(plans)}
        </Button>
      }
    >
      {current?.error ? (
        <View style={{ alignItems: 'flex-start', gap: 12, paddingVertical: 8 }}>
          <Txt variant="meta" tone="danger" accessibilityLiveRegion="polite">
            {current.error}
          </Txt>
          <Button icon={<RotateCw size={16} color={c.fg} />} onPress={() => setAttempt((a) => a + 1)}>
            Reintentar
          </Button>
        </View>
      ) : !server ? (
        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
          <LogoSpinner size={32} label="Cargando el podio" />
        </View>
      ) : (
        <>
          {warnings.map((w) => (
            <View key={w} accessibilityLiveRegion="polite" style={[styles.warning, { backgroundColor: c.warnSoft }]}>
              <AlertTriangle size={16} color={c.warn} style={{ marginTop: 2 }} />
              <Txt variant="meta" style={{ flex: 1 }}>
                {w}
              </Txt>
            </View>
          ))}
          {plans.map((plan) => {
            const design = byId.get(plan.slot.badgeId) ?? null;
            const look = design ? designLook(design, comp.sport, prize.period) : null;
            const pick = picks[plan.slot.id];
            const change = changeOf(plan, payload);
            const notes = planNotes(plan, plans);
            return (
              <View key={plan.slot.id} style={[styles.place, { backgroundColor: c.surface2, opacity: plan.deliverable ? 1 : 0.75 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  {design && look ? <Insignia badge={look} size={40} label={badgeLabel(design.name, look)} /> : <NoBadge size={40} />}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt variant="meta" accessibilityRole="header" style={{ fontFamily: font.semibold, color: c.fg }}>
                      {`${PLACE_LABEL[plan.slot.place]} · ${plan.title}`}
                    </Txt>
                    <Txt variant="small" tone="muted" numberOfLines={1} style={{ fontFamily: font.regular }}>
                      {design?.name ?? 'Insignia no disponible'}
                    </Txt>
                  </View>
                </View>
                {notes.map((n) => (
                  <View key={n.text} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                    {n.tone === 'warn' ? <AlertTriangle size={14} color={c.warn} style={{ marginTop: 1 }} /> : <Info size={14} color={c.muted} style={{ marginTop: 1 }} />}
                    <Txt variant="small" tone={n.tone === 'warn' ? 'warn' : 'muted'} style={{ flex: 1, fontFamily: n.tone === 'warn' ? font.medium : font.regular }}>
                      {n.text}
                    </Txt>
                  </View>
                ))}
                {plan.deliverable && <SwitchRow on={!!pick?.on} onChange={(on) => setPicks(toggleSlot(picks, plan, on))} label="Entregar este lugar" hint={removeHint(plan, pick, nameOf)} />}
                {showUnits(plan) && (
                  <View style={{ gap: 8 }}>
                    {plan.units.map((u) => {
                      const picked = pick?.players[u.ref] ?? [];
                      const many = u.players.length > 1;
                      return (
                        <View key={u.ref} style={{ gap: 4 }}>
                          <Txt variant="meta" style={{ fontFamily: font.medium, color: c.fg }}>
                            {unitTitle(u)}
                            {!!u.detail && <Txt variant="meta" tone="muted">{` · ${u.detail}`}</Txt>}
                          </Txt>
                          {many && (
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16 }}>
                              {u.players.map((x) => {
                                const on = picked.includes(x.id);
                                const last = on && picked.length === 1;
                                return (
                                  <CheckRow
                                    key={x.id}
                                    checked={on}
                                    label={x.name}
                                    disabled={!plan.deliverable || !pick?.on || last}
                                    onPress={() => setPicks(togglePlayer(picks, plan.slot.id, u.ref, x.id))}
                                  />
                                );
                              })}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
                {(change.add.length > 0 || change.remove.length > 0) && change.before.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                    <Txt variant="small" tone="muted" style={{ fontFamily: font.regular }}>
                      Antes:
                    </Txt>
                    <Txt variant="small" style={{ fontFamily: font.regular, color: c.fg }}>
                      {namesLine(change.before.map(nameOf))}
                    </Txt>
                    <ArrowRight size={14} color={c.muted} accessibilityLabel="ahora" />
                    <Txt variant="small" tone="muted" style={{ fontFamily: font.regular }}>
                      Ahora:
                    </Txt>
                    <Txt variant="small" style={{ fontFamily: font.regular, color: c.fg }}>
                      {change.after.length ? namesLine(change.after.map(nameOf)) : 'nadie'}
                    </Txt>
                  </View>
                )}
              </View>
            );
          })}
          {!league.hasMinors && <SwitchRow on={notify} onChange={setNotify} label={NOTIFY_LABEL} hint={NOTIFY_HINT} />}
          {!!error && (
            <Txt variant="meta" tone="danger" accessibilityLiveRegion="polite" style={{ fontFamily: font.medium }}>
              {error}
            </Txt>
          )}
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  warning: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  place: { gap: 10, borderRadius: 16, padding: 16 },
});
