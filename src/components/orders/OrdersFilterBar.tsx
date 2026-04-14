import { Filter, ShoppingCart } from 'lucide-react';
import { ORDER_TYPE_LABELS, STATUS_LABELS } from './orderConstants';
import type { OrderType, OrderStatus, Order } from '../../types';

interface OrdersFilterBarProps {
  statusFilter: OrderStatus | 'all';
  typeFilter: OrderType | 'all';
  onStatusChange: (s: OrderStatus | 'all') => void;
  onTypeChange: (t: OrderType | 'all') => void;
  orders: Order[];
}

export function OrdersFilterBar({
  statusFilter,
  typeFilter,
  onStatusChange,
  onTypeChange,
  orders,
}: OrdersFilterBarProps) {
  return (
    <div className="flex flex-col gap-2 mb-4">
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
        <Filter size={14} className="text-gray-500 flex-shrink-0" />
        <span className="text-xs md:text-sm text-gray-500 flex-shrink-0">Status:</span>
        {(['all', 'active', 'executed', 'cancelled', 'expired'] as const).map((status) => (
          <button
            key={status}
            onClick={() => onStatusChange(status)}
            className={`text-xs px-3 py-1 rounded-full transition-colors ${
              statusFilter === status
                ? 'bg-purple-600 text-white'
                : 'bg-[#252542] text-gray-400 hover:bg-[#353560]'
            }`}
          >
            {status === 'all' ? 'Alle' : STATUS_LABELS[status]}
            {status !== 'all' && (
              <span className="ml-1">({orders.filter((o) => o.status === status).length})</span>
            )}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
        <ShoppingCart size={14} className="text-gray-500 flex-shrink-0" />
        <span className="text-xs md:text-sm text-gray-500 flex-shrink-0">Typ:</span>
        {(['all', 'limit-buy', 'limit-sell', 'stop-loss', 'stop-buy'] as const).map((type) => (
          <button
            key={type}
            onClick={() => onTypeChange(type)}
            className={`text-xs px-3 py-1 rounded-full transition-colors ${
              typeFilter === type
                ? 'bg-purple-600 text-white'
                : 'bg-[#252542] text-gray-400 hover:bg-[#353560]'
            }`}
          >
            {type === 'all' ? 'Alle' : ORDER_TYPE_LABELS[type]}
            {type !== 'all' && (
              <span className="ml-1">({orders.filter((o) => o.orderType === type).length})</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
