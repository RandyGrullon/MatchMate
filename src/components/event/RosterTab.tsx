import { useState } from 'react';
import { RefreshCw, UserPlus, Users, X } from 'lucide-react';
import { fetchEffectiveAverages, removeEntry, updateEntries, updateEntry } from '../../lib/data';
import { useLeagueCtx } from '../../lib/league';
import { calcHandicap, category } from '../../lib/stats';
import type { BowlingEvent, Entry, Player } from '../../lib/types';
import { useAction, useFeedback } from '../feedback';
import { NumberCell } from '../NumberCell';
import { Avatar } from '../Avatar';
import { Badge, Button, Card, Empty, Select } from '../ui';
import { CategoryBadge } from './CategoryBadge';
import { AddPlayersModal } from './AddPlayersModal';

/** Torneo: inscritos con su promedio, handicap y equipo. */
export function RosterTab({ event, entries, players }: { event: BowlingEvent; entries: Entry[]; players: Player[] }) {
  const { lid } = useLeagueCtx();
  const run = useAction();
  const { confirm } = useFeedback();
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const byId = new Map(players.map((p) => [p.id, p]));
  const teams = Object.entries(event.teams ?? {}).sort(([, a], [, b]) => a.order - b.order);
  const sorted = [...entries].sort((a, b) => (byId.get(a.playerId)?.name ?? '').localeCompare(byId.get(b.playerId)?.name ?? ''));

  async function remove(entry: Entry) {
    const name = byId.get(entry.playerId)?.name ?? 'jugador';
    const played = entry.scores?.some((s) => s != null);
    const ok = await confirm({
      title: `¿Sacar a ${name} del torneo?`,
      message: played ? 'Tiene juegos anotados en este torneo; se borran también.' : undefined,
      confirmText: 'Sacar',
      danger: true,
    });
    if (ok) await run(() => removeEntry(lid, entry), `${name} fuera del torneo`);
  }

  async function syncAverages() {
    const ok = await confirm({
      title: 'Actualizar promedios',
      message:
        'Se toma el promedio actual de cada inscrito (fijo o calculado con sus juegos verificados). Úsalo antes de empezar el torneo; el handicap se recalcula.',
      confirmText: 'Actualizar',
    });
    if (!ok) return;
    setSyncing(true);
    await run(async () => {
      const avgs = await fetchEffectiveAverages(lid, entries.map((e) => ({ id: e.playerId, averageOverride: byId.get(e.playerId)?.averageOverride ?? null })));
      await updateEntries(lid, entries.map((e) => ({ id: e.id, patch: { average: avgs.get(e.playerId) ?? 0 } })));
    }, 'Promedios actualizados');
    setSyncing(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setAdding(true)}>
          Inscribir jugadores
        </Button>
        {entries.length > 0 && (
          <Button icon={<RefreshCw className="size-4" />} loading={syncing} onClick={syncAverages}>
            Actualizar promedios
          </Button>
        )}
        <span className="ml-auto text-sm text-muted">{entries.length} inscritos</span>
      </div>

      {entries.length === 0 ? (
        <Empty icon={<Users className="size-8" />} title="Nadie inscrito todavía">
          Inscribe a los jugadores; entran con su promedio actual para calcular el handicap.
        </Empty>
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          <div className="hidden grid-cols-[1fr_11rem_5rem_6rem_2.5rem] items-center gap-3 px-4 py-2 text-xs font-medium text-muted md:grid">
            <span>Jugador</span>
            <span>Equipo</span>
            <span className="text-center">Promedio</span>
            <span className="text-center">Handicap</span>
            <span />
          </div>
          {sorted.map((e) => {
            const name = byId.get(e.playerId)?.name ?? '(jugador borrado)';
            const auto = calcHandicap(e.average, event.hcpBase, event.hcpPercent);
            return (
              <div key={e.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 px-4 py-3 md:grid-cols-[1fr_11rem_5rem_6rem_2.5rem] md:py-2">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={name} className="size-8 text-xs" />
                  <span className="truncate font-medium">{name}</span>
                  <CategoryBadge value={category(e.average, event.categoryCuts)} />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="md:order-last"
                  aria-label={`Sacar a ${name}`}
                  onClick={() => remove(e)}
                  icon={<X className="size-4" />}
                />
                <div className="col-span-2 flex flex-wrap items-end gap-3 md:contents">
                  <label className="flex flex-1 flex-col gap-1 md:contents">
                    <span className="text-[11px] text-muted md:hidden">Equipo</span>
                    <Select
                      value={e.teamId ?? ''}
                      onChange={(ev) => run(() => updateEntry(lid, e.id, { teamId: ev.target.value || null }))}
                      className="h-9 min-w-32"
                      aria-label="Equipo"
                    >
                      <option value="">Sin equipo</option>
                      {teams.map(([id, t]) => {
                        const size = entries.filter((x) => x.teamId === id).length;
                        const full = !!event.teamSize && size >= event.teamSize && e.teamId !== id;
                        return (
                          <option key={id} value={id} disabled={full}>
                            {t.name}
                            {event.teamSize ? ` (${size}/${event.teamSize})` : ''}
                            {full ? ' · lleno' : ''}
                          </option>
                        );
                      })}
                    </Select>
                  </label>
                  <label className="flex flex-col items-center gap-1 md:contents">
                    <span className="text-[11px] text-muted md:hidden">Promedio</span>
                    <NumberCell
                      label={`Promedio de ${name}`}
                      value={e.average}
                      onCommit={(v) => run(() => updateEntry(lid, e.id, { average: v ?? 0 }))}
                      className="md:justify-self-center"
                    />
                  </label>
                  <label className="flex flex-col items-center gap-1 md:flex-row md:justify-center">
                    <span className="text-[11px] text-muted md:hidden">Handicap</span>
                    <NumberCell
                      label={`Handicap de ${name}`}
                      value={e.handicapOverride}
                      placeholder={String(auto)}
                      allowEmpty
                      onCommit={(v) => run(() => updateEntry(lid, e.id, { handicapOverride: v }))}
                    />
                    {e.handicapOverride != null && <Badge className="hidden md:inline-flex">fijo</Badge>}
                  </label>
                </div>
              </div>
            );
          })}
        </Card>
      )}
      <p className="text-xs text-muted">
        El handicap vacío se calcula solo: ({event.hcpBase} − promedio) × {event.hcpPercent}%. Escribe un número para fijarlo a mano.
      </p>

      <AddPlayersModal open={adding} onClose={() => setAdding(false)} event={event} entries={entries} players={players} />
    </div>
  );
}
