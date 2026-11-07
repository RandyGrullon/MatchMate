/**
 * El modo cancha en la app (CourtLayout, LeaseBanner y TwoHalves de la web, con la misma máquina: src/court/machine.ts y
 * useCourt): arriba salir (✕), el título y «•••» (suspender y lo del deporte); el aviso del turno (sin señal, otro
 * anotador, otro teléfono); el marcador del deporte; dos mitades gigantes para tocar el lado que ganó el punto; y
 * abajo, siempre a la vista, Deshacer y Terminar. La pantalla no se apaga mientras se anota.
 */
import { useHoldBadgeUnlock } from '@mm/components/badges/hold';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import { MoreHorizontal, Undo2, X } from 'lucide-react-native';
import type { CourtController } from '@mm/court/useCourt';
import type { LeaseState } from '@mm/court/machine';
import { saveErrorMessage } from '@mm/lib/errorText';
import type { MatchStatus } from '@mm/lib/data/matches';
import { toast } from '../feedback';
import { Button, Field, Input, Sheet, Txt } from '../ui';
import { useColors } from '@/theme/theme';

const CLOSED: Record<MatchStatus, string> = {
  scheduled: 'El partido no ha empezado.',
  live: 'El partido está en vivo.',
  suspended: 'Partido suspendido. Se retoma pidiendo el turno otra vez.',
  finished: 'Resultado enviado. Falta que el rival lo confirme.',
  confirmed: 'Resultado confirmado.',
  disputed: 'El resultado está en disputa: decide el admin.',
  walkover: 'Partido por W.O.',
  void: 'Partido anulado.',
  postponed: 'Partido aplazado.',
};

export interface MoreItem {
  key: string;
  label: string;
  hint?: string;
  onPress: () => void;
}

/** Una línea de aviso arriba de las mitades (quién saca, cambio de lado, el final). */
export function CourtNote({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'danger' }) {
  const c = useColors();
  const bg = tone === 'accent' ? c.accentSoft : tone === 'danger' ? c.dangerSoft : c.surface2;
  return (
    <View style={{ borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: bg }}>
      <Txt tone={tone === 'accent' ? 'accent' : tone === 'danger' ? 'danger' : 'fg'}>{children}</Txt>
    </View>
  );
}

function LeaseNote({ lease, unsent, conflict, isAdmin, onClaim }: { lease: LeaseState; unsent: number; conflict: boolean; isAdmin: boolean; onClaim: (force: boolean) => void }) {
  const [confirm, setConfirm] = useState(false);
  let body: ReactNode = null;
  let tone: 'neutral' | 'danger' = 'neutral';
  if (lease.kind === 'offline') {
    body = <Txt variant="meta">{`Sin señal: sigue anotando. Todo queda en el teléfono y se envía solo al volver${unsent > 0 ? ` (${unsent} sin enviar)` : ''}.`}</Txt>;
  } else if (lease.kind === 'other') {
    tone = 'danger';
    body = (
      <View style={{ gap: 8 }}>
        <Txt variant="meta" tone="danger">
          <Txt variant="meta" tone="danger" style={{ fontWeight: '700' }}>
            Otro anotador tomó el control{lease.scorerName ? ` (${lease.scorerName})` : ''}.
          </Txt>{' '}
          Tu lista quedó guardada en este teléfono.{lease.expired ? ' Su teléfono no publica hace rato.' : ''} {isAdmin ? '' : 'Pídele al admin que te dé el control.'}
        </Txt>
        {isAdmin && (
          <Button size="md" onPress={() => setConfirm(true)}>
            Tomar el control
          </Button>
        )}
      </View>
    );
  } else if (lease.kind === 'stale') {
    tone = 'danger';
    body = <Txt variant="meta" tone="danger">Otro teléfono con tu cuenta va más adelante en este partido. Sigue anotando desde ese teléfono.</Txt>;
  } else if (lease.kind === 'denied') {
    tone = 'danger';
    body = <Txt variant="meta" tone="danger">No puedes anotar este partido. Lo anota alguien de los equipos, el anotador o el admin.</Txt>;
  } else if (lease.kind === 'closed') {
    body = (
      <View style={{ gap: 8 }}>
        <Txt variant="meta">{CLOSED[lease.status]}</Txt>
        {lease.status === 'suspended' && (
          <Button size="md" onPress={() => onClaim(false)}>
            Retomar
          </Button>
        )}
      </View>
    );
  }
  return (
    <>
      {conflict && <CourtNote tone="danger">Se siguió con el marcador del otro teléfono. Tu lista quedó guardada aparte en este teléfono.</CourtNote>}
      {body && <CourtNote tone={tone}>{body}</CourtNote>}
      <Sheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title="¿Tomar el control?"
        footer={
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button size="lg" full onPress={() => setConfirm(false)}>
                Cancelar
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button
                variant="primary"
                size="lg"
                full
                onPress={() => {
                  setConfirm(false);
                  onClaim(true);
                }}
              >
                Sí, anoto yo
              </Button>
            </View>
          </View>
        }
      >
        <Txt>
          {lease.kind === 'other' && lease.scorerName ? `${lease.scorerName} deja de anotar.` : 'El otro teléfono deja de anotar.'} Su lista se queda guardada en su teléfono y el
          partido sigue desde lo último que publicó.
        </Txt>
      </Sheet>
    </>
  );
}

export interface HalfProps {
  label: string;
  big: string | number;
  sub?: string;
  onTap: () => void;
  ariaLabel: string;
}

/** Dos mitades gigantes: se toca el lado que ganó el punto (con vibración). `swap`: el lado 2 va a la izquierda (arriba). */
export function TwoHalves({ a, b, swap, disabled }: { a: HalfProps; b: HalfProps; swap?: boolean; disabled?: boolean }) {
  const c = useColors();
  const halves = swap ? [b, a] : [a, b];
  return (
    <View style={{ flex: 1, gap: 10 }}>
      {halves.map((h, i) => (
        <Pressable
          key={i}
          accessibilityRole="button"
          accessibilityLabel={h.ariaLabel}
          disabled={disabled}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
            h.onTap();
          }}
          style={({ pressed }) => ({
            flex: 1,
            borderRadius: 28,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            opacity: disabled ? 0.55 : 1,
            backgroundColor: pressed ? c.accent : i === 0 ? c.accentSoft : c.surface,
          })}
        >
          <Txt variant="cardTitle" numberOfLines={1} style={{ paddingHorizontal: 16 }}>
            {h.label}
          </Txt>
          <Txt style={{ fontSize: 72, lineHeight: 80, fontWeight: '800' }}>{h.big}</Txt>
          {!!h.sub && h.sub.trim() !== '' && (
            <Txt variant="meta" tone="muted">
              {h.sub}
            </Txt>
          )}
        </Pressable>
      ))}
    </View>
  );
}

export function CourtShell<C, S, E>({
  title,
  subtitle,
  onExit,
  court,
  isAdmin,
  header,
  children,
  undoLabel,
  finishSummary,
  onFinished,
  canSuspend = true,
  more = [],
  actions,
}: {
  title: string;
  subtitle?: string | null;
  onExit: () => void;
  court: CourtController<C, S, E>;
  isAdmin: boolean;
  header?: ReactNode;
  children: ReactNode;
  undoLabel?: string;
  finishSummary?: string;
  onFinished?: (how: 'sent' | 'queued') => void;
  canSuspend?: boolean;
  more?: MoreItem[];
  /** Los botones del deporte entre Deshacer y Terminar (la mesa de equipos: «Fin del cuarto»). */
  actions?: ReactNode;
}) {
  useKeepAwake();
  // El aviso de una insignia nueva espera a que se cierre la mesa (como la web).
  useHoldBadgeUnlock();
  const c = useColors();
  const [menu, setMenu] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function doFinish() {
    if (busy) return;
    setBusy(true);
    try {
      const how = await court.finish();
      setFinishing(false);
      if (how === 'stale') {
        toast('Otro teléfono va más adelante: termina el partido desde ahí.', 'error');
        return;
      }
      toast(how === 'sent' ? 'Resultado enviado' : 'Sin señal: el resultado se envía solo al volver');
      onFinished?.(how);
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function doSuspend() {
    if (busy) return;
    setBusy(true);
    try {
      await court.suspend(note.trim() || undefined);
      setSuspending(false);
      toast('Partido suspendido. Se retoma desde aquí.');
      onExit();
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  const menuItems: MoreItem[] = [
    ...(canSuspend && !court.readOnly && court.snapshot ? [{ key: 'suspender', label: 'Suspender', hint: 'Lluvia, luz… con el marcador de ahora', onPress: () => setSuspending(true) }] : []),
    ...more,
  ];

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 4 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Salir de la cancha" hitSlop={8} onPress={onExit} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <X size={24} color={c.fg} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="bodyStrong" numberOfLines={1}>
            {title}
          </Txt>
          {!!subtitle && (
            <Txt variant="small" tone="muted" numberOfLines={1}>
              {subtitle}
            </Txt>
          )}
        </View>
        {court.unsent > 0 && (
          <Txt variant="small" tone="muted" accessibilityLabel="Publicaciones por enviar">
            {court.unsent}
          </Txt>
        )}
        {menuItems.length > 0 && (
          <Pressable accessibilityRole="button" accessibilityLabel="Opciones del partido" hitSlop={8} onPress={() => setMenu(true)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <MoreHorizontal size={22} color={c.fg} />
          </Pressable>
        )}
      </View>
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8, gap: 10 }}>
        <LeaseNote lease={court.lease} unsent={court.unsent} conflict={court.conflict} isAdmin={isAdmin} onClaim={(force) => void court.claim(force)} />
        {header}
        {children}
      </View>
      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 12 }}>
        <View style={{ flex: 1 }}>
          <Button size="xl" full disabled={!court.canUndo || court.readOnly} icon={<Undo2 size={20} color={c.fg} />} onPress={() => court.undo()} accessibilityLabel={undoLabel ?? 'Deshacer la última jugada'}>
            {undoLabel ?? 'Deshacer'}
          </Button>
        </View>
        {actions}
        <View style={{ flex: 1 }}>
          <Button variant="primary" size="xl" full disabled={court.readOnly || !court.snapshot} onPress={() => setFinishing(true)}>
            Terminar
          </Button>
        </View>
      </View>

      <Sheet
        open={finishing}
        onClose={() => setFinishing(false)}
        title="¿Terminar el partido?"
        footer={
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button size="lg" full onPress={() => setFinishing(false)}>
                Seguir anotando
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button variant="primary" size="lg" full loading={busy} onPress={doFinish}>
                Enviar resultado
              </Button>
            </View>
          </View>
        }
      >
        <Txt style={{ fontSize: 30, lineHeight: 36, fontWeight: '700' }}>{finishSummary ?? (court.summary || 'Sin marcador')}</Txt>
        {!court.over && (
          <Txt tone="danger" variant="bodyStrong">
            Según las reglas todavía no termina. ¿Seguro?
          </Txt>
        )}
        <Txt variant="small" tone="muted">
          Si juegas, el rival lo confirma. Sin señal, se envía solo al volver.
        </Txt>
      </Sheet>

      <Sheet open={menu} onClose={() => setMenu(false)} title="Opciones del partido">
        {menuItems.map((it) => (
          <Pressable
            key={it.key}
            accessibilityRole="button"
            onPress={() => {
              setMenu(false);
              it.onPress();
            }}
            style={({ pressed }) => ({ minHeight: 56, justifyContent: 'center', borderRadius: 16, paddingHorizontal: 16, backgroundColor: pressed ? c.surface2 : c.surface })}
          >
            <Txt variant="bodyStrong">{it.label}</Txt>
            {!!it.hint && (
              <Txt variant="meta" tone="muted">
                {it.hint}
              </Txt>
            )}
          </Pressable>
        ))}
      </Sheet>

      <Sheet
        open={suspending}
        onClose={() => setSuspending(false)}
        title="Suspender el partido"
        subtitle="Otro día se retoma desde aquí"
        footer={
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button size="lg" full onPress={() => setSuspending(false)}>
                Cancelar
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button variant="danger" size="lg" full loading={busy} onPress={doSuspend}>
                Suspender
              </Button>
            </View>
          </View>
        }
      >
        <Txt>
          Se guarda el marcador: <Txt variant="bodyStrong">{court.summary || 'sin puntos'}</Txt>. Se puede retomar en este u otro teléfono.
        </Txt>
        <Field label="Motivo (opcional)">
          <Input value={note} maxLength={200} onChangeText={setNote} placeholder="Lluvia, se fue la luz…" />
        </Field>
      </Sheet>
    </SafeAreaView>
  );
}
