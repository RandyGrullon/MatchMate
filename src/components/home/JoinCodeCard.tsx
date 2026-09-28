import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Ticket } from 'lucide-react';
import { Button, Card, Input } from '../ui';

/** «¿Te invitaron? Pon el código»: lleva a /unirse/<código>. */
export function JoinCodeCard() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  function submit(e: FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c) navigate(`/unirse/${encodeURIComponent(c)}`);
  }
  return (
    <Card className="p-4" tour="unirse">
      <form onSubmit={submit} className="flex flex-col gap-2">
        <label htmlFor="codigo-invitacion" className="flex items-center gap-2 text-sm font-medium">
          <Ticket className="size-5 text-accent" /> ¿Te invitaron? Pon el código
        </label>
        <div className="flex gap-2">
          <Input
            id="codigo-invitacion"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCD2345"
            maxLength={12}
            autoCapitalize="characters"
            autoComplete="off"
            className="h-11 font-mono tracking-widest uppercase"
          />
          <Button type="submit" variant="primary" disabled={!code.trim()} className="h-11">
            Unirme
          </Button>
        </div>
      </form>
    </Card>
  );
}
