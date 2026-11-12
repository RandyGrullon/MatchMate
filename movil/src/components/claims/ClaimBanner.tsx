import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Clock, Search, UserX, X } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { cancelClaim, claimErrorText, useMyClaim } from '@mm/lib/data/claims';
import { usePlayers } from '@mm/lib/data/players';
import { useLeagueCtx } from '@mm/lib/league';
import { useNow } from '@mm/lib/useNow';
import { leagueSport } from '@mm/sports/registry';
import { peopleWord } from '@mm/components/league/logic';
import { CLAIM_CANCELLED_TEXT, bannerCopy, claimableFree, loadDismissed, pickConfirmText, saveDismissed, withDismissed } from '@mm/components/claims/banner';
import { usePlayerHistory, useRefreshWhilePending } from '@mm/components/claims/data';
import { bannerState } from '@mm/components/claims/logic';
import { toast } from '@/components/feedback';
import { WhoAreYouList, type WhoChoice } from '@/components/league/WhoAreYou';
import { Button, Card, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { ClaimRequestSheet } from './ClaimRequestSheet';

/** Lo que tarda en irse una hoja antes de abrir la otra (dos hojas a la vez no se ven en el iPhone). */
const SHEET_CLOSE_MS = 400;

/**
 * Arriba en el inicio de la liga, para los miembros (ClaimBanner de la web, con su misma lógica): «Mi reclamo»
 * (pendiente, con «Cancelar pedido»; o rechazado, con la nota del admin) o, si su jugador todavía no tiene nada y hay
 * jugadores sin cuenta, «¿Ya jugabas en esta liga? Busca tu nombre» (elige uno de la lista y lo pide; el admin lo
 * aprueba). Lo que cierra se guarda en el teléfono. Va dentro de LeagueScope.
 */
export function ClaimBanner() {
  const c = useColors();
  const { lid, member, myPlayerId, league } = useLeagueCtx();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const claim = useMyClaim(member ? lid : null, uid);
  const players = usePlayers(member ? lid : undefined);
  const own = usePlayerHistory(member ? lid : null, myPlayerId);
  const now = useNow().getTime();
  const [dismissed, setDismissed] = useState(loadDismissed);
  const [picking, setPicking] = useState(false);
  const [choice, setChoice] = useState<WhoChoice>(null);
  const [asking, setAsking] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const people = peopleWord(leagueSport(league));
  const free = claimableFree(players.data, myPlayerId);
  const state = bannerState({
    claim: claim.data,
    ownHistory: own.data,
    freeCount: free.length,
    dismissed: (k) => dismissed.has(`${lid}:${k}`),
    now,
  });
  useRefreshWhilePending(state.kind === 'pending');

  const copy = bannerCopy(state, people);
  if (!member || !uid || !copy) return null;

  const dismiss = (k: string) => {
    const next = withDismissed(dismissed, lid, k);
    saveDismissed(next);
    setDismissed(next);
  };

  const picked = free.find((p) => p.id === choice) ?? null;
  const confirmPick = () => {
    setPicking(false);
    if (picked) {
      const p = { id: picked.id, name: picked.name };
      setTimeout(() => setAsking(p), SHEET_CLOSE_MS);
    } else dismiss('buscar');
  };
  const picker = (
    <>
      <Sheet
        open={picking}
        onClose={() => setPicking(false)}
        title="Busca tu nombre"
        footer={
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button size="lg" onPress={() => setPicking(false)}>
              Cancelar
            </Button>
            <View style={{ flex: 1 }}>
              <Button variant="primary" size="lg" full onPress={confirmPick}>
                {pickConfirmText(picked)}
              </Button>
            </View>
          </View>
        }
      >
        <WhoAreYouList players={free} value={choice} onChange={setChoice} people={people} />
      </Sheet>
      {asking && <ClaimRequestSheet player={asking} onClose={() => setAsking(null)} />}
    </>
  );

  if (state.kind === 'pending') {
    const cancel = async () => {
      setBusy(true);
      try {
        await cancelClaim(lid, state.claim.id);
        toast(CLAIM_CANCELLED_TEXT);
      } catch (e) {
        toast(claimErrorText(e), 'error');
      } finally {
        setBusy(false);
      }
    };
    return (
      <Card style={{ padding: 16, gap: 12, borderWidth: 1, borderColor: `${c.warn}66` }}>
        <BannerText icon={<Clock size={20} color={c.warn} />} iconBg={c.warnSoft} title={copy.title} text={copy.text} />
        <Button loading={busy} onPress={() => void cancel()} style={{ alignSelf: 'flex-start' }}>
          Cancelar pedido
        </Button>
      </Card>
    );
  }

  if (state.kind === 'rejected') {
    const rejected = state.claim;
    return (
      <Card style={{ padding: 16, paddingRight: 48, gap: 12 }}>
        <BannerText icon={<UserX size={20} color={c.danger} />} iconBg={c.dangerSoft} title={copy.title} text={copy.text} />
        {free.length > 0 && (
          <Button icon={<Search size={16} color={c.fg} />} onPress={() => setPicking(true)} style={{ alignSelf: 'flex-start' }}>
            Buscar otra vez
          </Button>
        )}
        <DismissButton onPress={() => dismiss(`rechazo:${rejected.id}`)} />
        {picker}
      </Card>
    );
  }

  return (
    <Card style={{ padding: 16, paddingRight: 48, gap: 12 }}>
      <BannerText icon={<Search size={20} color={c.accent} />} iconBg={c.accentSoft} title={copy.title} text={copy.text} />
      <Button variant="primary" icon={<Search size={16} color={c.accentFg} />} onPress={() => setPicking(true)} style={{ alignSelf: 'flex-start' }}>
        Buscar mi nombre
      </Button>
      <DismissButton onPress={() => dismiss('buscar')} />
      {picker}
    </Card>
  );
}

/** El ícono en su círculo, el título y el texto de la tarjeta. */
function BannerText({ icon, iconBg, title, text }: { icon: ReactNode; iconBg: string; title: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: iconBg }}>
        {icon}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt style={{ fontSize: 14, fontFamily: font.semibold }}>{title}</Txt>
        <Txt tone="muted" style={{ fontSize: 14 }}>
          {text}
        </Txt>
      </View>
    </View>
  );
}

/** La X de arriba a la derecha (lo cerrado se recuerda en este teléfono). */
function DismissButton({ onPress }: { onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Cerrar"
      onPress={onPress}
      style={({ pressed }) => ({ position: 'absolute', top: 8, right: 8, width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? c.surface2 : 'transparent' })}
    >
      <X size={16} color={c.muted} />
    </Pressable>
  );
}
