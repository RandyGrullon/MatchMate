import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { AlertTriangle, ArrowRightLeft, CheckCircle2, Crown, Download, Trash2, X } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { deleteLeague } from '@mm/lib/data';
import { transferLeague } from '@mm/lib/data/admin';
import { useOutboxSnapshot } from '@mm/lib/data/client';
import { rememberLeague } from '@mm/lib/league';
import { accountErrorMessage, DELETE_WORD, deleteMyAccount, fetchDeletePlan, type DeletePlan, type DeletePlanLeague } from '@mm/pages/legal/account';
import { sportMeta } from '@mm/sports/registry';
import { confirmAsync, toast } from '@/components/feedback';
import { openLegal } from '@/components/legal/links';
import { PickField } from '@/components/players/fields';
import { Button, Card, Empty, ErrorNote, Field, Input, Loading, Screen, Txt } from '@/components/ui';
import { shareMyData } from '@/lib/myData';
import { openOnWeb } from '@/lib/web';
import { colorsFor, useColors, useTheme } from '@/theme/theme';

/**
 * Borrar la cuenta desde la app (regla 5.1.1(v) de Apple), con el mismo camino de la web
 * (src/pages/legal/DeleteAccountDialog.tsx):
 * 1. Revisa si se puede (prepare_delete_account). Si tiene ligas a su nombre, las pasa a otro miembro o las borra
 *    aquí mismo; si es el único superadmin, le dice que nombre a otro (la consola se queda en la web).
 * 2. Muestra qué se borra y qué se queda, ofrece bajar sus datos antes y pide escribir BORRAR.
 * 3. Borra (Edge Function delete-account, deleteMyAccount compartido).
 */
export default function DeleteAccountScreen() {
  const c = useColors();
  const auth = useAuth();
  const uid = auth.user?.uid ?? null;
  const outbox = useOutboxSnapshot();
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Lo que respondió la revisión: el plan (se queda el último mientras se revisa otra vez) o por qué no se pudo.
  const [plan, setPlan] = useState<DeletePlan | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // El error de borrar.
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    fetchDeletePlan()
      .then((p) => {
        if (!alive) return;
        setPlan(p);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setLoadError(accountErrorMessage(e));
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [uid]);

  // Revisar otra vez (después de pasar o borrar una liga, o con «Intentar de nuevo»).
  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      setPlan(await fetchDeletePlan());
    } catch (e) {
      setLoadError(accountErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  const close = () => (router.canGoBack() ? router.back() : router.replace('/yo'));

  if (!uid) {
    return (
      <Screen>
        <Empty title="Entra a tu cuenta" text="Para borrar tu cuenta, primero entra con ella." action={<Button onPress={() => router.replace('/login')}>Entrar</Button>} />
      </Screen>
    );
  }
  if (loading && !plan) return <Loading label="Revisando tu cuenta" />;

  const ready = !!plan?.canDelete;
  const confirmed = word.trim().toUpperCase() === DELETE_WORD;

  async function remove() {
    if (!uid || !ready || !confirmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteMyAccount(uid);
      rememberLeague(null);
      toast('Tu cuenta se borró. Gracias por usar MatchMate.');
      router.dismissTo('/');
    } catch (e) {
      setError(accountErrorMessage(e));
      // Algo cambió (p. ej. justo le pasaron una liga): se revisa otra vez.
      void load();
    } finally {
      setBusy(false);
    }
  }

  async function exportFirst() {
    setExporting(true);
    try {
      const name = await shareMyData();
      toast(`Listo: ${name}`);
    } catch (e) {
      toast(accountErrorMessage(e), 'error');
    } finally {
      setExporting(false);
    }
  }

  const unsent = outbox.pendingCount + outbox.failed.length;
  const s = plan?.summary;

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="title">Borrar mi cuenta</Txt>
          {ready && (
            <Txt variant="meta" tone="muted">
              Esto no se puede deshacer
            </Txt>
          )}
        </View>
        <Button variant="ghost" accessibilityLabel="Cerrar" icon={<X size={22} color={c.fg} />} disabled={busy} onPress={close} />
      </View>

      {loadError && !plan ? (
        <View style={{ gap: 16 }}>
          <ErrorNote>{loadError}</ErrorNote>
          <Button variant="quiet" size="lg" full onPress={() => void load()}>
            Intentar de nuevo
          </Button>
        </View>
      ) : plan ? (
        <View style={{ gap: 20 }}>
          {plan.ownedLeagues.length > 0 && <OwnedLeagues plan={plan} onChanged={load} myUid={uid} />}
          {plan.blockers.includes('last_superadmin') && (
            <View style={{ flexDirection: 'row', gap: 14, borderRadius: 16, backgroundColor: c.warnSoft, padding: 16 }}>
              <Crown size={20} color={c.warn} style={{ marginTop: 2 }} />
              <View style={{ flex: 1, gap: 4 }}>
                <Txt variant="bodyStrong">Eres el único superadmin</Txt>
                <Txt tone="fg2">Si borras tu cuenta, nadie podría manejar la app. Primero nombra a otro superadmin.</Txt>
                {/* La consola del superadmin se queda en la web. */}
                <Pressable accessibilityRole="link" onPress={() => void openOnWeb('/superadmin/cuentas')} style={{ minHeight: 44, justifyContent: 'center' }}>
                  <Txt variant="bodyStrong" tone="accent">
                    Ir a Cuentas en la consola
                  </Txt>
                </Pressable>
              </View>
            </View>
          )}

          {ready && (
            <>
              <View style={{ flexDirection: 'row', gap: 12, borderRadius: 16, backgroundColor: c.dangerSoft, paddingHorizontal: 16, paddingVertical: 14 }}>
                <AlertTriangle size={20} color={c.danger} style={{ marginTop: 2 }} />
                <Txt tone="danger" style={{ flex: 1 }}>
                  Si después quieres volver, tendrías que crear una cuenta nueva.
                </Txt>
              </View>
              <View style={{ gap: 6 }}>
                <Txt variant="bodyStrong">Se borra</Txt>
                <Bullet>Tu cuenta, tu nombre y tu correo.</Bullet>
                <Bullet>Tu lugar en {s?.leagues === 1 ? '1 liga' : `${s?.leagues ?? 0} ligas`} (sales de todas).</Bullet>
                {!!s && s.comments + s.reactions > 0 && (
                  <Bullet>
                    {s.comments} {s.comments === 1 ? 'comentario' : 'comentarios'} y {s.reactions} {s.reactions === 1 ? 'reacción' : 'reacciones'}.
                  </Bullet>
                )}
                <Bullet>Los avisos en tus teléfonos{s?.devices ? ` (${s.devices})` : ''}.</Bullet>
              </View>
              <View style={{ gap: 6 }}>
                <Txt variant="bodyStrong">Se queda en las ligas</Txt>
                <Bullet>
                  Tus resultados, a nombre de tu jugador pero sin cuenta
                  {s?.players ? ` (${s.players === 1 ? '1 jugador' : `${s.players} jugadores`})` : ''}: son parte de las tablas.
                </Bullet>
                <Bullet>
                  {'Si quieres que los borren, pídeselo al admin de cada liga. '}
                  <Txt variant="bodyStrong" tone="accent" accessibilityRole="link" onPress={() => openLegal('privacidad', 'tiempo')}>
                    Más detalles
                  </Txt>
                </Bullet>
              </View>
              {unsent > 0 && (
                <View style={{ borderRadius: 16, backgroundColor: c.warnSoft, paddingHorizontal: 16, paddingVertical: 12 }}>
                  <Txt tone="warn">
                    Este teléfono tiene {unsent} {unsent === 1 ? 'cambio sin enviar' : 'cambios sin enviar'}. Si borras la cuenta, se pierden.
                  </Txt>
                </View>
              )}
              <Button variant="quiet" size="lg" full loading={exporting} icon={<Download size={20} color={c.fg} />} onPress={exportFirst}>
                Descargar mis datos antes
              </Button>
              <Field label={`Para confirmar, escribe ${DELETE_WORD}`}>
                <Input
                  accessibilityLabel={`Para confirmar, escribe ${DELETE_WORD}`}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  autoComplete="off"
                  placeholder={DELETE_WORD}
                  editable={!busy}
                  value={word}
                  onChangeText={setWord}
                />
              </Field>
            </>
          )}
          {error && <ErrorNote>{error}</ErrorNote>}
        </View>
      ) : null}

      {ready ? (
        <Button variant="danger" size="xl" full loading={busy} disabled={!confirmed} icon={<Trash2 size={20} color={c.onDanger} />} onPress={remove}>
          Borrar mi cuenta para siempre
        </Button>
      ) : (
        <Button variant="quiet" size="xl" full onPress={close}>
          Cerrar
        </Button>
      )}
    </Screen>
  );
}

/** Un punto de una lista (la <ul> de la web). */
function Bullet({ children }: { children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, paddingLeft: 4 }}>
      <Txt tone="faint">•</Txt>
      <Txt tone="fg2" style={{ flex: 1 }}>
        {children}
      </Txt>
    </View>
  );
}

/** Las ligas a su nombre: pasarlas a otro miembro o borrarlas, una por una. */
function OwnedLeagues({ plan, onChanged, myUid }: { plan: DeletePlan; onChanged: () => Promise<void> | void; myUid: string }) {
  const n = plan.ownedLeagues.length;
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 4 }}>
        <Txt variant="section">Primero, {n === 1 ? 'tu liga' : `tus ${n} ligas`}</Txt>
        <Txt tone="fg2">{n === 1 ? 'Está' : 'Están'} a tu nombre: pásala a otro miembro (quedas de admin hasta borrar la cuenta) o bórrala.</Txt>
      </View>
      {plan.ownedLeagues.map((l) => (
        <OwnedLeague key={l.id} league={l} onChanged={onChanged} myUid={myUid} />
      ))}
    </View>
  );
}

function OwnedLeague({ league, onChanged, myUid }: { league: DeletePlanLeague; onChanged: () => Promise<void> | void; myUid: string }) {
  const c = useColors();
  const { isDark } = useTheme();
  const [to, setTo] = useState(league.members[0]?.userId ?? '');
  const [busy, setBusy] = useState<'pasar' | 'borrar' | null>(null);
  const meta = sportMeta(league.sport);
  const sport = meta?.label ?? league.sport;
  const Icon = meta?.icon;
  // El cuadrito de la liga: el ícono de su deporte en su color (LeagueTile de la web).
  const tint = colorsFor(isDark, league.sport);
  const target = league.members.find((m) => m.userId === to);

  async function transfer() {
    if (!target) return;
    const ok = await confirmAsync({
      title: `¿Pasar «${league.name}» a ${target.name}?`,
      message: `${target.name} queda como dueño o dueña de la liga. Tú quedas como admin hasta que borres tu cuenta.`,
      confirmText: 'Pasar la liga',
    });
    if (!ok) return;
    setBusy('pasar');
    try {
      await transferLeague(league.id, target.userId);
      toast(`«${league.name}» ahora es de ${target.name}`);
      await onChanged();
    } catch (e) {
      toast(accountErrorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    const ok = await confirmAsync({
      title: `¿Borrar «${league.name}» para siempre?`,
      message: 'Se borran sus eventos, juegos, partidos, jugadores y fotos, para todos sus miembros. No se puede deshacer.',
      confirmText: 'Borrar la liga',
      danger: true,
    });
    if (!ok) return;
    setBusy('borrar');
    try {
      await deleteLeague(league.id, myUid);
      toast(`Se borró «${league.name}»`);
      await onChanged();
    } catch (e) {
      toast(accountErrorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: tint.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          {Icon ? <Icon size={22} color={tint.accent} /> : null}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="bodyStrong" numberOfLines={1}>
            {league.name}
          </Txt>
          <Txt variant="small" tone="muted">
            {league.kind === 'torneo' ? `Torneo · ${sport}` : sport}
          </Txt>
        </View>
      </View>
      {league.members.length ? (
        <View style={{ gap: 12 }}>
          <View style={{ gap: 6 }}>
            <Txt variant="meta" tone="fg2">
              Pasarla a
            </Txt>
            <PickField
              label="Pasarla a"
              options={league.members.map((m) => ({ key: m.userId, label: `${m.name}${m.role === 'admin' ? ' (admin)' : ''}` }))}
              value={to}
              onChange={setTo}
              disabled={!!busy}
            />
          </View>
          <Button variant="primary" size="lg" full icon={<ArrowRightLeft size={20} color={c.accentFg} />} onPress={transfer} loading={busy === 'pasar'} disabled={!!busy || !target}>
            Pasar la liga
          </Button>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <CheckCircle2 size={16} color={c.ok} style={{ marginTop: 3 }} />
          <Txt tone="fg2" style={{ flex: 1 }}>
            Solo estás tú: puedes borrarla sin afectar a nadie.
          </Txt>
        </View>
      )}
      {league.memberCount > league.members.length && (
        <Txt variant="small" tone="muted">
          Se ven {league.members.length} de {league.memberCount} miembros (los admins primero). Si no ves a la persona, hazla admin en la liga y vuelve aquí.
        </Txt>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !!busy, busy: busy === 'borrar' }}
        disabled={!!busy}
        onPress={remove}
        style={({ pressed }) => ({ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', opacity: busy ? 0.6 : pressed ? 0.7 : 1 })}
      >
        {busy === 'borrar' ? <ActivityIndicator size="small" color={c.danger} /> : <Trash2 size={18} color={c.danger} />}
        <Txt variant="bodyStrong" tone="danger">
          Borrar la liga
        </Txt>
      </Pressable>
    </Card>
  );
}
