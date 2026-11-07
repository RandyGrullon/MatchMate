/**
 * Las tarjetas de Configuración que siguen a tu cuenta, como src/pages/AccountPage.tsx: Apariencia, Mis ligas, Tus
 * datos (src/pages/legal/AccountDataCard.tsx), MatchMate (el panel del superadmin, Organizar con lo que espera, Mi
 * empresa, Acerca de y Contáctanos) y Cerrar sesión.
 */
import { Children, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { router } from "expo-router";
import {
  Building2,
  ClipboardList,
  Crown,
  Download,
  Info,
  Leaf,
  LogOut,
  MessageCircle,
  Plus,
  ScrollText,
  ShieldCheck,
  UserX,
  Zap,
} from "lucide-react-native";
import { logout, useAuth } from "@mm/lib/auth";
import { useLeaguesByIds, useMyMemberships } from "@mm/lib/data";
import { rememberLeague, roleLabel } from "@mm/lib/league";
import { countLabel, organizedLeagueIds } from "@mm/lib/organize";
import { unsubscribePush } from "@mm/lib/push";
import { useIsPro } from "@mm/lib/useMode";
import type { League } from "@mm/lib/types";
import { accountErrorMessage } from "@mm/pages/legal/account";
import { PRIVACY_PATH, TERMS_PATH } from "@mm/pages/legal/legal";
import { leagueSport, sportMeta } from "@mm/sports/registry";
import {
  businessSubtitle,
  organizeAriaLabel,
  showsOrganize,
} from "@mm/components/cuenta/logic";
import { useLeagueCount, useOrganizeTotal } from "@mm/components/organizeCount";
import { toast } from "../feedback";
import {
  Card,
  Divider,
  ListRow,
  RowIcon,
  SectionHeader,
  Segmented,
  Txt,
} from "../ui";
import { shareMyData } from "@/lib/myData";
import { openOnWeb } from "@/lib/web";
import { useOpenModeSheet } from "@/components/mode/Mode";
import { colorsFor, useColors, useTheme, type ThemeMode } from "@/theme/theme";
import { font, size } from "@/theme/tokens";

/** Las filas de una tarjeta con su raya entre una y otra (las que no salen no dejan raya). */
export function RowGroup({ children }: { children: ReactNode }) {
  const rows = Children.toArray(children);
  return (
    <Card padded={false}>
      {rows.map((row, i) => (
        <View key={i}>
          {i > 0 && <Divider inset={68} />}
          {row}
        </View>
      ))}
    </Card>
  );
}

/** Apariencia: claro, oscuro o como el teléfono (en este teléfono; el color lo pone cada deporte). */
export function AppearanceCard() {
  const c = useColors();
  const { mode, setMode } = useTheme();
  const isPro = useIsPro();
  const openMode = useOpenModeSheet();
  return (
    <>
      <SectionHeader title="Apariencia" />
      <Card padded={false} style={{ overflow: "hidden" }}>
        <View
          style={{
            gap: 10,
            paddingTop: 18,
            paddingBottom: 16,
            paddingHorizontal: 16,
          }}
        >
          <Segmented<ThemeMode>
            label="Tema"
            value={mode}
            onChange={setMode}
            options={[
              { key: "system", label: "Auto" },
              { key: "light", label: "Claro" },
              { key: "dark", label: "Oscuro" },
            ]}
          />
          <Txt variant="meta" tone="muted" style={{ marginHorizontal: 4 }}>
            En este teléfono. El color es el de tu deporte.
          </Txt>
        </View>
        <Divider />
        {/* Lite | Pro: abre la hoja «Elige cómo ver la app» (como la web). */}
        <ListRow
          icon={
            <RowIcon>
              {isPro ? (
                <Zap size={20} color={c.accent} />
              ) : (
                <Leaf size={20} color={c.accent} />
              )}
            </RowIcon>
          }
          title="Cómo ver la app"
          subtitle={isPro ? "Pro: con todo" : "Lite: lo esencial"}
          accessibilityLabel={`Cómo ver la app: ${isPro ? "Pro" : "Lite"}. Cambiar`}
          onPress={openMode}
        />
      </Card>
    </>
  );
}

/** El cuadrito de una liga: el ícono de su deporte en su color. */
function LeagueTile({ league }: { league: League }) {
  const { isDark } = useTheme();
  const sport = leagueSport(league);
  const tint = colorsFor(isDark, sport);
  const Icon = sportMeta(sport)?.icon;
  return (
    <View
      style={{
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: tint.accentSoft,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {Icon ? <Icon size={22} color={tint.accent} /> : null}
    </View>
  );
}

/** Mis ligas: cada una con tu papel (Dueño, Admin, Miembro); sin ninguna, crear o unirte. */
export function MyLeagues({ uid }: { uid: string }) {
  const c = useColors();
  const memberships = useMyMemberships(uid);
  const leagues = useLeaguesByIds(memberships.data.map((m) => m.leagueId));
  return (
    <>
      <SectionHeader title="Mis ligas" />
      {memberships.loading || leagues.loading ? (
        <Card>
          <ActivityIndicator color={c.accent} />
        </Card>
      ) : leagues.data.length === 0 ? (
        <RowGroup>
          {/* La web abre «¿Qué quieres hacer?»; en la app, crear y unirse están en Ligas. */}
          <ListRow
            icon={
              <RowIcon>
                <Plus size={20} color={c.accent} />
              </RowIcon>
            }
            title="Crear o unirme a una liga"
            subtitle="Todavía no estás en ninguna"
            onPress={() => router.push("/ligas")}
          />
        </RowGroup>
      ) : (
        <RowGroup>
          {leagues.data.map((l) => {
            const role = memberships.data.find(
              (m) => m.leagueId === l.id,
            )?.role;
            return (
              <ListRow
                key={l.id}
                icon={<LeagueTile league={l} />}
                title={l.name}
                subtitle={role ? roleLabel(role) : null}
                onPress={() =>
                  router.push({ pathname: "/l/[lid]", params: { lid: l.id } })
                }
              />
            );
          })}
        </RowGroup>
      )}
    </>
  );
}

/** Una fila en rojo (lo único de la pantalla que no se deshace): «Borrar mi cuenta». */
function DangerRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: size.row,
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: pressed ? c.surface2 : "transparent",
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: c.dangerSoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="bodyStrong" tone="danger" numberOfLines={1}>
          {title}
        </Txt>
        <Txt variant="meta" tone="muted" numberOfLines={2}>
          {subtitle}
        </Txt>
      </View>
    </Pressable>
  );
}

/**
 * Tus datos: la política de privacidad y los términos (en la web), «Descargar mis datos» (el mismo JSON de la web, con
 * la hoja de compartir del teléfono) y «Borrar mi cuenta» (la pantalla /cuenta/borrar).
 */
export function AccountData() {
  const c = useColors();
  const [exporting, setExporting] = useState(false);

  async function exportData() {
    if (exporting) return;
    setExporting(true);
    try {
      toast(`Listo: ${await shareMyData()}`);
    } catch (e) {
      toast(accountErrorMessage(e), "error");
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <SectionHeader title="Tus datos" />
      <RowGroup>
        <ListRow
          icon={
            <RowIcon>
              <ShieldCheck size={20} color={c.accent} />
            </RowIcon>
          }
          title="Política de privacidad"
          onPress={() => openOnWeb(PRIVACY_PATH)}
        />
        <ListRow
          icon={
            <RowIcon>
              <ScrollText size={20} color={c.accent} />
            </RowIcon>
          }
          title="Términos de uso"
          onPress={() => openOnWeb(TERMS_PATH)}
        />
        <ListRow
          icon={
            <RowIcon>
              <Download size={20} color={c.accent} />
            </RowIcon>
          }
          title="Descargar mis datos"
          subtitle="Tu perfil, ligas y resultados"
          onPress={exportData}
          right={exporting ? <ActivityIndicator color={c.accent} /> : undefined}
          chevron={!exporting}
        />
        <DangerRow
          icon={<UserX size={20} color={c.danger} />}
          title="Borrar mi cuenta"
          subtitle="No se puede deshacer"
          onPress={() => router.push("/cuenta/borrar")}
        />
      </RowGroup>
    </>
  );
}

/** Cuenta lo que espera en una liga que organizas (no dibuja nada). */
function PendingProbe({ lid }: { lid: string }) {
  useLeagueCount(lid);
  return null;
}

/**
 * MatchMate: el panel del superadmin (en la web), Organizar (a quien organiza alguna liga y al superadmin, con el
 * número de lo que espera), Mi empresa, Acerca de y Contáctanos (en la web).
 */
export function MatchMateCard({ uid }: { uid: string }) {
  const c = useColors();
  const auth = useAuth();
  const memberships = useMyMemberships(uid);
  const organizes = showsOrganize(auth.isSuper, memberships.data);
  const { counted, total } = useOrganizeTotal(
    organizedLeagueIds(memberships.data),
  );
  const business = auth.profile?.accountMode === "business";
  const badge = countLabel(total);
  return (
    <>
      <SectionHeader title="MatchMate" />
      <RowGroup>
        {auth.isSuper && (
          <ListRow
            icon={
              <RowIcon>
                <Crown size={20} color={c.accent} />
              </RowIcon>
            }
            title="Panel del superadmin"
            onPress={() => openOnWeb("/superadmin")}
          />
        )}
        {organizes && (
          <ListRow
            icon={
              <RowIcon>
                <ClipboardList size={20} color={c.accent} />
              </RowIcon>
            }
            title="Organizar"
            subtitle="Tus ligas, pendientes y ajustes"
            accessibilityLabel={organizeAriaLabel(total)}
            onPress={() => router.push("/organizar" as never)}
            right={
              badge ? (
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={{
                    minWidth: 26,
                    height: 26,
                    borderRadius: 13,
                    paddingHorizontal: 8,
                    backgroundColor: c.accent,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Txt
                    style={{
                      color: c.accentFg,
                      fontFamily: font.bold,
                      fontSize: 13,
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {badge}
                  </Txt>
                </View>
              ) : undefined
            }
          />
        )}
        <ListRow
          icon={
            <RowIcon>
              <Building2 size={20} color={business ? c.accent : c.fg2} />
            </RowIcon>
          }
          title="Mi empresa"
          subtitle={businessSubtitle(auth.profile?.accountMode)}
          onPress={() => router.push("/empresa")}
        />
        <ListRow
          icon={
            <RowIcon>
              <Info size={20} color={c.accent} />
            </RowIcon>
          }
          title="Acerca de MatchMate"
          onPress={() => openOnWeb("/acerca")}
        />
        <ListRow
          icon={
            <RowIcon>
              <MessageCircle size={20} color={c.accent} />
            </RowIcon>
          }
          title="Contáctanos"
          onPress={() => openOnWeb("/contacto")}
        />
      </RowGroup>
      {/* Cuentan lo que espera en cada liga que organizas (no dibujan nada). */}
      {counted.map((lid) => (
        <PendingProbe key={lid} lid={lid} />
      ))}
    </>
  );
}

/**
 * Cerrar sesión, como la web: primero se sale de la pantalla (a Ligas), este teléfono deja de recibir los avisos de la
 * cuenta y se sale.
 */
export function SignOutCard({ uid }: { uid: string }) {
  const c = useColors();
  const [busy, setBusy] = useState(false);
  async function signOut() {
    if (busy) return;
    setBusy(true);
    rememberLeague(null);
    router.dismissTo("/ligas");
    await unsubscribePush(uid);
    await logout();
  }
  return (
    <Card padded={false}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ busy }}
        onPress={() => void signOut()}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          minHeight: size.row,
          backgroundColor: pressed ? c.surface2 : "transparent",
        })}
      >
        <LogOut size={20} color={c.danger} />
        <Txt variant="bodyStrong" tone="danger">
          Cerrar sesión
        </Txt>
      </Pressable>
    </Card>
  );
}
