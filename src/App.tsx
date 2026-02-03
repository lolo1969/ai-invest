import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { Settings } from './components/Settings';
import { Signals } from './components/Signals';
import { Watchlist } from './components/Watchlist';
import { Portfolio } from './components/Portfolio';
import { Notifications } from './components/Notifications';
import { PriceAlerts } from './components/PriceAlerts';
import { useAppStore } from './store/useAppStore';
import { AlertCircle, X } from 'lucide-react';

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

        {renderView()}
      </main>
    </div>
  );
}

export default App;
