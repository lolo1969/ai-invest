# 🤖 AI Invest - Investment Advisor

An AI-powered Investment Advisor for Trade Republic as a Progressive Web App (PWA).

![React](https://img.shields.io/badge/React-19-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)
![Vite](https://img.shields.io/badge/Vite-7.3-purple)
![Tailwind](https://img.shields.io/badge/Tailwind-4.1-cyan)

## ✨ Features

- 📊 **Portfolio Management** - Manage stocks, ETFs and ETCs with ISIN support
- 🤖 **AI Analysis** - Claude AI analyzes your portfolio and gives recommendations
- 💰 **Cash Tracking** - Manage available capital
- 📈 **Live Prices** - Automatic price updates via Yahoo Finance (in EUR)
- ✏️ **Manual Prices** - Manually edit prices for hard-to-find securities
- 🆕 **New Buy Recommendations** - AI suggests 3-5 specific stocks to buy
- 📱 **Telegram Notifications** - Push notifications for important signals
- ✉️ **Email Notifications** - Via EmailJS integration
- 📲 **PWA** - Installable on smartphone and desktop

## 🚀 Quick Start

```bash
# Clone repository
git clone https://github.com/lolo1969/ai-invest.git
cd ai-invest

# Install dependencies
npm install

# Start development server
npm run dev
```

Open http://localhost:5173

## ⚙️ Configuration

### Setting up API Keys

1. **Claude API Key** (for AI analysis)
   - Create account: https://console.anthropic.com
   - Generate API key: https://console.anthropic.com/settings/keys

2. **Telegram Bot** (optional, for notifications)
   - Contact BotFather: https://t.me/BotFather
   - Enter `/newbot` and follow instructions
   - Copy Bot Token
   - Get Chat-ID via @userinfobot

3. **EmailJS** (optional, for email notifications)
   - Create account: https://www.emailjs.com
   - Connect email service (Gmail, Outlook, etc.)
   - Create template with variables: `to_email`, `subject`, `stock_name`, `stock_symbol`, `signal_type`, `price`, `change`, `confidence`, `risk_level`, `reasoning`, `target_price`, `stop_loss`, `date`

## 📁 Project Structure

```
src/
├── components/
│   ├── Dashboard.tsx      # Main overview & quick analysis
│   ├── Portfolio.tsx      # Portfolio management & AI analysis
│   ├── Settings.tsx       # Settings & API keys
│   ├── Notifications.tsx  # Notification overview
│   ├── Signals.tsx        # Investment signals
│   ├── Watchlist.tsx      # Stock watchlist
│   └── Sidebar.tsx        # Navigation
├── services/
│   ├── aiService.ts       # Claude AI integration
│   ├── marketData.ts      # Yahoo Finance API
│   └── notifications.ts   # Telegram & EmailJS
├── store/
│   └── useAppStore.ts     # Zustand state management
├── types/
│   └── index.ts           # TypeScript types
├── App.tsx
└── main.tsx
```

## 🛠️ Tech Stack

- **Frontend:** React 19 + TypeScript
- **Build Tool:** Vite 7.3
- **Styling:** Tailwind CSS 4.1
- **State Management:** Zustand (with localStorage persistence)
- **AI:** Claude API (claude-sonnet-4-20250514)
- **Price Data:** Yahoo Finance via CORS Proxy
- **Notifications:** Telegram Bot API + EmailJS
- **PWA:** vite-plugin-pwa

## 📊 Supported Securities

The app supports all securities tradable on Trade Republic:
- 🇺🇸 US Stocks (automatic USD → EUR conversion)
- 🇩🇪 German Stocks
- 🇪🇺 EU Stocks
- 📈 ETFs (e.g. MSCI World, EM IMI)
- 🥇 ETCs (e.g. Gold, Silver)

## 🔐 Security

- API keys are only stored in local browser storage
- No data is sent to external servers (except to the APIs)
- Claude API runs directly in the browser

## 📝 License

MIT License

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first.

---

Made with ❤️ and 🤖 Claude AI
