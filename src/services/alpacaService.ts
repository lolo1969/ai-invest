/**
 * Alpaca Paper Trading Service
 *
 * Submits orders to the Alpaca Paper Trading REST API after they are
 * executed in the internal state. The internal state remains the master –
 * Alpaca is a "fire and forget" execution channel.
 *
 * API reference: https://docs.alpaca.markets/reference/postorder
 */

import type { Order } from '../types';

const PAPER_BASE_URL = 'https://paper-api.alpaca.markets';

export interface AlpacaAccount {
  id: string;
  account_number: string;
  status: string;
  buying_power: string;
  cash: string;
  portfolio_value: string;
  currency: string;
  paper: boolean;
}

export interface AlpacaOrderResult {
  id: string;
  client_order_id: string;
  symbol: string;
  side: string;
  type: string;
  qty: string;
  limit_price?: string;
  stop_price?: string;
  status: string;
  created_at: string;
}

// Maps internal order types to Alpaca side + type
function mapOrderType(
  orderType: Order['orderType']
): { side: 'buy' | 'sell'; type: 'limit' | 'stop' | 'stop_limit' } {
  switch (orderType) {
    case 'limit-buy':
      return { side: 'buy', type: 'limit' };
    case 'stop-buy':
      return { side: 'buy', type: 'stop' };
    case 'limit-sell':
      return { side: 'sell', type: 'limit' };
    case 'stop-loss':
      return { side: 'sell', type: 'stop' };
  }
}

export class AlpacaService {
  private keyId: string;
  private keySecret: string;
  private baseUrl: string;

  constructor(keyId: string, keySecret: string, paper = true) {
    this.keyId = keyId;
    this.keySecret = keySecret;
    this.baseUrl = paper ? PAPER_BASE_URL : 'https://api.alpaca.markets';
  }

  private authHeaders(): Record<string, string> {
    return {
      'APCA-API-KEY-ID': this.keyId,
      'APCA-API-SECRET-KEY': this.keySecret,
      'Content-Type': 'application/json',
    };
  }

  private async fetchWithRetry<T>(
    fn: () => Promise<Response>,
    retries = 2,
    delayMs = 1500
  ): Promise<T> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      let response: Response;
      try {
        response = await fn();
      } catch (err: any) {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, attempt)));
          continue;
        }
        throw new Error(`Alpaca network error: ${err?.message ?? 'unknown'}`);
      }

      if (response.status === 429 || response.status === 503) {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, attempt)));
          continue;
        }
      }

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Alpaca API error (HTTP ${response.status}): ${body.slice(0, 300)}`);
      }

      return response.json() as Promise<T>;
    }
    throw new Error('Alpaca: max retries exceeded');
  }

  /** Verify credentials and return account details. */
  async getAccount(): Promise<AlpacaAccount> {
    return this.fetchWithRetry<AlpacaAccount>(() =>
      fetch(`${this.baseUrl}/v2/account`, {
        method: 'GET',
        headers: this.authHeaders(),
      })
    );
  }

  /**
   * Submit an order to Alpaca.
   * Uses the price at which the order was internally executed as the
   * limit / stop price so Alpaca mirrors the same trigger.
   */
  async submitOrder(order: Order, executedPrice: number): Promise<AlpacaOrderResult> {
    const { side, type } = mapOrderType(order.orderType);
    const price = executedPrice > 0 ? executedPrice : order.triggerPrice;

    const body: Record<string, unknown> = {
      symbol: order.symbol,
      qty: String(order.quantity),
      side,
      type,
      time_in_force: 'gtc',
      client_order_id: order.id,
    };

    if (type === 'limit') {
      body.limit_price = price.toFixed(2);
    } else if (type === 'stop' || type === 'stop_limit') {
      body.stop_price = price.toFixed(2);
      if (type === 'stop_limit') {
        body.limit_price = price.toFixed(2);
      }
    }

    return this.fetchWithRetry<AlpacaOrderResult>(() =>
      fetch(`${this.baseUrl}/v2/orders`, {
        method: 'POST',
        headers: this.authHeaders(),
        body: JSON.stringify(body),
      })
    );
  }
}

/** Singleton factory – creates a new instance from current store settings. */
export function createAlpacaService(
  keyId: string,
  keySecret: string,
  paper = true
): AlpacaService | null {
  if (!keyId.trim() || !keySecret.trim()) return null;
  return new AlpacaService(keyId, keySecret, paper);
}
