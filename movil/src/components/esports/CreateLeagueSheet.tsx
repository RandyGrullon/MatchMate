/**
 * «Crear liga» de un juego (`?crear=liga` en la página del juego; teams/CreateLeagueSheet.tsx de la web): nombre,
 * pública o privada y sede (opcional). Una liga de esports junta varios torneos del mismo juego; se crea con
 * `createEsportsLeague` y lleva a la liga. Sin cuenta, la tarjeta para entrar.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Trophy } from 'lucide-react-native';
import { createEsportsLeague, esportsErrorText } from '@mm/lib/data/esports';
import { useIsPro } from '@mm/lib/useMode';
import { GAMES, type GameId } from '@mm/sports/esports';
import { toast } from '../feedback';
import { Button, Field, Input, Segmented, Sheet, Txt } from '../ui';
import { SignInCard } from './EsportsIndex';
import { useColors } from '@/theme/theme';

type Visibility = 'public' | 'private';

export function CreateLeagueSheet({ open, onClose, game, signedIn }: { open: boolean; onClose: () => void; game: GameId; signedIn: boolean }) {
  return (
    <Sheet open={open} onClose={onClose} title="Crear liga" subtitle={GAMES[game].name}>
      {open && <Body game={game} signedIn={signedIn} onClose={onClose} />}
    </Sheet>
  );
}

function Body({ game, signedIn, onClose }: { game: GameId; signedIn: boolean; onClose: () => void }) {
  const c = useColors();
  const pro = useIsPro();
  const meta = GAMES[game];
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [venue, setVenue] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!signedIn) return <SignInCard icon={<Trophy size={28} color={c.accent} />} title="Entra para crear tu liga" text={`Junta tus torneos de ${meta.name} en una liga.`} />;

  const nameError = name.trim().length === 0 ? 'Ponle un nombre a la liga.' : null;

  async function create() {
    setTried(true);
    if (nameError || busy) return;
    setBusy(true);
    try {
      const lid = await createEsportsLeague({ game, name: name.trim(), visibility, venue: venue.trim() || undefined });
      toast(`Listo: ${name.trim()} quedó creada`);
      onClose();
      router.push({ pathname: '/l/[lid]', params: { lid } });
    } catch (e) {
      console.error(e);
      toast(esportsErrorText(e, game), 'error');
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 16 }}>
      <Txt variant="meta" tone="muted">{`Una liga junta varios torneos de ${meta.name}, con los mismos organizadores y su link de invitación.`}</Txt>
      <Field label="Nombre de la liga" hint={tried ? nameError : null} error={tried && !!nameError}>
        <Input accessibilityLabel="Nombre de la liga" maxLength={60} value={name} placeholder={`Liga de ${meta.name}`} invalid={tried && !!nameError} onChangeText={setName} />
      </Field>
      <View style={{ gap: 8 }}>
        <Txt variant="bodyStrong" tone="fg2">
          ¿Quién la ve?
        </Txt>
        <Segmented<Visibility>
          label="Quién ve la liga"
          value={visibility}
          onChange={setVisibility}
          options={[
            { key: 'public', label: 'Pública' },
            { key: 'private', label: 'Privada' },
          ]}
        />
        <Txt variant="meta" tone="muted">
          {visibility === 'public' ? 'Sale en la página del juego y cualquiera la ve.' : 'Solo entra quien tenga el link o el código.'}
        </Txt>
      </View>
      <Field label="Sede (opcional)">
        <Input accessibilityLabel="Sede (opcional)" maxLength={80} value={venue} placeholder="Online, cibercafé o centro gamer" onChangeText={setVenue} />
      </Field>
      <Button variant="primary" size={pro ? 'lg' : 'xl'} full loading={busy} icon={<Trophy size={20} color={c.accentFg} />} onPress={create}>
        Crear liga
      </Button>
    </View>
  );
}
