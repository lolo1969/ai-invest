import { ShoppingCart, Plus, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { calcAvailableCash } from './shared/reservedCashHelper';
import { useOrderForm } from './orders/useOrderForm';
import { useOrderStats } from './orders/useOrderStats';
import { OrdersStatsBar } from './orders/OrdersStatsBar';
import { AutoExecuteSettings } from './orders/AutoExecuteSettings';
import { OrderForm } from './orders/OrderForm';
import { OrderInfoBox } from './orders/OrderInfoBox';
import { OrdersFilterBar } from './orders/OrdersFilterBar';
import { OrderCard } from './orders/OrderCard';

export function Orders() {
  const {
    orders,
    orderSettings,
    updateOrderSettings,
    removeOrder,
    cancelOrder,
    cashBalance,
  } = useAppStore();

  const {
    formData,
    setFormData,
    showForm,
    setShowForm,
    searchingSymbol,
    symbolSuggestions,
    manualExecuteId,
    setManualExecuteId,
    handleSymbolSearch,
    selectSymbol,
    handleSubmit,
    handleManualExecute,
  } = useOrderForm();

  const {
    filteredOrders,
    stats,
    quickSelectOptions,
    maxSellQuantity,
    isSellOrder,
    statusFilter,
    setStatusFilter,
    typeFilter,
    setTypeFilter,
  } = useOrderStats(formData.symbol, formData.orderType);

  const { reservedCash, availableCash } = calcAvailableCash(cashBalance, orders, orderSettings);
  const activeOrders = orders.filter((o) => o.status === 'active');

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 md:mb-8 pt-12 lg:pt-0">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
            <ShoppingCart className="text-purple-400" size={24} />
            Orders
          </h2>
          <p className="text-gray-400 mt-1 text-sm">Limit & Stop Orders verwalten</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-3 md:px-4 py-2 bg-purple-600 hover:bg-purple-700
                   text-white rounded-lg transition-colors text-sm md:text-base"
        >
          {showForm ? <X size={16} /> : <Plus size={16} />}
          {showForm ? 'Abbrechen' : 'Neue Order'}
        </button>
      </div>

      <OrdersStatsBar
        orderSettings={orderSettings}
        stats={stats}
        cashBalance={cashBalance}
        reservedCash={reservedCash}
        availableCash={availableCash}
        onToggleAutoExecute={() => updateOrderSettings({ autoExecute: !orderSettings.autoExecute })}
      />

      {orderSettings.autoExecute && (
        <AutoExecuteSettings
          orderSettings={orderSettings}
          activeOrders={activeOrders}
          onUpdate={updateOrderSettings}
        />
      )}

      {showForm && (
        <OrderForm
          formData={formData}
          setFormData={setFormData}
          onSubmit={handleSubmit}
          onCancel={() => setShowForm(false)}
          searchingSymbol={searchingSymbol}
          symbolSuggestions={symbolSuggestions}
          onSymbolSearch={handleSymbolSearch}
          onSelectSymbol={selectSymbol}
          quickSelectOptions={quickSelectOptions}
          maxSellQuantity={maxSellQuantity}
          isSellOrder={isSellOrder}
        />
      )}

      <OrderInfoBox />

      <OrdersFilterBar
        statusFilter={statusFilter}
        typeFilter={typeFilter}
        onStatusChange={setStatusFilter}
        onTypeChange={setTypeFilter}
        orders={orders}
      />

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <ShoppingCart size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-lg">Keine Orders vorhanden</p>
          <p className="text-sm mt-1">Erstelle deine erste Order mit dem Button oben</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              manualExecuteId={manualExecuteId}
              onManualExecute={handleManualExecute}
              onCancelOrder={cancelOrder}
              onRemoveOrder={removeOrder}
              onSetManualExecuteId={setManualExecuteId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
