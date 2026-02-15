import { useState } from 'react';
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
  ShoppingCart
} from 'lucide-react';

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

  return (
    <>
      {/* Mobile menu button */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-[#1a1a2e] text-white"
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

      {/* Sidebar */}
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
              AI Invest
            </h1>
            <p className="text-sm text-gray-400 mt-1">Investment Advisor</p>
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
                    {item.icon}
                    <span className="font-medium">{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-[#252542]">
            <div className="px-4 py-3 bg-[#252542] rounded-lg">
              <p className="text-xs text-gray-400">AI Investment Advisor</p>
              <p className="text-xs text-gray-500 mt-1">v1.0.0</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
