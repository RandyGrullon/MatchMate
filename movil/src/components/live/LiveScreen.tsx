/**
 * En vivo (`/l/<liga>/vivo`, LiveStreamPage de la web, con su misma lógica: src/components/live/logic.ts y
 * src/lib/data/streams.ts): la transmisión elegida (`?s=<id>`, si no la primera) dentro de la app cuando la plataforma
 * lo deja (YouTube, Twitch, Kick, Facebook), si no un botón grande «Ver en Instagram» que la abre afuera. Debajo, el
 * título, «Compartir» y, para quien puede, «Terminar transmisión»; las otras transmisiones de la liga; y para quien
 * transmite (admins y anotadores, con la liga en vivo activada), «Transmitir en vivo». Sin nada en vivo: «No hay nada en
 * vivo ahora» (al admin de una liga sin las transmisiones activadas, dónde activarlas). Se ve sin cuenta en una liga
 * pública.
 */
import { useState } from 'react';
import { Linking, Pressable, Share, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { CircleStop, ExternalLink, Radio, Share2 } from 'lucide-react-native';
import { endStream, streamErrorText, streamShareUrl, useLeagueStreams, type LiveStream } from '@mm/lib/data/streams';
import { useLeagueCtx } from '@mm/lib/league';
import { relativeTime } from '@mm/lib/notifications';
import { shareOrigin } from '@mm/lib/origin';
import { PLATFORM_LABEL, embedUrl } from '@mm/lib/streams';
import { useNow } from '@mm/lib/useNow';
import { activateLiveText, canStartStream, endStreamConfirm, noLiveText, notEmbeddableText, pickStream, streamLine, streamShareText, streamTitle } from '@mm/components/live/logic';
import { confirmAsync, toast } from '@/components/feedback';
import { LogoSpinner } from '@/components/Logo';
import { Button, Card, Divider, ListRow, LoadError, RowIcon, SectionHeader, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { useIsPro } from '@mm/lib/useMode';
import { TITLE_PRO } from '@/components/home/proLook';
import { PlatformMark } from './PlatformMark';
import { StartStreamSheet } from './StartStreamSheet';
import { StreamPlayer, playerHost } from './StreamPlayer';

export function LiveScreen({ wanted }: { wanted: string | null }) {
  const c = useColors();
  const ctx = useLeagueCtx();
  const { lid, league, isAdmin } = ctx;
  const streams = useLeagueStreams(lid);
  const [starting, setStarting] = useState(false);
  const can = canStartStream(ctx);
  const { current, others } = pickStream(streams.data, wanted);
  // Pro: el botón de 48 y el título un poco más chico (LiveStreamPage de la web).
  const pro = useIsPro();

  const startButton = can && (
    <Button variant={current ? 'quiet' : 'primary'} size={pro ? 'lg' : 'xl'} full icon={<Radio size={20} color={current ? c.fg : c.accentFg} />} onPress={() => setStarting(true)}>
      Transmitir en vivo
    </Button>
  );

  let body;
  if (streams.error && !streams.data.length) {
    body = <LoadError error={streams.error} />;
  } else if (streams.loading && !streams.data.length) {
    body = (
      <View style={[styles.video, { backgroundColor: c.surface2 }]}>
        <LogoSpinner size={36} label="Cargando lo que está en vivo" />
      </View>
    );
  } else if (!current) {
    body = (
      <Card style={{ alignItems: 'center', paddingTop: 28, paddingBottom: 24, paddingHorizontal: 20 }}>
        <View style={[styles.emptyIcon, { backgroundColor: c.surface2 }]}>
          <Radio size={28} color={c.muted} />
        </View>
        <Txt variant="section" style={{ marginTop: 16, textAlign: 'center' }}>
          No hay nada en vivo ahora
        </Txt>
        <Txt variant="meta" tone="muted" style={{ marginTop: 6, textAlign: 'center', maxWidth: 360 }}>
          {noLiveText(league)}
        </Txt>
        {startButton && <View style={{ marginTop: 20, alignSelf: 'stretch' }}>{startButton}</View>}
        {!league.liveEnabled && isAdmin && (
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push({ pathname: '/l/[lid]/ajustes', params: { lid } } as never)}
            style={{ marginTop: 16, minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 }}
          >
            <Txt variant="meta" tone="accent" style={{ fontFamily: font.semibold }}>
              {activateLiveText(league)}
            </Txt>
          </Pressable>
        )}
      </Card>
    );
  } else {
    body = (
      <>
        <StreamView stream={current} />
        {others.length > 0 && (
          <View style={{ gap: 10, marginTop: 14 }}>
            <SectionHeader title="También en vivo" />
            <Card padded={false}>
              {others.map((s, i) => (
                <View key={s.id}>
                  {i > 0 && <Divider inset={16} />}
                  <ListRow
                    icon={
                      <RowIcon>
                        <PlatformMark platform={s.platform} />
                      </RowIcon>
                    }
                    title={streamTitle(s)}
                    subtitle={streamLine(s)}
                    onPress={() => router.setParams({ s: s.id })}
                  />
                </View>
              ))}
            </Card>
          </View>
        )}
        {startButton && <View style={{ marginTop: 14 }}>{startButton}</View>}
      </>
    );
  }

  return (
    <>
      <View style={{ gap: 4 }}>
        <Txt variant="title" style={pro ? TITLE_PRO : undefined}>
          En vivo
        </Txt>
        <Txt variant="meta" tone="muted">
          {league.name}
        </Txt>
      </View>
      <View style={{ gap: 16 }}>{body}</View>
      {/* Una transmisión de la liga (sin partido); la de un partido o un evento se pone desde su «•••». */}
      {can && <StartStreamSheet lid={lid} open={starting} onClose={() => setStarting(false)} />}
    </>
  );
}

/**
 * La transmisión: el video dentro de la app (16:9) o el botón para abrirla en su plataforma; el título, la plataforma,
 * cuándo empezó y quién; «Compartir» y, para quien puede, «Terminar transmisión».
 */
function StreamView({ stream: s }: { stream: LiveStream }) {
  const c = useColors();
  const now = useNow(60_000).getTime();
  const [busy, setBusy] = useState<'compartir' | 'terminar' | null>(null);
  const platform = PLATFORM_LABEL[s.platform];
  const src = embedUrl(s.url, playerHost());
  const title = streamTitle(s);
  const started = Date.parse(s.startedAt);
  // Como el link de la web (target=_blank): se abre en la plataforma.
  const open = () => void Linking.openURL(s.url).catch(() => undefined);

  const share = async () => {
    setBusy('compartir');
    // Con el dominio de la app: es el link que abre la app en el teléfono de quien lo recibe.
    const link = streamShareUrl(s.leagueId, shareOrigin(null));
    try {
      await Share.share({ message: `${streamShareText(s)}\n${link}`, url: link });
    } catch {
      toast('No se pudo compartir.', 'error');
    } finally {
      setBusy(null);
    }
  };
  const end = async () => {
    if (!(await confirmAsync(endStreamConfirm(s.platform)))) return;
    setBusy('terminar');
    try {
      await endStream(s);
      toast('Transmisión terminada');
    } catch (e) {
      console.error(e);
      toast(streamErrorText(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const meta = [streamLine(s), Number.isFinite(started) ? `Empezó ${relativeTime(started, now)}` : null, s.startedBy?.name || null].filter(Boolean).join(' · ');
  return (
    <>
      {src ? (
        <StreamPlayer key={s.id} src={src} title={`${title} en ${platform}`} />
      ) : (
        <Card style={{ alignItems: 'center', paddingTop: 28, paddingBottom: 24, paddingHorizontal: 20 }}>
          <PlatformMark platform={s.platform} size={48} />
          <Txt variant="meta" tone="muted" style={{ marginTop: 12, textAlign: 'center', maxWidth: 360 }}>
            {notEmbeddableText(s.platform)}
          </Txt>
          <View style={{ marginTop: 20, alignSelf: 'stretch' }}>
            <Button variant="danger" size="xl" full icon={<ExternalLink size={20} color={c.onDanger} />} onPress={open}>
              {`Ver en ${platform}`}
            </Button>
          </View>
        </Card>
      )}

      <View style={{ paddingHorizontal: 4, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={[styles.dot, { backgroundColor: c.danger }]} />
          <Txt tone="danger" style={{ fontSize: 11, fontFamily: font.bold, letterSpacing: 0.9 }}>
            EN VIVO
          </Txt>
        </View>
        <Txt variant="cardTitle">{title}</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <PlatformMark platform={s.platform} size={16} />
          <Txt variant="meta" tone="muted" style={{ flex: 1, minWidth: 0 }}>
            {meta}
          </Txt>
        </View>
        {!!src && (
          <Pressable accessibilityRole="link" onPress={open} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 }}>
            <ExternalLink size={16} color={c.accent} />
            <Txt variant="meta" tone="accent" style={{ fontFamily: font.medium }}>{`Abrir en ${platform}`}</Txt>
          </Pressable>
        )}
      </View>

      <View style={{ gap: 10 }}>
        <Button variant="soft" size="lg" full icon={<Share2 size={20} color={c.accent} />} loading={busy === 'compartir'} onPress={() => void share()}>
          Compartir
        </Button>
        {s.canEnd && (
          <Button size="lg" full icon={<CircleStop size={20} color={c.danger} />} loading={busy === 'terminar'} onPress={() => void end()}>
            <Txt tone="danger" style={{ fontFamily: font.semibold }}>
              Terminar transmisión
            </Txt>
          </Button>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  video: { aspectRatio: 16 / 9, width: '100%', borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  emptyIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
