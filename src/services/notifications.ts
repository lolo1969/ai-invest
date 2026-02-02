import type { InvestmentSignal } from '../types';
import emailjs from '@emailjs/browser';

export class NotificationService {
  // Send Telegram notification
  async sendTelegram(
    botToken: string,
    chatId: string,
    signal: InvestmentSignal
  ): Promise<boolean> {
    if (!botToken || !chatId) {
      console.warn('Telegram credentials not configured');
      return false;
    }

    const emoji = signal.signal === 'BUY' ? '🟢' : signal.signal === 'SELL' ? '🔴' : '🟡';
    const message = `
${emoji} *${signal.signal} Signal*

*${signal.stock.name}* (${signal.stock.symbol})
💰 Aktueller Preis: ${signal.stock.price.toFixed(2)} ${signal.stock.currency}
📊 Änderung: ${signal.stock.changePercent >= 0 ? '+' : ''}${signal.stock.changePercent.toFixed(2)}%

🎯 Konfidenz: ${signal.confidence}%
⚠️ Risiko: ${signal.riskLevel}

📝 *Begründung:*
${signal.reasoning}

${signal.targetPrice ? `🎯 Zielpreis: ${signal.targetPrice.toFixed(2)} ${signal.stock.currency}` : ''}
${signal.stopLoss ? `🛑 Stop-Loss: ${signal.stopLoss.toFixed(2)} ${signal.stock.currency}` : ''}

_AI Invest - ${new Date().toLocaleString('de-DE')}_
    `.trim();

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown',
          }),
        }
      );

      const data = await response.json();
      return data.ok === true;
    } catch (error) {
      console.error('Telegram notification failed:', error);
      return false;
    }
  }

  // Send email notification using EmailJS
  async sendEmail(
    to: string,
    signal: InvestmentSignal,
    serviceId: string,
    templateId: string,
    publicKey: string
  ): Promise<boolean> {
    if (!to || !serviceId || !templateId || !publicKey) {
      console.warn('EmailJS credentials not configured');
      return false;
    }

    const emoji = signal.signal === 'BUY' ? '🟢' : signal.signal === 'SELL' ? '🔴' : '🟡';
    
    try {
      const templateParams = {
        to_email: to,
        subject: `${emoji} ${signal.signal} Signal - ${signal.stock.name}`,
        stock_name: signal.stock.name,
        stock_symbol: signal.stock.symbol,
        signal_type: signal.signal,
        price: `${signal.stock.price.toFixed(2)} ${signal.stock.currency}`,
        change: `${signal.stock.changePercent >= 0 ? '+' : ''}${signal.stock.changePercent.toFixed(2)}%`,
        confidence: `${signal.confidence}%`,
        risk_level: signal.riskLevel,
        reasoning: signal.reasoning,
        target_price: signal.targetPrice ? `${signal.targetPrice.toFixed(2)} ${signal.stock.currency}` : 'Nicht gesetzt',
        stop_loss: signal.stopLoss ? `${signal.stopLoss.toFixed(2)} ${signal.stock.currency}` : 'Nicht gesetzt',
        date: new Date().toLocaleString('de-DE'),
      };

      const response = await emailjs.send(serviceId, templateId, templateParams, publicKey);
      console.log('Email sent successfully:', response);
      return response.status === 200;
    } catch (error) {
      console.error('EmailJS notification failed:', error);
      return false;
    }
  }

  // Send notification via configured channels
  async notify(
    signal: InvestmentSignal,
    config: {
      telegram?: { botToken: string; chatId: string };
      email?: { address: string; serviceId: string; templateId: string; publicKey: string };
    }
  ): Promise<{ telegram: boolean; email: boolean }> {
    const results = { telegram: false, email: false };

    if (config.telegram?.botToken && config.telegram?.chatId) {
      results.telegram = await this.sendTelegram(
        config.telegram.botToken,
        config.telegram.chatId,
        signal
      );
    }

    if (config.email?.address && config.email?.serviceId && config.email?.templateId && config.email?.publicKey) {
      results.email = await this.sendEmail(
        config.email.address,
        signal,
        config.email.serviceId,
        config.email.templateId,
        config.email.publicKey
      );
    }

    return results;
  }

  // Test EmailJS connection
  async testEmail(
    to: string,
    serviceId: string,
    templateId: string,
    publicKey: string
  ): Promise<boolean> {
    try {
      const templateParams = {
        to_email: to,
        subject: '✅ AI Invest E-Mail Verbindung erfolgreich!',
        stock_name: 'Test',
        stock_symbol: 'TEST',
        signal_type: 'INFO',
        price: '0.00 EUR',
        change: '0.00%',
        confidence: '100%',
        risk_level: 'Niedrig',
        reasoning: 'Dies ist eine Testnachricht. Deine E-Mail-Benachrichtigungen sind jetzt eingerichtet!',
        target_price: '-',
        stop_loss: '-',
        date: new Date().toLocaleString('de-DE'),
      };

      const response = await emailjs.send(serviceId, templateId, templateParams, publicKey);
      return response.status === 200;
    } catch (error) {
      console.error('EmailJS test failed:', error);
      return false;
    }
  }

  // Test Telegram connection
  async testTelegram(botToken: string, chatId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: '✅ AI Invest Verbindung erfolgreich!\n\nDu wirst ab jetzt Investment-Signale erhalten.',
            parse_mode: 'Markdown',
          }),
        }
      );

      const data = await response.json();
      return data.ok === true;
    } catch (error) {
      console.error('Telegram test failed:', error);
      return false;
    }
  }
}

export const notificationService = new NotificationService();
