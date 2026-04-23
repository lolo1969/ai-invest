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
💰 Current Price: ${signal.stock.price.toFixed(2)} ${signal.stock.currency}
📊 Change: ${signal.stock.changePercent >= 0 ? '+' : ''}${signal.stock.changePercent.toFixed(2)}%

🎯 Confidence: ${signal.confidence}%
⚠️ Risk: ${signal.riskLevel}

📝 *Reasoning:*
${signal.reasoning}

${signal.targetPrice ? `🎯 Target Price: ${signal.targetPrice.toFixed(2)} ${signal.stock.currency}` : ''}
${signal.stopLoss ? `🛑 Stop-Loss: ${signal.stopLoss.toFixed(2)} ${signal.stock.currency}` : ''}

_Vestia - ${new Date().toLocaleString('en-US')}_
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

  // Send simple Telegram message (for price alerts)
  async sendTelegramMessage(
    botToken: string,
    chatId: string,
    message: string
  ): Promise<boolean> {
    if (!botToken || !chatId) {
      console.warn('Telegram credentials not configured');
      return false;
    }

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
      console.error('Telegram message failed:', error);
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
        target_price: signal.targetPrice ? `${signal.targetPrice.toFixed(2)} ${signal.stock.currency}` : 'Not set',
        stop_loss: signal.stopLoss ? `${signal.stopLoss.toFixed(2)} ${signal.stock.currency}` : 'Not set',
        date: new Date().toLocaleString('en-US'),
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
        subject: '✅ Vestia Email Connection Successful!',
        stock_name: 'Test',
        stock_symbol: 'TEST',
        signal_type: 'INFO',
        price: '0.00 EUR',
        change: '0.00%',
        confidence: '100%',
        risk_level: 'Low',
        reasoning: 'This is a test message. Your email notifications are now set up!',
        target_price: '-',
        stop_loss: '-',
        date: new Date().toLocaleString('en-US'),
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
            text: '✅ Vestia connection successful!\n\nYou will now receive investment signals.',
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
