import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { BadgeCheck, CheckCircle2, ExternalLink, Hourglass, XCircle } from 'lucide-react';
import { Insignia } from '../../badges/visual';
import { reviewBadge, useBadgeNotices, type BadgeReview } from '../../lib/data/badges';
import { useLeagueCtx } from '../../lib/league';
import { useAction, useFeedback } from '../feedback';
import { Badge, Button, Card, Empty, ListSkeleton, LoadError, Modal, Textarea } from '../ui';
import { reviewModel, type ReviewModel } from './logic';

/** Largo máximo de la nota al no confirmar (el de la base). */
const NOTE_MAX = 140;

/**
 * Una hazaña por confirmar: la insignia, quién y cuándo, la evidencia (valores, marcadores de la tarjeta y el link al
 * juego o la ronda para ver la foto o los cuadros) y «Confirmar» o «No se pudo confirmar».
 */
export function ReviewRow({ model, busy, onConfirm, onReject }: { model: ReviewModel; busy?: boolean; onConfirm: () => void; onReject: () => void }) {
  const r = model.review;
  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <Insignia badge={model.look} size={40} label={`${model.name}, en revisión`} />
      <div className="min-w-0 flex-1">
        <p className="leading-snug font-semibold break-words">
          {model.name} <span className="font-normal text-muted">{`de ${r.playerName}`}</span>
        </p>
        <p className="text-sm text-muted">{[model.levelName !== 'Única' ? model.levelName : null, model.date].filter(Boolean).join(' · ')}</p>
        {model.evidence && <p className="mt-1 text-sm">{model.evidence}</p>}
        {model.markers > 0 && (
          <p className="mt-0.5 text-xs text-muted">{`Tarjeta firmada por ${model.markers} ${model.markers === 1 ? 'marcador' : 'marcadores'}`}</p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {model.eventLink && (
            <Link to={model.eventLink} className="inline-flex h-11 items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
              <ExternalLink className="size-4" aria-hidden="true" />
              {model.eventName ? `Ver ${model.eventName}` : 'Ver el juego'}
            </Link>
          )}
          {r.overdue && (
            <Badge tone="warn">
              <Hourglass className="size-3" aria-hidden="true" /> Más de 14 días
            </Badge>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button className="h-11" icon={<XCircle className="size-4" />} disabled={busy} onClick={onReject}>
            No se pudo confirmar
          </Button>
          <Button className="h-11" variant="primary" icon={<CheckCircle2 className="size-4" />} loading={busy} onClick={onConfirm}>
            Confirmar
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * La lista de hazañas por confirmar con «Confirmar» (pide confirmación) y «No se pudo confirmar» (con nota opcional).
 * La usan Admin › «Por confirmar» (las de la liga) y la consola del superadmin (las vencidas de toda la app).
 */
export function ReviewList({ reviews, loading, error, empty }: { reviews: readonly BadgeReview[]; loading: boolean; error: Error | null; empty: ReactNode }) {
  const run = useAction();
  const { confirm } = useFeedback();
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<ReviewModel | null>(null);
  const [note, setNote] = useState('');

  const models = useMemo(() => reviews.map(reviewModel).filter((m): m is ReviewModel => m !== null), [reviews]);

  const decide = async (r: BadgeReview, ok: boolean, text?: string) => {
    setBusy(r.id);
    await run(() => reviewBadge(r, ok, text), ok ? 'Confirmada: ya es firme' : 'Listo: no cuenta');
    setBusy(null);
  };

  const approve = async (m: ReviewModel) => {
    const yes = await confirm({
      title: `¿Confirmar «${m.name}» de ${m.review.playerName}?`,
      message: 'Queda firme y se le avisa. Confírmala solo si lo viste o si la evidencia lo muestra.',
      confirmText: 'Confirmar',
    });
    if (yes) await decide(m.review, true);
  };

  let content;
  if (loading && !models.length) content = <ListSkeleton rows={2} />;
  else if (error && !models.length) content = <LoadError error={error} />;
  else if (!models.length) content = empty;
  else
    content = (
      <Card className="divide-y divide-line overflow-hidden">
        {models.map((m) => (
          <ReviewRow
            key={m.review.id}
            model={m}
            busy={busy === m.review.id}
            onConfirm={() => void approve(m)}
            onReject={() => {
              setNote('');
              setRejecting(m);
            }}
          />
        ))}
      </Card>
    );

  return (
    <>
      {content}
      <Modal
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        title="No se pudo confirmar"
        footer={
          <>
            <Button className="h-11" onClick={() => setRejecting(null)}>
              Cancelar
            </Button>
            <Button
              className="h-11"
              variant="danger"
              loading={!!rejecting && busy === rejecting.review.id}
              onClick={async () => {
                if (!rejecting) return;
                await decide(rejecting.review, false, note);
                setRejecting(null);
              }}
            >
              No se pudo confirmar
            </Button>
          </>
        }
      >
        {rejecting && (
          <div className="flex flex-col gap-3">
            <p className="text-sm">{`«${rejecting.name}» de ${rejecting.review.playerName} no va a contar. Se le dice que no se pudo confirmar, sin nada público.`}</p>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Nota (opcional)
              <Textarea value={note} maxLength={NOTE_MAX} rows={3} onChange={(e) => setNote(e.target.value)} placeholder="Por ejemplo: no hay foto del marcador." />
              <span className="self-end text-xs text-muted">{`${note.length}/${NOTE_MAX}`}</span>
            </label>
          </div>
        )}
      </Modal>
    </>
  );
}

/**
 * Admin › «Por confirmar» (§6.5): las hazañas de la liga que piden aval y que esta cuenta puede confirmar (dueño o
 * admin que no jugó ni aparece en la evidencia: lo decide la base). Confirmada, queda firme y se le avisa al jugador;
 * si no, se retira sin rastro público.
 */
export default function ReviewsPanel() {
  const { lid } = useLeagueCtx();
  const notices = useBadgeNotices();
  const reviews = useMemo(() => notices.data.reviews.filter((r) => r.leagueId === lid), [notices.data.reviews, lid]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold tracking-tight">Por confirmar</h2>
        <p className="text-sm text-muted">Hazañas que piden que las confirme alguien que no jugó. Revisa la evidencia antes.</p>
      </div>
      <ReviewList
        reviews={reviews}
        loading={notices.loading}
        error={notices.error}
        empty={
          <Empty icon={<BadgeCheck className="size-7" aria-hidden="true" />} title="Nada por confirmar">
            Cuando alguien logre una hazaña que pide que la confirme otra persona (un juego perfecto, un hoyo en uno), sale aquí.
          </Empty>
        }
      />
    </div>
  );
}
