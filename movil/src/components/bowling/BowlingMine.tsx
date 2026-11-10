import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { ClipboardPen, Eye, LogIn, LogOut, RotateCcw, UserPlus, UserRound } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { ensurePlayer, removeMember, useJoining } from '@mm/lib/data';
import { playToo } from '@mm/lib/data/scorers';
import { rememberLeague, useLeagueCtx } from '@mm/lib/league';
import { useJoinFlow } from '@/components/agenda/joinFlow';
import { confirmAsync } from '@/components/feedback';
import { runAction } from '@/components/swimming/parts';
import { Button, Empty, Loading } from '@/components/ui';
import { useColors } from '@/theme/theme';

/**
 * «Mis juegos» de una liga de boliche (`/l/<liga>/perfil`, LeagueProfilePage de la web), dentro de LeagueScope:
 * - miembro con jugador: su página de jugador (`/l/<liga>/j/<jugador>`);
 * - recién unido: se le está creando su jugador;
 * - sin cuenta: entrar o crear la cuenta;
 * - sin ser miembro: unirse (pública) o pedir invitación (privada);
 * - quien entró solo para anotar (sin jugador): «Estás aquí para anotar», con «También juego» y «Salir»;
 * - miembro sin jugador: se le crea solo, con su cuenta.
 */
export function BowlingMine() {
  const { lid, myPlayerId, member } = useLeagueCtx();
  const { user } = useAuth();
  const joining = useJoining(lid);
  if (myPlayerId) return <Redirect href={{ pathname: '/l/[lid]/j/[playerId]', params: { lid, playerId: myPlayerId } }} />;
  if (member && joining) return <Loading label="Preparando tu perfil" />;
  if (!user) return <SignInPrompt />;
  if (!member) return <NotMember />;
  if (member.scorerOnly) return <ScorerOnly />;
  return <PreparingPlayer />;
}

/**
 * Entró solo para anotar (link o invitación de anotador) y no tiene jugador: nadie se lo crea solo. «También juego»
 * se lo crea (y deja de ser «solo anota»); «Salir» lo saca de la liga.
 */
function ScorerOnly() {
  const c = useColors();
  const { lid, league, member } = useLeagueCtx();
  const [busy, setBusy] = useState<'play' | 'leave' | null>(null);
  const torneo = league.kind === 'torneo';
  const from = torneo ? 'del torneo' : 'de la liga';

  async function play() {
    setBusy('play');
    await runAction(() => playToo(lid), 'Listo, ya tienes tu jugador');
    setBusy(null);
  }

  async function leave() {
    if (!member) return;
    const ok = await confirmAsync({ title: `¿Salir ${from}?`, message: `Dejas de anotar y sales ${from}.`, confirmText: 'Salir', danger: true });
    if (!ok) return;
    setBusy('leave');
    const left = await runAction(() => removeMember(member).then(() => true), `Saliste ${from}`);
    setBusy(null);
    if (!left) return;
    rememberLeague(null);
    router.replace('/ligas');
  }

  return (
    <Empty
      icon={<ClipboardPen size={30} color={c.accent} />}
      title="Estás aquí para anotar"
      text={`Entraste ${torneo ? 'al torneo' : 'a la liga'} para anotar resultados; no tienes jugador.`}
      action={
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
          <Button variant="primary" loading={busy === 'play'} disabled={!!busy} icon={<UserPlus size={16} color={c.accentFg} />} onPress={() => void play()}>
            También juego
          </Button>
          <Button variant="ghost" loading={busy === 'leave'} disabled={!!busy} icon={<LogOut size={16} color={c.danger} />} onPress={() => void leave()}>
            {`Salir ${from}`}
          </Button>
        </View>
      }
    />
  );
}

function SignInPrompt() {
  const c = useColors();
  const { base } = useLeagueCtx();
  const next = `${base}/perfil`;
  return (
    <Empty
      icon={<UserRound size={30} color={c.accent} />}
      title="Tu perfil de jugador"
      text="Entra para ver tus números, confirmar asistencia y anotar tus juegos."
      action={
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          <Button icon={<LogIn size={16} color={c.fg} />} onPress={() => router.push({ pathname: '/login', params: { next } })}>
            Entrar
          </Button>
          <Button variant="primary" icon={<UserPlus size={16} color={c.accentFg} />} onPress={() => router.push({ pathname: '/login', params: { modo: 'registro', next } })}>
            Crear cuenta
          </Button>
        </View>
      }
    />
  );
}

function NotMember() {
  const c = useColors();
  const { lid, league, base } = useLeagueCtx();
  // «¿Quién eres?» cuando hay jugadores sin cuenta (el mismo camino que en todas partes).
  const flow = useJoinFlow();
  if (league.visibility === 'private') {
    return (
      <Empty
        icon={<Eye size={30} color={c.accent} />}
        title="Estás viendo como superadmin"
        text="No eres miembro de esta liga privada. Para tener perfil aquí, pide el link de invitación."
      />
    );
  }
  const join = () => void flow.start({ lid, name: league.name, sport: league.sport, kind: league.kind, next: `${base}/perfil` });
  return (
    <>
      <Empty
        icon={<UserPlus size={30} color={c.accent} />}
        title={`Únete a ${league.name}`}
        text="Entras como jugador: confirmas asistencia, anotas tus juegos y sales en el ranking."
        action={
          <Button variant="primary" loading={flow.busy === lid} icon={<UserPlus size={16} color={c.accentFg} />} onPress={join}>
            Unirme
          </Button>
        }
      />
      {flow.modal}
    </>
  );
}

/**
 * Miembro que todavía no tiene su jugador (se unió antes de que entrar fuera jugar, o falló al crearse): se le crea
 * solo, con su cuenta.
 */
function PreparingPlayer() {
  const c = useColors();
  const { lid, member } = useLeagueCtx();
  const [attempt, setAttempt] = useState(0);
  // El intento que falló (el de antes no cuenta: al intentar de nuevo se ve otra vez «preparando»).
  const [failedAt, setFailedAt] = useState<number | null>(null);
  const uid = member?.uid;
  const name = member?.name;

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    ensurePlayer(lid, uid, name ?? '').catch((e: unknown) => {
      console.error(e);
      if (alive) setFailedAt(attempt);
    });
    return () => {
      alive = false;
    };
  }, [lid, uid, name, attempt]);

  if (failedAt !== attempt) return <Loading label="Preparando tu perfil" />;
  return (
    <Empty
      icon={<UserRound size={30} color={c.accent} />}
      title="No se pudo preparar tu perfil"
      text="Revisa tu conexión e inténtalo de nuevo."
      action={
        <Button variant="primary" icon={<RotateCcw size={16} color={c.accentFg} />} onPress={() => setAttempt((n) => n + 1)}>
          Intentar de nuevo
        </Button>
      }
    />
  );
}
