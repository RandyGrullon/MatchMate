import { useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import { UserPlus } from 'lucide-react-native';
import { displayName, useAuth } from '@mm/lib/auth';
import { joinLeagueClaim } from '@mm/lib/data/leagues';
import { fetchPlayers } from '@mm/lib/data/players';
import { saveErrorMessage } from '@mm/lib/errorText';
import type { LeagueKind, Player } from '@mm/lib/types';
import { joinClaimMessage } from '@mm/components/claims/logic';
import { joinLabel, joinStep, peopleWord } from '@mm/components/league/logic';
import { toast } from '@/components/feedback';
import { WhoAreYouList, type WhoChoice } from '@/components/league/WhoAreYou';
import { Button, Sheet } from '@/components/ui';
import { useColors } from '@/theme/theme';

/** A qué liga se une la cuenta (JoinTarget de la web, src/components/league/WhoAreYou.tsx). */
export interface JoinTarget {
  lid: string;
  name: string;
  sport?: string | null;
  kind?: LeagueKind;
  /** Adónde vuelve después de entrar o crear la cuenta (por defecto, la liga). */
  next?: string;
}

export interface JoinFlow {
  /** La liga a la que se está uniendo (o leyendo sus jugadores), o null. */
  busy: string | null;
  start: (target: JoinTarget) => Promise<void>;
  /** El «¿Quién eres?»: va una vez en la pantalla que usa el flujo. */
  modal: ReactNode;
}

/**
 * «Unirme» por el mismo camino de la web (useJoinFlow de src/components/league/WhoAreYou.tsx, con su lógica: joinStep
 * de src/components/league/logic.ts): sin cuenta, a entrar; si la liga tiene jugadores sin cuenta (los que el admin
 * anotó), primero «¿Quién eres?» para no quedar dos veces en la tabla; después join_league (con el pedido del jugador
 * elegido) y el aviso de cómo quedó. `onJoined`: después de unirse (en la agenda, apuntarse).
 */
export function useJoinFlow(onJoined?: (target: JoinTarget, r: { playerId: string | null; claimId: string | null }) => void): JoinFlow {
  const auth = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [asking, setAsking] = useState<{ target: JoinTarget; free: Player[]; initial: WhoChoice } | null>(null);

  async function join(t: JoinTarget, choice: WhoChoice, free: readonly Player[]) {
    if (!auth.user) return;
    setBusy(t.lid);
    let r: { playerId: string | null; claimId: string | null };
    try {
      r = await joinLeagueClaim(t.lid, { uid: auth.user.uid, name: displayName(auth) }, null, choice);
      toast(`Te uniste a ${t.name}`);
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
      return;
    } finally {
      setBusy(null);
    }
    setAsking(null);
    const said = joinClaimMessage(choice, free.find((p) => p.id === choice)?.name ?? null, r.playerId, r.claimId);
    if (said) toast(said);
    onJoined?.(t, r);
  }

  async function start(t: JoinTarget) {
    const me = { signedIn: !!auth.user, name: auth.user ? displayName(auth) : null };
    let next = joinStep(t, undefined, me);
    if (next.step === 'load') {
      setBusy(t.lid);
      try {
        next = joinStep(t, await fetchPlayers(t.lid), me);
      } catch {
        toast('No se pudo abrir la lista de la liga. Prueba otra vez.', 'error');
        return;
      } finally {
        setBusy(null);
      }
    }
    if (next.step === 'login') router.push(next.url as never);
    else if (next.step === 'join') await join(t, next.choice, []);
    else if (next.step === 'ask') setAsking({ target: t, free: next.free, initial: next.initial });
  }

  const target = asking?.target;
  const modal = asking ? (
    // Se arma de nuevo cada vez que se abre: arranca con el que parece ser (la lista pudo cambiar).
    <WhoAreYouSheet
      key={asking.target.lid}
      players={asking.free}
      initial={asking.initial}
      busy={!!target && busy === target.lid}
      joinText={joinLabel(target?.kind)}
      sport={target?.sport ?? null}
      onClose={() => setAsking(null)}
      onJoin={(choice) => void join(asking.target, choice, asking.free)}
    />
  ) : null;
  return { busy, start, modal };
}

/** «¿Quién eres?» antes de unirse (WhoAreYouModal de la web): la lista, «Cancelar» y «Unirme a la liga». */
function WhoAreYouSheet({
  players,
  initial,
  busy,
  joinText,
  sport,
  onClose,
  onJoin,
}: {
  players: readonly Player[];
  initial: WhoChoice;
  busy: boolean;
  joinText: string;
  sport: string | null;
  onClose: () => void;
  onJoin: (choice: WhoChoice) => void;
}) {
  const c = useColors();
  const [value, setValue] = useState<WhoChoice>(initial);
  return (
    <Sheet
      open
      onClose={onClose}
      title="¿Quién eres?"
      footer={
        <>
          <Button variant="primary" size="xl" full loading={busy} icon={<UserPlus size={20} color={c.accentFg} />} onPress={() => onJoin(value)}>
            {joinText}
          </Button>
          <Button variant="ghost" full onPress={onClose}>
            Cancelar
          </Button>
        </>
      }
    >
      <WhoAreYouList players={players} value={value} onChange={setValue} people={peopleWord(sport)} />
    </Sheet>
  );
}
