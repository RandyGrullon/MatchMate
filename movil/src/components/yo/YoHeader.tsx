import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Search, Settings } from "lucide-react-native";
import { ModeSwitch } from "@/components/mode/Mode";
import { Avatar } from "@/components/social/Avatar";
import { Txt } from "@/components/ui";
import { useColors } from "@/theme/theme";
import { font } from "@/theme/tokens";

/** Un botón redondo de 44 de arriba de Yo (la lupa y el engranaje), como SearchButton y el engranaje de la web. */
function RoundButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: c.surface,
        transform: [{ scale: pressed ? 0.95 : 1 }],
      })}
    >
      {children}
    </Pressable>
  );
}

/**
 * Arriba de Yo (YoTop de la web): «Lite | Pro» (cómo ver la app: cambia al momento, con «Deshacer» abajo), la lupa
 * (buscar personas y ligas, `/buscar`) y el único engranaje (la cuenta, `/cuenta`).
 */
export function YoTop() {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
      }}
    >
      <ModeSwitch />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <RoundButton
          label="Buscar personas y ligas"
          onPress={() => router.push("/buscar")}
        >
          <Search size={21} color={c.fg2} />
        </RoundButton>
        <RoundButton
          label="Configuración de la cuenta"
          onPress={() => router.push("/cuenta" as never)}
        >
          <Settings size={21} color={c.fg2} />
        </RoundButton>
      </View>
    </View>
  );
}

/**
 * Tu foto (o tus iniciales; tocarla lleva a cambiarla en `/cuenta?foto=1`), tu nombre, «@usuario · tu liga» y tu
 * biografía (Identity de la web; más chico en Pro).
 */
export function Identity({
  name,
  line,
  bio,
  photo,
  pro = false,
}: {
  name: string;
  line: string | null;
  bio?: string | null;
  photo?: string | null;
  pro?: boolean;
}) {
  const text = bio?.trim();
  const avatar = pro ? 52 : 60;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: pro ? 14 : 16 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          photo ? "Cambiar tu foto de perfil" : "Ponerle una foto a tu perfil"
        }
        onPress={() => router.push("/cuenta?foto=1" as never)}
        style={({ pressed }) => ({
          borderRadius: avatar / 2,
          transform: [{ scale: pressed ? 0.95 : 1 }],
        })}
      >
        <Avatar name={name} photo={photo} size={avatar} />
      </Pressable>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt
          accessibilityRole="header"
          numberOfLines={1}
          style={
            pro
              ? { fontSize: 22, lineHeight: 26, letterSpacing: -0.44, fontFamily: font.bold }
              : { fontSize: 26, lineHeight: 30, letterSpacing: -0.65, fontFamily: font.bold }
          }
        >
          {name}
        </Txt>
        {!!line && (
          <Txt
            variant="meta"
            tone="muted"
            numberOfLines={1}
            style={pro ? { marginTop: 2 } : { marginTop: 3 }}
          >
            {line}
          </Txt>
        )}
        {!!text && (
          <Txt
            variant="meta"
            tone="fg2"
            numberOfLines={2}
            style={{ marginTop: pro ? 4 : 6 }}
          >
            {text}
          </Txt>
        )}
      </View>
    </View>
  );
}
