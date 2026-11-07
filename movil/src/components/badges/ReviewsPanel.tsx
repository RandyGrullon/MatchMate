import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { BadgeCheck, CheckCircle2, ExternalLink, Hourglass, XCircle } from 'lucide-react-native';
import { reviewBadge, useBadgeNotices, type BadgeReview } from '@mm/lib/data/badges';
import { useLeagueCtx } from '@mm/lib/league';
import type { ReviewModel } from '@mm/components/badges/logic';
import { REVIEW_NOTE_MAX, approveQuestion, leagueReviews, markersText, rejectText, reviewDone, reviewEventText, reviewSubline } from '@mm/components/badges/reviews';
import { confirmAsync } from '@/components/feedback';
import { runAction } from '@/components/swimming/parts';
import { Badge, Button, Card, Divider, Empty, Field, Input, LoadError, Sheet, Txt } from '@/components/ui';
import { LogoSpinner } from '@/components/Logo';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { Insignia } from './Insignia';

/**
 * Organizar › «Insignias por confirmar» en la app (ReviewsPanel de la web, §6.5): las hazañas de la liga que piden aval y
 * que esta cuenta puede confirmar (dueño o admin que no jugó ni aparece en la evidencia: lo decide la base). Confirmada,
 * queda firme y se le avisa al jugador; si no, se retira sin rastro público. Va dentro de LeagueScope.
 */

/** Una hazaña por confirmar: la insignia, quién y cuándo, la evidencia, el juego y «Confirmar» o «No se pudo confirmar». */
function ReviewRow({ model, busy, disabled, onConfirm, onReject }: { model: ReviewModel; busy?: boolean; disabled?: boolean; onConfirm: () => void; onReject: () => void }) {
  const c = useColors();
  const r = model.review;
  const markers = markersText(model.markers);
  const link = model.eventLink;
  return (
    <View style={styles.row}>
      <Insignia badge={model.look} size={40} label={`${model.name}, en revisión`} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt variant="bodyStrong">
          {model.name} <Txt tone="muted">{`de ${r.playerName}`}</Txt>
        </Txt>
        <Txt variant="meta" tone="muted">
          {reviewSubline(model)}
        </Txt>
        {!!model.evidence && <Txt variant="meta">{model.evidence}</Txt>}
        {!!markers && (
          <Txt variant="small" tone="muted">
            {markers}
          </Txt>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          {!!link && (
            <Pressable accessibilityRole="link" onPress={() => router.push(link as never)} style={styles.link}>
              <ExternalLink size={16} color={c.accent} />
              <Txt variant="meta" tone="accent" style={{ fontFamily: font.semibold }}>
                {reviewEventText(model)}
              </Txt>
            </Pressable>
          )}
          {r.overdue && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Hourglass size={12} color={c.warn} />
              <Badge tone="warn">Más de 14 días</Badge>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
          <Button icon={<XCircle size={18} color={c.fg} />} disabled={busy || disabled} onPress={onReject}>
            No se pudo confirmar
          </Button>
          <Button variant="primary" icon={<CheckCircle2 size={18} color={c.accentFg} />} loading={busy} disabled={disabled} onPress={onConfirm}>
            Confirmar
          </Button>
        </View>
      </View>
    </View>
  );
}

/** «Por confirmar» de la liga: la lista con «Confirmar» (pregunta antes) y «No se pudo confirmar» (con nota opcional). */
export function ReviewsPanel() {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const notices = useBadgeNotices();
  // Una a la vez: la que se está decidiendo gira y las demás esperan.
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<ReviewModel | null>(null);
  const [note, setNote] = useState('');
  const models = leagueReviews(notices.data.reviews, lid);

  const decide = async (r: BadgeReview, ok: boolean, text?: string) => {
    setBusy(r.id);
    await runAction(() => reviewBadge(r, ok, text), reviewDone(ok));
    setBusy(null);
  };

  const approve = async (m: ReviewModel) => {
    if (await confirmAsync(approveQuestion(m))) await decide(m.review, true);
  };

  let content;
  if (notices.loading && !models.length) {
    content = (
      <View style={{ paddingVertical: 32, alignItems: 'center' }}>
        <LogoSpinner size={36} label="Cargando" />
      </View>
    );
  } else if (notices.error && !models.length) content = <LoadError error={notices.error} />;
  else if (!models.length) {
    content = (
      <Empty
        icon={<BadgeCheck size={28} color={c.accent} />}
        title="Nada por confirmar"
        text="Cuando alguien logre una hazaña que pide que la confirme otra persona (un juego perfecto, un hoyo en uno), sale aquí."
      />
    );
  } else {
    content = (
      <Card padded={false}>
        {models.map((m, i) => (
          <View key={m.review.id}>
            {i > 0 && <Divider />}
            <ReviewRow
              model={m}
              busy={busy === m.review.id}
              disabled={busy !== null && busy !== m.review.id}
              onConfirm={() => void approve(m)}
              onReject={() => {
                setNote('');
                setRejecting(m);
              }}
            />
          </View>
        ))}
      </Card>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 2 }}>
        <Txt variant="section" accessibilityRole="header">
          Por confirmar
        </Txt>
        <Txt variant="meta" tone="muted">
          Hazañas que piden que las confirme alguien que no jugó. Revisa la evidencia antes.
        </Txt>
      </View>
      {content}
      <Sheet
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        title="No se pudo confirmar"
        footer={
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
            <Button onPress={() => setRejecting(null)}>Cancelar</Button>
            <Button
              variant="danger"
              loading={!!rejecting && busy === rejecting.review.id}
              disabled={!!rejecting && busy !== null && busy !== rejecting.review.id}
              onPress={async () => {
                if (!rejecting) return;
                await decide(rejecting.review, false, note);
                setRejecting(null);
              }}
            >
              No se pudo confirmar
            </Button>
          </View>
        }
      >
        {rejecting && (
          <View style={{ gap: 12 }}>
            <Txt variant="meta">{rejectText(rejecting)}</Txt>
            <Field label="Nota (opcional)" hint={`${note.length}/${REVIEW_NOTE_MAX}`}>
              <Input
                value={note}
                maxLength={REVIEW_NOTE_MAX}
                multiline
                numberOfLines={3}
                onChangeText={setNote}
                placeholder="Por ejemplo: no hay foto del marcador."
                style={{ height: 96, paddingTop: 14, textAlignVertical: 'top' }}
              />
            </Field>
          </View>
        )}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
});
