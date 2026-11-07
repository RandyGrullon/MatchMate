/**
 * «Perfil público» en Configuración, como src/components/cuenta/PublicProfile.tsx: lo que ven los demás en tu perfil y
 * en tus publicaciones (tu foto y tu biografía) y las personas que bloqueaste. Filas en una tarjeta y cada cosa en su
 * hoja: la foto (elegir o tomar, ver cómo queda y guardarla, o quitarla), la biografía (hasta 160) y la lista de
 * bloqueadas con «Desbloquear». `/cuenta?foto=1` abre la hoja de la foto.
 */
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Ban, Camera, Check, ImageUp, Quote, Trash2 } from 'lucide-react-native';
import { invalidate, type Live } from '@mm/lib/data/client';
import type { PublicProfile } from '@mm/lib/data/follows';
import { BIO_MAX, blockKeys, removeAvatar, setBio, setBlocked, uploadAvatar, useMyBlocks, type BlockedPerson } from '@mm/lib/data/profileSocial';
import { saveErrorMessage } from '@mm/lib/errorText';
import { avatarErrorText, bioErrorText, blockedSubtitle, sameBio } from '@mm/components/cuenta/logic';
import { atUsername } from '@mm/components/social/socialFormat';
import { confirmAsync, toast } from '../feedback';
import { Avatar } from '../social/Avatar';
import { Button, Card, Divider, Empty, ErrorNote, Input, ListRow, LoadError, RowIcon, SectionHeader, Sheet, Txt } from '../ui';
import { avatarPhoto, type AvatarPhoto } from './avatarPhoto';
import { pickPhotoAssets, type PhotoSource } from '@/lib/pickImage';
import { useColors } from '@/theme/theme';

type Part = 'foto' | 'bio' | 'bloqueadas';

export function PublicProfileSection({ name, profile }: { name: string; profile: PublicProfile | null }) {
  const c = useColors();
  const params = useLocalSearchParams<{ foto?: string }>();
  const wantsPhoto = params.foto === '1';
  const [sheet, setSheet] = useState<Part | null>(wantsPhoto ? 'foto' : null);
  const blocks = useMyBlocks();
  const photo = profile?.avatar ?? null;
  const bio = profile?.bio?.trim() || null;

  const close = () => {
    setSheet(null);
    if (wantsPhoto) router.setParams({ foto: undefined });
  };

  return (
    <>
      <SectionHeader title="Perfil público" />
      <Card padded={false}>
        <ListRow
          icon={<Avatar name={name} photo={photo} size={40} />}
          title="Foto de perfil"
          subtitle={photo ? 'Cámbiala o quítala' : 'Que te reconozcan en tus publicaciones'}
          onPress={() => setSheet('foto')}
        />
        <Divider inset={68} />
        <ListRow
          icon={
            <RowIcon>
              <Quote size={20} color={c.accent} />
            </RowIcon>
          }
          title="Tu biografía"
          subtitle={bio ?? 'Cuéntales algo de ti'}
          onPress={() => setSheet('bio')}
        />
        <Divider inset={68} />
        <ListRow
          icon={
            <RowIcon>
              <Ban size={20} color={c.accent} />
            </RowIcon>
          }
          title="Personas bloqueadas"
          subtitle={blockedSubtitle(blocks.loading, blocks.data.length)}
          onPress={() => setSheet('bloqueadas')}
        />
      </Card>

      {sheet === 'foto' && (
        <Sheet open onClose={close} title="Foto de perfil" subtitle="Sale en tu perfil y en lo que publicas">
          <AvatarEditor name={name} photo={photo} onDone={close} />
        </Sheet>
      )}
      {sheet === 'bio' && (
        <Sheet open onClose={close} title="Tu biografía" subtitle="Sale en tu perfil, debajo de tu nombre">
          <BioForm current={bio} onDone={close} />
        </Sheet>
      )}
      {sheet === 'bloqueadas' && (
        <Sheet open onClose={close} title="Personas bloqueadas" subtitle="No ven tu perfil ni tus publicaciones">
          <BlockedPeople list={blocks} />
        </Sheet>
      )}
    </>
  );
}

/**
 * La foto de perfil: cómo se ve ahora, «Elegir foto» (de la galería, o tomarla con la cámara; se recorta al cuadrado
 * del centro y se achica en el teléfono), cómo va a quedar con «Guardar foto», y «Quitar foto» (vuelven las
 * iniciales). Necesita señal.
 */
function AvatarEditor({ name, photo, onDone }: { name: string; photo: string | null; onDone: () => void }) {
  const c = useColors();
  const [picked, setPicked] = useState<AvatarPhoto | null>(null);
  const [busy, setBusy] = useState<'preparar' | 'subir' | 'quitar' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(source: PhotoSource) {
    if (busy) return;
    setBusy('preparar');
    setError(null);
    try {
      const [asset] = await pickPhotoAssets(source);
      if (asset) setPicked(await avatarPhoto(asset));
    } catch (e) {
      console.warn('[foto de perfil]', e);
      setError(avatarErrorText({ code: 'imagen' }));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!picked || busy) return;
    setBusy('subir');
    setError(null);
    try {
      await uploadAvatar(picked);
      toast(photo ? 'Foto cambiada' : 'Foto lista');
      onDone();
    } catch (e) {
      setError(avatarErrorText(e));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (busy) return;
    const ok = await confirmAsync({ title: '¿Quitar tu foto?', message: 'Vuelven a salir tus iniciales. Puedes poner otra cuando quieras.', confirmText: 'Quitar', danger: true });
    if (!ok) return;
    setBusy('quitar');
    setError(null);
    try {
      await removeAvatar();
      toast('Foto quitada');
      onDone();
    } catch (e) {
      setError(avatarErrorText(e));
    } finally {
      setBusy(null);
    }
  }

  /** «Elegir foto» (la galería) y, al lado, la cámara: lo que en la web ofrece el teléfono al tocar el botón. */
  const chooser = (label: string, primary: boolean) => (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ flex: 1 }}>
        <Button
          variant={primary ? 'primary' : 'quiet'}
          size="xl"
          full
          loading={busy === 'preparar'}
          disabled={!!busy}
          icon={<ImageUp size={20} color={primary ? c.accentFg : c.fg} />}
          onPress={() => pick('library')}
        >
          {busy === 'preparar' ? 'Preparando…' : label}
        </Button>
      </View>
      <Button size="xl" accessibilityLabel="Tomar una foto" disabled={!!busy} icon={<Camera size={20} color={c.fg} />} onPress={() => pick('camera')} />
    </View>
  );

  return (
    <View style={{ alignItems: 'center', gap: 16, paddingTop: 8 }}>
      {picked ? (
        <Image
          source={{ uri: picked.preview }}
          accessibilityLabel="Tu foto nueva"
          accessibilityIgnoresInvertColors
          style={{ width: 128, height: 128, borderRadius: 64, backgroundColor: c.surface2 }}
          contentFit="cover"
        />
      ) : (
        <Avatar name={name} photo={photo} size={128} />
      )}
      <Txt variant="meta" tone="muted" style={{ textAlign: 'center', maxWidth: 320 }}>
        {picked ? 'Así se va a ver. ¿La guardas?' : 'Se recorta al cuadrado del centro. La ve cualquiera que vea tu perfil.'}
      </Txt>
      {error && (
        <View style={{ alignSelf: 'stretch' }}>
          <ErrorNote>{error}</ErrorNote>
        </View>
      )}
      <View style={{ alignSelf: 'stretch', gap: 10 }}>
        {picked ? (
          <>
            <Button variant="primary" size="xl" full loading={busy === 'subir'} disabled={!!busy} icon={<Check size={20} color={c.accentFg} />} onPress={save}>
              {busy === 'subir' ? 'Subiendo…' : 'Guardar foto'}
            </Button>
            {chooser('Elegir otra', false)}
          </>
        ) : (
          <>
            {chooser(photo ? 'Cambiar foto' : 'Elegir foto', true)}
            {photo && (
              <Button size="xl" full loading={busy === 'quitar'} disabled={!!busy} icon={<Trash2 size={20} color={c.danger} />} onPress={remove}>
                Quitar foto
              </Button>
            )}
          </>
        )}
      </View>
    </View>
  );
}

/** La biografía: hasta 160 caracteres con la cuenta a la vista; vacía, se quita. */
function BioForm({ current, onDone }: { current: string | null | undefined; onDone: () => void }) {
  const [value, setValue] = useState(current ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const over = value.length > BIO_MAX;

  async function save() {
    if (busy || over) return;
    if (sameBio(value, current)) {
      onDone();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await setBio(value);
      toast(saved ? 'Biografía guardada' : 'Biografía quitada');
      onDone();
    } catch (err) {
      setError(bioErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <View style={{ gap: 8 }}>
        <Txt variant="bodyStrong" tone="fg2">
          Sobre ti
        </Txt>
        <Input
          accessibilityLabel="Sobre ti"
          multiline
          value={value}
          onChangeText={(t) => {
            setValue(t);
            setError(null);
          }}
          maxLength={BIO_MAX}
          autoFocus
          placeholder="Cuéntales qué juegas y dónde"
          invalid={!!error || over}
          style={{ height: 112, paddingTop: 14, paddingBottom: 14, textAlignVertical: 'top' }}
        />
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <Txt variant="meta" tone={over ? 'danger' : 'muted'} style={{ flex: 1 }}>
            Qué juegas, dónde o desde cuándo. Vacía, se quita.
          </Txt>
          <Txt variant="meta" tone={over ? 'danger' : 'muted'} accessibilityLiveRegion="polite" style={{ fontVariant: ['tabular-nums'] }}>
            {value.length}/{BIO_MAX}
          </Txt>
        </View>
      </View>
      {error && <ErrorNote>{error}</ErrorNote>}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button size="xl" full disabled={busy} onPress={onDone}>
            Cancelar
          </Button>
        </View>
        <View style={{ flex: 1 }}>
          <Button variant="primary" size="xl" full loading={busy} disabled={over} onPress={save}>
            Guardar
          </Button>
        </View>
      </View>
    </>
  );
}

/** Las personas que bloqueaste (la más nueva primero), cada una con «Desbloquear». */
function BlockedPeople({ list }: { list: Live<BlockedPerson[]> }) {
  const c = useColors();
  const [busy, setBusy] = useState<string | null>(null);

  if (list.loading && !list.data.length) return <ActivityIndicator color={c.accent} style={{ paddingVertical: 24 }} />;
  if (list.error && !list.data.length) return <LoadError error={list.error} onRetry={() => invalidate(blockKeys.mine)} />;
  if (!list.data.length) {
    return (
      <Empty
        icon={<Ban size={28} color={c.accent} />}
        title="No has bloqueado a nadie"
        text="Si bloqueas a alguien desde su perfil, sale aquí para desbloquearlo cuando quieras."
      />
    );
  }

  async function unblock(p: BlockedPerson) {
    if (busy) return;
    setBusy(p.id);
    try {
      await setBlocked(p.id, false);
      toast(`Desbloqueaste a ${p.name}`);
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <View accessibilityLabel="Personas bloqueadas" style={{ gap: 4 }}>
      {list.data.map((p) => {
        const handle = atUsername(p.username);
        return (
          <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 6 }}>
            <Avatar name={p.name} photo={p.avatar} size={40} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="bodyStrong" numberOfLines={1}>
                {p.name}
              </Txt>
              {!!handle && (
                <Txt variant="small" tone="muted" numberOfLines={1}>
                  {handle}
                </Txt>
              )}
            </View>
            <Button loading={busy === p.id} disabled={!!busy && busy !== p.id} accessibilityLabel={`Desbloquear a ${p.name}`} onPress={() => unblock(p)}>
              Desbloquear
            </Button>
          </View>
        );
      })}
    </View>
  );
}
