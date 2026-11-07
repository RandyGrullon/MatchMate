/**
 * «Crear equipo» (CreateSquadSheet de la web, con su misma lógica: src/pages/squads/squadForm.ts): primero el deporte
 * (todos los abiertos; Esports lleva a elegir el juego y crear el equipo en Esports) y después nombre, tag (sale solo
 * del nombre hasta que escribes el tuyo), ciudad, color, descripción y «Busca jugadores». Al crear, a la página del
 * equipo con la hoja de invitar abierta (`?invitar=1`; el código que llegó al crear va en `createdCodes`, como el
 * `state` de la web). `sport`: el deporte ya elegido (salta el primer paso).
 */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { ChevronLeft, ChevronRight, Shield } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { createSquad, squadErrorText, updateSquad } from '@mm/lib/data/squads';
import { useActiveSport } from '@mm/lib/sportContext';
import { sportMeta } from '@mm/sports/registry';
import { useSportStatus } from '@mm/sports/status';
import type { SportId } from '@mm/sports/types';
import { createTeamLink } from '@mm/pages/esports/logic';
import { defaultSquadSport } from '@mm/components/squads/logic';
import { changeCreateForm, createGate, createStartStep, initialCreateForm, type SquadForm } from '@mm/pages/squads/squadForm';
import { GamePickerSheet, SignInCard } from '../esports/EsportsIndex';
import { toast } from '../feedback';
import { Button, ErrorNote, Sheet, Txt } from '../ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { openSquad, useSquadColors } from './bits';
import { SportPicker, SquadFields } from './fields';

/** El código que llegó al crear cada equipo (la hoja de invitar lo muestra sin esperar a leerlo). */
export const createdCodes = new Map<string, string>();

export function CreateSquadSheet({ open, onClose, sport }: { open: boolean; onClose: () => void; sport?: string | null }) {
  const [pickGame, setPickGame] = useState(false);
  return (
    <>
      <Sheet open={open} onClose={onClose} title="Crear equipo">
        {open && (
          <CreateSquadBody
            wanted={sport ?? null}
            onEsports={() => {
              onClose();
              // En el iPhone una hoja no se abre mientras la otra se está cerrando.
              setTimeout(() => setPickGame(true), 350);
            }}
            onCreated={(squadId) => {
              // La hoja se cierra antes de ir: un Modal abierto se quedaría encima de la pantalla del equipo.
              onClose();
              setTimeout(() => openSquad(squadId, { invitar: '1' }), 0);
            }}
          />
        )}
      </Sheet>
      <GamePickerSheet
        open={pickGame}
        onClose={() => setPickGame(false)}
        title="¿De qué juego?"
        subtitle="Los equipos de esports son de un juego"
        onPick={(g) => {
          setPickGame(false);
          setTimeout(() => router.push(createTeamLink(g) as Href), 0);
        }}
      />
    </>
  );
}

function CreateSquadBody({ wanted, onEsports, onCreated }: { wanted: string | null; onEsports: () => void; onCreated: (squadId: string) => void }) {
  const c = useColors();
  const auth = useAuth();
  const sports = useSportStatus(auth.isSuper);
  const active = useActiveSport();
  const startSport = defaultSquadSport(sports.creatable, wanted, active);
  const [picked, setPicked] = useState<string | null>(null);
  const sport = picked ?? startSport;
  const [step, setStep] = useState<'deporte' | 'datos'>(() => createStartStep(wanted, startSport));
  const [form, setForm] = useState<SquadForm>(() => initialCreateForm());
  const [tagTyped, setTagTyped] = useState(false);
  const [busy, setBusy] = useState(false);
  const tint = useSquadColors(form.color, sport ?? 'bowling');

  if (!auth.user) {
    return <SignInCard icon={<Shield size={28} color={c.accent} />} title="Entra para crear tu equipo" text="Arma tu equipo, invita a los tuyos con un link y búscale liga." />;
  }

  if (!sport) {
    return (
      <Txt variant="meta" tone="muted" style={{ textAlign: 'center', paddingBottom: 16 }}>
        Ahora mismo no se pueden crear equipos. Vuelve a intentarlo más tarde.
      </Txt>
    );
  }

  if (step === 'deporte') {
    return (
      <View style={{ gap: 16 }}>
        <SportPicker
          groups={sports.choices}
          status={sports.status}
          value={sport as SportId}
          onChange={(id) => {
            if (id === 'esports') return onEsports();
            setPicked(id);
          }}
        />
        <Button variant="primary" size="xl" full icon={<ChevronRight size={20} color={c.accentFg} />} onPress={() => setStep('datos')}>
          Seguir
        </Button>
      </View>
    );
  }

  const gate = createGate(form, busy);
  const meta = sportMeta(sport);
  const Icon = meta?.icon;
  const change = (patch: Partial<SquadForm>) => setForm((f) => changeCreateForm(f, patch, tagTyped));

  async function create() {
    if (!gate.canCreate || !sport) return;
    setBusy(true);
    try {
      const name = form.name.trim();
      const r = await createSquad({ sport, name, tag: form.tag, description: form.description, city: form.city || null, color: form.color });
      if (form.recruiting) {
        try {
          await updateSquad(r.squadId, { recruiting: true });
        } catch (e) {
          console.warn('[equipo] busca jugadores', e);
        }
      }
      toast(`Listo: ${name} quedó creado`);
      createdCodes.set(r.squadId, r.inviteCode);
      onCreated(r.squadId);
    } catch (e) {
      console.error(e);
      toast(squadErrorText(e), 'error');
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 16 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Deporte: ${meta?.label ?? sport}. Cambiar`}
        onPress={() => setStep('deporte')}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start', minHeight: 44, borderRadius: 12, backgroundColor: c.surface2, paddingVertical: 6, paddingLeft: 8, paddingRight: 12, opacity: pressed ? 0.85 : 1 })}
      >
        <ChevronLeft size={16} color={c.muted} />
        {Icon && <Icon size={16} color={tint.accent} />}
        <Txt variant="meta" style={{ fontFamily: font.semibold }}>
          {meta?.label ?? sport}
        </Txt>
        <Txt variant="meta" tone="muted">
          · Cambiar
        </Txt>
      </Pressable>
      <SquadFields form={form} sport={sport} onChange={change} onTagTyped={() => setTagTyped(true)} />
      {gate.shown && <ErrorNote>{gate.shown}</ErrorNote>}
      <Button variant="primary" size="xl" full loading={busy} disabled={!gate.canCreate} icon={<Shield size={20} color={c.accentFg} />} onPress={create}>
        Crear equipo
      </Button>
    </View>
  );
}
