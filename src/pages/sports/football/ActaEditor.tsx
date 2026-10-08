import { useMemo, useState } from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { adminCorrectResult, type Match } from '../../../lib/data/matches';
import type { Side } from '../../../sports/types';
import { useAction } from '../../../components/feedback';
import { Button, Field, Input, Segmented, Select, Sheet, cx } from '../../../components/ui';
import { rosterOf } from '../team/logic';
import type { TeamLeague } from '../team/useTeamLeague';
import { correctedScore, decodeLines, pensFromScore, type ScoreLine } from './adapter';

/**
 * Admin: corregir el acta de un partido ya anotado (el comité revisó el acta del árbitro): goles, penales y, por
 * jugador, si jugó, goles, asistencias, autogoles, amarillas, roja directa y portero. De aquí salen goleadores,
 * tarjetas, vallas invictas y las suspensiones. Queda confirmado (con historial).
 */
export function ActaEditor({ tl, match: m, open, onClose }: { tl: TeamLeague; match: Match; open: boolean; onClose: () => void }) {
  const run = useAction();
  const [tab, setTab] = useState<'1' | '2'>('1');
  const [lines, setLines] = useState<ScoreLine[]>(() => decodeLines(m.score?.lines));
  const [goals, setGoals] = useState<[string, string]>(() => {
    const s = m.score?.sides;
    return [String(s?.[0] ?? 0), String(s?.[1] ?? 0)];
  });
  const [pens, setPens] = useState<[string, string]>(() => {
    const p = pensFromScore(m.score);
    return p ? [String(p[0]), String(p[1])] : ['', ''];
  });
  const [adding, setAdding] = useState('');
  const [busy, setBusy] = useState(false);

  const side = (tab === '1' ? 1 : 2) as Side;
  const names = m.sides.map((s) => tl.teamOf(s.teamId)?.name ?? s.label);
  const roster = useMemo(() => rosterOf(tl.allTeams.data, m.sides[side - 1].teamId), [tl.allTeams.data, m.sides, side]);
  const mine = lines.filter((l) => l.side === side);
  const candidates = [...roster.map((r) => r.playerId), ...tl.players.data.map((p) => p.id)].filter((id, i, a) => a.indexOf(id) === i && !lines.some((l) => l.playerId === id));
  const num = (v: string) => (/^\d{1,2}$/.test(v.trim()) ? Number(v) : null);
  const a = num(goals[0]);
  const b = num(goals[1]);
  const pa = num(pens[0]);
  const pb = num(pens[1]);
  const tied = a !== null && a === b;
  const pensSet = tied && pa !== null && pb !== null;
  const valid = a !== null && b !== null && (!pensSet || pa !== pb) && (pens[0] === '' || pa !== null) && (pens[1] === '' || pb !== null);
  const scorerGoals = (s: Side) => lines.filter((l) => l.side === s).reduce((n, l) => n + l.goals, 0) + lines.filter((l) => l.side !== s).reduce((n, l) => n + l.ownGoals, 0);
  const mismatch = a !== null && b !== null && (scorerGoals(1) > a || scorerGoals(2) > b);

  const patch = (id: string, p: Partial<ScoreLine>) => setLines((ls) => ls.map((l) => (l.side === side && l.playerId === id ? { ...l, ...p } : l)));
  const add = (id: string) => {
    if (!id) return;
    setLines((ls) => [...ls, { playerId: id, side, played: true, goals: 0, assists: 0, ownGoals: 0, yellows: 0, red: null, keeper: false, conceded: 0 }]);
    setAdding('');
  };

  const save = async () => {
    if (!valid || a === null || b === null) return;
    setBusy(true);
    const { score, winner } = correctedScore({ old: m.score, lines, sides: [a, b], pens: pensSet ? [pa!, pb!] : null });
    const ok = await run(async () => {
      await adminCorrectResult(tl.lid, m.id, { score, winner, note: 'Acta corregida' });
      return true;
    }, 'Acta corregida');
    setBusy(false);
    if (ok) onClose();
  };

  const stepper = (label: string, value: number, set: (n: number) => void, max = 20) => (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[11px] font-semibold text-muted">{label}</span>
      <div className="flex items-center rounded-xl bg-surface-2">
        <Button variant="ghost" size="lg" icon={<Minus className="size-4" />} aria-label={`Menos ${label}`} disabled={value <= 0} onClick={() => set(value - 1)} />
        <span className="num w-5 text-center text-[17px] font-bold">{value}</span>
        <Button variant="ghost" size="lg" icon={<Plus className="size-4" />} aria-label={`Más ${label}`} disabled={value >= max} onClick={() => set(value + 1)} />
      </div>
    </div>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Corregir el acta"
      subtitle="Al guardar, el resultado queda confirmado"
      footer={
        <Button variant="primary" size="lg" className="w-full" loading={busy} disabled={!valid} onClick={() => void save()}>
          Guardar el acta
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pb-1">
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Goles ${names[0]}`}>
            <Input inputMode="numeric" value={goals[0]} onChange={(e) => setGoals([e.target.value, goals[1]])} />
          </Field>
          <Field label={`Goles ${names[1]}`}>
            <Input inputMode="numeric" value={goals[1]} onChange={(e) => setGoals([goals[0], e.target.value])} />
          </Field>
          {tied && (
            <>
              <Field label={`Penales ${names[0]}`} hint="Solo si hubo tanda">
                <Input inputMode="numeric" value={pens[0]} onChange={(e) => setPens([e.target.value, pens[1]])} />
              </Field>
              <Field label={`Penales ${names[1]}`}>
                <Input inputMode="numeric" value={pens[1]} onChange={(e) => setPens([pens[0], e.target.value])} />
              </Field>
            </>
          )}
        </div>
        {pensSet && pa === pb && <p className="text-sm text-danger">La tanda de penales no termina empatada.</p>}
        {mismatch && <p className="text-sm text-warn">Los goles por jugador suman más que el marcador: revisa.</p>}

        <Segmented
          full
          label="Equipo"
          options={[1, 2].map((s) => ({
            key: String(s) as '1' | '2',
            label: (
              <>
                <span className="min-w-0 truncate">{names[s - 1]}</span>
                <span className="num text-muted">{lines.filter((l) => l.side === s && l.played).length}</span>
              </>
            ),
          }))}
          value={tab}
          onChange={setTab}
        />
        <ul className="flex flex-col divide-y divide-line">
          {mine.map((l) => (
            <li key={l.playerId} className="flex flex-col gap-2 py-3">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{tl.nameOf(l.playerId)}</span>
                <label className="flex min-h-11 items-center gap-1.5 text-sm">
                  <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={l.played} onChange={(e) => patch(l.playerId, { played: e.target.checked })} />
                  Jugó
                </label>
                <label className="flex min-h-11 items-center gap-1.5 text-sm">
                  <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={l.keeper} onChange={(e) => patch(l.playerId, { keeper: e.target.checked })} />
                  Portero
                </label>
                <Button
                  variant="ghost"
                  size="lg"
                  icon={<Trash2 className="size-4" />}
                  aria-label={`Quitar a ${tl.nameOf(l.playerId)} del acta`}
                  onClick={() => setLines((ls) => ls.filter((x) => !(x.side === side && x.playerId === l.playerId)))}
                />
              </div>
              <div className="flex flex-wrap items-end gap-3">
                {stepper('Goles', l.goals, (n) => patch(l.playerId, { goals: n }))}
                {stepper('Asist.', l.assists, (n) => patch(l.playerId, { assists: n }))}
                {stepper('Autogol', l.ownGoals, (n) => patch(l.playerId, { ownGoals: n }))}
                {stepper('Amarillas', l.yellows, (n) => patch(l.playerId, { yellows: n, red: n >= 2 ? 'second_yellow' : l.red === 'second_yellow' ? null : l.red }), 2)}
                <label className={cx('flex min-h-11 items-center gap-1.5 text-sm', l.red === 'second_yellow' && 'text-muted')}>
                  <input
                    type="checkbox"
                    className="size-5 accent-[var(--accent)]"
                    disabled={l.red === 'second_yellow'}
                    checked={l.red === 'direct' || l.red === 'second_yellow'}
                    onChange={(e) => patch(l.playerId, { red: e.target.checked ? 'direct' : null })}
                  />
                  {l.red === 'second_yellow' ? 'Roja (doble amarilla)' : 'Roja directa'}
                </label>
              </div>
            </li>
          ))}
          {!mine.length && <li className="py-3 text-meta text-muted">Nadie de este equipo en el acta todavía.</li>}
        </ul>
        <Field label="Agregar al acta">
          <Select value={adding} onChange={(e) => add(e.target.value)}>
            <option value="">{candidates.length ? 'Elige un jugador…' : 'No hay más jugadores'}</option>
            {candidates.map((id) => (
              <option key={id} value={id}>
                {tl.nameOf(id)}
                {roster.some((r) => r.playerId === id) ? '' : ' (fuera de la plantilla)'}
              </option>
            ))}
          </Select>
        </Field>
        <p className="text-[13px] text-muted">Las suspensiones y las tablas se recalculan solas.</p>
      </div>
    </Sheet>
  );
}
