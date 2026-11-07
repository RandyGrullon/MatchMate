/**
 * «Compartir el resultado» de un partido (ShareResultCard.tsx de la web, con su misma lógica): el texto (título, ronda y
 * cancha, quién ganó y con qué marcador, y el link), «Compartir imagen» (la misma imagen de la web, con la marca y el
 * color del deporte: share/cards.ts la arma y aquí se pinta con react-native-svg), «WhatsApp» y «Texto» (el menú del
 * teléfono). Abajo, «Publicar en Social» (el partido como publicación en la liga) para los miembros de una liga sin
 * menores con el partido terminado.
 */
import { useContext, useRef, useState } from 'react';
import { Linking, Platform, Share, View } from 'react-native';
import Svg, { SvgXml } from 'react-native-svg';
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { AlertTriangle, Copy, Download, Link2, MessageCircle, Share2 } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import type { Match } from '@mm/lib/data/matches';
import { usePlayers } from '@mm/lib/data/players';
import { LeagueContext } from '@mm/lib/league';
import { useNow } from '@mm/lib/useNow';
import { leagueSport } from '@mm/sports/registry';
import type { Side } from '@mm/sports/types';
import { matchShareText, whatsappShareUrl } from '@mm/components/match/format';
import { MATCH_SHAREABLE, leagueShareTarget, matchPostText, matchPreviewParts, matchSharePick } from '@mm/components/posts/shareGame';
import { downloadFile } from '@mm/components/share/actions';
import { buildScene, type CardFrame, type ShareCard, type ShareResultSide } from '@mm/components/share/cards';
import { shareImageOf } from '@mm/components/share/frame';
import { resultShare } from '@mm/components/share/match';
import { sceneToSvg } from '@mm/components/share/svg';
import { PublishButton, PublishGameSheet } from '../social/ShareToSocial';
import { toast } from '../feedback';
import { Button, Sheet, Txt } from '../ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** La imagen sale al doble (como la web: 1080 px de ancho). */
const SCALE = 2;
/** En la vista previa web de la app no hay menú para archivos: se descarga (como la web sin menú). */
const CAN_SHARE_FILES = Platform.OS !== 'web';

type Step = 'card' | 'image' | 'publish';

/**
 * La hoja «Compartir el resultado» (se monta al abrirla, como en la web). `subtitle`: el título del partido.
 * `sideExtra`: el color de cada equipo en la imagen. `mySide`: el lado de quien mira si jugó (su texto sugerido es
 * «¡Ganamos…!»).
 */
export function ShareResultSheet({
  onClose,
  match,
  title,
  subtitle,
  roundWord,
  url,
  sideExtra,
  mySide,
}: {
  onClose: () => void;
  match: Match;
  /** Nombre de la liga o de la noche. */
  title?: string;
  subtitle?: string;
  roundWord?: string;
  url?: string;
  sideExtra?: (side: Side) => Pick<ShareResultSide, 'dot' | 'sub'> | undefined;
  mySide?: Side | null;
}) {
  const c = useColors();
  const ctx = useContext(LeagueContext);
  const signedIn = !!useAuth().user;
  const now = useNow().getTime();
  const [step, setStep] = useState<Step>('card');
  const [busy, setBusy] = useState(false);
  const text = matchShareText({ match, title, roundWord, url, now });

  // «Publicar en Social»: solo miembros de una liga sin menores y con el partido terminado. Si quien mira no lo jugó,
  // va con el primer jugador con cuenta del lado que ganó (la base pide uno que lo jugó). Sin cuenta no hay hoja.
  const target = signedIn ? leagueShareTarget(ctx) : null;
  const mine = !!(mySide && ctx?.myPlayerId);
  const players = usePlayers(target && !mine && MATCH_SHAREABLE.includes(match.status) ? ctx?.lid : undefined);
  const pick = target
    ? matchSharePick(match, {
        mySide,
        myPlayerId: ctx?.myPlayerId,
        hasAccount: (id) => players.data.some((p) => p.id === id && !!p.uid && !p.isMinor),
      })
    : null;

  // En el teléfono siempre está el menú; en la vista previa web, solo si el navegador lo tiene (si no, se copia).
  const canShare = Platform.OS !== 'web' || (typeof navigator !== 'undefined' && 'share' in navigator);
  async function shareText() {
    setBusy(true);
    try {
      try {
        await Share.share({ message: text });
        return;
      } catch {
        // sin menú: se copia
      }
      await Clipboard.setStringAsync(text);
      toast('Copiado');
    } catch {
      toast('No se pudo copiar', 'error');
    } finally {
      setBusy(false);
    }
  }

  const card = resultShare(match, { title: title || ctx?.league.name || 'Resultado', roundWord, tz: ctx?.league.tz, url, sideExtra, now });
  const image = shareImageOf(card, { sport: ctx ? leagueSport(ctx.league) : null, url, tz: ctx?.league.tz, now: new Date(now) });

  if (step === 'publish' && pick) {
    return (
      <PublishGameSheet
        open
        onClose={() => setStep('card')}
        league={target}
        game={pick.game}
        text={matchPostText(match, pick.side, pick.mine, target?.sport)}
        preview={<MatchPreview match={match} side={pick.side} />}
      />
    );
  }
  if (step === 'image') {
    return <ShareImageSheet onClose={() => setStep('card')} card={card} frame={image.frame} url={url} filename={image.filename} caption={image.caption} />;
  }

  return (
    <Sheet open onClose={onClose} title="Compartir el resultado" subtitle={subtitle}>
      <View style={{ borderRadius: 16, backgroundColor: c.surface2, paddingHorizontal: 16, paddingVertical: 12 }}>
        <Txt selectable style={{ fontSize: 15, lineHeight: 22 }}>
          {text}
        </Txt>
      </View>
      <Button variant="primary" size="lg" full icon={<Share2 size={20} color={c.accentFg} />} onPress={() => setStep('image')}>
        Compartir imagen
      </Button>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button size="lg" full icon={<MessageCircle size={20} color={c.fg} />} onPress={() => void Linking.openURL(whatsappShareUrl(text)).catch(() => undefined)}>
            WhatsApp
          </Button>
        </View>
        <View style={{ flex: 1 }}>
          <Button
            size="lg"
            full
            loading={busy}
            icon={canShare ? <Share2 size={20} color={c.fg} /> : <Copy size={20} color={c.fg} />}
            accessibilityLabel={canShare ? 'Compartir como texto' : 'Copiar el texto'}
            onPress={() => void shareText()}
          >
            {canShare ? 'Texto' : 'Copiar'}
          </Button>
        </View>
      </View>
      {pick && <PublishButton league={target} game={pick.game} onPress={() => setStep('publish')} />}
    </Sheet>
  );
}

/** El partido en la hoja para publicarlo: los dos lados (primero el del jugador) y el marcador desde su lado. */
function MatchPreview({ match, side }: { match: Match; side: Side }) {
  const c = useColors();
  const { mine, other, score } = matchPreviewParts(match, side);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, paddingHorizontal: 14, paddingVertical: 12 }}>
      <Txt variant="meta" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="meta" style={{ fontFamily: font.semibold }}>
          {mine}
        </Txt>
        <Txt variant="meta" tone="muted">
          {' vs '}
        </Txt>
        <Txt variant="meta" style={{ fontFamily: font.semibold }}>
          {other}
        </Txt>
      </Txt>
      {!!score && <Txt style={{ fontFamily: font.bold, fontSize: 20, lineHeight: 25, fontVariant: ['tabular-nums'] }}>{score}</Txt>}
    </View>
  );
}

/** El PNG (base64) de lo que pinta el SVG, al tamaño que se pide. */
function svgPng(svg: Svg, width: number, height: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('La imagen tardó demasiado.')), 10_000);
    try {
      svg.toDataURL(
        (b64) => {
          clearTimeout(timer);
          resolve(b64);
        },
        { width, height },
      );
    } catch (e) {
      clearTimeout(timer);
      reject(e);
    }
  });
}

/** Los bytes de un PNG en base64 (vista previa web: para descargarlo). */
function pngBlob(b64: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: 'image/png' });
}

/**
 * La imagen para compartir (ShareImageModal de la web): la vista previa, «Compartir imagen» (el menú del teléfono con la
 * imagen; en el iPhone va con el texto y el link) y «Copiar link». En la vista previa web de la app, como la web sin
 * menú para archivos: «Descargar imagen».
 */
export function ShareImageSheet({
  onClose,
  card,
  frame,
  url,
  filename,
  caption,
}: {
  onClose: () => void;
  card: ShareCard;
  frame: CardFrame;
  url?: string;
  filename: string;
  caption: string;
}) {
  const c = useColors();
  const svg = useRef<Svg>(null);
  const [busy, setBusy] = useState<'compartir' | 'copiar' | null>(null);
  // Si no se pudo sacar la imagen (o compartirla), lo dice y queda el link.
  const [failed, setFailed] = useState(false);
  const scene = buildScene(card, frame);
  // Sin aria-hidden: en la vista previa web React lo avisa como atributo inválido dentro del SVG.
  const xml = sceneToSvg(scene).replace(/ aria-hidden="true"/g, '');

  async function share() {
    if (!svg.current || busy) return;
    setBusy('compartir');
    try {
      const b64 = await svgPng(svg.current, scene.width * SCALE, scene.height * SCALE);
      if (!CAN_SHARE_FILES) {
        downloadFile(pngBlob(b64), filename);
        toast('Imagen descargada');
        return;
      }
      const file = new File(Paths.cache, filename);
      if (file.exists) file.delete();
      file.create();
      await file.write(b64, { encoding: 'base64' });
      if (Platform.OS === 'ios') {
        // El iPhone manda la imagen con el texto (y el link dentro).
        const r = await Share.share({ url: file.uri, message: caption });
        if (r.action === Share.sharedAction) onClose();
        return;
      }
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sin menú para compartir.');
      await Sharing.shareAsync(file.uri, { mimeType: 'image/png', dialogTitle: card.title });
      onClose();
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    if (!url) return;
    setBusy('copiar');
    try {
      await Clipboard.setStringAsync(url);
      toast('Link copiado');
    } catch {
      toast('No se pudo copiar el link', 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Compartir"
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {!!url && (
            <View style={{ flex: 1 }}>
              <Button size="lg" full icon={<Link2 size={18} color={c.fg} />} loading={busy === 'copiar'} disabled={busy === 'compartir'} onPress={() => void copy()}>
                Copiar link
              </Button>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Button
              variant="primary"
              size="lg"
              full
              disabled={failed}
              loading={busy === 'compartir'}
              icon={CAN_SHARE_FILES ? <Share2 size={18} color={c.accentFg} /> : <Download size={18} color={c.accentFg} />}
              onPress={() => void share()}
            >
              {CAN_SHARE_FILES ? 'Compartir imagen' : 'Descargar imagen'}
            </Button>
          </View>
        </View>
      }
    >
      {failed ? (
        <View style={{ alignItems: 'center', gap: 8, borderRadius: 14, backgroundColor: c.surface2, paddingHorizontal: 16, paddingVertical: 32 }}>
          <AlertTriangle size={24} color={c.warn} />
          <Txt variant="meta" style={{ textAlign: 'center' }}>
            No se pudo hacer la imagen en este teléfono.
          </Txt>
          {!!url && (
            <Txt tone="muted" style={{ fontSize: 12, textAlign: 'center' }}>
              Puedes mandar el link.
            </Txt>
          )}
        </View>
      ) : (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Imagen para compartir: ${card.title}`}
          style={{ width: '100%', aspectRatio: scene.width / scene.height, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: c.line }}
        >
          <SvgXml xml={xml} override={{ ref: svg, width: '100%', height: '100%' }} />
        </View>
      )}
      <Txt tone="muted" style={{ fontSize: 12 }}>
        {CAN_SHARE_FILES
          ? Platform.OS === 'ios'
            ? 'Elige WhatsApp (o donde quieras) en el menú del teléfono. El link va con la imagen.'
            : 'Elige WhatsApp (o donde quieras) en el menú del teléfono.'
          : 'Descarga la imagen y mándala por WhatsApp junto con el link.'}
      </Txt>
    </Sheet>
  );
}
