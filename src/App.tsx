import { useState, Suspense, lazy } from 'react';
import { Sidebar } from './components/Sidebar';
import { useAppStore } from './store/useAppStore';
import { AlertCircle, X, Loader2 } from 'lucide-react';

// Lazy-loaded components für Code-Splitting
const Dashboard = lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const Settings = lazy(() => import('./components/Settings').then(m => ({ default: m.Settings })));
const Signals = lazy(() => import('./components/Signals').then(m => ({ default: m.Signals })));
const Watchlist = lazy(() => import('./components/Watchlist').then(m => ({ default: m.Watchlist })));
const Portfolio = lazy(() => import('./components/Portfolio').then(m => ({ default: m.Portfolio })));
const Notifications = lazy(() => import('./components/Notifications').then(m => ({ default: m.Notifications })));
const PriceAlerts = lazy(() => import('./components/PriceAlerts').then(m => ({ default: m.PriceAlerts })));

// Loading Spinner Komponente
const LoadingSpinner = () => (
  <div className="flex items-center justify-center h-full min-h-[400px]">
    <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
  </div>
);

function App() {
  const [activeView, setActiveView] = useState('dashboard');
  const { error, setError } = useAppStore();

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
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="flex min-h-screen bg-[#0f0f23]">
      <Sidebar activeView={activeView} onNavigate={setActiveView} />
      
      <main className="flex-1 lg:ml-0 overflow-auto">
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
