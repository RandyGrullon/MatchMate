import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ticket } from 'lucide-react-native';
import { displayName, useAuth } from '@mm/lib/auth';
import { getInvite, getInviteDetails, joinLeagueClaim, type InviteDetails } from '@mm/lib/data/leagues';
import { joinClaimMessage } from '@mm/components/claims/logic';
import { guessPlayer, joinLabel, peopleWord } from '@mm/components/league/logic';
import { useMembership } from '@mm/lib/data/members';
import { asBackendError } from '@mm/lib/db/errors';
import { saveErrorMessage } from '@mm/lib/errorText';
import { sportMeta } from '@mm/sports/registry';
import type { Invite } from '@mm/lib/types';
import { toast } from '@/components/feedback';
import { WhoAreYouList, type WhoChoice } from '@/components/league/WhoAreYou';
import { Button, Card, Empty, ErrorNote, Loading, Screen, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';

/**
 * El link o el QR de invitación (/unirse/<código>, JoinPage de la web): a qué liga lleva, «¿Quién eres?» si el admin ya
 * anotó jugadores sin cuenta (unirse como uno de ellos queda pendiente de que lo apruebe) y «Unirme a la liga» (o
 * «Unirme como …»). Sin cuenta, crearla o entrar y volver aquí. Si ya es miembro, a la liga.
 */
export default function JoinScreen() {
  const { code = '' } = useLocalSearchParams<{ code: string }>();
  const c = useColors();
  const auth = useAuth();
  const [attempt, setAttempt] = useState(0);
  // Lo que respondió la búsqueda de este código en este intento (lo de un intento anterior no cuenta: «cargando»).
  const [result, setResult] = useState<{ key: string; invite?: Invite | null; failed?: string } | null>(null);
  // Con cuenta: la invitación con los jugadores que el admin ya anotó sin cuenta («¿Quién eres?», como JoinPage).
  const [details, setDetails] = useState<{ key: string; data: InviteDetails | null } | null>(null);
  const [choice, setChoice] = useState<WhoChoice | undefined>(undefined);
  const key = `${code}:${attempt}`;
  const invite = result?.key === key ? result.invite : undefined;
  const failed = result?.key === key ? (result.failed ?? null) : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const membership = useMembership(invite?.leagueId, auth.user?.uid);

  useEffect(() => {
    let alive = true;
    const key = `${code}:${attempt}`;
    getInvite(code)
      .then((i) => alive && setResult({ key, invite: i }))
      .catch((e: unknown) => {
        if (!alive) return;
        const be = asBackendError(e);
        setResult({ key, failed: be?.kind === 'rate_limited' ? 'Fueron muchos intentos seguidos. Espera un minuto.' : 'No pudimos revisar la invitación. Revisa tu conexión.' });
      });
    return () => {
      alive = false;
    };
  }, [code, attempt]);

  useEffect(() => {
    if (invite && membership.data) router.replace({ pathname: '/l/[lid]', params: { lid: invite.leagueId } });
  }, [invite, membership.data]);

  const uid = auth.user?.uid;
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    const k = `${code}:${uid}`;
    getInviteDetails(code)
      .then((d) => alive && setDetails({ key: k, data: d }))
      .catch((e: unknown) => {
        // Cuenta bloqueada o muchos intentos: queda lo básico (unirse como jugador nuevo).
        console.warn('[invitación]', e);
        if (alive) setDetails({ key: k, data: null });
      });
    return () => {
      alive = false;
    };
  }, [code, uid]);
  const info = details?.key === `${code}:${uid}` ? details.data : null;
  const players = useMemo(() => info?.players ?? [], [info]);
  const me = displayName(auth);
  const suggested = useMemo<WhoChoice>(() => guessPlayer(players, me), [players, me]);
  const picked = choice === undefined ? suggested : choice;
  const pickedName = picked ? (players.find((pl) => pl.id === picked)?.name ?? null) : null;

  if (failed) {
    return (
      <Screen>
        <Empty title="No se pudo cargar la invitación" text={failed} action={<Button onPress={() => setAttempt((n) => n + 1)}>Reintentar</Button>} />
      </Screen>
    );
  }
  if (invite === undefined || auth.loading) return <Loading label="Buscando la invitación" />;
  if (!invite) {
    return (
      <Screen>
        <Empty
          icon={<Ticket size={28} color={c.accent} />}
          title="Esta invitación no sirve"
          text="El código no existe o lo cambiaron. Pídele el link nuevo a quien organiza."
          action={<Button onPress={() => router.navigate('/ligas')}>Ver ligas</Button>}
        />
      </Screen>
    );
  }

  const meta = sportMeta(invite.sport);
  const Icon = meta?.icon;
  const torneo = invite.kind === 'torneo';

  async function join() {
    if (!auth.user || !invite) return;
    setBusy(true);
    setError(null);
    try {
      const r = await joinLeagueClaim(invite.leagueId, { uid: auth.user.uid, name: displayName(auth) }, invite.id, players.length ? picked : null);
      // Lo de «¿Quién eres?»: queda pendiente de que el admin lo apruebe.
      const said = players.length ? joinClaimMessage(picked, pickedName, r.playerId, r.claimId) : null;
      if (said) toast(said);
      router.replace({ pathname: '/l/[lid]', params: { lid: invite.leagueId } });
    } catch (e) {
      setError(saveErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 28 }}>
        <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          {Icon && <Icon size={32} color={c.accent} />}
        </View>
        <Txt variant="meta" tone="muted">
          {torneo ? 'Te invitaron al torneo' : 'Te invitaron a la liga'}
        </Txt>
        <Txt variant="title" style={{ textAlign: 'center' }}>
          {invite.leagueName}
        </Txt>
        <Txt tone="muted">{[meta?.label, invite.visibility === 'public' ? (torneo ? 'Torneo público' : 'Liga pública') : torneo ? 'Torneo privado' : 'Liga privada'].filter(Boolean).join(' · ')}</Txt>
      </Card>
      {info?.hasMinors && (
        <Txt tone="muted" style={{ fontSize: 13 }}>
          {`${torneo ? 'Torneo con menores' : 'Liga con menores'}: privada, sin fotos ni comentarios. A los menores los registra un admin.`}
        </Txt>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
      {auth.user ? (
        <>
          {players.length > 0 && (
            <Card>
              <WhoAreYouList players={players} value={picked} onChange={setChoice} people={peopleWord(invite.sport)} />
            </Card>
          )}
          <Button variant="primary" size="xl" full loading={busy} onPress={join}>
            {pickedName ? `Unirme como ${pickedName}` : joinLabel(invite.kind)}
          </Button>
        </>
      ) : (
        <View style={{ gap: 10 }}>
          <Button variant="primary" size="xl" full onPress={() => router.push({ pathname: '/login', params: { modo: 'registro' } })}>
            Crear cuenta y unirme
          </Button>
          <Button size="xl" full onPress={() => router.push('/login')}>
            Ya tengo cuenta
          </Button>
        </View>
      )}
    </Screen>
  );
}
