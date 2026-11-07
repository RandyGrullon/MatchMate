/**
 * El menú «⋯» de algo que alguien escribió (publicación o comentario), como ContentMenu de la web
 * (src/components/posts/PostMenu.tsx): Reportar y Bloquear a quien lo escribió (si no es tuyo) y Borrar (si puedes),
 * en una hoja que sube desde abajo. Borrar y bloquear piden confirmación. Y la hoja de Reportar (ReportModal de la web).
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Flag, MoreHorizontal, Trash2, UserX, type LucideIcon } from 'lucide-react-native';
import { socialErrorText } from '@mm/lib/data/posts';
import { setBlocked } from '@mm/lib/data/profileSocial';
import { REPORT_KIND_THIS, REPORT_NOTE_MAX, REPORT_REASONS, reportContent, reportErrorText, type ReportKind, type ReportReason } from '@mm/lib/data/reports';
import { contentMenuKeys, shortName } from '@mm/components/posts/postFormat';
import { confirmAsync, toast } from '../feedback';
import { Button, ChoiceRow, ErrorNote, Field, Input, Sheet, Txt } from '../ui';
import { openLegal } from '@/components/legal/links';
import { useColors } from '@/theme/theme';

/** Lo que tarda en irse una hoja antes de abrir otra pantalla (los Términos, desde la hoja de reportar). */
const SHEET_CLOSE_MS = 400;

type Key = 'borrar' | 'reportar' | 'bloquear';

export function ContentMenu({
  what,
  kind,
  targetId,
  author,
  isMine,
  canDelete,
  onDelete,
  onGone,
  deleteText,
}: {
  what: 'publicación' | 'comentario';
  kind: Extract<ReportKind, 'post' | 'post_comment'>;
  targetId: string;
  author: { id: string; name: string };
  isMine: boolean;
  canDelete: boolean;
  onDelete: () => Promise<void>;
  onGone?: () => void;
  deleteText?: string;
}) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const name = shortName(author.name);
  const fem = what === 'publicación';

  async function remove() {
    const ok = await confirmAsync({
      title: `¿Borrar ${fem ? 'la publicación' : 'el comentario'}?`,
      message: deleteText ?? (fem ? 'Se borra para todos, con sus me gusta y comentarios.' : 'Se borra para todos.'),
      confirmText: 'Borrar',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await onDelete();
      toast(fem ? 'Publicación borrada' : 'Comentario borrado');
      onGone?.();
    } catch (e) {
      toast(socialErrorText(e, 'No se pudo borrar. Inténtalo otra vez.'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function block() {
    const ok = await confirmAsync({
      title: `¿Bloquear a ${name}?`,
      message: 'Dejan de seguirse, no verás lo que publica ni comenta y no podrá ver tu perfil. Puedes desbloquearlo cuando quieras.',
      confirmText: 'Bloquear',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await setBlocked(author.id, true);
      toast(`Bloqueaste a ${name}`);
      onGone?.();
    } catch (e) {
      toast(socialErrorText(e, 'No se pudo bloquear. Inténtalo otra vez.'), 'error');
    } finally {
      setBusy(false);
    }
  }

  const actions: Record<Key, { label: string; hint?: string; icon: LucideIcon; danger?: boolean; run: () => void }> = {
    reportar: { label: `Reportar ${fem ? 'publicación' : 'comentario'}`, hint: 'Lo revisa el equipo de MatchMate.', icon: Flag, run: () => setReporting(true) },
    bloquear: { label: `Bloquear a ${name}`, hint: 'No verás lo que publica.', icon: UserX, run: () => void block() },
    borrar: { label: `Borrar ${what}`, icon: Trash2, danger: true, run: () => void remove() },
  };
  const keys = contentMenuKeys({ isMine, canDelete });
  if (!keys.length) return null;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Más opciones ${fem ? 'de la publicación' : 'del comentario'}`}
        hitSlop={6}
        disabled={busy}
        onPress={() => setOpen(true)}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }}
      >
        {busy ? <ActivityIndicator color={c.muted} /> : <MoreHorizontal size={20} color={c.muted} />}
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} title={fem ? 'Publicación' : 'Comentario'} subtitle={`De ${author.name.trim() || 'alguien'}`}>
        {keys.map((k) => {
          const a = actions[k];
          const Icon = a.icon;
          return (
            <Pressable
              key={k}
              accessibilityRole="button"
              onPress={() => {
                setOpen(false);
                a.run();
              }}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, borderRadius: 16, paddingHorizontal: 16, backgroundColor: pressed ? c.surface2 : c.surface })}
            >
              <Icon size={20} color={a.danger ? c.danger : c.fg} />
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong" tone={a.danger ? 'danger' : 'fg'}>
                  {a.label}
                </Txt>
                {!!a.hint && (
                  <Txt variant="meta" tone="muted">
                    {a.hint}
                  </Txt>
                )}
              </View>
            </Pressable>
          );
        })}
      </Sheet>
      {reporting && <ReportSheet kind={kind} targetId={targetId} onClose={() => setReporting(false)} />}
    </>
  );
}

/** «Reportar»: el motivo (obligatorio), una nota opcional y a quién le llega. Reportar lo mismo otra vez no crea otro. */
export function ReportSheet({ kind, targetId, onClose }: { kind: ReportKind; targetId: string; onClose: () => void }) {
  const c = useColors();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inLeague = kind === 'comment' || kind === 'game' || kind === 'announcement';
  const maybeLeague = kind === 'post' || kind === 'post_comment';

  async function send() {
    if (!reason || busy) return;
    setBusy(true);
    setError(null);
    try {
      await reportContent({ kind, targetId, reason, note });
      toast('Gracias. Lo vamos a revisar.');
      onClose();
    } catch (e) {
      setError(reportErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Reportar ${REPORT_KIND_THIS[kind]}`}
      footer={
        <Button variant="primary" size="xl" full icon={<Flag size={20} color={c.accentFg} />} loading={busy} disabled={!reason} onPress={send}>
          Enviar reporte
        </Button>
      }
    >
      <Txt variant="bodyStrong">¿Qué pasa?</Txt>
      {REPORT_REASONS.map((r) => (
        <ChoiceRow key={r.key} title={r.label} subtitle={r.hint} selected={reason === r.key} onPress={() => setReason(r.key)} />
      ))}
      <Field label="Nota (opcional)" hint={`${note.length}/${REPORT_NOTE_MAX}`}>
        <Input
          multiline
          value={note}
          onChangeText={(t) => setNote(t.slice(0, REPORT_NOTE_MAX))}
          placeholder="Cuéntanos qué viste, si hace falta."
          style={{ height: 96, paddingTop: 14, textAlignVertical: 'top' }}
        />
      </Field>
      {error && <ErrorNote>{error}</ErrorNote>}
      <Txt variant="meta" tone="muted">
        Lo revisa el equipo de MatchMate
        {inLeague ? ' y los admins de la liga (sin saber quién lo reportó)' : maybeLeague ? ' y, si es de una liga, sus admins (sin saber quién lo reportó)' : ''}. La persona
        reportada no sabe que fuiste tú. Mira lo que no se permite en los{' '}
        <Txt
          variant="meta"
          tone="accent"
          onPress={() => {
            // La hoja se cierra primero (otra pantalla no se ve encima de una hoja abierta).
            onClose();
            setTimeout(() => openLegal('terminos'), SHEET_CLOSE_MS);
          }}
        >
          Términos de uso
        </Txt>
        .
      </Txt>
    </Sheet>
  );
}
