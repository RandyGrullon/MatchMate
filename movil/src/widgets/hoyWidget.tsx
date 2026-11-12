/**
 * El widget de MatchMate en el iPhone (pantalla de inicio y pantalla bloqueada): lo de Hoy (en juego, tu próximo
 * partido, tu próxima fecha o nada) y, en los tamaños grandes, «Lo que viene». Tocarlo abre esa pantalla en la app.
 * El contenido ya viene armado y en texto (src/components/home/homeWidget.ts, con los textos de Hoy); lo manda la app
 * (movil/src/components/home/HomeWidgetFeeder.tsx).
 *
 * La función con 'widget' corre aparte, dentro de la extensión del iPhone: solo componentes de @expo/ui/swift-ui, sin
 * hooks, sin imports en tiempo de ejecución y sin nada declarado fuera de ella (todo va adentro o llega en props). Su
 * nombre va en minúscula a propósito: así el React Compiler (que corre en movil/src) no la toma por un componente. En
 * app.json va como initialLayout: sale en la galería de widgets aunque la app no se haya abierto todavía.
 */
import { Circle, HStack, Link, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { background, containerBackground, font, foregroundStyle, frame, lineLimit, minimumScaleFactor, shapes, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { HomeWidgetProps, WidgetRow } from '@mm/components/home/homeWidget';

function hoyWidgetView(props: HomeWidgetProps, environment: WidgetEnvironment) {
  'widget';
  // Los colores de la app (movil/src/theme/tokens.ts): claro y oscuro.
  const dark = environment.colorScheme === 'dark';
  const bg = dark ? '#161922' : '#ffffff';
  const ink = dark ? '#eceef3' : '#151822';
  const muted = dark ? '#9aa1b0' : '#646b7a';
  const accent = dark ? '#8b8cf6' : '#4338ca';
  const tile = dark ? '#1e222d' : '#eef0f4';
  const line = dark ? '#2a2f3b' : '#e2e5eb';
  const family = environment.widgetFamily ?? 'systemSmall';

  // ------------------------------------------------------------ Pantalla bloqueada (un solo color)
  if (family === 'accessoryInline') {
    return <Text modifiers={[widgetURL(props.url)]}>{props.line ? `${props.title} · ${props.line}` : props.title}</Text>;
  }
  if (family === 'accessoryRectangular') {
    return (
      <VStack alignment="leading" spacing={1} modifiers={[containerBackground('clear', 'widget'), widgetURL(props.url)]}>
        <Text modifiers={[font({ size: 12, weight: 'semibold' }), lineLimit(1)]}>{props.lead}</Text>
        <Text modifiers={[font({ size: 15, weight: 'bold' }), lineLimit(1), minimumScaleFactor(0.8)]}>{props.title}</Text>
        <Text modifiers={[font({ size: 13 }), lineLimit(1)]}>{props.line}</Text>
      </VStack>
    );
  }

  // ------------------------------------------------------------ Piezas
  const dot = <Circle modifiers={[foregroundStyle(accent), frame({ width: 7, height: 7 })]} />;
  const leadRow = (
    <HStack spacing={6}>
      {props.live ? dot : null}
      <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(props.live ? accent : muted), lineLimit(1)]}>{props.lead}</Text>
      <Spacer />
    </HStack>
  );
  const featured = (titleSize: number, lines: number) => (
    <VStack alignment="leading" spacing={4}>
      {leadRow}
      <Text modifiers={[font({ size: titleSize, weight: 'bold' }), foregroundStyle(ink), lineLimit(2), minimumScaleFactor(0.8)]}>{props.title}</Text>
      {props.line ? <Text modifiers={[font({ size: 13 }), foregroundStyle(ink), lineLimit(lines)]}>{props.line}</Text> : null}
      {props.sub ? <Text modifiers={[font({ size: 12 }), foregroundStyle(muted), lineLimit(1)]}>{props.sub}</Text> : null}
    </VStack>
  );
  // El bloque de fecha de las listas (DateBlock): el mes arriba en el color de la app y el día grande.
  const dateBlock = (row: WidgetRow) => (
    <VStack spacing={0} modifiers={[frame({ width: 40, height: 42 }), background(tile, shapes.roundedRectangle({ cornerRadius: 11 }))]}>
      <Text modifiers={[font({ size: 10, weight: 'bold' }), foregroundStyle(accent)]}>{row.month}</Text>
      <Text modifiers={[font({ size: 17, weight: 'bold' }), foregroundStyle(ink)]}>{row.day}</Text>
    </VStack>
  );
  const rowView = (row: WidgetRow) => (
    <Link destination={row.url}>
      <HStack spacing={10}>
        {dateBlock(row)}
        <VStack alignment="leading" spacing={1}>
          <Text modifiers={[font({ size: 14, weight: 'semibold' }), foregroundStyle(ink), lineLimit(1)]}>{row.title}</Text>
          <Text modifiers={[font({ size: 12 }), foregroundStyle(muted), lineLimit(1)]}>{row.line}</Text>
        </VStack>
        <Spacer />
        {row.live ? dot : null}
      </HStack>
    </Link>
  );
  const card = (content: ReturnType<typeof featured>) => <VStack modifiers={[containerBackground(bg, 'widget'), widgetURL(props.url)]}>{content}</VStack>;

  // ------------------------------------------------------------ Pequeño: lo de hoy (todo el widget lo abre)
  if (family === 'systemSmall') {
    return card(
      <VStack alignment="leading" spacing={0}>
        {featured(17, 2)}
        <Spacer />
      </VStack>,
    );
  }

  // ------------------------------------------------------------ Mediano: lo de hoy y las dos fechas siguientes
  if (family === 'systemMedium') {
    return card(
      <HStack spacing={12}>
        <VStack alignment="leading" spacing={0} modifiers={[frame({ maxWidth: 1000 })]}>
          {featured(17, 2)}
          <Spacer />
        </VStack>
        {props.rows.length ? (
          <VStack alignment="leading" spacing={8} modifiers={[frame({ maxWidth: 1000 })]}>
            {props.rows[0] ? rowView(props.rows[0]) : null}
            {props.rows[1] ? rowView(props.rows[1]) : null}
            <Spacer />
          </VStack>
        ) : null}
      </HStack>,
    );
  }

  // ------------------------------------------------------------ Grande: lo de hoy y «Lo que viene»
  return card(
    <VStack alignment="leading" spacing={10}>
      {featured(20, 2)}
      {props.emptyRows ? (
        <VStack alignment="leading" spacing={8}>
          <HStack modifiers={[frame({ height: 1 }), background(line)]}>
            <Spacer />
          </HStack>
          <Text modifiers={[font({ size: 15, weight: 'bold' }), foregroundStyle(ink)]}>Lo que viene</Text>
          {props.rows.length ? null : <Text modifiers={[font({ size: 13 }), foregroundStyle(muted), lineLimit(2)]}>{props.emptyRows}</Text>}
          {props.rows[0] ? rowView(props.rows[0]) : null}
          {props.rows[1] ? rowView(props.rows[1]) : null}
          {props.rows[2] ? rowView(props.rows[2]) : null}
          {props.rows[3] ? rowView(props.rows[3]) : null}
        </VStack>
      ) : null}
      <Spacer />
    </VStack>,
  );
}

/**
 * Lo que sale antes de que la app le mande nada (recién instalada). Va escrito aquí y no con homeWidget.ts: este archivo
 * se evalúa también al compilar la extensión, donde solo existe expo-widgets.
 */
const firstProps: HomeWidgetProps = {
  lead: 'MatchMate',
  live: false,
  title: 'Tu liga, en el celular',
  line: 'Abre MatchMate para ver aquí lo próximo de tus ligas.',
  sub: '',
  url: 'matchmate://',
  rows: [],
  emptyRows: '',
};

/** Se llama igual que en app.json (plugins → expo-widgets → widgets[].name). */
export const HoyWidget = createWidget<HomeWidgetProps>('MatchMateHoy', hoyWidgetView, firstProps);
