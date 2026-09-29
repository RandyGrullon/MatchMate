import { useState } from 'react';
import { Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import { createPlayer } from '../../../../lib/data';
import { saveLeagueMatchRules } from '../../../../lib/data/racket';
import { createSeasonTeam, deleteSeasonTeam, pairName, setRoster, updateSeasonTeam, type SeasonTeam } from '../../../../lib/data/seasonTeams';
import { useLeagueCtx } from '../../../../lib/league';
import { useAction, useFeedback } from '../../../../components/feedback';
import { useQuickMinor } from '../../../../components/players/GuardianFields';
import { Badge, Button, Card, Empty, Field, Input, Modal, Select } from '../../../../components/ui';
import { Section } from '../bits';
import { presetOf, presetsOf, rulesText } from '../logic/rulesText';
import { formatLevel, parseLevelInput, setLevel, useLevels } from '../levels';
import { useNames } from '../names';
import { useRacket } from '../sport';

/**
 * Admin › Parejas y niveles: las reglas del partido de la liga, las parejas de la temporada (id estable: la tabla
 * es de la pareja; las estadísticas, de quien juega) y el nivel de cada jugador en la escala del deporte
 * (pádel Playtomic 0–7, tenis NTRP, pickleball DUPR: ronda 1 del mexicano, cajas del primer mes y siembra).
 */
export default function PairsAdmin() {
  const { sport, rules, doubles } = useRacket();
  const { lid } = useLeagueCtx();
  const run = useAction();
  const current = presetOf(sport, rules);
  return (
    <div className="flex flex-col gap-6">
      <Section title="Reglas del partido">
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-sm">
            Ahora: <b>{rulesText(rules)}</b>
          </p>
          <div className="flex flex-col gap-2">
            {presetsOf(sport).map((p) => (
              <Button
                key={p.id}
                variant={current?.id === p.id ? 'primary' : 'secondary'}
                className="h-auto min-h-11 justify-start py-2 text-left"
                onClick={() => void run(() => saveLeagueMatchRules(lid, p.rules as unknown as Record<string, unknown>), 'Reglas guardadas')}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted">Valen para los partidos nuevos. Los que ya están creados se quedan con sus reglas (el admin las cambia antes de empezar cada uno).</p>
        </Card>
      </Section>
      {/* Pádel siempre es de dobles; en tenis y pickleball, aunque las reglas sean de individual, las cajas y la escalera
          de dobles piden parejas. */}
      {(doubles || sport !== 'padel') && <PairsSection />}
      <LevelsSection />
    </div>
  );
}

function PairsSection() {
  const { lid } = useLeagueCtx();
  const names = useNames();
  const run = useAction();
  const { confirm } = useFeedback();
  const [editing, setEditing] = useState<SeasonTeam | 'new' | null>(null);
  const paired = new Set(names.teams.flatMap((t) => t.roster.map((r) => r.playerId)));
  const free = names.players.filter((p) => !paired.has(p.id)).length;

  return (
    <Section
      title={`Parejas (${names.teams.length})`}
      action={
        <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
          Pareja
        </Button>
      }
    >
      {names.teams.length ? (
        <Card className="divide-y divide-line overflow-hidden">
          {names.teams.map((t) => (
            <div key={t.id} className="flex items-center gap-2 px-4 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{t.name}</span>
                <span className="block truncate text-xs text-muted">{t.roster.map((r) => names.nameOf(r.playerId)).join(' / ') || 'Sin jugadores'}</span>
              </span>
              {t.roster.length !== 2 && <Badge tone="warn">{t.roster.length} jugadores</Badge>}
              <Button size="sm" variant="ghost" icon={<Pencil className="size-4" />} aria-label={`Editar ${t.name}`} onClick={() => setEditing(t)} />
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 className="size-4" />}
                aria-label={`Borrar ${t.name}`}
                onClick={async () => {
                  if (await confirm({ title: `¿Borrar ${t.name}?`, message: 'Sus partidos se quedan con el nombre de la pareja.', confirmText: 'Borrar', danger: true }))
                    await run(() => deleteSeasonTeam(lid, t.id), 'Pareja borrada');
                }}
              />
            </div>
          ))}
        </Card>
      ) : (
        <Empty title="Todavía no hay parejas">Para la liga de parejas y los torneos, arma las parejas aquí. El americano y el mexicano no las necesitan.</Empty>
      )}
      {free > 0 && names.teams.length > 0 && <p className="px-1 text-xs text-muted">{free} jugadores sin pareja.</p>}
      {editing && <PairEditor team={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Section>
  );
}

function PairEditor({ team, onClose }: { team: SeasonTeam | null; onClose: () => void }) {
  const { lid } = useLeagueCtx();
  const names = useNames();
  const run = useAction();
  const [a, setA] = useState(team?.roster[0]?.playerId ?? '');
  const [b, setB] = useState(team?.roster[1]?.playerId ?? '');
  const [name, setName] = useState(team?.name ?? '');
  const [busy, setBusy] = useState(false);
  const paired = new Set(names.teams.filter((t) => t.id !== team?.id).flatMap((t) => t.roster.map((r) => r.playerId)));
  const options = [...names.players].sort((x, y) => Number(paired.has(x.id)) - Number(paired.has(y.id)) || x.name.localeCompare(y.name, 'es'));
  const auto = pairName([a, b].filter(Boolean).map(names.nameOf));

  const save = async () => {
    setBusy(true);
    const players = [a, b].filter(Boolean).map((playerId) => ({ playerId }));
    const finalName = name.trim() || auto;
    const ok = await run(async () => {
      if (team) {
        if (finalName !== team.name) await updateSeasonTeam(lid, team.id, { name: finalName });
        await setRoster(lid, team.id, players);
      } else {
        await createSeasonTeam(lid, { name: finalName, players });
      }
      return true;
    }, team ? 'Pareja guardada' : 'Pareja creada');
    setBusy(false);
    if (ok) onClose();
  };

  const select = (value: string, set: (v: string) => void, other: string, label: string) => (
    <Field label={label}>
      <Select value={value} onChange={(e) => set(e.target.value)}>
        <option value="">(elige)</option>
        {options.map((p) => (
          <option key={p.id} value={p.id} disabled={p.id === other}>
            {p.name}
            {paired.has(p.id) ? ' (ya tiene pareja)' : ''}
          </option>
        ))}
      </Select>
    </Field>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={team ? `Editar ${team.name}` : 'Nueva pareja'}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} disabled={!a || !b || !(name.trim() || auto)} onClick={() => void save()}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {select(a, setA, b, 'Jugador 1 (drive)')}
        {select(b, setB, a, 'Jugador 2 (revés)')}
        <Field label="Nombre de la pareja" hint="Si lo dejas vacío: los dos nombres.">
          <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={auto || 'Ana / Luis'} />
        </Field>
        <p className="text-xs text-muted">Si un día falta alguien, en el partido se pone al suplente («Quién juega»): la pareja suma y las estadísticas van a quien jugó.</p>
      </div>
    </Modal>
  );
}

function LevelsSection() {
  const { lid } = useLeagueCtx();
  const { sport } = useRacket();
  const names = useNames();
  const { levels, scale } = useLevels();
  const run = useAction();
  const [newName, setNewName] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Liga con menores: «Es menor de edad» y su tutor debajo del nombre.
  const minor = useQuickMinor(!!newName.trim());

  const save = async (id: string) => {
    const raw = drafts[id];
    if (raw === undefined) return;
    const v = parseLevelInput(raw, scale);
    if (v === 'invalido') return;
    await run(() => setLevel(lid, id, sport, v));
    setDrafts((d) => {
      const next = { ...d };
      delete next[id];
      return next;
    });
  };

  return (
    <Section title={`Jugadores y ${scale.key === 'level' ? 'nivel' : scale.label} (${names.players.length})`}>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const n = newName.trim();
          if (!n) return;
          const m = minor.take();
          if (m === undefined) return;
          if (await run(() => createPlayer(lid, n, null, m), `${n} agregado`)) {
            setNewName('');
            minor.reset();
          }
        }}
      >
        <Input value={newName} maxLength={60} onChange={(e) => setNewName(e.target.value)} placeholder="Agregar jugador" aria-label="Nombre del jugador nuevo" />
        <Button type="submit" icon={<UserPlus className="size-4" />} disabled={!newName.trim()} aria-label="Agregar jugador" />
      </form>
      {minor.fields}
      {names.players.length ? (
        <Card className="divide-y divide-line overflow-hidden">
          {names.players.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-2">
              <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
              <Input
                className="w-20 text-center"
                inputMode="decimal"
                aria-label={`${scale.label} de ${p.name}`}
                placeholder={scale.placeholder}
                value={drafts[p.id] ?? (levels[p.id] != null ? formatLevel(levels[p.id], scale) : '')}
                onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                onBlur={() => void save(p.id)}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            </div>
          ))}
        </Card>
      ) : (
        <Empty title="Sin jugadores" />
      )}
      <p className="px-1 text-xs text-muted">{scale.hint}</p>
    </Section>
  );
}
