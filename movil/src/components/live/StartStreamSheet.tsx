/**
 * «Transmitir en vivo» (StartStreamSheet de la web, con su misma lógica: src/components/live/logic.ts y
 * src/lib/data/streams.ts): pegar el link (se reconoce la plataforma al momento; «Pegar» lee lo copiado), un título
 * opcional (de entrada, el del partido) y «Empezar». Ya en vivo: «Ya estás en vivo» con «Compartir link» (la página
 * En vivo de la liga) y «Ver». Avisa a los miembros y seguidores la base (start_stream). Cada vez que se abre empieza de
 * cero.
 */
import { useState } from 'react';
import { Share, View } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { ClipboardPaste, Eye, Radio, Share2 } from 'lucide-react-native';
import { STREAM_TITLE_MAX, startStream, streamErrorText, streamProblem, streamShareUrl, type LiveStream } from '@mm/lib/data/streams';
import { shareOrigin } from '@mm/lib/origin';
import { START_SHARE_ERROR, linkHint, ownStreamTitle, startedText, streamShareText } from '@mm/components/live/logic';
import { toast } from '@/components/feedback';
import { Button, ErrorNote, Field, Input, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { PlatformMark } from './PlatformMark';

export function StartStreamSheet(props: { lid: string; matchId?: string | null; eventId?: string | null; defaultTitle?: string | null; open: boolean; onClose: () => void }) {
  if (!props.open) return null;
  return <StartStreamDialog {...props} />;
}

function StartStreamDialog({
  lid,
  matchId,
  eventId,
  defaultTitle,
  onClose,
}: {
  lid: string;
  matchId?: string | null;
  eventId?: string | null;
  defaultTitle?: string | null;
  onClose: () => void;
}) {
  const c = useColors();
  const [busy, setBusy] = useState<'empezar' | 'compartir' | null>(null);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState((defaultTitle ?? '').slice(0, STREAM_TITLE_MAX));
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState<LiveStream | null>(null);
  const hint = linkHint(url, checked);

  const paste = async () => {
    try {
      const text = (await Clipboard.getStringAsync()).trim();
      if (text) {
        setUrl(text);
        setError(null);
      } else toast('No hay nada copiado.', 'error');
    } catch {
      toast('No se pudo leer lo copiado: pégalo en el campo.', 'error');
    }
  };

  const start = async () => {
    setBusy('empezar');
    setChecked(true);
    try {
      const problem = streamProblem({ url, title });
      if (problem) {
        setError(problem);
        return;
      }
      setError(null);
      setStarted(await startStream({ leagueId: lid, url, title: ownStreamTitle(title, defaultTitle), matchId: matchId ?? null, eventId: eventId ?? null }));
    } catch (e) {
      console.error(e);
      setError(streamErrorText(e));
    } finally {
      setBusy(null);
    }
  };

  const share = async (s: LiveStream) => {
    setBusy('compartir');
    // Con el dominio de la app: es el link que abre la app en el teléfono de quien lo recibe.
    const link = streamShareUrl(lid, shareOrigin(null));
    try {
      await Share.share({ message: `${streamShareText(s)}\n${link}`, url: link });
    } catch {
      toast(START_SHARE_ERROR, 'error');
    } finally {
      setBusy(null);
    }
  };

  if (started) {
    return (
      <Sheet
        open
        onClose={onClose}
        title="Transmitir en vivo"
        footer={
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button
              size="lg"
              icon={<Eye size={20} color={c.fg} />}
              onPress={() => {
                onClose();
                router.push({ pathname: '/l/[lid]/vivo', params: { lid, s: started.id } } as never);
              }}
              style={{ flex: 1 }}
            >
              Ver
            </Button>
            <Button variant="primary" size="lg" icon={<Share2 size={20} color={c.accentFg} />} loading={busy === 'compartir'} onPress={() => void share(started)} style={{ flex: 1 }}>
              Compartir link
            </Button>
          </View>
        }
      >
        <View style={{ alignItems: 'center', paddingVertical: 16 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: c.dangerSoft }}>
            <Radio size={32} color={c.danger} />
          </View>
          <Txt variant="cardTitle" style={{ marginTop: 16 }}>
            Ya estás en vivo
          </Txt>
          <Txt variant="meta" tone="muted" style={{ marginTop: 6, textAlign: 'center', maxWidth: 360 }}>
            {startedText(started)}
          </Txt>
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Transmitir en vivo"
      subtitle={defaultTitle || undefined}
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button size="lg" disabled={!!busy} onPress={onClose} style={{ flex: 1 }}>
            Cancelar
          </Button>
          <Button variant="primary" size="lg" icon={<Radio size={20} color={c.accentFg} />} loading={busy === 'empezar'} onPress={() => void start()} style={{ flex: 1 }}>
            Empezar
          </Button>
        </View>
      }
    >
      <View style={{ gap: 16 }}>
        <View style={{ gap: 6 }}>
          <Txt variant="small" tone="muted" style={{ fontFamily: font.medium }}>
            Link de la transmisión
          </Txt>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Input
              accessibilityLabel="Link de la transmisión"
              value={url}
              editable={busy !== 'empezar'}
              invalid={hint.tone === 'error'}
              keyboardType="url"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="https://youtube.com/live/…"
              onChangeText={(v) => {
                setUrl(v);
                setError(null);
              }}
              style={{ flex: 1, minWidth: 0, height: 44 }}
            />
            <Button icon={<ClipboardPaste size={16} color={c.fg} />} disabled={busy === 'empezar'} onPress={() => void paste()}>
              Pegar
            </Button>
          </View>
          <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {hint.platform && <PlatformMark platform={hint.platform} size={16} />}
            <Txt
              variant="small"
              tone={hint.tone === 'error' ? 'danger' : hint.tone === 'ok' ? 'fg2' : 'muted'}
              style={hint.tone === 'muted' ? undefined : { fontFamily: hint.tone === 'ok' ? font.semibold : font.medium }}
            >
              {hint.text}
            </Txt>
          </View>
        </View>
        <Field label="Título (opcional)" hint={`Sale en la liga y en el aviso. Hasta ${STREAM_TITLE_MAX} caracteres.`}>
          <Input value={title} maxLength={STREAM_TITLE_MAX} editable={busy !== 'empezar'} placeholder={defaultTitle || 'Ej.: Final del torneo'} onChangeText={setTitle} style={{ height: 44 }} />
        </Field>
        {!!error && <ErrorNote>{error}</ErrorNote>}
      </View>
    </Sheet>
  );
}
