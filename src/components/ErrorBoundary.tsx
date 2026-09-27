import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Si una pantalla falla al dibujarse, se muestra un aviso con opción de recargar en vez de una página en blanco. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[pantalla]', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="text-lg font-semibold">Algo salió mal</h1>
        <p className="text-sm text-muted">La pantalla no se pudo mostrar. Recarga para intentarlo de nuevo; tus datos están guardados.</p>
        <button
          type="button"
          onClick={() => location.reload()}
          className="h-10 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg"
        >
          Recargar
        </button>
      </div>
    );
  }
}
