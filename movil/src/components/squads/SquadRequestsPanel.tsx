/**
 * Los equipos que piden entrar a la liga (SquadRequestsPanel de la web, con su misma lógica: logic.ts): para los admins
 * de una liga de fútbol, futsal o baloncesto (`canEnterLeagues(leagueSport(liga))`), arriba de los equipos de la liga.
 * Cada uno con su logo, su nombre, cuántos son y quién lo pidió, con «Aceptar» (crea el equipo en la liga con su
 * plantilla: el aviso dice con cuántos entró y cuántos ya estaban en otro equipo) y «Rechazar» (con una nota opcional,
 * le llega al capitán). Sin pendientes no se ve.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Check, X } from 'lucide-react-native';
import { decideSquadRequest, useLeagueSquadRequests, type SquadRequest } from '@mm/lib/data/squads';
import { adminErrorText, countWord, decisionText, requestLine, squadAsk, squadTitle } from '@mm/components/squads/logic';
import { confirmAsync, toast } from '../feedback';
import { Button, Card, Field, Input, ListRow, SectionHeader, Sheet, Txt } from '../ui';
import { useColors } from '@/theme/theme';
import { openSquad, SquadLogo } from './bits';

/** El largo de la nota al rechazar (el mismo de la base). */
const NOTE_MAX = 200;

export function SquadRequestsPanel({ lid }: { lid: string }) {
  const c = useColors();
  const req = useLeagueSquadRequests(lid);
  const pending = req.data.filter((r) => r.status === 'pending');
  const [rejecting, setRejecting] = useState<SquadRequest | null>(null);
  if (!pending.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader
        title="Equipos que quieren entrar"
        action={
          <Txt variant="meta" tone="muted">
            {countWord(pending.length, 'pendiente', 'pendientes')}
          </Txt>
        }
      />
      <Card padded={false}>
        {pending.map((r, i) => (
          <View key={r.id} style={i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null}>
            <RequestRow lid={lid} request={r} onReject={() => setRejecting(r)} />
          </View>
        ))}
      </Card>
      <RejectSheet lid={lid} request={rejecting} onClose={() => setRejecting(null)} />
    </View>
  );
}

function RequestRow({ lid, request: r, onReject }: { lid: string; request: SquadRequest; onReject: () => void }) {
  const c = useColors();
  const [busy, setBusy] = useState(false);

  async function accept() {
    if (!(await confirmAsync(squadAsk.accept(r.squad.name, r.squad.members)))) return;
    setBusy(true);
    try {
      toast(decisionText(await decideSquadRequest(lid, r.id, true)));
    } catch (e) {
      console.error(e);
      toast(adminErrorText(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      <ListRow icon={<SquadLogo squad={r.squad} />} title={squadTitle(r.squad)} subtitle={requestLine(r)} onPress={() => openSquad(r.squad.id)} />
      <View style={{ flexDirection: 'row', gap: 8, paddingLeft: 68, paddingRight: 18, paddingBottom: 12 }}>
        <View style={{ flex: 1 }}>
          <Button variant="primary" full loading={busy} icon={<Check size={16} color={c.accentFg} />} onPress={accept}>
            Aceptar
          </Button>
        </View>
        <View style={{ flex: 1 }}>
          <Button full disabled={busy} icon={<X size={16} color={c.fg} />} onPress={onReject}>
            Rechazar
          </Button>
        </View>
      </View>
    </View>
  );
}

/** «Rechazar» con una nota opcional (le llega al capitán). */
function RejectSheet({ lid, request, onClose }: { lid: string; request: SquadRequest | null; onClose: () => void }) {
  return (
    <Sheet open={!!request} onClose={onClose} title="Rechazar equipo" subtitle={request?.squad.name}>
      {request && <RejectBody lid={lid} request={request} onDone={onClose} />}
    </Sheet>
  );
}

function RejectBody({ lid, request, onDone }: { lid: string; request: SquadRequest; onDone: () => void }) {
  const c = useColors();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function reject() {
    setBusy(true);
    try {
      await decideSquadRequest(lid, request.id, false, note);
      toast(`Rechazaste a ${request.squad.name}`);
      onDone();
    } catch (e) {
      console.error(e);
      toast(adminErrorText(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 16 }}>
      <Txt variant="meta" tone="muted">
        El capitán recibe un aviso. Puede volver a pedir más adelante.
      </Txt>
      <Field label="Nota para el capitán (opcional)">
        <Input
          accessibilityLabel="Nota para el capitán (opcional)"
          multiline
          maxLength={NOTE_MAX}
          value={note}
          placeholder="Ya cerramos la inscripción de esta temporada…"
          onChangeText={setNote}
          style={{ height: 96, paddingTop: 14, textAlignVertical: 'top' }}
        />
      </Field>
      <Button variant="danger" size="xl" full loading={busy} icon={<X size={20} color={c.onDanger} />} onPress={reject}>
        Rechazar
      </Button>
    </View>
  );
}
