/**
 * Un partido de raqueta (MatchDetail.tsx de la web, con su misma lógica): el título («Ronda 1 · Cancha 2»), el estado y
 * la hora, el marcador grande, confirmar o reclamar (el rival) y UN botón: «Anotar en la cancha» (con «Solo el
 * resultado» debajo). El admin decide un reclamo en su tarjeta; W.O., aplazar, reprogramar, quién juega, corregir,
 * anular y borrar, en «•••» (MatchAdmin.tsx). Compartir el resultado (imagen, texto para WhatsApp y «Publicar en
 * Social») e historial.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Gavel, History, Keyboard, Play, Share2 } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { useLeagueMembers } from '@mm/lib/data';
import { hasResult, isOpen, resolveDispute, useMatch } from '@mm/lib/data/matches';
import { savePointsResult, useWithPendingPoints } from '@mm/lib/data/racket';
import { saveErrorMessage } from '@mm/lib/errorText';
import { useLeagueCtx } from '@mm/lib/league';
import { shareOrigin } from '@mm/lib/origin';
import { useNow } from '@mm/lib/useNow';
import { roundLabel, statusInfo, whenText } from '@mm/components/match/format';
import { pointsResultParser, racketResultParser, type ParsedResult } from '@mm/components/match/parsers';
import { engineRules } from '@mm/pages/sports/racket/court/adapters';
import { parsePoints } from '@mm/pages/sports/racket/logic/night';
import { isPointsMatch } from '@mm/pages/sports/racket/logic/results';
import { rulesText } from '@mm/pages/sports/racket/logic/rulesText';
import { historyLines } from '@mm/pages/sports/racket/match/history';
import { useMySide } from '@mm/pages/sports/racket/match/side';
import { courtWords, useRacket } from '@mm/pages/sports/racket/sport';
import { MatchStatus } from '../match/MatchCard';
import { ConfirmResult, ResultSheet, Scoreboard } from '../match/ResultParts';
import { ShareResultSheet } from '../match/ShareResult';
import { toast } from '../feedback';
import { PointsCourt, SetsCourt } from './RacketCourt';
import { MatchAdmin } from './MatchAdmin';
import { useRacketPhone } from './parts';
import { Button, Card, Divider, Empty, ListRow, LoadError, RowIcon, Sheet, Txt } from '../ui';
import { LogoSpinner } from '../Logo';
import { useColors } from '@/theme/theme';

export const courtRoute = (lid: string, matchId: string) => ({ pathname: '/l/[lid]/partido/[matchId]/cancha' as const, params: { lid, matchId } });

export function RacketMatch({ matchId }: { matchId: string }) {
  const c = useColors();
  const { lid, isAdmin, member, league } = useLeagueCtx();
  const { sport, ext } = useRacketPhone();
  const w = courtWords(ext);
  const q = useMatch(lid, matchId);
  const list = useWithPendingPoints(lid, q.data ? [q.data] : []);
  const m = list[0] ?? null;
  const mySideOf = useMySide();
  const members = useLeagueMembers(lid);
  const now = useNow().getTime();
  const [entry, setEntry] = useState<null | 'finish' | 'correct' | 'resolve'>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);

  if (q.error) return <LoadError error={q.error} />;
  if (q.loading && !m) {
    return (
      <View style={{ paddingVertical: 32, alignItems: 'center' }}>
        <LogoSpinner size={36} label="Cargando el partido" />
      </View>
    );
  }
  if (!m) return <Empty title="Este partido ya no existe" action={<Button onPress={() => (router.canGoBack() ? router.back() : router.navigate({ pathname: '/l/[lid]', params: { lid } }))}>Volver</Button>} />;

  const mySide = mySideOf(m);
  const canScore = isAdmin || !!member?.scorer || mySide !== null;
  const points = isPointsMatch(m);
  const open = isOpen(m);
  const rules = engineRules(sport, m.rules);
  const parser = points ? pointsResultParser(parsePoints(m.rules?.points)) : racketResultParser(rules);
  const pointsSubmit = (note?: string) => async (r: ParsedResult) => {
    const sides = r.score.sides ?? [0, 0];
    const out = await savePointsResult(lid, m.id, [sides[0], sides[1]], { note });
    if (out && !out.ok) throw new Error('Otro teléfono va más adelante con este partido.');
  };
  const memberName = (id: string) => members.data.find((x) => x.uid === id)?.name ?? null;
  const history = historyLines(m.history, memberName, league.tz, w.one);
  const status = statusInfo(m, now);
  const heading = [m.stage || roundLabel(m.round, points ? 'Ronda' : 'Jornada'), m.court].filter(Boolean).join(' · ') || (points ? 'Partido de la noche' : 'Partido');
  const when = whenText(m.scheduledAt, league.tz, true);
  const url = `${shareOrigin(null)}/l/${lid}${m.eventId ? `/e/${m.eventId}` : '/juegos'}?partido=${m.id}`;
  const pointsCfg = parsePoints(m.rules?.points);

  async function keepProposed() {
    setBusy(true);
    try {
      await resolveDispute(lid, m!.id, { note: 'Queda el resultado anotado' });
      toast('Reclamo resuelto: queda el resultado anotado');
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <Txt variant="title" style={{ flex: 1, fontSize: 28, lineHeight: 33 }}>
            {heading}
          </Txt>
          {/* Lo del admin: W.O., aplazar, reprogramar, quién juega, corregir, anular y borrar. */}
          <MatchAdmin match={m} onDeleted={() => (router.canGoBack() ? router.back() : router.navigate({ pathname: '/l/[lid]', params: { lid } }))} onCorrect={() => setEntry('correct')} />
        </View>
        {(m.status !== 'scheduled' || when) && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {m.status !== 'scheduled' && <MatchStatus label={status.label} tone={status.tone} live={status.live} />}
            {m.status !== 'scheduled' && !!when && (
              <Txt variant="meta" tone="muted">
                ·
              </Txt>
            )}
            {!!when && (
              <Txt variant="meta" tone="muted">
                {when}
              </Txt>
            )}
          </View>
        )}
      </View>
      <Scoreboard match={m} mySide={mySide} rules={points ? null : rulesText(rules)} />
      <ConfirmResult lid={lid} match={m} mySide={mySide} isAdmin={isAdmin} now={now} />
      {open && canScore && (
        <View style={{ gap: 10 }}>
          <Button variant="primary" size="xl" full icon={<Play size={20} color={c.accentFg} />} onPress={() => router.push(courtRoute(lid, m.id))}>
            {m.status === 'live' ? `Seguir anotando en la ${w.one}` : m.status === 'suspended' ? `Retomar en la ${w.one}` : `Anotar en la ${w.one}`}
          </Button>
          <Button size="lg" full icon={<Keyboard size={20} color={c.fg} />} onPress={() => setEntry('finish')}>
            {points ? 'Poner el marcador' : 'Solo el resultado'}
          </Button>
        </View>
      )}
      {isAdmin && m.status === 'disputed' && (
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Gavel size={16} color={c.danger} />
            <Txt variant="meta" tone="danger" style={{ fontWeight: '700' }}>
              En disputa
            </Txt>
          </View>
          <Txt>{m.disputeNote ? `«${m.disputeNote}»` : 'El rival dice que el resultado no es así.'}</Txt>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button size="lg" full loading={busy} onPress={keepProposed}>
                Dejar lo anotado
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button variant="primary" size="lg" full onPress={() => setEntry('resolve')}>
                Decidir el reclamo
              </Button>
            </View>
          </View>
        </Card>
      )}
      {(hasResult(m) || history.length > 0) && (
      <Card padded={false}>
        {hasResult(m) && (
          <ListRow
            icon={
              <RowIcon>
                <Share2 size={20} color={c.accent} />
              </RowIcon>
            }
            title="Compartir el resultado"
            subtitle="Imagen o texto para WhatsApp"
            onPress={() => setSharing(true)}
          />
        )}
        {history.length > 0 && (
          <>
            {hasResult(m) && <Divider inset={68} />}
            <ListRow
              icon={
                <RowIcon>
                  <History size={20} color={c.accent} />
                </RowIcon>
              }
              title={`Historial (${history.length})`}
              subtitle={history[0].text}
              onPress={() => setHistoryOpen(true)}
            />
          </>
        )}
      </Card>
      )}
      {sharing && <ShareResultSheet onClose={() => setSharing(false)} match={m} title={league.name} subtitle={heading} roundWord={points ? 'Ronda' : 'Jornada'} url={url} mySide={mySide} />}
      <Sheet open={historyOpen} onClose={() => setHistoryOpen(false)} title="Historial" subtitle={heading}>
        {history.map((h, i) => (
          <View key={i} style={{ gap: 2, paddingVertical: 8, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: c.line }}>
            <Txt variant="bodyStrong">{h.text}</Txt>
            <Txt variant="small" tone="muted">
              {new Date(h.at).toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short', timeZone: league.tz || undefined })}
              {h.who ? ` · ${h.who}` : ''}
              {h.note ? ` · ${h.note}` : ''}
            </Txt>
          </View>
        ))}
      </Sheet>
      {entry && (
        <ResultSheet
          open
          onClose={() => setEntry(null)}
          lid={lid}
          match={m}
          parser={parser}
          mode={entry}
          placeholder={points ? '14-10' : sport === 'pickleball' ? '11-7 9-11 11-5' : '6-4 3-6 10-7'}
          examples={points ? [] : sport === 'pickleball' ? ['11-7', '11-9'] : ['6-4 6-4', '6-3 6-2', '6-4 3-6 10-7', '7-6(5) 6-4']}
          hint={
            points
              ? `Los puntos de cada lado${pointsCfg.mode === 'total' ? `: suman ${pointsCfg.target}` : ''}.`
              : sport === 'pickleball'
                ? 'Juego por juego, separados por espacio (11-7 9-11 11-5).'
                : 'Set por set, separados por espacio. El súper tie-break va con sus puntos (10-7).'
          }
          onSubmit={points ? pointsSubmit(entry === 'finish' ? undefined : 'Corregido por el admin') : undefined}
        />
      )}
    </View>
  );
}

/** La cancha del partido: a sets o de puntos, según el partido. Solo si está abierto y quien mira puede anotar. */
export function RacketMatchCourt({ matchId, onExit }: { matchId: string; onExit: () => void }) {
  const { lid, isAdmin, member } = useLeagueCtx();
  const { sport } = useRacket();
  const { user } = useAuth();
  const q = useMatch(lid, matchId);
  const mySideOf = useMySide();
  const m = q.data;
  if (q.loading && !m) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <LogoSpinner size={36} label="Preparando la cancha" />
      </View>
    );
  }
  if (!m) return <Empty title="Este partido ya no existe" action={<Button onPress={onExit}>Volver</Button>} />;
  const canScore = isAdmin || !!member?.scorer || mySideOf(m) !== null;
  if (!isOpen(m) || !canScore) return <Empty title="No puedes anotar este partido" text="Lo anota alguien de los equipos, el anotador o el admin." action={<Button onPress={onExit}>Volver</Button>} />;
  const uid = user?.uid ?? null;
  return isPointsMatch(m) ? (
    <PointsCourt match={m} isAdmin={isAdmin} userId={uid} onExit={onExit} />
  ) : (
    <SetsCourt match={m} sport={sport} isAdmin={isAdmin} userId={uid} onExit={onExit} />
  );
}
