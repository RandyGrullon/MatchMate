import { useState } from 'react';
import { LADDERS, rankLabel, validateRank, type GameId, type Ladder, type RankMap, type RankValue } from '../../../sports/esports';
import { Field, Input, Segmented, Select } from '../../../components/ui';
import {
  defaultRankKey,
  divsOf,
  isNumberRank,
  isTextRank,
  isTierRank,
  mmrProposal,
  numberRank,
  pickTier,
  rankKeysFor,
  setRank,
  type RankKey,
} from '../logic';

const KEY_LABEL: Record<RankKey, string> = { main: 'Rango', '1v1': '1v1', '2v2': '2v2', '3v3': '3v3' };

/**
 * El rango declarado de un juego (opcional, §6.2): la escalera del catálogo (tier y, si tiene, división), un número
 * (CS Rating, trofeos) o un texto corto. Rocket League va por modo (1v1 · 2v2 · 3v3) y en cada uno «Tu MMR (opcional)»
 * propone el rango con la tabla de la temporada («aprox., temporada actual»). Cada cambio llega completo en `onChange`.
 */
export function RankPicker({ game, value, onChange }: { game: GameId; value: RankMap; onChange: (v: RankMap) => void }) {
  const keys = rankKeysFor(game);
  const [key, setKey] = useState<RankKey>(defaultRankKey(game));
  const ladder = LADDERS[game];
  const current = value[key] ?? null;
  const set = (v: RankValue | null) => onChange(setRank(value, key, v));
  const error = current ? validateRank(game, key, current) : null;

  return (
    <div className="flex flex-col gap-3">
      {keys.length > 1 && (
        <Segmented<RankKey>
          label="Modo del rango"
          full
          value={key}
          onChange={setKey}
          options={keys.map((k) => ({ key: k, label: KEY_LABEL[k], ariaLabel: `Rango en ${KEY_LABEL[k]}` }))}
        />
      )}
      {ladder.kind === 'tiers' ? (
        <TierInput key={key} game={game} ladder={ladder} rankKey={key} value={current} onChange={set} />
      ) : ladder.kind === 'number' ? (
        <NumberInput key={key} ladder={ladder} value={current} onChange={set} />
      ) : (
        <Field label="Tu rango (opcional)" hint="Como sale en el juego.">
          <Input
            className="h-11"
            maxLength={24}
            value={isTextRank(current) ? current.text : ''}
            placeholder="Por ejemplo: Tekken King"
            onChange={(e) => set(e.target.value.trim() ? { text: e.target.value.slice(0, 24) } : null)}
          />
        </Field>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function TierInput({
  game,
  ladder,
  rankKey,
  value,
  onChange,
}: {
  game: GameId;
  ladder: Extract<Ladder, { kind: 'tiers' }>;
  rankKey: RankKey;
  value: RankValue | null;
  onChange: (v: RankValue | null) => void;
}) {
  const tier = isTierRank(value) ? value : null;
  const divs = tier ? divsOf(ladder, tier.tier) : [];
  const perMode = ladder.perMode && rankKey !== 'main';
  const [mmr, setMmr] = useState(tier?.mmr != null ? String(tier.mmr) : '');
  const proposal = perMode ? mmrProposal(rankKey as '1v1' | '2v2' | '3v3', mmr) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 max-[359px]:grid-cols-1">
        <Field label="Tu rango (opcional)" className={divs.length ? undefined : 'col-span-2 max-[359px]:col-span-1'}>
          <Select
            className="h-11"
            value={tier?.tier ?? ''}
            onChange={(e) => {
              setMmr('');
              onChange(pickTier(ladder, e.target.value));
            }}
          >
            <option value="">Sin rango</option>
            {ladder.tiers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        {tier && divs.length > 0 && (
          <Field label={ladder.divWord || 'División'}>
            <Select className="h-11" value={String(tier.div ?? divs[0])} onChange={(e) => onChange({ tier: tier.tier, div: Number(e.target.value) })}>
              {divs.map((d) => (
                <option key={d} value={d}>
                  {rankLabel(game, { tier: tier.tier, div: d })}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      {perMode && (
        <Field
          label="Tu MMR (opcional)"
          hint={
            proposal
              ? `Con ${Number(mmr).toLocaleString('es-DO')} de MMR: ${rankLabel(game, proposal)} (aprox., temporada actual).`
              : mmr.trim()
                ? 'Escribe un número de −100 a 3000.'
                : 'Si lo sabes, te proponemos el rango (aprox., temporada actual).'
          }
        >
          <Input
            className="h-11"
            inputMode="numeric"
            maxLength={5}
            value={mmr}
            placeholder="1250"
            onChange={(e) => {
              const raw = e.target.value.replace(/[^\d-]/g, '');
              setMmr(raw);
              const p = mmrProposal(rankKey as '1v1' | '2v2' | '3v3', raw);
              if (p) onChange(p);
            }}
          />
        </Field>
      )}
      {perMode && <p className="text-xs text-muted">Pon el de cada modo que juegas: los torneos piden el de su modo.</p>}
    </div>
  );
}

function NumberInput({ ladder, value, onChange }: { ladder: Extract<Ladder, { kind: 'number' }>; value: RankValue | null; onChange: (v: RankValue | null) => void }) {
  const [raw, setRaw] = useState(isNumberRank(value) ? String(value.value) : '');
  return (
    <Field label={`Tu ${ladder.label} (opcional)`} hint={`De ${ladder.min.toLocaleString('es-DO')} a ${ladder.max.toLocaleString('es-DO')}.`}>
      <Input
        className="h-11"
        inputMode="numeric"
        maxLength={8}
        value={raw}
        placeholder="0"
        onChange={(e) => {
          const s = e.target.value.replace(/[^\d]/g, '');
          setRaw(s);
          onChange(numberRank(s));
        }}
      />
    </Field>
  );
}
