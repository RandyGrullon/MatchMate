import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { QrCode, Search, Target, Ticket, Users } from 'lucide-react';
import { Button, Card, ListRow, RowIcon, cx } from '../ui';
import { QrHelpSheet } from './HomeSheets';

/**
 * Hoy de una cuenta nueva (sin ligas): «Únete a tu liga» con el código que te mandó quien organiza (lleva a
 * /unirse/<código>) y «o escanea el QR»; debajo, «o también»: crear tu liga, anotar un juego suelto o buscar ligas
 * abiertas. `onCreate` = null si la cuenta no puede crear ligas todavía.
 */
export function JoinLeagueCard({ onCreate }: { onCreate: (() => void) | null }) {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [qr, setQr] = useState(false);
  function submit(e: FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c) navigate(`/unirse/${encodeURIComponent(c)}`);
  }
  return (
    <>
      <Card className="px-5 pt-[22px] pb-2">
        <section aria-labelledby="unete-titulo">
          <span aria-hidden="true" className="grid size-[52px] place-items-center rounded-2xl bg-accent-soft text-accent">
            <Ticket className="size-[26px]" />
          </span>
          <h2 id="unete-titulo" className="mt-4 text-card-title">
            Únete a tu liga
          </h2>
          <p className="mt-1.5 text-[15.5px] leading-[1.45] text-fg-2">
            Pon el código que te mandó quien organiza. Son 8 letras y números, como <b className="font-bold tracking-wide">ABCD2345</b>.
          </p>
          <form onSubmit={submit} className="mt-[18px] flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="CÓDIGO"
              aria-label="Código de invitación"
              maxLength={12}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className={cx(
                'h-14 min-w-0 flex-1 rounded-2xl bg-surface-2 px-4 text-base font-semibold tracking-[0.1em] text-fg uppercase placeholder:text-faint',
                'focus:ring-2 focus:ring-accent/40 focus:outline-none',
              )}
            />
            <Button type="submit" variant="primary" size="xl" disabled={!code.trim()} className="w-[108px] shrink-0 px-0 disabled:opacity-100">
              Unirme
            </Button>
          </form>
          <button
            type="button"
            onClick={() => setQr(true)}
            className="mt-0.5 flex h-12 w-full items-center justify-center gap-[7px] text-meta font-semibold text-accent transition active:opacity-70"
          >
            <QrCode aria-hidden="true" className="size-[18px]" /> o escanea el QR
          </button>
        </section>
      </Card>

      <div role="separator" className="mx-1 mt-[26px] mb-3.5 flex items-center gap-3 text-sm font-[550] text-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
        o también
      </div>
      <Card className="overflow-hidden">
        {onCreate && (
          <ListRow
            leading={
              <RowIcon>
                <Users className="size-5" />
              </RowIcon>
            }
            title="Crear mi liga"
            subtitle="Tú organizas; toma 1 minuto"
            onClick={onCreate}
          />
        )}
        <ListRow
          leading={
            <RowIcon>
              <Target className="size-5" />
            </RowIcon>
          }
          title="Anotar un juego suelto"
          subtitle="Solo para ti, sin liga"
          to="/juegos-sueltos?nuevo=1"
        />
        <ListRow
          leading={
            <RowIcon>
              <Search className="size-5" />
            </RowIcon>
          }
          title="Buscar ligas abiertas"
          subtitle="Públicas, para unirte"
          to="/ligas"
        />
      </Card>
      <QrHelpSheet open={qr} onClose={() => setQr(false)} />
    </>
  );
}
