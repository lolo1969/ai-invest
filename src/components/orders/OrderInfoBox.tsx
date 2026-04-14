import { ArrowDownCircle, ArrowUpCircle, ShieldAlert, Zap } from 'lucide-react';

export function OrderInfoBox() {
  return (
    <div className="bg-[#1a1a2e] rounded-xl p-4 border border-[#252542] mb-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-2">ℹ️ So funktionieren Orders</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-gray-500">
        <div className="flex items-start gap-2">
          <ArrowDownCircle size={14} className="text-green-400 mt-0.5 flex-shrink-0" />
          <span><strong className="text-gray-400">Limit Buy:</strong> Kauforder wird ausgeführt wenn der Kurs auf oder unter den Trigger-Preis fällt.</span>
        </div>
        <div className="flex items-start gap-2">
          <ArrowUpCircle size={14} className="text-blue-400 mt-0.5 flex-shrink-0" />
          <span><strong className="text-gray-400">Limit Sell:</strong> Verkaufsorder wird ausgeführt wenn der Kurs auf oder über den Trigger-Preis steigt.</span>
        </div>
        <div className="flex items-start gap-2">
          <ShieldAlert size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
          <span><strong className="text-gray-400">Stop Loss:</strong> Automatischer Verkauf zur Verlustbegrenzung wenn der Kurs unter den Trigger fällt.</span>
        </div>
        <div className="flex items-start gap-2">
          <Zap size={14} className="text-yellow-400 mt-0.5 flex-shrink-0" />
          <span><strong className="text-gray-400">Stop Buy:</strong> Kauforder bei Breakout – wird ausgeführt wenn der Kurs über den Trigger steigt.</span>
        </div>
      </div>
    </div>
  );
}
