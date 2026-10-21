import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@mm/lib/auth';
import { useLeague, useMembership } from '@mm/lib/data';
import { canInviteTo, inviteTitle } from '@mm/components/invite/logic';
import { InvitePanel } from '@/components/invite/InvitePanel';
import { BackBar, Empty, Loading, Screen, Txt } from '@/components/ui';

/** Invitar a la liga (InviteSheet de la web): los admins con el código; un miembro de una liga pública, con su link. */
export default function InviteScreen() {
  const { lid } = useLocalSearchParams<{ lid: string }>();
  const auth = useAuth();
  const league = useLeague(lid);
  const membership = useMembership(lid, auth.user?.uid);
  const l = league.data;
  if ((league.loading && !l) || (membership.loading && !membership.data)) return <Loading />;
  const isAdmin = membership.data?.role === 'admin' || membership.data?.role === 'owner';
  return (
    <Screen>
      <BackBar label={l?.name ?? 'Liga'} fallback={`/l/${lid}`} />
      <Txt variant="title">{inviteTitle(l?.kind)}</Txt>
      {l && canInviteTo(l, isAdmin, !!membership.data) ? (
        <>
          <Txt tone="muted">Mándales el link o enséñales el QR: entran con un toque.</Txt>
          <InvitePanel lid={l.id} name={l.name} isAdmin={isAdmin} />
        </>
      ) : (
        <Empty title="No puedes invitar a esta liga" text="Pídele a un admin el link o el código para entrar." />
      )}
    </Screen>
  );
}
