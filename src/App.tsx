import { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { Sidebar } from './components/Sidebar';
import { useAppStore } from './store/useAppStore';
import { useAutopilot } from './hooks/useAutopilot';
import { useOrderExecution } from './hooks/useOrderExecution';
import { AlertCircle, X, Loader2 } from 'lucide-react';

// Lazy-loaded components für Code-Splitting
const Dashboard = lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const Settings = lazy(() => import('./components/Settings').then(m => ({ default: m.Settings })));
const Signals = lazy(() => import('./components/Signals').then(m => ({ default: m.Signals })));
const Watchlist = lazy(() => import('./components/Watchlist').then(m => ({ default: m.Watchlist })));
const Portfolio = lazy(() => import('./components/Portfolio').then(m => ({ default: m.Portfolio })));
const Notifications = lazy(() => import('./components/Notifications').then(m => ({ default: m.Notifications })));
const PriceAlerts = lazy(() => import('./components/PriceAlerts').then(m => ({ default: m.PriceAlerts })));
const Orders = lazy(() => import('./components/Orders').then(m => ({ default: m.Orders })));
const Autopilot = lazy(() => import('./components/Autopilot').then(m => ({ default: m.Autopilot })));

// Loading Spinner Komponente
const LoadingSpinner = () => (
  <div className="flex items-center justify-center h-full min-h-[400px]">
    <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
  </div>
);

const VALID_VIEWS = ['dashboard', 'settings', 'signals', 'watchlist', 'portfolio', 'notifications', 'price-alerts', 'orders', 'autopilot'];

function getInitialView(): string {
  const hash = window.location.hash.replace('#', '');
  return VALID_VIEWS.includes(hash) ? hash : 'dashboard';
}

function App() {
  const [activeView, setActiveViewState] = useState(getInitialView);
  const { error, setError, isAnalyzing } = useAppStore();

  // Navigation mit Hash-Sync
  const setActiveView = useCallback((view: string) => {
    setActiveViewState(view);
    window.location.hash = view;
  }, []);

  // Auf Browser-Back/Forward reagieren (Hash-Änderung)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (VALID_VIEWS.includes(hash)) {
        setActiveViewState(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Warnung bei Reload wenn Analyse läuft
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isAnalyzing) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isAnalyzing]);

  // Autopilot-Hook auf App-Ebene, damit er persistent läuft
  useAutopilot();

  // Order-Execution-Hook auf App-Ebene, damit Orders im Hintergrund geprüft werden
  useOrderExecution();

  const renderView = () => {
    switch (activeView) {
      case 'dashboard':
        return <Dashboard />;
      case 'settings':
        return <Settings />;
      case 'signals':
        return <Signals />;
      case 'watchlist':
        return <Watchlist />;
      case 'portfolio':
        return <Portfolio />;
      case 'notifications':
        return <Notifications />;
      case 'price-alerts':
        return <PriceAlerts />;
      case 'orders':
        return <Orders />;
      case 'autopilot':
        return <Autopilot />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="flex min-h-screen bg-[#0f0f23]">
      <Sidebar activeView={activeView} onNavigate={setActiveView} />
      
      <main className="flex-1 lg:ml-0 overflow-auto pb-20 lg:pb-0">
        {/* Error Toast */}
        {error && (
          <div className="fixed top-4 right-4 z-50 max-w-md bg-red-500/90 text-white 
                        rounded-lg shadow-lg p-4 flex items-start gap-3 animate-slide-in">
            <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">Fehler</p>
              <p className="text-sm opacity-90">{error}</p>
            </div>
            <button 
              onClick={() => setError(null)}
              className="p-1 hover:bg-white/20 rounded"
            >
              <X size={16} />
            </button>
          </div>
        )}

        <Suspense fallback={<LoadingSpinner />}>
          {renderView()}
        </Suspense>
      </main>
    </div>
  );
}

export default App;
