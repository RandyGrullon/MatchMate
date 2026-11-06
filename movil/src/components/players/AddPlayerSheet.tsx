import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Waves } from 'lucide-react-native';
import { useLeagueCtx } from '@mm/lib/league';
import { leagueSport } from '@mm/sports/registry';
import { addManyMinors, addManyPlayers, addPlayerWithStats } from '@mm/components/players/data';
import {
  MAX_MANY,
  emptyDraft,
  emptyGuardian,
  guardianProblem,
  manyAddedToast,
  manyCountLine,
  oneAddedToast,
  parseManyMinors,
  parseManyNames,
  parseStats,
  statKind,
  statWord,
  type GuardianDraft,
  type StatDraft,
} from '@mm/components/players/logic';
import { toast } from '@/components/feedback';
import { runAction } from '@/components/swimming/parts';
import { Button, Field, Input, Segmented, Sheet, Txt } from '@/components/ui';
import { openOnWeb } from '@/lib/web';
import { useColors } from '@/theme/theme';
import { ConsentCheck, GuardianFields, MinorCheck, SportStatFields } from './fields';

type Mode = 'uno' | 'varios';

/** Una lista de varias líneas (el <textarea rows={8}> de la web). */
function Lines({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  return <Input multiline textAlignVertical="top" value={value} onChangeText={onChange} placeholder={placeholder} accessibilityLabel={label} style={{ height: 28 + 8 * 24, paddingTop: 14, paddingBottom: 14 }} />;
}

/**
 * Agregar jugador (AddPlayerModal de la web, con su misma lógica): a uno con el número de su deporte o a varios (un
 * nombre por línea). En una liga con menores pregunta «Es menor de edad» (marcado de entrada) y pide su tutor; en
 * «Varios», «Nombre, tutor, teléfono» por línea. En natación los nadadores se anotan en su pestaña (en la web). Se
 * monta abierta: cada vez empieza vacía.
 */
export function AddPlayerSheet({ onClose, existingNames }: { onClose: () => void; existingNames: readonly string[] }) {
  const c = useColors();
  const { lid, league } = useLeagueCtx();
  const sport = leagueSport(league);
  const kind = statKind(sport);
  const [mode, setMode] = useState<Mode>('uno');
  const [name, setName] = useState('');
  const [draft, setDraft] = useState<StatDraft>(emptyDraft);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Liga con menores: de entrada se registra como menor (se desmarca para un adulto, p. ej. el entrenador).
  const minorsOk = !!league.hasMinors;
  const [isMinor, setIsMinor] = useState(minorsOk);
  const [guardian, setGuardian] = useState<GuardianDraft>(emptyGuardian);
  const [manyMinors, setManyMinors] = useState(minorsOk);
  const [manyConsent, setManyConsent] = useState(false);

  const minorOne = minorsOk && isMinor;
  const minorMode = minorsOk && manyMinors;
  const many = useMemo(() => parseManyNames(text, existingNames), [text, existingNames]);
  const minors = useMemo(() => (minorMode ? parseManyMinors(text, existingNames) : null), [minorMode, text, existingNames]);
  const count = minors ? minors.rows.length : many.names.length;
  const tooMany = count > MAX_MANY;
  const minorsBlocked = !!minors && (minors.noGuardian.length > 0 || minors.badPhone.length > 0 || !manyConsent);
  const word = statWord(sport);

  async function submitOne() {
    if (busy) return;
    const parsed = parseStats(sport, draft);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    const problem = minorOne ? guardianProblem(guardian) : null;
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setBusy(true);
    const minor = minorOne ? { guardianName: guardian.guardianName, guardianPhone: guardian.guardianPhone, consent: guardian.consent } : null;
    const r = await runAction(() => addPlayerWithStats(lid, sport, name, parsed.stats, minor));
    setBusy(false);
    if (!r) return;
    const done = oneAddedToast(name, r.statsSaved, word);
    toast(done.text, done.tone);
    onClose();
  }

  async function submitMany() {
    if (busy || !count || tooMany || minorsBlocked) return;
    setBusy(true);
    const r = await runAction(() => (minors ? addManyMinors(lid, minors.rows, manyConsent) : addManyPlayers(lid, many.names)));
    setBusy(false);
    if (!r) return;
    const done = manyAddedToast(r);
    toast(done.text, done.tone);
    onClose();
  }

  if (kind === 'swimming') {
    return (
      <Sheet
        open
        onClose={onClose}
        title="Agregar nadador"
        footer={
          <Button
            variant="primary"
            size="xl"
            full
            icon={<Waves size={20} color={c.accentFg} />}
            onPress={() => {
              onClose();
              void openOnWeb(`/l/${lid}/admin?tab=nadadores`);
            }}
          >
            Ir a Nadadores
          </Button>
        }
      >
        <Txt tone="fg2">
          {'Los nadadores se anotan en '}
          <Txt variant="bodyStrong" tone="fg2">
            Nadadores
          </Txt>
          {
            ': ahí va su año de nacimiento, su sexo y su club, y los menores con el nombre de su tutor (los menores no tienen cuenta).'
          }
        </Txt>
      </Sheet>
    );
  }

  const existing = minors ? minors.existing : many.existing;
  const repeated = minors ? minors.repeated : many.repeated;
  return (
    <Sheet
      open
      onClose={onClose}
      title="Agregar jugador"
      footer={
        <Button
          variant="primary"
          size="xl"
          full
          loading={busy}
          // El nombre es obligatorio (el `required` de la web).
          disabled={mode === 'uno' ? !name.trim() : count === 0 || tooMany || minorsBlocked}
          onPress={() => void (mode === 'uno' ? submitOne() : submitMany())}
        >
          {mode === 'uno' ? 'Agregar' : count > 1 ? `Agregar ${count}` : 'Agregar'}
        </Button>
      }
    >
      <Segmented<Mode>
        label="Cómo agregar"
        options={[
          { key: 'uno', label: 'Uno' },
          { key: 'varios', label: 'Varios' },
        ]}
        value={mode}
        onChange={setMode}
      />

      {mode === 'uno' ? (
        <View style={{ gap: 16, marginTop: 8 }}>
          <Field label="Nombre">
            <Input autoFocus maxLength={60} value={name} onChangeText={setName} placeholder="Nombre y apellido" accessibilityLabel="Nombre" />
          </Field>
          <SportStatFields sport={sport} draft={draft} onChange={setDraft} />
          {minorsOk && <MinorCheck checked={isMinor} onChange={setIsMinor} />}
          {minorOne && <GuardianFields value={guardian} onChange={setGuardian} />}
          {!!error && (
            <Txt variant="meta" tone="danger" accessibilityRole="alert" accessibilityLiveRegion="polite">
              {error}
            </Txt>
          )}
          <Txt tone="muted" style={{ fontSize: 13 }}>
            {minorOne
              ? 'Queda sin cuenta. Un menor no se puede reclamar: sus resultados quedan en la liga.'
              : 'Queda sin cuenta. Si después se crea una, la puede reclamar y tú lo apruebas.'}
          </Txt>
        </View>
      ) : (
        <View style={{ gap: 12, marginTop: 8 }}>
          {minorsOk && <MinorCheck checked={manyMinors} onChange={setManyMinors} label="Son menores de edad" hint="Cada uno con el nombre de su padre, madre o tutor." />}
          {minorMode ? (
            <Field label="Un menor por línea: nombre, tutor y teléfono" hint="El teléfono del tutor es opcional. Sirve pegar de una hoja de cálculo.">
              <Lines value={text} onChange={setText} placeholder={'Ana Pérez, María Pérez, 809 555 1234\nLuis Gómez, Carlos Gómez'} label="Menores con su tutor" />
            </Field>
          ) : (
            <Field label="Un nombre por línea" hint={word ? `Después toca a cada uno en la lista para ponerle ${word}.` : undefined}>
              <Lines value={text} onChange={setText} placeholder={'Ana Pérez\nLuis Gómez\nCarla Núñez'} label="Nombres" />
            </Field>
          )}
          <Txt variant="small" tone={tooMany ? 'danger' : 'muted'} accessibilityLiveRegion="polite">
            {manyCountLine({ count, existing, repeated })}
          </Txt>
          {!!minors && minors.noGuardian.length > 0 && (
            <Txt variant="small" tone="danger" accessibilityRole="alert">
              {`Falta el tutor de: ${minors.noGuardian.join(', ')}.`}
            </Txt>
          )}
          {!!minors && minors.badPhone.length > 0 && (
            <Txt variant="small" tone="danger" accessibilityRole="alert">
              {`Revisa el teléfono del tutor de: ${minors.badPhone.join(', ')} (solo números).`}
            </Txt>
          )}
          {minorMode && (
            <ConsentCheck
              checked={manyConsent}
              onChange={setManyConsent}
              label="Los tutores dieron permiso"
              hint="El padre, madre o tutor de cada uno aceptó que lo registres en la app. Queda anotado quién los registró y cuándo."
            />
          )}
        </View>
      )}
    </Sheet>
  );
}
