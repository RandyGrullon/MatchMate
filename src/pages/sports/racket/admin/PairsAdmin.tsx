import { useState } from 'react';
import { Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import { createPlayer } from '../../../../lib/data';
import { saveLeagueMatchRules } from '../../../../lib/data/racket';
import { createSeasonTeam, deleteSeasonTeam, pairName, setRoster, updateSeasonTeam, type SeasonTeam } from '../../../../lib/data/seasonTeams';
import { useLeagueCtx } from '../../../../lib/league';
import { BusyIcon, useBusy } from '../../../../components/busy';
import { useAction, useFeedback } from '../../../../components/feedback';
import { useQuickMinor } from '../../../../components/players/GuardianFields';
import { Badge, Button, Card, Empty, Field, Input, Select, Sheet, sectionLinkClass } from '../../../../components/ui';
import { PresetButtons, Section } from '../bits';
import { SaveFooter } from '../night/parts';
import { presetOf, presetsOf, rulesText } from '../logic/rulesText';
import { formatLevel, parseLevelInput, setLevel, useLevels } from '../levels';
import { useNames } from '../names';
import { useRacket } from '../sport';

/**
 * Organizar › Parejas y niveles (rediseño «Calma y foco»: secciones con su título, filas sin bordes y hojas desde abajo):
 * las reglas del partido de la liga, las parejas de la temporada (id estable: la tabla es de la pareja; las
 * estadísticas, de quien juega) y el nivel de cada jugador en la escala del deporte (pádel Playtomic 0–7, tenis NTRP,
 * pickleball DUPR, ping pong 1–10: ronda 1 del mexicano, cajas del primer mes y siembra).
 */
export default function PairsAdmin() {
  const { sport, rules, doubles } = useRacket();
  const { lid } = useLeagueCtx();
  const run = useAction();
  const saving = useBusy();
  const current = presetOf(sport, rules);
  return (
    <div className="flex flex-col gap-[30px]">
      <Section title="Reglas del partido">
        <Card className="flex flex-col gap-3 px-5 pt-[18px] pb-5">
          <p className="text-[15px] text-fg-2">
            Ahora: <b className="text-fg">{rulesText(rules)}</b>
          </p>
          <PresetButtons
            presets={presetsOf(sport)}
            current={current?.id}
            pending={saving.busy}
            className="min-h-11"
            onPick={(p) => void saving.run(p.id, () => run(() => saveLeagueMatchRules(lid, p.rules as unknown as Record<string, unknown>), 'Reglas guardadas'))}
          />
          <p className="text-[13px] text-muted">Valen para los partidos nuevos.</p>
        </Card>
      </Section>
      {/* Pádel siempre es de dobles; en tenis, pickleball y ping pong, aunque las reglas sean de individual, las cajas y
          la escalera de dobles piden parejas. */}
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
  const deleting = useBusy();
  const [editing, setEditing] = useState<SeasonTeam | 'new' | null>(null);
  const paired = new Set(names.teams.flatMap((t) => t.roster.map((r) => r.playerId)));
  const free = names.players.filter((p) => !paired.has(p.id)).length;

  return (
    <Section
      title={`Parejas (${names.teams.length})`}
      action={
        <button type="button" onClick={() => setEditing('new')} className={sectionLinkClass} aria-haspopup="dialog">
          <Plus aria-hidden="true" className="size-[18px]" strokeWidth={2.4} />
          Pareja
        </button>
      }
    >
      {names.teams.length ? (
        <Card className="overflow-hidden">
          {names.teams.map((t) => (
            <div key={t.id} className="mm-row relative flex min-h-16 items-center gap-1 py-2 pr-2 pl-5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{t.name}</span>
                <span className="block truncate text-[13px] text-muted">{t.roster.map((r) => names.nameOf(r.playerId)).join(' / ') || 'Sin jugadores'}</span>
              </span>
              {t.roster.length !== 2 && <Badge tone="danger">{t.roster.length} jugadores</Badge>}
              <Button variant="ghost" className="size-11 rounded-full" icon={<Pencil className="size-4" />} aria-label={`Editar ${t.name}`} onClick={() => setEditing(t)} />
              <Button
                variant="ghost"
                className="size-11 rounded-full text-faint"
                icon={<Trash2 className="size-4" />}
                aria-label={`Borrar ${t.name}`}
                loading={deleting.isBusy(t.id)}
                disabled={deleting.isBusy()}
                onClick={async () => {
                  if (await confirm({ title: `¿Borrar ${t.name}?`, message: 'Sus partidos se quedan con el nombre de la pareja.', confirmText: 'Borrar', danger: true }))
                    await deleting.run(t.id, () => run(() => deleteSeasonTeam(lid, t.id), 'Pareja borrada'));
                }}
              />
            </div>
          ))}
        </Card>
      ) : (
        <Empty title="Todavía no hay parejas">Para la liga de parejas y los torneos. El americano no las necesita.</Empty>
      )}
      {free > 0 && names.teams.length > 0 && <p className="mx-1 text-[13px] text-muted">{free} jugadores sin pareja.</p>}
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
    <Sheet
      open
      onClose={onClose}
      title={team ? `Editar ${team.name}` : 'Nueva pareja'}
      footer={<SaveFooter onClose={onClose} busy={busy} disabled={!a || !b || !(name.trim() || auto)} onSave={() => void save()} />}
    >
      <div className="flex flex-col gap-3 pb-1">
        {select(a, setA, b, 'Jugador 1 (drive)')}
        {select(b, setB, a, 'Jugador 2 (revés)')}
        <Field label="Nombre de la pareja" hint="Si lo dejas vacío: los dos nombres.">
          <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={auto || 'Ana / Luis'} />
        </Field>
        <p className="text-[13px] text-muted">Si un día falta alguien, en el partido se pone al suplente («Quién juega»).</p>
      </div>
    </Sheet>
  );
}

function LevelsSection() {
  const { lid } = useLeagueCtx();
  const { sport } = useRacket();
  const names = useNames();
  const { levels, scale } = useLevels();
  const run = useAction();
  const adding = useBusy();
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
    <Section title={`Jugadores y ${scale.label === 'Nivel' ? 'nivel' : scale.label} (${names.players.length})`}>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const n = newName.trim();
          if (!n) return;
          const m = minor.take();
          if (m === undefined) return;
          void adding.run('agregar', async () => {
            if (await run(() => createPlayer(lid, n, null, m), `${n} agregado`)) {
              setNewName('');
              minor.reset();
            }
          });
        }}
      >
        <Input value={newName} maxLength={60} onChange={(e) => setNewName(e.target.value)} placeholder="Agregar jugador" aria-label="Nombre del jugador nuevo" />
        <Button type="submit" variant="soft" className="size-10 shrink-0 rounded-xl" icon={<UserPlus className="size-4" />} loading={adding.isBusy()} disabled={!newName.trim()} aria-label="Agregar jugador" />
      </form>
      {minor.fields}
      {names.players.length ? (
        <Card className="overflow-hidden">
          {names.players.map((p) => (
            <LevelRow
              key={p.id}
              name={p.name}
              label={`${scale.label} de ${p.name}`}
              placeholder={scale.placeholder}
              value={drafts[p.id] ?? (levels[p.id] != null ? formatLevel(levels[p.id], scale) : '')}
              onChange={(v) => setDrafts((d) => ({ ...d, [p.id]: v }))}
              onSave={() => save(p.id)}
            />
          ))}
        </Card>
      ) : (
        <Empty title="Sin jugadores" />
      )}
      <p className="mx-1 text-[13px] text-muted">{scale.hint}</p>
    </Section>
  );
}

/** El nivel de un jugador: se guarda al salir del campo, con la ruedita al lado mientras guarda (cada fila la suya). */
function LevelRow({
  name,
  label,
  placeholder,
  value,
  onChange,
  onSave,
}: {
  name: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => Promise<void>;
}) {
  const saving = useBusy();
  const busy = saving.isBusy();
  return (
    <div className="mm-row relative flex min-h-14 items-center gap-3 py-2 pr-4 pl-5">
      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{name}</span>
      <BusyIcon busy={busy} className="size-4 shrink-0 text-muted" />
      {/* El campo en su caja de 80 px (el Input trae w-full). */}
      <div className="w-20 shrink-0">
        <Input
          className="num text-center"
          inputMode="decimal"
          aria-label={label}
          aria-busy={busy || undefined}
          disabled={busy}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => void saving.run('nivel', onSave)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </div>
    </div>
  );
}
