import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** "el panel interno", "esta sección"… */
  lugar?: string;
}

/** Contiene un error de render para que no se caiga todo el sitio. */
export class LimiteError extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Ópalo] Error en', this.props.lugar ?? 'una sección', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="contenedor seccion" role="alert">
        <h2>Algo falló al abrir {this.props.lugar ?? 'esta sección'}</h2>
        <p className="texto-2">Recarga la página. Si vuelve a pasar, avísale a quien administra el sitio y dile qué estabas haciendo.</p>
        <div className="fila">
          <button type="button" className="btn btn-primario" onClick={() => window.location.reload()}>
            Recargar
          </button>
          <a className="btn btn-secundario" href="./">
            Ir al inicio
          </a>
        </div>
      </div>
    );
  }
}
