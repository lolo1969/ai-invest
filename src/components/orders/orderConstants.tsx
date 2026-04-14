import { ArrowDownCircle, ArrowUpCircle, ShieldAlert, Zap } from 'lucide-react';
import type { OrderType, OrderStatus } from '../../types';

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  'limit-buy': 'Limit Buy',
  'limit-sell': 'Limit Sell',
  'stop-loss': 'Stop Loss',
  'stop-buy': 'Stop Buy',
};

export const ORDER_TYPE_DESCRIPTIONS: Record<OrderType, string> = {
  'limit-buy': 'Kaufen wenn Preis auf oder unter Zielpreis fällt',
  'limit-sell': 'Verkaufen wenn Preis auf oder über Zielpreis steigt',
  'stop-loss': 'Verlustbegrenzung – verkaufen wenn Preis fällt',
  'stop-buy': 'Breakout – kaufen wenn Preis steigt',
};

export const ORDER_TYPE_ICONS: Record<OrderType, React.ReactNode> = {
  'limit-buy': <ArrowDownCircle size={16} className="text-green-400" />,
  'limit-sell': <ArrowUpCircle size={16} className="text-blue-400" />,
  'stop-loss': <ShieldAlert size={16} className="text-red-400" />,
  'stop-buy': <Zap size={16} className="text-yellow-400" />,
};

export const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: 'text-yellow-400 bg-yellow-400/10',
  active: 'text-blue-400 bg-blue-400/10',
  executed: 'text-green-400 bg-green-400/10',
  cancelled: 'text-gray-400 bg-gray-400/10',
  expired: 'text-orange-400 bg-orange-400/10',
};

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Warte auf Bestätigung',
  active: 'Aktiv',
  executed: 'Ausgeführt',
  cancelled: 'Storniert',
  expired: 'Abgelaufen',
};
