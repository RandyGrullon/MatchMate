/**
 * Publicar en el muro de un equipo (ComposerCard de la web con `squad`, con su misma lógica: createPost con el equipo,
 * siempre para todos). La tarjeta «¿Qué cuenta el equipo?» con tu foto abre la hoja «Publicar en el equipo»: el texto,
 * una foto (de la galería o la cámara, como la hoja de publicar de la app) y «¿Quién la ve?» (Para todos). Lo escrito
 * se queda si cierras la hoja.
 */
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Camera, Globe, ImagePlus, X } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { usePublicProfile } from '@mm/lib/data/follows';
import { POST_TEXT_MAX, VISIBILITY_LABEL, createPost, postProblem, socialErrorText } from '@mm/lib/data/posts';
import type { CompressedImage } from '@mm/lib/image';
import { COUNTER_FROM } from '@mm/components/posts/postFormat';
import { SQUAD_AUDIENCE_HINT } from '@mm/components/squads/logic';
import { Avatar } from '../social/Avatar';
import { toast } from '../feedback';
import { Button, ErrorNote, Sheet, Txt } from '../ui';
import { pickPhoto, type PhotoSource } from '@/lib/pickImage';
import { useColors } from '@/theme/theme';

/** Lo que se escribía en el muro de cada equipo. */
const drafts = new Map<string, string>();

export function SquadComposer({ squad, placeholder }: { squad: { id: string; name: string }; placeholder: string }) {
  const c = useColors();
  const auth = useAuth();
  const uid = auth.user?.uid;
  const me = usePublicProfile(uid);
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState<CompressedImage | null>(null);
  const [picking, setPicking] = useState(false);
  if (!uid) return null;
  const name = me.data?.name ?? auth.profile?.name ?? 'Tú';
  const draft = drafts.get(squad.id);

  async function pick() {
    setPicking(true);
    try {
      const img = await pickPhoto('library');
      if (img) {
        setPhoto(img);
        setOpen(true);
      }
    } catch {
      toast('No se pudo abrir esa imagen. Prueba con otra.', 'error');
    } finally {
      setPicking(false);
    }
  }

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface, borderRadius: 22, padding: 12 }}>
        <Avatar name={name} photo={me.data?.avatar} />
        <Pressable accessibilityRole="button" accessibilityLabel="Publicar en el equipo" onPress={() => setOpen(true)} style={{ flex: 1, minHeight: 44, justifyContent: 'center', borderRadius: 22, backgroundColor: c.surface2, paddingHorizontal: 16 }}>
          <Txt variant="meta" tone={draft ? 'fg' : 'muted'} numberOfLines={1}>
            {draft?.split('\n')[0] || placeholder}
          </Txt>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Publicar una foto" disabled={picking} onPress={() => void pick()} hitSlop={6} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <ImagePlus size={22} color={c.accent} />
        </Pressable>
      </View>
      {open && (
        <ComposerSheet
          squad={squad}
          initialPhoto={photo}
          onClose={() => {
            setOpen(false);
            setPhoto(null);
          }}
        />
      )}
    </>
  );
}

function ComposerSheet({ squad, initialPhoto, onClose }: { squad: { id: string; name: string }; initialPhoto: CompressedImage | null; onClose: () => void }) {
  const c = useColors();
  const [text, setTextState] = useState(() => drafts.get(squad.id) ?? '');
  const [photo, setPhoto] = useState<CompressedImage | null>(initialPhoto);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setText = (v: string) => {
    const next = v.slice(0, POST_TEXT_MAX);
    setTextState(next);
    if (next) drafts.set(squad.id, next);
    else drafts.delete(squad.id);
  };

  const problem = postProblem({ text, photo, leagueId: null, visibility: 'public' });
  const shownProblem = problem && (text.trim() || photo) ? problem : null;

  async function pick(source: PhotoSource) {
    setPicking(true);
    try {
      const img = await pickPhoto(source);
      if (img) setPhoto(img);
    } catch {
      toast('No se pudo abrir esa imagen. Prueba con otra.', 'error');
    } finally {
      setPicking(false);
    }
  }

  async function publish() {
    if (problem || busy) return;
    setBusy(true);
    setError(null);
    try {
      await createPost({ text, photo, squadId: squad.id, leagueId: null, visibility: 'public' });
      drafts.delete(squad.id);
      toast('Publicado');
      onClose();
    } catch (e) {
      setError(socialErrorText(e, 'No se pudo publicar. Inténtalo otra vez.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Publicar en el equipo"
      subtitle={squad.name}
      footer={
        <Button variant="primary" size="xl" full loading={busy} disabled={!!problem} onPress={publish}>
          Publicar
        </Button>
      }
    >
      <TextInput
        accessibilityLabel="Qué quieres publicar"
        placeholder="Cuenta cómo te fue…"
        placeholderTextColor={c.faint}
        multiline
        autoFocus={!initialPhoto}
        value={text}
        onChangeText={setText}
        style={{ minHeight: 112, maxHeight: 240, borderRadius: 16, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.surface, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: c.fg, textAlignVertical: 'top' }}
      />
      {text.length >= POST_TEXT_MAX - COUNTER_FROM && (
        <Txt variant="small" tone={text.length >= POST_TEXT_MAX ? 'warn' : 'muted'} style={{ alignSelf: 'flex-end' }}>
          {text.length}/{POST_TEXT_MAX}
        </Txt>
      )}
      {photo ? (
        <View>
          <Image source={{ uri: photo.data }} style={{ width: '100%', aspectRatio: photo.width && photo.height ? photo.width / photo.height : 4 / 3, borderRadius: 16 }} contentFit="cover" />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quitar la foto"
            onPress={() => setPhoto(null)}
            style={{ position: 'absolute', top: 8, right: 8, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' }}
          >
            <X size={18} color="#ffffff" />
          </Pressable>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button full loading={picking} icon={<ImagePlus size={18} color={c.fg} />} onPress={() => void pick('library')}>
              {picking ? 'Preparando foto…' : 'Agregar foto'}
            </Button>
          </View>
          <Button accessibilityLabel="Tomar una foto" icon={<Camera size={18} color={c.fg} />} disabled={picking} onPress={() => void pick('camera')} />
        </View>
      )}
      <Txt variant="bodyStrong">¿Quién la ve?</Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Globe size={18} color={c.muted} />
        <Txt>{VISIBILITY_LABEL.public}</Txt>
      </View>
      <Txt variant="meta" tone="muted">
        {SQUAD_AUDIENCE_HINT}
      </Txt>
      {shownProblem && <ErrorNote>{shownProblem}</ErrorNote>}
      {error && <ErrorNote>{error}</ErrorNote>}
    </Sheet>
  );
}
