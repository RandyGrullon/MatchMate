/**
 * Publicar (como Composer.tsx de la web): la tarjeta «¿Qué jugaste hoy?» abre la hoja con el texto, una foto (de la
 * galería o la cámara), dónde se publica (tu perfil o una de tus ligas, o la liga fija en su muro) y quién la ve.
 * Lo escrito se queda si cierras la hoja.
 */
import { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Camera, Globe, ImagePlus, Lock, Users, X } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { useLeaguesByIds, useMyMemberships } from '@mm/lib/data';
import { usePublicProfile } from '@mm/lib/data/follows';
import { POST_TEXT_MAX, createPost, postProblem, socialErrorText, VISIBILITY_LABEL, type Post, type PostVisibility } from '@mm/lib/data/posts';
import type { CompressedImage } from '@mm/lib/image';
import { leagueSport } from '@mm/sports/registry';
import { COUNTER_FROM, audienceHint, audienceOptions, defaultAudience, type ComposerTarget } from '@mm/components/posts/postFormat';
import { Avatar } from './Avatar';
import { toast } from '../feedback';
import { Button, ChoiceRow, ErrorNote, Segmented, Sheet, Txt } from '../ui';
import { pickPhoto, type PhotoSource } from '@/lib/pickImage';
import { useColors } from '@/theme/theme';

const AUDIENCE_ICON = { public: Globe, followers: Users, league: Lock } as const;

/** Lo que se escribía, por lugar (el feed o el muro de una liga). */
const drafts = new Map<string, string>();

/** «¿Qué jugaste hoy?»: abre la hoja para publicar. `league`: el muro de esa liga (se publica ahí). */
export function ComposerCard({ league, placeholder, onPosted }: { league?: ComposerTarget | null; placeholder?: string; onPosted?: (post: Post) => void }) {
  const c = useColors();
  const auth = useAuth();
  const uid = auth.user?.uid;
  const me = usePublicProfile(uid);
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState<CompressedImage | null>(null);
  const [picking, setPicking] = useState(false);
  if (!uid) return null;
  const name = me.data?.name ?? auth.profile?.name ?? 'Tú';
  const draft = drafts.get(league?.id ?? 'feed');

  async function pick(source: PhotoSource) {
    setPicking(true);
    try {
      const img = await pickPhoto(source);
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
        <Pressable accessibilityRole="button" accessibilityLabel="Nueva publicación" onPress={() => setOpen(true)} style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}>
          <Txt tone={draft ? 'fg' : 'muted'} numberOfLines={1}>
            {draft || placeholder || '¿Qué jugaste hoy?'}
          </Txt>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Agregar foto" disabled={picking} onPress={() => void pick('library')} hitSlop={6} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <ImagePlus size={22} color={c.accent} />
        </Pressable>
      </View>
      {open && (
        <ComposerSheet
          uid={uid}
          fixedLeague={league ?? null}
          initialPhoto={photo}
          onClose={() => {
            setOpen(false);
            setPhoto(null);
          }}
          onPosted={onPosted}
        />
      )}
    </>
  );
}

function ComposerSheet({
  uid,
  fixedLeague,
  initialPhoto,
  onClose,
  onPosted,
}: {
  uid: string;
  fixedLeague: ComposerTarget | null;
  initialPhoto: CompressedImage | null;
  onClose: () => void;
  onPosted?: (post: Post) => void;
}) {
  const c = useColors();
  const memberships = useMyMemberships(uid);
  const byIds = useLeaguesByIds(fixedLeague ? [] : memberships.data.map((m) => m.leagueId));
  const leagues = useMemo<ComposerTarget[]>(
    () =>
      byIds.data
        .filter((l) => !l.hasMinors)
        .map((l) => ({ id: l.id, name: l.name, sport: leagueSport(l), visibility: l.visibility }))
        .sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [byIds.data],
  );
  const place = fixedLeague?.id ?? 'feed';
  const [text, setTextState] = useState(() => drafts.get(place) ?? '');
  const [photo, setPhoto] = useState<CompressedImage | null>(initialPhoto);
  const [targetId, setTargetId] = useState<string | null>(fixedLeague?.id ?? null);
  const target = fixedLeague ?? leagues.find((l) => l.id === targetId) ?? null;
  const options: PostVisibility[] = audienceOptions(target);
  const [chosen, setChosen] = useState<PostVisibility>(() => defaultAudience(target));
  const audience = options.includes(chosen) ? chosen : defaultAudience(target);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setText = (v: string) => {
    const next = v.slice(0, POST_TEXT_MAX);
    setTextState(next);
    if (next) drafts.set(place, next);
    else drafts.delete(place);
  };

  const problem = postProblem({ text, photo, leagueId: target?.id ?? null, visibility: audience });
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
      const post = await createPost({ text, photo, leagueId: target?.id ?? null, visibility: audience });
      drafts.delete(place);
      toast('Publicado');
      onPosted?.(post);
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
      title={fixedLeague ? 'Publicar en la liga' : 'Nueva publicación'}
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
      {!fixedLeague && leagues.length > 0 && (
        <>
          <Txt variant="bodyStrong">Publicar en</Txt>
          <ChoiceRow title="Mi perfil" selected={!targetId} onPress={() => setTargetId(null)} />
          {leagues.map((l) => (
            <ChoiceRow key={l.id} title={l.name} subtitle={l.visibility === 'public' ? 'Liga pública' : 'Liga privada'} selected={targetId === l.id} onPress={() => setTargetId(l.id)} />
          ))}
        </>
      )}
      <Txt variant="bodyStrong">¿Quién la ve?</Txt>
      {options.length > 1 ? (
        <Segmented<PostVisibility> label="Quién la ve" value={audience} onChange={setChosen} options={options.map((v) => ({ key: v, label: VISIBILITY_LABEL[v] }))} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {(() => {
            const Icon = AUDIENCE_ICON[audience];
            return <Icon size={18} color={c.muted} />;
          })()}
          <Txt>{VISIBILITY_LABEL[audience]}</Txt>
        </View>
      )}
      <Txt variant="meta" tone="muted">
        {audienceHint(audience, !!target)}
      </Txt>
      {shownProblem && <ErrorNote>{shownProblem}</ErrorNote>}
      {error && <ErrorNote>{error}</ErrorNote>}
    </Sheet>
  );
}
