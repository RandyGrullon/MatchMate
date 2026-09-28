import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, House, RefreshCw, RotateCw } from 'lucide-react';
import { isChunkLoadError, reportClientError } from '../lib/errorReport';

interface Props {
  children: ReactNode;
  /** Qué pantalla es (va en el reporte: «liga/ranking», «cuenta»…). */
  area?: string;
  /** Al cambiar (la ruta), si la pantalla había fallado se vuelve a intentar dibujar. */
  resetKey?: unknown;
  /**
   * Envuelve el aviso: las pantallas de arriba lo muestran dentro del marco de la app para que la barra de
   * navegación siga ahí. Sin `frame` (la de toda la app), el aviso ocupa la pantalla completa.
   */
  frame?: (fallback: ReactNode) => ReactNode;
}

interface State {
  error: unknown;
  failed: boolean;
}

/**
 * Si una pantalla falla al dibujarse: un aviso con «Intentar de nuevo» en vez de una página en blanco, y el error
 * le llega al dueño de la app (consola › Errores). Hay uno por pantalla (App.tsx) y uno para toda la app, así un
 * error en una pantalla no tumba la barra de navegación.
 * Si lo que falló fue bajar una parte de la app (versión nueva publicada, o la señal se cayó), el aviso pide
 * actualizar.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, failed: false };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error, failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[pantalla]', this.props.area ?? 'app', error, info.componentStack);
    reportClientError('render', error, { component: this.props.area ?? 'app', componentStack: info.componentStack ?? null });
  }

  componentDidUpdate(prev: Props) {
    if (this.state.failed && !Object.is(prev.resetKey, this.props.resetKey)) this.setState({ error: null, failed: false });
  }

  private retry = () => this.setState({ error: null, failed: false });

  render() {
    if (!this.state.failed) return this.props.children;
    const chunk = isChunkLoadError(this.state.error);
    const box = <ErrorScreen chunk={chunk} full={!this.props.frame} onRetry={this.retry} />;
    return this.props.frame ? this.props.frame(box) : box;
  }
}

/** El aviso: dentro del marco (pantalla) o solo (toda la app). */
function ErrorScreen({ chunk, full, onRetry }: { chunk: boolean; full: boolean; onRetry: () => void }) {
  const reload = () => location.reload();
  return (
    <div
      role="alert"
      className={
        full
          ? 'mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-3 px-4 text-center'
          : 'animate-fade-up mx-auto flex max-w-sm flex-col items-center gap-3 px-2 py-14 text-center'
      }
    >
      <div className="mb-1 flex size-14 items-center justify-center rounded-2xl bg-warn-soft text-warn">
        {chunk ? <RefreshCw className="size-7" aria-hidden="true" /> : <AlertTriangle className="size-7" aria-hidden="true" />}
      </div>
      <h1 className="text-lg font-semibold">{chunk ? 'Hay que actualizar la app' : 'Esta pantalla tuvo un problema'}</h1>
      <p className="text-sm text-muted">
        {chunk
          ? 'No se pudo abrir esta parte de la app: puede que haya una versión nueva o que se cayera la señal. Actualiza para seguir; tus datos están guardados.'
          : 'No se pudo mostrar. El aviso le llega solo al equipo de MatchMate para arreglarlo. Tus datos están guardados.'}
      </p>
      <div className="mt-1 flex flex-wrap justify-center gap-2">
        {chunk ? (
          <button type="button" onClick={reload} className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-medium text-accent-fg">
            <RefreshCw className="size-4" aria-hidden="true" /> Actualizar
          </button>
        ) : (
          <>
            <button type="button" onClick={onRetry} className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-medium text-accent-fg">
              <RotateCw className="size-4" aria-hidden="true" /> Intentar de nuevo
            </button>
            {full ? (
              <button type="button" onClick={reload} className="inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-medium">
                <RefreshCw className="size-4" aria-hidden="true" /> Recargar
              </button>
            ) : (
              // Un <a> (no el Link del router): funciona aunque el router sea lo que falló.
              <a href="/" className="inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-medium">
                <House className="size-4" aria-hidden="true" /> Ir al inicio
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}
