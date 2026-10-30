import { Component, ErrorInfo, ReactNode } from 'react';

export interface ErrorBoundaryProps {
  children?: ReactNode;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  errorMsg: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    errorMsg: ''
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMsg: error.message };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, errorMsg: '' });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-color, #fff)' }}>
          <h1>Ocurrió un problema inesperado</h1>
          <p>{this.state.errorMsg}</p>
          <button 
            onClick={this.handleReset}
            style={{ padding: '10px 20px', marginTop: '20px', cursor: 'pointer', background: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '4px' }}
          >
            Volver al Inicio
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
