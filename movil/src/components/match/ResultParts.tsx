/**
 * Las piezas del partido en la app, con la lógica de la web (src/components/match: format.ts, parsers.ts y las
 * funciones de src/lib/data/matches.ts):
 * - Scoreboard: el marcador grande (los dos lados con su marcador por set, el ganador con copa y «Tú»).
 * - ResultSheet: «Solo el resultado» (ResultEntryModal): escribir el marcador y ver enseguida quién gana o el error.
 * - ConfirmResult: «Por confirmar» (ConfirmResultBanner): confirmar o «No es así» con nota; «Esperando al rival».
 */
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Check, Trophy } from 'lucide-react-native';
import { adminCorrectResult, canConfirm, canDispute, confirmResult, disputeResult, finishMatch, resolveDispute, type Match } from '@mm/lib/data/matches';
import { saveErrorMessage } from '@mm/lib/errorText';
import { autoConfirmText, flipScoreText, scoreColumns, sideName } from '@mm/components/match/format';
import { tryParse, type ParsedResult, type ResultParser } from '@mm/components/match/parsers';
import type { Side } from '@mm/sports/types';
import { useNow } from '@mm/lib/useNow';
import { toast } from '../feedback';
import { Badge, Button, Card, Field, Input, Sheet, Txt } from '../ui';
import { useColors } from '@/theme/theme';

export function Scoreboard({ match: m, mySide, rules }: { match: Match; mySide: Side | null; rules?: string | null }) {
  const c = useColors();
  const cols = scoreColumns(m.score);
  const walkover = m.status === 'walkover';
  return (
    <Card style={{ paddingVertical: 8, gap: 0 }}>
      {m.sides.map((s, i) => {
        const won = m.winner === s.side;
        const mine = mySide === s.side;
        const absent = walkover && (m.walkoverSide === s.side || m.walkoverSide === 0);
        return (
          <View key={s.side} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: c.line }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Txt numberOfLines={1} style={{ flexShrink: 1, fontSize: 17, fontWeight: won ? '700' : m.winner ? '500' : '600', color: won || !m.winner ? c.fg : c.muted }}>
                  {sideName(s)}
                </Txt>
                {mine && <Badge>Tú</Badge>}
              </View>
              {absent && (
                <Txt variant="small" tone="muted">
                  No vino
                </Txt>
              )}
            </View>
            {won && <Trophy size={20} color={c.gold} accessibilityLabel="Ganó" />}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {cols.length ? (
                cols.map((col, j) => {
                  const v = i === 0 ? col.a : col.b;
                  const other = i === 0 ? col.b : col.a;
                  return (
                    <Txt key={j} style={{ width: 32, textAlign: 'right', fontSize: 30, lineHeight: 34, fontWeight: v > other ? '700' : '500', color: v > other ? c.fg : c.faint }}>
                      {v}
                      {col.tb && v < other ? <Txt style={{ fontSize: 12 }}>{col.tb}</Txt> : null}
                    </Txt>
                  );
                })
              ) : (
                <Txt style={{ width: 32, textAlign: 'right', fontSize: 30, lineHeight: 34, color: c.faint }}>–</Txt>
              )}
            </View>
          </View>
        );
      })}
      {!!rules && (
        <Txt variant="small" tone="muted" style={{ paddingTop: 8 }}>
          {rules}
        </Txt>
      )}
    </Card>
  );
}

export function ResultSheet({
  open,
  onClose,
  lid,
  match: m,
  parser,
  mode = 'finish',
  placeholder = '6-4 3-6 10-7',
  hint,
  examples = [],
  title,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  lid: string;
  match: Match;
  parser: ResultParser;
  mode?: 'finish' | 'correct' | 'resolve';
  placeholder?: string;
  hint?: string;
  examples?: string[];
  /** El título de la hoja, si no es el de siempre (p. ej. «Marcador de Cancha 1» en la noche de raqueta). */
  title?: string;
  onSubmit?: (r: ParsedResult) => Promise<void>;
}) {
  const c = useColors();
  const [text, setText] = useState(() => (typeof m.score?.text === 'string' && mode !== 'finish' ? m.score.text : ''));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => (text.trim() ? tryParse(parser, text) : null), [parser, text]);
  const winnerName = parsed?.ok && parsed.value.winner ? sideName(m.sides[parsed.value.winner - 1]) : null;

  async function submit() {
    if (!parsed?.ok || busy) return;
    const r = parsed.value;
    setBusy(true);
    try {
      let sent = true;
      if (onSubmit) await onSubmit(r);
      else if (mode === 'correct') await adminCorrectResult(lid, m.id, { score: r.score, winner: r.winner, state: r.state, note });
      else if (mode === 'resolve') await resolveDispute(lid, m.id, { score: r.score, winner: r.winner, state: r.state, note });
      else {
        const out = await finishMatch(lid, m.id, { score: r.score, winner: r.winner, state: r.state ?? null });
        sent = out !== undefined;
        if (out && !out.ok) throw new Error('Otro teléfono va más adelante con este partido.');
      }
      toast(sent ? 'Resultado guardado' : 'Sin señal: el resultado se envía solo al volver');
      onClose();
    } catch (e) {
      toast(e instanceof Error && !('kind' in e) ? e.message : saveErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  const heading = title ?? (mode === 'finish' ? 'Anotar resultado' : mode === 'correct' ? 'Corregir resultado' : 'Decidir el reclamo');
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={heading}
      footer={
        <Button variant="primary" size="xl" full loading={busy} disabled={!parsed?.ok} icon={<Check size={20} color={c.accentFg} />} onPress={submit}>
          Guardar
        </Button>
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Txt variant="bodyStrong" numberOfLines={1} style={{ flex: 1, textAlign: 'center' }}>
          {sideName(m.sides[0])}
        </Txt>
        <Txt variant="small" tone="muted">
          vs.
        </Txt>
        <Txt variant="bodyStrong" numberOfLines={1} style={{ flex: 1, textAlign: 'center' }}>
          {sideName(m.sides[1])}
        </Txt>
      </View>
      <Input
        accessibilityLabel="Marcador"
        autoFocus
        autoCorrect={false}
        autoCapitalize="none"
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        returnKeyType="done"
        onSubmitEditing={submit}
        invalid={parsed?.ok === false}
        style={{ textAlign: 'center', fontSize: 22 }}
      />
      <Txt variant="small" tone="muted" style={{ textAlign: 'center' }}>
        El de la izquierda primero{hint ? ` · ${hint}` : ''}
      </Txt>
      {examples.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
          {examples.map((x) => (
            <Pressable key={x} accessibilityRole="button" onPress={() => setText(x)} style={{ borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: c.surface2 }}>
              <Txt variant="meta" style={{ fontWeight: '600' }}>
                {x}
              </Txt>
            </Pressable>
          ))}
        </View>
      )}
      {parsed?.ok === false && (
        <Txt variant="meta" tone="danger" style={{ textAlign: 'center' }}>
          {parsed.error}
        </Txt>
      )}
      {parsed?.ok && (
        <View style={{ borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: c.accentSoft }}>
          <Txt tone="accent" style={{ textAlign: 'center' }}>
            {winnerName ? (
              <>
                Gana <Txt tone="accent" variant="bodyStrong">{winnerName}</Txt>{' '}
                {parsed.value.winner === 2 && typeof parsed.value.score.text === 'string' ? flipScoreText(parsed.value.score.text) : parsed.value.score.text}
              </>
            ) : (
              `Empate ${parsed.value.score.text ?? ''}`
            )}
          </Txt>
        </View>
      )}
      {mode !== 'finish' && (
        <Field label="Nota (opcional)">
          <Input value={note} maxLength={300} onChangeText={setNote} placeholder="Por qué se cambió" />
        </Field>
      )}
    </Sheet>
  );
}

export function ConfirmResult({ lid, match: m, mySide, isAdmin, now: nowProp }: { lid: string; match: Match; mySide: Side | null; isAdmin?: boolean; now?: number }) {
  const c = useColors();
  const ticking = useNow().getTime();
  const now = nowProp ?? ticking;
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  if (m.status !== 'finished') return null;
  const confirmable = canConfirm(m, mySide, !!isAdmin);
  const disputable = canDispute(m, mySide, now);
  const mine = mySide !== null && mySide === m.proposedSide;
  if (!confirmable && !mine) return null;
  const proposer = m.proposedSide ? sideName(m.sides[m.proposedSide - 1]) : 'El anotador';
  const text = typeof m.score?.text === 'string' ? (mySide === 2 ? flipScoreText(m.score.text) : m.score.text) : '';
  const left = autoConfirmText(m, now);
  const waiting = mine && !confirmable;

  async function confirm() {
    setBusy(true);
    try {
      await confirmResult(lid, m.id);
      toast('Resultado confirmado');
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }
  async function dispute() {
    setBusy(true);
    try {
      await disputeResult(lid, m.id, note);
      toast('Reclamo enviado: decide el admin');
      setOpen(false);
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.warn }} />
        <Txt variant="meta" tone="warn" style={{ fontWeight: '700' }}>
          {waiting ? 'Esperando al rival' : 'Por confirmar'}
        </Txt>
      </View>
      {waiting ? (
        <Txt>
          Anotaste <Txt variant="bodyStrong">{text || 'el resultado'}</Txt>. Falta que el rival lo confirme.
        </Txt>
      ) : (
        <Txt>
          {proposer} anotó <Txt variant="bodyStrong">{text || 'el resultado'}</Txt>. ¿Está bien?
        </Txt>
      )}
      {!!left && (
        <Txt variant="small" tone="muted">
          {waiting ? `${left}.` : `${left} si nadie reclama.`}
        </Txt>
      )}
      {!waiting && (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
          {disputable && (
            <View style={{ flex: 1 }}>
              <Button size="lg" full disabled={busy} onPress={() => setOpen(true)}>
                No es así
              </Button>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Button variant="primary" size="lg" full loading={busy} icon={<Check size={20} color={c.accentFg} />} onPress={confirm}>
              Confirmar
            </Button>
          </View>
        </View>
      )}
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="¿Qué pasó?"
        subtitle="El admin decide con lo que le cuentes"
        footer={
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button size="lg" full onPress={() => setOpen(false)}>
                Cancelar
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button variant="danger" size="lg" full loading={busy} onPress={dispute}>
                Enviar reclamo
              </Button>
            </View>
          </View>
        }
      >
        <Field label="Cuéntale al admin (opcional)" hint="Ejemplo: fue 6-4 4-6 10-8.">
          <Input multiline maxLength={500} value={note} onChangeText={setNote} style={{ height: 96, paddingTop: 14, textAlignVertical: 'top' }} />
        </Field>
      </Sheet>
    </Card>
  );
}
