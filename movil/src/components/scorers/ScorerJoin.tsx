/**
 * El link para anotar (`/anotar/<código>`, ScorerJoinPage de la web, con su misma lógica: src/components/scorers/logic.ts
 * y join.ts): a qué torneo lleva (nombre, deporte y logo, también sin cuenta) y «Entrar para anotar». Sin sesión manda a
 * crear la cuenta o a entrar (con la vuelta: `next` = /anotar/<código>?entrar=1) y deja la marca de que tocó el botón
 * (rememberScorerIntent). Al volver con la sesión (con ?entrar=1, o en esta misma pantalla si la cuenta llegó mientras
 * estaba abierta) entra solo una vez si encuentra la marca; sin ella, se ve la tarjeta: un link que llega de otro lado
 * no mete a nadie en una liga sin un toque. Quien ya puede anotar (dueño, admin o anotador) va directo al torneo.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { CalendarClock, ClipboardPen, Link2Off, LogIn, Trophy, UserPlus } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { getScorerLinkPreview, joinAsScorer, normalizeScorerCode, type ScorerLinkInfo, type ScorerLinkPreview } from '@mm/lib/data/scorers';
import { useLogo } from '@mm/lib/logos';
import { sportMeta } from '@mm/sports/registry';
import { leagueTypeLine } from '@mm/components/screens/leagueTypeLine';
import { autoEnterStep, deadLinkText, expiryDay, rememberScorerIntent, scorerJoinNext, scorerReach, scorerReachForYou, takeScorerIntent } from '@mm/components/scorers/logic';
import { deadStatusOf, enterWithLink, scorerJoinLines, scorerJoinSub } from '@mm/components/scorers/join';
import { toast } from '@/components/feedback';
import { BackBar, Button, Card, Divider, LoadError, Loading, RowIcon, Txt } from '@/components/ui';
import { appRoute } from '@/lib/links';
import { SportColors, useColors } from '@/theme/theme';

/** A la pantalla de la app que le toca a la ruta del torneo (siempre /l/…), sin dejar /anotar atrás. */
const goTo = (path: string) => router.replace((appRoute(path) ?? path) as never);

/**
 * «Entrar para anotar» (a mano o solo al volver de entrar): joinAsScorer una vez y lo que sigue (enterWithLink): al
 * torneo con el aviso, el vacío del link que dejó de servir, o el error en palabras (la tarjeta sigue ahí).
 */
async function runEnter(code: string, info: ScorerLinkInfo, setBusy: (b: boolean) => void, onDead: (p: ScorerLinkPreview) => void) {
  setBusy(true);
  try {
    const out = await enterWithLink(code, info, joinAsScorer);
    if (out.kind === 'go') {
      if (out.toast) toast(out.toast);
      goTo(out.path);
    } else if (out.kind === 'dead') {
      onDead(out.preview);
    } else {
      toast(out.message, 'error');
    }
  } finally {
    setBusy(false);
  }
}

export function ScorerJoinScreen({ code: raw, wantsEnter }: { code: string; wantsEnter: boolean }) {
  const code = normalizeScorerCode(raw);
  const auth = useAuth();
  const uid = auth.user?.uid ?? null;
  const [attempt, setAttempt] = useState(0);
  const key = `${code}:${uid ?? '-'}:${attempt}`;
  // Lo que respondió la vista previa de este código, con esta cuenta, en este intento (lo de antes no cuenta: carga).
  const [result, setResult] = useState<{ key: string; preview?: ScorerLinkPreview; error?: Error } | null>(null);
  // El link dejó de servir mientras miraba (o no sirve para esta cuenta): su vacío.
  const [dead, setDead] = useState<{ key: string; preview: ScorerLinkPreview } | null>(null);
  const [busy, setBusy] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);
  // Abrió la pantalla sin cuenta: si la cuenta llega aquí mismo (volvió de entrar), es como volver con ?entrar=1.
  const signedOutHere = useRef(false);

  useEffect(() => {
    if (auth.loading) return;
    if (!uid) signedOutHere.current = true;
    let alive = true;
    const k = `${code}:${uid ?? '-'}:${attempt}`;
    getScorerLinkPreview(code)
      .then((p) => {
        if (!alive) return;
        setResult({ key: k, preview: p });
        // Volvió de entrar o de crear la cuenta: entra solo si tocó el botón en este teléfono; si no, se quita
        // ?entrar=1 y queda la tarjeta con «Entrar para anotar». La marca sirve una vez.
        const returning = !!uid && (wantsEnter || signedOutHere.current);
        if (!returning || !p || p.status !== 'ok') return;
        signedOutHere.current = false;
        const step = autoEnterStep(p, takeScorerIntent(code));
        if (step === 'skip') return; // ya anota: va directo al torneo
        // Entra solo: al terminar se va al torneo (o se queda la tarjeta con el aviso, ya sin la marca).
        if (step === 'enter') void runEnter(code, p, setAutoBusy, (d) => setDead({ key: k, preview: d }));
        else if (wantsEnter) router.setParams({ entrar: undefined });
      })
      .catch((e: unknown) => {
        console.warn('[anotar]', e);
        if (alive) setResult({ key: k, error: e instanceof Error ? e : new Error(String(e)) });
      });
    return () => {
      alive = false;
    };
  }, [code, uid, auth.loading, attempt, wantsEnter]);

  const mine = result?.key === key ? result : null;
  const deadHere = dead?.key === key ? dead : null;
  const preview = deadHere ? deadHere.preview : mine?.preview;
  const info = preview && preview.status === 'ok' ? preview : null;
  const skip = !!uid && !!info?.canScore;

  // Ya anota (dueño, admin o anotador): directo al torneo.
  useEffect(() => {
    if (skip && info) goTo(info.path);
  }, [skip, info]);

  if (auth.loading || (!mine && !deadHere)) return <Loading />;
  if (mine?.error && preview === undefined) {
    return (
      <View style={{ gap: 16 }}>
        <BackBar label="Ligas" fallback="/ligas" />
        <LoadError error={mine.error} onRetry={() => setAttempt((n) => n + 1)} />
      </View>
    );
  }
  if (!info) return <DeadLink preview={preview ?? null} />;
  if (skip) return <Loading />;
  if (autoBusy) return <Loading label="Entrando para anotar…" />;
  return (
    <SportColors sport={info.sport}>
      <JoinCard code={code} info={info} signedIn={!!uid} busy={busy} onEnter={() => void runEnter(code, info, setBusy, (d) => setDead({ key, preview: d }))} />
    </SportColors>
  );
}

/** El link no sirve (o no sirve para esta cuenta, o hubo muchos intentos): qué pasó y «Ver ligas». */
function DeadLink({ preview }: { preview: ScorerLinkPreview }) {
  const c = useColors();
  const dead = deadLinkText(deadStatusOf(preview));
  return (
    <View style={{ gap: 16 }}>
      <BackBar label="Ligas" fallback="/ligas" />
      <Card style={{ alignItems: 'center', gap: 8, paddingTop: 28 }}>
        <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Link2Off size={28} color={c.accent} />
        </View>
        <Txt variant="cardTitle" style={{ textAlign: 'center', marginTop: 8 }}>
          {dead.title}
        </Txt>
        <Txt tone="muted" style={{ textAlign: 'center' }}>
          {dead.body}
        </Txt>
        <View style={{ alignSelf: 'stretch', marginTop: 16 }}>
          <Button size="xl" full onPress={() => router.navigate('/ligas')}>
            Ver ligas
          </Button>
        </View>
      </Card>
    </View>
  );
}

/** El logo de la liga si tiene (se ve también sin cuenta); si no, el deporte en su cuadro (96 px). */
function HeroArt({ logoPath, sport }: { logoPath: string | null; sport: string }) {
  const c = useColors();
  const { url, pending } = useLogo(logoPath);
  const box = { width: 96, height: 96, borderRadius: 24 };
  if (url) return <Image source={{ uri: url }} accessibilityIgnoresInvertColors contentFit="cover" style={[box, { backgroundColor: c.surface2 }]} />;
  const Icon = sportMeta(sport)?.icon ?? ClipboardPen;
  return <View style={[box, { backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }]}>{!pending && <Icon size={44} color={c.accent} />}</View>;
}

const LINE_ICONS: Record<'que' | 'donde' | 'hasta', (color: string) => ReactNode> = {
  que: (color) => <ClipboardPen size={20} color={color} />,
  donde: (color) => <Trophy size={20} color={color} />,
  hasta: (color) => <CalendarClock size={20} color={color} />,
};

/** La tarjeta del link que sirve: el torneo, qué haces, dónde y hasta cuándo, y el botón (o crear la cuenta y entrar). */
function JoinCard({ code, info, signedIn, busy, onEnter }: { code: string; info: ScorerLinkInfo; signedIn: boolean; busy: boolean; onEnter: () => void }) {
  const c = useColors();
  const reach = scorerReachForYou(scorerReach({ id: info.leagueId, kind: info.kind, sport: info.sport }));
  const lines = scorerJoinLines(reach, expiryDay(info.expiresAt));
  const sub = scorerJoinSub(info);
  // La vuelta de /login (como la web): entrar solo con el link, una vez, si tocó el botón aquí.
  const next = decodeURIComponent(scorerJoinNext(code));
  const login = (signup: boolean) => {
    rememberScorerIntent(code);
    router.push({ pathname: '/login', params: signup ? { modo: 'registro', next } : { next } });
  };

  return (
    <View style={{ gap: 24 }}>
      <BackBar label="Ligas" fallback="/ligas" />
      <View style={{ alignItems: 'center', gap: 4 }}>
        <HeroArt logoPath={info.logoPath} sport={info.sport} />
        <Txt variant="meta" tone="muted" style={{ marginTop: 16 }}>
          Te invitaron a anotar
        </Txt>
        <Txt variant="title" style={{ textAlign: 'center' }}>
          {info.name}
        </Txt>
        {!!sub && (
          <Txt variant="bodyStrong" tone="fg2" style={{ textAlign: 'center' }}>
            {sub}
          </Txt>
        )}
        <Txt variant="meta" tone="muted">
          {leagueTypeLine(info.sport, info.kind, info.visibility)}
        </Txt>
      </View>

      <Card padded={false}>
        {lines.map((l, i) => (
          <View key={l.key}>
            {i > 0 && <Divider inset={68} />}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingVertical: 10, paddingLeft: 16, paddingRight: 18 }}>
              <RowIcon>{LINE_ICONS[l.key](c.accent)}</RowIcon>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt variant="meta" tone="muted" style={{ fontSize: 13 }}>
                  {l.label}
                </Txt>
                <Txt variant="bodyStrong">{l.value}</Txt>
              </View>
            </View>
          </View>
        ))}
      </Card>

      {signedIn ? (
        <Button variant="primary" size="xl" full loading={busy} onPress={onEnter} icon={<ClipboardPen size={20} color={c.accentFg} />}>
          Entrar para anotar
        </Button>
      ) : (
        <View style={{ gap: 10 }}>
          <Button variant="primary" size="xl" full icon={<UserPlus size={20} color={c.accentFg} />} onPress={() => login(true)}>
            Crear cuenta y entrar a anotar
          </Button>
          <Button size="xl" full icon={<LogIn size={20} color={c.fg} />} onPress={() => login(false)}>
            Ya tengo cuenta
          </Button>
        </View>
      )}
    </View>
  );
}
