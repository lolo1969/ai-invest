import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    // Here you could send to an error tracking service like Sentry
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-[#0f0f23] flex items-center justify-center p-6">
          <div className="bg-[#1a1a2e] rounded-xl p-8 border border-[#252542] max-w-md w-full text-center">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={32} className="text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">
              Etwas ist schiefgelaufen
            </h2>
            <p className="text-gray-400 mb-4">
              Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.
            </p>
            {this.state.error && (
              <details className="text-left mb-4">
                <summary className="text-gray-500 cursor-pointer hover:text-gray-400 text-sm">
                  Technische Details
                </summary>
                <pre className="mt-2 p-3 bg-[#0f0f23] rounded text-red-400 text-xs overflow-auto">
                  {this.state.error.message}
                </pre>
              </details>
            )}
            <button
              onClick={this.handleReset}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 
                       text-white rounded-lg transition-colors mx-auto"
            >
              <RefreshCw size={18} />
              Erneut versuchen
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
