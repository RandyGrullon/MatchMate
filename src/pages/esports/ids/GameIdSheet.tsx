import { useState, type ReactNode } from 'react';
import { ChevronRight, Link2, Pencil, Save, Search, ShieldAlert, ShieldCheck, Trash2, Trophy } from 'lucide-react';
import {
  confirmGameId,
  deleteGameId,
  gameIdErrorText,
  lookupGameId,
  saveGameId,
  setRanks,
  startLink,
  type GameIdRecord,
  type ProvidersStatus,
} from '../../../lib/data/esportsIds';
import { GAMES, idPlatforms, idRegions, normalizeGameId, validateRankMap, type GameId, type RankMap, type RankSource } from '../../../sports/esports';
import { GameMark, IdChip, RankChip } from '../../../components/esports/bits';
import { BusyIcon, useBusy } from '../../../components/busy';
import { useFeedback } from '../../../components/feedback';
import { useIsPro } from '../../../components/mode';
import { Button, Field, Input, Select, Sheet, cx } from '../../../components/ui';
import {
  PROVIDER_NAME,
  afterLookup,
  canLookup,
  connectLabel,
  idActions,
  idWord,
  initialIdSheetState,
  isTakenError,
  linkProviderFor,
  numericId,
  rankKeysFor,
  ranksToSend,
  takenText,
  type IdSheetState,
} from '../logic';
import { RankPicker } from './RankPicker';

export interface GameIdSheetProps {
  open: boolean;
  onClose: () => void;
  game: GameId;
  /** El ID que ya tiene de ese juego (y plataforma), o null. */
  record: GameIdRecord | null;
  providers: ProvidersStatus;
  /** Quedó guardado (o comprobado): vuelve a `?volver=` o cierra. */
  onDone: () => void;
  /** Para abrir en un paso (las pruebas, o con algo ya escrito). */
  initial?: Partial<IdSheetState>;
}

/**
 * La hoja del ID de un juego (§12.6):
 * - lo que hay (con un ID guardado): el ID con su chip («Cuenta conectada», «Comprobado» o «Declarado») y el rango;
 *   «Cambiar mi rango», «Comprobar con Riot» (si hay búsqueda y no está comprobado), «Conectar con…» (si está encendido y
 *   no entró con su cuenta), «Cambiar mi ID» (no si entró con su cuenta) y «Quitar mi ID»;
 * - escribir el ID, en un solo paso: «Conectar con Epic/Steam/Riot» arriba si el juego lo tiene y está encendido, la
 *   plataforma (NBA 2K), la región y el campo con el error de `normalizeGameId` en vivo, y el rango (opcional). «Buscar»
 *   si el juego tiene búsqueda encendida (LoL y VALORANT con Riot); si no, «Guardar»: queda declarado;
 * - «¿Eres tú?» con lo que encontró la búsqueda → «Sí, soy yo» (queda comprobado) / «No soy yo» (vuelve al campo);
 * - ese ID está conectado a otra cuenta (entró con su cuenta de Epic, Steam o Riot) → conéctalo tú o prueba con otro;
 * - el rango → «Guardar rango».
 * En el modo local no hay proveedores ni búsqueda: el ID se guarda declarado, sin errores.
 */
export function GameIdSheet(props: GameIdSheetProps) {
  // Se monta solo mientras está abierta: cada vez empieza de cero (y se cierra al quitarla).
  if (!props.open) return null;
  return <GameIdOpen {...props} />;
}

function GameIdOpen({ game, record, providers, onClose, onDone, initial }: GameIdSheetProps) {
  const meta = GAMES[game];
  const pro = useIsPro();
  const { toast, confirm } = useFeedback();
  const busy = useBusy<'save' | 'found' | 'lookup' | 'rank' | 'delete' | 'link'>();
  const [s, setS] = useState<IdSheetState>(() => ({ ...initialIdSheetState(game, record), ...initial }));
  const [tried, setTried] = useState(false);
  const patch = (p: Partial<IdSheetState>) => setS((prev) => ({ ...prev, ...p }));

  const platforms = idPlatforms(game);
  const regions = idRegions(game);
  const lookupOn = canLookup(game, providers);
  const provider = linkProviderFor(game, providers);
  const size = pro ? 'lg' : 'xl';
  const norm = normalizeGameId(game, s.raw, s.platform || undefined);
  const normError = 'error' in norm ? norm.error : null;
  const platformLabel = (id: string) => platforms.find((p) => p.id === id)?.label ?? id;
  // Un rango a medias (el tier sin división, un número fuera de la escalera) no se manda: lo dice el selector.
  const rankError = validateRankMap(game, s.ranks);
  const label = idWord(meta.idInfo.label);

  const saved = () => {
    toast('Listo: guardaste tu ID');
    onDone();
  };

  /** Guarda el ID (declarado) y el rango si cambió; con búsqueda, además lo busca. */
  async function submit() {
    const n = normalizeGameId(game, s.raw, s.platform || undefined);
    if ('error' in n || rankError) {
      setTried(true);
      return;
    }
    await busy.run('save', async () => {
      try {
        const res = await saveGameId(game, s.raw, s.platform || undefined, s.region || undefined);
        const display = res.idDisplay || n.display;
        // Si cambia el ID, el rango de antes ya no cuenta: se manda lo elegido.
        const before = record && record.idDisplay === display ? record.ranks : null;
        const ranks = ranksToSend(s.ranks, before);
        if (ranks) await setRanks(game, ranks, s.platform || undefined);
        if (!lookupOn) return saved();
        const r = await lookupGameId(game, s.raw, s.platform || undefined, s.region || undefined);
        const next = afterLookup(r, label);
        if (next.next === 'saved') return saved();
        patch({ display, step: next.next, message: next.message, found: r.status === 'found' ? r : null });
      } catch (e) {
        if (isTakenError(e)) return patch({ step: 'taken', display: n.display, message: null });
        console.error(e);
        toast(gameIdErrorText(e, game), 'error');
      }
    });
  }

  /** «Comprobar con Riot» desde lo que hay: busca el ID guardado. */
  async function check() {
    if (!record) return;
    await busy.run('lookup', async () => {
      try {
        const r = await lookupGameId(game, record.idDisplay, record.platform || undefined, record.region || undefined);
        const next = afterLookup(r, label);
        if (next.next === 'saved') {
          toast(r.status === 'rate_limited' ? 'Hiciste muchas búsquedas seguidas. Prueba en un rato.' : 'No se pudo buscar ahora. Prueba más tarde.', 'error');
          return;
        }
        patch({ display: record.idDisplay, raw: record.idDisplay, step: next.next, message: next.message, found: r.status === 'found' ? r : null });
      } catch (e) {
        console.error(e);
        toast(gameIdErrorText(e, game), 'error');
      }
    });
  }

  async function confirmFound(lookupId: string) {
    await busy.run('found', async () => {
      try {
        await confirmGameId(game, lookupId, s.platform || undefined);
        toast('Listo: tu ID quedó comprobado');
        onDone();
      } catch (e) {
        if (isTakenError(e)) return patch({ step: 'taken', message: null });
        console.error(e);
        toast(gameIdErrorText(e, game), 'error');
      }
    });
  }

  async function saveRanks() {
    await busy.run('rank', async () => {
      try {
        await setRanks(game, s.ranks, s.platform || undefined);
        toast('Rango guardado');
        patch({ step: 'summary' });
      } catch (e) {
        console.error(e);
        toast(gameIdErrorText(e, game), 'error');
      }
    });
  }

  async function remove() {
    const ok = await confirm({
      title: `¿Quitar tu ID de ${meta.name}?`,
      message: 'Sin él no te pueden sumar a un equipo ni te inscribes en torneos de este juego. Lo puedes volver a poner.',
      confirmText: 'Quitar',
      danger: true,
    });
    if (!ok) return;
    await busy.run('delete', async () => {
      try {
        await deleteGameId(game, s.platform || undefined);
        toast('Listo: quitaste tu ID');
        onClose();
      } catch (e) {
        console.error(e);
        toast(gameIdErrorText(e, game), 'error');
      }
    });
  }

  async function connect() {
    if (!provider) return;
    await busy.run('link', async () => {
      try {
        await startLink(provider, game);
      } catch (e) {
        console.error(e);
        toast(gameIdErrorText(e, game), 'error');
      }
    });
  }

  const idCard = (display: string, extra?: ReactNode) => (
    <div className="flex items-center gap-3.5 rounded-2xl bg-surface-2 p-4">
      <GameMark game={game} size="md" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">{s.platform ? `${meta.idInfo.label} · ${platformLabel(s.platform)}` : meta.idInfo.label}</p>
        <p className="text-[19px] font-semibold tracking-[-0.01em] break-all">{display}</p>
        {extra}
      </div>
    </div>
  );

  const ranksLine = (ranks: RankMap, source: RankSource) => {
    const keys = rankKeysFor(game).filter((k) => ranks[k]);
    if (!keys.length) return null;
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {keys.map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            {k !== 'main' && <span className="text-xs font-semibold text-muted">{k}</span>}
            <RankChip game={game} rank={ranks[k]} source={source} />
          </span>
        ))}
      </div>
    );
  };

  let body: ReactNode;
  let footer: ReactNode = null;

  // Sin lo que hace falta para un paso (un ID guardado, lo que encontró la búsqueda), escribir el ID.
  const step = (s.step === 'summary' || s.step === 'rank') && !record ? 'edit' : s.step === 'found' && !s.found ? 'edit' : s.step;

  switch (step) {
    case 'summary': {
      const r = record!;
      const actions = idActions(r, providers);
      const login = r.ownership === 'login';
      const hasRank = Object.keys(r.ranks).length > 0;
      body = (
        <div className="flex flex-col gap-4 pb-1">
          {idCard(r.idDisplay, r.lookupName ? <p className="mt-0.5 truncate text-sm text-muted">En el juego: {r.lookupName}</p> : null)}
          <div className="flex flex-wrap items-center gap-2">
            <IdChip ownership={r.ownership} />
          </div>
          {login && meta.link && <p className="-mt-1 text-meta text-muted">{`Lo conectaste con tu cuenta de ${PROVIDER_NAME[meta.link]}. Si cambió, quítalo y conéctalo otra vez.`}</p>}
          <section aria-labelledby="mi-rango" className="flex flex-col gap-2">
            <h3 id="mi-rango" className="text-sm font-semibold">
              Rango
            </h3>
            {ranksLine(r.ranks, r.rankSource) ?? <p className="text-meta text-muted">Sin rango. Ponlo para que te siembren mejor en los torneos.</p>}
          </section>
          <ul className="-mx-2 flex flex-col">
            {actions.map((a) => {
              switch (a) {
                case 'rank':
                  return <ActionRow key={a} icon={<Trophy className="size-5" />} label={hasRank ? 'Cambiar mi rango' : 'Poner mi rango'} onClick={() => patch({ step: 'rank', ranks: { ...r.ranks } })} />;
                case 'lookup':
                  return (
                    <ActionRow
                      key={a}
                      icon={<BusyIcon busy={busy.isBusy('lookup')} icon={<ShieldCheck className="size-5" />} className="size-5" />}
                      label="Comprobar con Riot"
                      hint="Buscamos tu Riot ID y queda comprobado"
                      onClick={() => void check()}
                      disabled={busy.isBusy()}
                    />
                  );
                case 'link':
                  return (
                    <ActionRow
                      key={a}
                      icon={<BusyIcon busy={busy.isBusy('link')} icon={<Link2 className="size-5" />} className="size-5" />}
                      label={connectLabel(provider!)}
                      hint="Entra con tu cuenta y tu ID queda conectado"
                      onClick={() => void connect()}
                      disabled={busy.isBusy()}
                    />
                  );
                case 'change':
                  return <ActionRow key={a} icon={<Pencil className="size-5" />} label="Cambiar mi ID" onClick={() => patch({ step: 'edit', raw: r.idDisplay, message: null })} />;
                case 'delete':
                  return (
                    <ActionRow
                      key={a}
                      danger
                      icon={<BusyIcon busy={busy.isBusy('delete')} icon={<Trash2 className="size-5" />} className="size-5" />}
                      label="Quitar mi ID"
                      onClick={() => void remove()}
                      disabled={busy.isBusy()}
                    />
                  );
              }
            })}
          </ul>
        </div>
      );
      break;
    }

    case 'edit': {
      const showError = !!normError && !/plataforma/i.test(normError) && (tried || (s.raw.trim() !== '' && !/^Escribe/.test(normError)));
      body = (
        <form
          className="flex flex-col gap-4 pb-1"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {provider && (
            <>
              <div className="flex flex-col gap-3 rounded-2xl bg-accent-soft p-4">
                <p className="text-meta font-semibold">{`Entra con tu cuenta de ${PROVIDER_NAME[provider]} y tu ID queda conectado.`}</p>
                <Button variant="secondary" className="h-11 w-full" loading={busy.isBusy('link')} onClick={() => void connect()} icon={<Link2 className="size-4" />}>
                  {connectLabel(provider)}
                </Button>
              </div>
              <div className="flex items-center gap-3 text-[13px] font-medium text-muted">
                <span aria-hidden="true" className="h-px flex-1 bg-line" />o escribe tu ID
                <span aria-hidden="true" className="h-px flex-1 bg-line" />
              </div>
            </>
          )}
          {platforms.length > 0 && (
            <Field label="Plataforma" hint={tried && !s.platform ? <span className="text-danger">Elige la plataforma.</span> : undefined}>
              <Select className="h-11" value={s.platform} onChange={(e) => patch({ platform: e.target.value })}>
                <option value="">Elige la plataforma</option>
                {platforms.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {regions.length > 0 && (
            <Field label="Región" hint="Dónde juegas: tu ID es el mismo en todas.">
              <Select className="h-11" value={s.region} onChange={(e) => patch({ region: e.target.value })}>
                {!meta.idInfo.defaultRegion && <option value="">Sin región</option>}
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label={`Tu ${label}`} hint={showError ? <span className="text-danger">{normError}</span> : meta.idInfo.hint}>
            <Input
              className="h-11"
              value={s.raw}
              placeholder={meta.idInfo.placeholder}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              inputMode={numericId(game) ? 'numeric' : 'text'}
              maxLength={60}
              aria-invalid={!!showError || undefined}
              onChange={(e) => patch({ raw: e.target.value, message: null })}
            />
          </Field>
          {s.message && (
            <div className="flex flex-col gap-2 rounded-2xl bg-warn-soft px-4 py-3">
              <p role="status" className="text-sm text-warn">
                {s.message}
              </p>
              <button type="button" className="-mx-1 inline-flex min-h-11 items-center self-start px-1 text-meta font-semibold text-accent" onClick={saved}>
                Guardarlo así
              </button>
            </div>
          )}
          <section aria-labelledby="rango-del-id" className="flex flex-col gap-2">
            <h3 id="rango-del-id" className="text-sm font-semibold">
              Tu rango (opcional)
            </h3>
            <RankPicker game={game} value={s.ranks} onChange={(ranks) => patch({ ranks })} />
          </section>
        </form>
      );
      footer = (
        <Button
          variant="primary"
          size={size}
          className="w-full"
          disabled={!!rankError}
          loading={busy.isBusy('save')}
          onClick={() => void submit()}
          icon={lookupOn ? <Search className="size-5" /> : <Save className="size-5" />}
        >
          {lookupOn ? 'Buscar' : 'Guardar'}
        </Button>
      );
      break;
    }

    case 'found': {
      const f = s.found!;
      body = (
        <div className="flex flex-col gap-4 pb-1">
          <p className="text-meta text-muted">Buscamos {s.display || s.raw} en {meta.name} y encontramos esta cuenta:</p>
          <div className="flex flex-col items-center gap-2.5 rounded-3xl bg-surface-2 px-4 py-6 text-center">
            <GameMark game={game} size="lg" />
            <p className="text-[22px] font-semibold tracking-[-0.01em] break-all">{f.displayName}</p>
            {ranksLine(f.ranks, 'verificado')}
          </div>
          <h3 className="text-card-title text-center">¿Eres tú?</h3>
        </div>
      );
      footer = (
        <div className="flex gap-2">
          <Button variant="quiet" size={size} className="shrink-0" disabled={busy.isBusy()} onClick={() => patch({ step: 'edit', found: null, message: null })}>
            No soy yo
          </Button>
          <Button variant="primary" size={size} className="min-w-0 flex-1" loading={busy.isBusy('found')} onClick={() => void confirmFound(f.lookupId)}>
            Sí, soy yo
          </Button>
        </div>
      );
      break;
    }

    case 'taken': {
      const display = s.display || s.raw.trim();
      body = (
        <div className="flex flex-col items-center gap-2 pt-2 pb-1 text-center">
          <span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-warn-soft text-warn">
            <ShieldAlert className="size-7" />
          </span>
          <h3 className="mt-2 text-card-title">Ese ID está conectado a otra cuenta</h3>
          {display && <p className="text-meta font-semibold break-all">{display}</p>}
          <p className="max-w-sm text-body text-muted">{takenText(game)}</p>
        </div>
      );
      const other = (
        <Button
          variant={provider ? 'ghost' : 'primary'}
          size={provider ? 'md' : size}
          className={provider ? 'h-11 w-full' : 'w-full'}
          disabled={busy.isBusy()}
          onClick={() => patch({ step: 'edit', message: null })}
        >
          Prueba con otro ID
        </Button>
      );
      footer = provider ? (
        <div className="flex flex-col gap-2">
          <Button variant="primary" size={size} className="w-full" loading={busy.isBusy('link')} onClick={() => void connect()} icon={<Link2 className="size-5" />}>
            {connectLabel(provider)}
          </Button>
          {other}
        </div>
      ) : (
        other
      );
      break;
    }

    case 'rank': {
      body = (
        <div className="flex flex-col gap-4 pb-1">
          <p className="text-meta text-muted">El rango que pongas sale como «Declarado».</p>
          <RankPicker game={game} value={s.ranks} onChange={(ranks) => patch({ ranks })} />
        </div>
      );
      footer = (
        <div className="flex gap-2">
          <Button variant="quiet" size={size} className="shrink-0" disabled={busy.isBusy()} onClick={() => patch({ step: 'summary' })}>
            Volver
          </Button>
          <Button
            variant="primary"
            size={size}
            className="min-w-0 flex-1"
            disabled={!!rankError}
            loading={busy.isBusy('rank')}
            onClick={() => void saveRanks()}
            icon={<Trophy className="size-5" />}
          >
            Guardar rango
          </Button>
        </div>
      );
      break;
    }
  }

  return (
    <Sheet open onClose={onClose} title={meta.name} subtitle={meta.idInfo.label} footer={footer}>
      {body}
    </Sheet>
  );
}

/** Una opción de la hoja (como el menú «•••»): el ícono en su caja, qué hace y, debajo, una línea. 56 px. */
function ActionRow({
  icon,
  label,
  hint,
  onClick,
  danger,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cx(
          'flex min-h-14 w-full items-center gap-3.5 rounded-2xl px-2 py-2 text-left transition hover:bg-surface-2 active:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-70',
          danger && 'text-danger',
        )}
      >
        <span aria-hidden="true" className={cx('grid size-10 shrink-0 place-items-center rounded-xl', danger ? 'bg-danger-soft text-danger' : 'bg-surface-2 text-fg-2')}>
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-body font-semibold">{label}</span>
          {hint && <span className="block text-[13px] text-muted">{hint}</span>}
        </span>
        {!danger && <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-faint" />}
      </button>
    </li>
  );
}
