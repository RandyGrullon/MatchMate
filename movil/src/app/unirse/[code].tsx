import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ticket } from 'lucide-react-native';
import { displayName, useAuth } from '@mm/lib/auth';
import { getInvite, joinLeagueClaim } from '@mm/lib/data/leagues';
import { useMembership } from '@mm/lib/data/members';
import { asBackendError } from '@mm/lib/db/errors';
import { saveErrorMessage } from '@mm/lib/errorText';
import { sportMeta } from '@mm/sports/registry';
import type { Invite } from '@mm/lib/types';
import { Button, Card, Empty, ErrorNote, Loading, Screen, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';

/**
 * El link o el QR de invitación (/unirse/<código>): a qué liga lleva y «Unirme». Sin cuenta, crearla o entrar y volver
 * aquí. Si ya es miembro, a la liga. («¿Quién eres?», para unirse como un jugador que el admin ya anotó, llega después:
 * mientras, la persona entra como jugador nuevo y el admin la junta con el de la lista.)
 */
export default function JoinScreen() {
  const { code = '' } = useLocalSearchParams<{ code: string }>();
  const c = useColors();
  const auth = useAuth();
  const [invite, setInvite] = useState<Invite | null | undefined>(undefined);
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const membership = useMembership(invite?.leagueId, auth.user?.uid);

  useEffect(() => {
    let alive = true;
    setInvite(undefined);
    setFailed(null);
    getInvite(code)
      .then((i) => alive && setInvite(i))
      .catch((e: unknown) => {
        if (!alive) return;
        const be = asBackendError(e);
        setFailed(be?.kind === 'rate_limited' ? 'Fueron muchos intentos seguidos. Espera un minuto.' : 'No pudimos revisar la invitación. Revisa tu conexión.');
      });
    return () => {
      alive = false;
    };
  }, [code, attempt]);

  useEffect(() => {
    if (invite && membership.data) router.replace({ pathname: '/l/[lid]', params: { lid: invite.leagueId } });
  }, [invite, membership.data]);

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
      await joinLeagueClaim(invite.leagueId, { uid: auth.user.uid, name: displayName(auth) }, invite.id, null);
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
      {error && <ErrorNote>{error}</ErrorNote>}
      {auth.user ? (
        <Button variant="primary" size="xl" full loading={busy} onPress={join}>
          Unirme
        </Button>
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
