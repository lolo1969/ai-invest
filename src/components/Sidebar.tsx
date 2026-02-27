import { useState } from 'react';
import { version } from '../../package.json';
import { 
  LayoutDashboard, 
  Settings, 
  TrendingUp, 
  Bell, 
  Briefcase,
  Search,
  Menu,
  X,
  BellRing,
  ShoppingCart,
  Bot
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface SidebarProps {
  activeView: string;
  onNavigate: (view: string) => void;
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
  { id: 'autopilot', label: 'Autopilot', icon: <Bot size={20} /> },
  { id: 'signals', label: 'Signale', icon: <TrendingUp size={20} /> },
  { id: 'portfolio', label: 'Portfolio', icon: <Briefcase size={20} /> },
  { id: 'watchlist', label: 'Watchlist', icon: <Search size={20} /> },
  { id: 'orders', label: 'Orders', icon: <ShoppingCart size={20} /> },
  { id: 'price-alerts', label: 'Preisalarme', icon: <BellRing size={20} /> },
  { id: 'notifications', label: 'Alerts', icon: <Bell size={20} /> },
  { id: 'settings', label: 'Einstellungen', icon: <Settings size={20} /> },
];

export function Sidebar({ activeView, onNavigate }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const autopilotEnabled = useAppStore((s) => s.autopilotSettings.enabled);
  const autopilotRunning = useAppStore((s) => s.autopilotState.isRunning);

  // Top 5 items for mobile bottom navigation
  const mobileNavItems = navItems.filter(item => 
    ['dashboard', 'portfolio', 'signals', 'orders', 'settings'].includes(item.id)
  );

  return (
    <>
      {/* Mobile menu button - nur sichtbar wenn NICHT in bottomNav-Ansicht */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-[#1a1a2e] text-white shadow-lg border border-[#252542]"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar - Desktop */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-40
          w-64 bg-[#1a1a2e] border-r border-[#252542]
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-[#252542]">
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <TrendingUp className="text-indigo-500" size={28} />
              Vestia
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-sm text-gray-400">Investment Advisor</p>
              <span className="text-[10px] font-semibold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">v{version} ALPHA</span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4">
            <ul className="space-y-2">
              {navItems.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => {
                      onNavigate(item.id);
                      setIsOpen(false);
                    }}
                    className={`
                      w-full flex items-center gap-3 px-4 py-3 rounded-lg
                      transition-all duration-200
                      ${
                        activeView === item.id
                          ? 'bg-indigo-600 text-white'
                          : 'text-gray-400 hover:bg-[#252542] hover:text-white'
                      }
                    `}
                  >
                    <span className="relative">
                      {item.icon}
                      {item.id === 'autopilot' && autopilotEnabled && (
                        <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-[#1a1a2e] ${
                          autopilotRunning ? 'bg-yellow-400 animate-pulse' : 'bg-emerald-400 animate-pulse'
                        }`} />
                      )}
                    </span>
                    <span className="font-medium">{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-[#252542]">
            <div className="px-4 py-3 bg-[#252542] rounded-lg">
              <p className="text-xs text-gray-400">Intelligent Investment Advisor</p>
              <p className="text-xs text-gray-500 mt-1">v{version}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#1a1a2e] border-t border-[#252542] safe-bottom">
        <div className="flex items-center justify-around px-1 py-1">
          {mobileNavItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                onNavigate(item.id);
                setIsOpen(false);
              }}
              className={`
                flex flex-col items-center justify-center py-2 px-3 rounded-lg min-w-0 flex-1
                transition-all duration-200
                ${
                  activeView === item.id
                    ? 'text-indigo-400 bg-indigo-600/10'
                    : 'text-gray-500'
                }
              `}
            >
              <span className="relative">
                {item.icon}
                {item.id === 'autopilot' && autopilotEnabled && (
                  <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${
                    autopilotRunning ? 'bg-yellow-400 animate-pulse' : 'bg-emerald-400 animate-pulse'
                  }`} />
                )}
              </span>
              <span className="text-[10px] mt-1 font-medium truncate w-full text-center">{item.label}</span>
            </button>
          ))}
          {/* More button to open sidebar */}
          <button
            onClick={() => setIsOpen(true)}
            className="flex flex-col items-center justify-center py-2 px-3 rounded-lg min-w-0 flex-1 text-gray-500"
          >
            <Menu size={20} />
            <span className="text-[10px] mt-1 font-medium">Mehr</span>
          </button>
        </div>
      </nav>
    </>
  );
}
