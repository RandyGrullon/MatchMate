import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Globe, Lock, Trophy } from 'lucide-react';
import { createEsportsLeague, esportsErrorText } from '../../../lib/data/esports';
import { GAMES, type GameId } from '../../../sports/esports';
import { useFeedback } from '../../../components/feedback';
import { useIsPro } from '../../../components/mode';
import { SignInCard } from '../../../components/screens/ScreenBits';
import { Button, Field, Input, Segmented, Sheet } from '../../../components/ui';

type Visibility = 'public' | 'private';

/**
 * «Crear liga» de un juego (`?crear=liga` en la página del juego, §12.3): nombre, pública o privada y sede (opcional).
 * Una liga de esports junta varios torneos del mismo juego; se crea con `createEsportsLeague` y lleva a la liga.
 */
export function CreateLeagueSheet({ open, onClose, game, signedIn }: { open: boolean; onClose: () => void; game: GameId; signedIn: boolean }) {
  return (
    <Sheet open={open} onClose={onClose} title="Crear liga" subtitle={GAMES[game].name}>
      {open && <CreateLeagueBody game={game} signedIn={signedIn} />}
    </Sheet>
  );
}

function CreateLeagueBody({ game, signedIn }: { game: GameId; signedIn: boolean }) {
  const meta = GAMES[game];
  const pro = useIsPro();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useFeedback();
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [venue, setVenue] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!signedIn) {
    return (
      <SignInCard
        className="mb-2"
        icon={<Trophy />}
        title="Entra para crear tu liga"
        text={`Junta tus torneos de ${meta.name} en una liga.`}
        next={encodeURIComponent(location.pathname + location.search)}
      />
    );
  }

  const nameError = name.trim().length === 0 ? 'Ponle un nombre a la liga.' : null;

  async function create() {
    setTried(true);
    if (nameError || busy) return;
    setBusy(true);
    try {
      const lid = await createEsportsLeague({ game, name: name.trim(), visibility, venue: venue.trim() || undefined });
      toast(`Listo: ${name.trim()} quedó creada`);
      navigate(`/l/${lid}`);
    } catch (e) {
      console.error(e);
      toast(esportsErrorText(e, game), 'error');
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-4 pb-1"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void create();
      }}
    >
      <p className="text-meta text-muted">Una liga junta varios torneos de {meta.name}, con los mismos organizadores y su link de invitación.</p>
      <Field label="Nombre de la liga" hint={tried && nameError ? <span className="text-danger">{nameError}</span> : undefined}>
        <Input className="h-11" maxLength={60} value={name} placeholder={`Liga de ${meta.name}`} aria-invalid={(tried && !!nameError) || undefined} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted">¿Quién la ve?</span>
        <Segmented<Visibility>
          label="Quién ve la liga"
          full
          value={visibility}
          onChange={setVisibility}
          options={[
            { key: 'public', label: 'Pública', icon: <Globe className="size-4" /> },
            { key: 'private', label: 'Privada', icon: <Lock className="size-4" /> },
          ]}
        />
        <span className="text-xs text-muted">{visibility === 'public' ? 'Sale en la página del juego y cualquiera la ve.' : 'Solo entra quien tenga el link o el código.'}</span>
      </div>
      <Field label="Sede (opcional)">
        <Input className="h-11" maxLength={80} value={venue} placeholder="Online, cibercafé o centro gamer" onChange={(e) => setVenue(e.target.value)} />
      </Field>
      <Button type="submit" variant="primary" size={pro ? 'lg' : 'xl'} className="mt-1 w-full" loading={busy} icon={<Trophy className="size-5" />}>
        Crear liga
      </Button>
    </form>
  );
}
