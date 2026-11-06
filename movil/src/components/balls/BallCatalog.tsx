import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BookOpen, Plus, Search, X } from 'lucide-react-native';
import { BALL_BRANDS, searchBallCatalog, type CatalogBall } from '@mm/lib/ballCatalog';
import { BALL_MAX, catalogLine } from '@mm/lib/balls';
import { CATALOG_BROWSE_LIMIT, CATALOG_PICK_LIMIT, hasBallCatalog, pickedCatalog } from '@mm/components/balls/catalog';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { Button, Input, Sheet, Txt } from '../ui';
import { CatalogBallArt } from './BallArt';

/**
 * Buscar bolas en el catálogo de marcas y modelos (BallCatalog.tsx de la web, src/lib/ballCatalog.ts): por marca, por
 * modelo o los dos en cualquier orden. Arriba de la hoja de una bola («Buscar en el catálogo»: llena marca, nombre y
 * cubierta) y en Mis bolas («Buscar bolas»: «Agregar a mi arsenal» abre la hoja ya llena).
 */

/** El campo de búsqueda (con su lupa y la X para borrar lo escrito). */
export function CatalogSearchInput({
  value,
  onChange,
  label,
  placeholder = 'Marca o modelo: Storm, Phaze…',
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
}) {
  const c = useColors();
  return (
    <View>
      <Input
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        returnKeyType="search"
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        maxLength={60}
        style={{ paddingLeft: 42, paddingRight: 48 }}
      />
      <View pointerEvents="none" style={[styles.searchIcon]}>
        <Search size={18} color={c.muted} />
      </View>
      {!!value && (
        <Pressable accessibilityRole="button" accessibilityLabel="Borrar búsqueda" onPress={() => onChange('')} style={styles.clear}>
          <X size={18} color={c.muted} />
        </Pressable>
      )}
    </View>
  );
}

/** Un modelo en la lista: la bola con sus colores, la marca, el nombre y «Reactiva perlada · 2023 · asimétrico». */
export function CatalogRow({
  ball: cb,
  trailing,
  trailingLabel,
  disabled,
  onPress,
}: {
  ball: CatalogBall;
  trailing?: ReactNode;
  /** Lo que dice `trailing` para el lector de pantalla. */
  trailingLabel?: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  const line = catalogLine(cb);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[cb.brand, cb.name, line, trailingLabel].filter(Boolean).join(', ')}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surface2 : 'transparent', opacity: disabled ? 0.5 : 1 }]}
    >
      <CatalogBallArt ball={cb} size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt numberOfLines={1} style={{ fontSize: 12, fontFamily: font.medium, color: c.muted }}>
          {cb.brand}
        </Txt>
        <Txt numberOfLines={1} style={{ fontSize: 15, fontFamily: font.semibold, color: c.fg }}>
          {cb.name}
        </Txt>
        {!!line && (
          <Txt numberOfLines={1} style={{ fontSize: 13, color: c.muted }}>
            {line}
          </Txt>
        )}
      </View>
      {trailing}
    </Pressable>
  );
}

/** La lista de modelos que salen (o que no sale ninguno). */
function CatalogResults({ query, results, label, row }: { query: string; results: readonly CatalogBall[]; label: string; row: (c: CatalogBall) => ReactNode }) {
  const c = useColors();
  if (!results.length) {
    return (
      <View style={{ borderRadius: 12, backgroundColor: c.surface2, paddingHorizontal: 12, paddingVertical: 10 }}>
        <Txt variant="meta" tone="muted" accessibilityLiveRegion="polite">
          {`Ninguna bola del catálogo con «${query.trim()}».`}
        </Txt>
      </View>
    );
  }
  return (
    <View accessibilityLabel={label} style={{ borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, overflow: 'hidden' }}>
      {results.map((cb, i) => (
        <View key={cb.id} style={i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null}>
          {row(cb)}
        </View>
      ))}
    </View>
  );
}

/**
 * «Buscar en el catálogo» en la hoja de una bola (CatalogPick de la web). Sin modelo elegido: el buscador (en una
 * nueva, abierto; en una que ya existe, detrás de un botón) y, al tocar uno, `onPick`. «No está en el catálogo»
 * (`onManual`) cierra el buscador y se escribe a mano. Con modelo: cuál es, «Cambiar» y la X para quitarlo.
 */
export function CatalogPick({
  value,
  brand,
  name,
  fresh,
  onPick,
  onClear,
  onManual,
}: {
  value: string | null;
  brand: string;
  name: string;
  fresh: boolean;
  onPick: (c: CatalogBall) => void;
  onClear: () => void;
  onManual: () => void;
}) {
  const c = useColors();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(fresh && !value);
  const results = useMemo(() => searchBallCatalog(query, CATALOG_PICK_LIMIT), [query]);
  if (!hasBallCatalog() && !value) return null;
  const { linked, title, specs } = pickedCatalog(value, brand, name);

  if (value && !searching) {
    return (
      <View style={[styles.picked, { borderColor: c.line }]}>
        {linked ? <CatalogBallArt ball={linked} size={36} /> : <BookOpen size={20} color={c.muted} />}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt style={{ fontSize: 12, fontFamily: font.medium, color: c.muted }}>Del catálogo</Txt>
          <Txt numberOfLines={1} style={{ fontSize: 15, fontFamily: font.semibold, color: c.fg }}>
            {title}
          </Txt>
          {!!specs && (
            <Txt numberOfLines={1} style={{ fontSize: 13, color: c.muted }}>
              {specs}
            </Txt>
          )}
        </View>
        {hasBallCatalog() && (
          <Button variant="ghost" onPress={() => setSearching(true)}>
            Cambiar
          </Button>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel="Quitar el modelo del catálogo" onPress={onClear} style={styles.square}>
          <X size={18} color={c.muted} />
        </Pressable>
      </View>
    );
  }

  if (!searching) {
    return (
      <Pressable accessibilityRole="button" onPress={() => setSearching(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, alignSelf: 'flex-start' }}>
        <Search size={16} color={c.accent} />
        <Txt style={{ fontSize: 14, fontFamily: font.semibold, color: c.accent }}>Buscar en el catálogo</Txt>
      </Pressable>
    );
  }

  const pick = (cb: CatalogBall) => {
    setQuery('');
    setSearching(false);
    onPick(cb);
  };
  const manual = () => {
    setQuery('');
    setSearching(false);
    onManual();
  };
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Txt accessibilityRole="header" style={{ fontSize: 12, fontFamily: font.medium, color: c.muted }}>
          Buscar en el catálogo
        </Txt>
        {!!value && (
          <Pressable accessibilityRole="button" onPress={() => setSearching(false)} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Txt style={{ fontSize: 14, fontFamily: font.semibold, color: c.accent }}>Cancelar</Txt>
          </Pressable>
        )}
      </View>
      <CatalogSearchInput value={query} onChange={setQuery} label="Buscar en el catálogo" />
      {query.trim() ? (
        <>
          <CatalogResults query={query} results={results} label="Bolas del catálogo" row={(cb) => <CatalogRow ball={cb} onPress={() => pick(cb)} />} />
          <View style={{ alignSelf: 'flex-start' }}>
            <Button onPress={manual}>No está en el catálogo</Button>
          </View>
        </>
      ) : (
        <Txt tone="muted" style={{ fontSize: 13 }}>
          Marca y modelo, en cualquier orden. Llena la marca, el nombre y la cubierta; si no está, escríbela abajo.
        </Txt>
      )}
    </View>
  );
}

/**
 * «Buscar bolas» de Mis bolas (CatalogSearchSheet de la web): el buscador del catálogo, las marcas para tocar (sin
 * nada escrito) y los modelos que salen; tocar uno lo agrega a mi arsenal (`onAdd` abre la hoja de una bola nueva ya
 * llena). Si no está, `onManual` abre la hoja vacía. Con el cupo lleno no se puede agregar. Se monta abierta.
 */
export function CatalogSearchSheet({
  initialQuery = '',
  full,
  onAdd,
  onManual,
  onClose,
}: {
  initialQuery?: string;
  full: boolean;
  onAdd: (id: string) => void;
  onManual: () => void;
  onClose: () => void;
}) {
  const c = useColors();
  const [query, setQuery] = useState(initialQuery);
  const found = useMemo(() => searchBallCatalog(query, CATALOG_BROWSE_LIMIT + 1), [query]);
  const results = found.slice(0, CATALOG_BROWSE_LIMIT);
  return (
    <Sheet open onClose={onClose} title="Buscar bolas" subtitle="Marcas y modelos del catálogo">
      <View style={{ gap: 12 }}>
        <CatalogSearchInput value={query} onChange={setQuery} label="Buscar bolas" placeholder="Storm, Hammer, Phaze…" />
        {!query.trim() ? (
          <>
            <Txt variant="meta" tone="muted">
              Escribe la marca, el modelo o los dos, en cualquier orden. O toca una marca:
            </Txt>
            <View accessibilityLabel="Marcas" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {BALL_BRANDS.map((b) => (
                <Pressable
                  key={b}
                  accessibilityRole="button"
                  onPress={() => setQuery(b)}
                  style={({ pressed }) => ({ height: 44, borderRadius: 22, paddingHorizontal: 16, justifyContent: 'center', backgroundColor: c.surface2, opacity: pressed ? 0.85 : 1 })}
                >
                  <Txt style={{ fontSize: 14, fontFamily: font.medium, color: c.fg }}>{b}</Txt>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <>
            <CatalogResults
              query={query}
              results={results}
              label="Bolas del catálogo"
              row={(cb) => (
                <CatalogRow
                  ball={cb}
                  disabled={full}
                  onPress={() => onAdd(cb.id)}
                  trailingLabel="Agregar a mi arsenal"
                  trailing={
                    <View style={[styles.addChip, { backgroundColor: c.accentSoft }]}>
                      <Plus size={16} color={c.accent} strokeWidth={2.4} />
                      <Txt style={{ fontSize: 14, fontFamily: font.semibold, color: c.accent }}>Agregar</Txt>
                    </View>
                  }
                />
              )}
            />
            {found.length > CATALOG_BROWSE_LIMIT && (
              <Txt tone="muted" style={{ fontSize: 13 }}>
                Hay más: escribe también el modelo.
              </Txt>
            )}
          </>
        )}
        {full ? (
          <Txt tone="muted" style={{ fontSize: 13 }}>
            {`Ya tienes ${BALL_MAX} bolas: borra una que ya no uses para agregar otra.`}
          </Txt>
        ) : (
          !!query.trim() && (
            <View style={{ alignSelf: 'flex-start' }}>
              <Button onPress={onManual}>No está en el catálogo: agregarla a mano</Button>
            </View>
          )
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  searchIcon: { position: 'absolute', left: 14, top: 0, bottom: 0, justifyContent: 'center' },
  clear: { position: 'absolute', right: 4, top: 0, bottom: 0, width: 44, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 14, paddingVertical: 10 },
  picked: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth * 2, paddingVertical: 8, paddingLeft: 14, paddingRight: 4 },
  square: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  addChip: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, borderRadius: 18, paddingLeft: 10, paddingRight: 12 },
});
