/**
 * Entrar a un equipo con su link o QR (`/equipos/unirse/<código>`, JoinSquadPage de la web, con su misma lógica:
 * squadJoinState): «‹ Equipos», el logo, «Te invitaron al equipo», «{nombre} [TAG]», el deporte y cuántos son. Sin
 * cuenta: crear cuenta o entrar. Con cuenta: «Unirme al equipo» → la página del equipo. Si ya estás: «Ya estás en este
 * equipo» con el botón. Un código malo: «Esta invitación no sirve».
 */
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Check, Ticket, UserPlus, Users } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { joinSquad, previewSquad, squadErrorText, useMySquads, type SquadLite } from '@mm/lib/data/squads';
import { sportMeta } from '@mm/sports/registry';
import { membersText, squadJoinState, squadTitle } from '@mm/components/squads/logic';
import { SignInCard } from '../esports/EsportsIndex';
import { toast } from '../feedback';
import { BackBar, Button, Card, Empty, Loading, Txt } from '../ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { openSquad, SquadLogo, useSquadColors } from './bits';

export function JoinSquadScreen({ code }: { code: string }) {
  const auth = useAuth();
  // Lo leído de cada código (lo de otro código no cuenta: leyendo). null = el código no sirve.
  const [result, setResult] = useState<{ code: string; preview: SquadLite | null } | null>(null);
  useEffect(() => {
    let alive = true;
    previewSquad(code)
      .then((p) => alive && setResult({ code, preview: p ?? null }))
      .catch((e: unknown) => {
        console.warn('[equipo por código]', e);
        if (alive) setResult({ code, preview: null });
      });
    return () => {
      alive = false;
    };
  }, [code]);
  const preview = result?.code === code ? result.preview : undefined;
  return <JoinSquadView code={code} preview={auth.loading ? undefined : preview} uid={auth.user?.uid ?? null} />;
}

function JoinSquadView({ code, preview, uid }: { code: string; preview: SquadLite | null | undefined; uid: string | null }) {
  const c = useColors();
  const mine = useMySquads();
  const [busy, setBusy] = useState(false);
  const mySquadIds = useMemo(() => new Set(mine.data.map((s) => s.id)), [mine.data]);
  const state = squadJoinState({ preview, signedIn: !!uid, loading: !!uid && mine.loading && !mine.data.length, mySquadIds });
  const tint = useSquadColors(preview?.color ?? null, preview?.sport ?? 'football');

  if (state === 'loading') return <Loading label="Buscando la invitación" />;

  if (state === 'dead' || !preview) {
    return (
      <View style={{ gap: 16 }}>
        <BackBar label="Equipos" fallback="/equipos" />
        <Empty
          icon={<Ticket size={28} color={c.accent} />}
          title="Esta invitación no sirve"
          text="El código no existe o lo cambiaron. Pídele el link nuevo al capitán del equipo."
          action={<Button onPress={() => router.navigate('/equipos' as Href)}>Ver equipos</Button>}
        />
      </View>
    );
  }

  const meta = sportMeta(preview.sport);
  const Icon = meta?.icon;

  async function join() {
    if (!preview || busy) return;
    setBusy(true);
    try {
      const r = await joinSquad(code);
      toast(`¡Bienvenido a ${preview.name}!`);
      openSquad(r.squadId, {}, true);
    } catch (e) {
      console.error(e);
      toast(squadErrorText(e), 'error');
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 24 }}>
      <BackBar label="Equipos" fallback="/equipos" />
      <View style={{ alignItems: 'center', gap: 4 }}>
        <SquadLogo squad={preview} size={96} />
        <Txt variant="meta" tone="muted" style={{ marginTop: 16 }}>
          {state === 'member' ? 'Tu equipo' : 'Te invitaron al equipo'}
        </Txt>
        <Txt variant="title" style={{ textAlign: 'center' }}>
          {squadTitle(preview)}
        </Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {Icon && <Icon size={20} color={tint.accent} />}
          <Txt tone="fg2" style={{ fontFamily: font.semibold }}>
            {[meta?.label ?? 'Otro deporte', preview.city].filter(Boolean).join(' · ')}
          </Txt>
        </View>
        <Txt variant="meta" tone="muted">
          {membersText(preview.members)}
        </Txt>
      </View>

      {state === 'signin' && (
        <SignInCard
          icon={<Users size={28} color={c.accent} />}
          title="Entra para unirte al equipo"
          text="Con tu cuenta entras a la plantilla, ves el muro del equipo y juegas sus ligas."
          createLabel="Crear cuenta y unirme"
          loginLabel="Ya tengo cuenta"
        />
      )}

      {state === 'member' && (
        <Card style={{ alignItems: 'center', gap: 8, paddingTop: 28 }}>
          <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Check size={28} color={c.accent} />
          </View>
          <Txt variant="cardTitle" style={{ textAlign: 'center', marginTop: 8 }}>
            Ya estás en este equipo
          </Txt>
          <Txt tone="muted" style={{ textAlign: 'center' }}>
            No hace falta el código: entra directo a la página del equipo.
          </Txt>
          <View style={{ alignSelf: 'stretch', marginTop: 16 }}>
            <Button variant="primary" size="xl" full onPress={() => openSquad(preview.id)}>
              Ir al equipo
            </Button>
          </View>
        </Card>
      )}

      {state === 'ready' && (
        <Button variant="primary" size="xl" full loading={busy} onPress={join} icon={<UserPlus size={20} color={c.accentFg} />}>
          Unirme al equipo
        </Button>
      )}
    </View>
  );
}
