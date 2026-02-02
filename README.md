# 🤖 AI Invest - Investment Advisor

Ein KI-gestützter Investment Advisor für Trade Republic als Progressive Web App (PWA).

![React](https://img.shields.io/badge/React-19-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)
![Vite](https://img.shields.io/badge/Vite-7.3-purple)
![Tailwind](https://img.shields.io/badge/Tailwind-4.1-cyan)

## ✨ Features

- 📊 **Portfolio-Management** - Aktien, ETFs und ETCs verwalten mit ISIN-Support
- 🤖 **KI-Analyse** - Claude AI analysiert dein Portfolio und gibt Empfehlungen
- 💰 **Cash-Tracking** - Verfügbares Kapital verwalten
- 📈 **Live-Kurse** - Automatische Kursaktualisierung via Yahoo Finance (in EUR)
- ✏️ **Manuelle Kurse** - Kurse manuell bearbeiten für schwer zu findende Wertpapiere
- 🆕 **Neue Kaufempfehlungen** - KI schlägt 3-5 konkrete Aktien zum Kauf vor
- 📱 **Telegram-Benachrichtigungen** - Push-Notifications für wichtige Signale
- ✉️ **E-Mail-Benachrichtigungen** - Via EmailJS Integration
- 📲 **PWA** - Installierbar auf Smartphone und Desktop

## 🚀 Schnellstart

```bash
# Repository klonen
git clone https://github.com/DEIN_USERNAME/ai-invest.git
cd ai-invest

# Dependencies installieren
npm install

# Entwicklungsserver starten
npm run dev
```

Öffne http://localhost:5173

## ⚙️ Konfiguration

### API Keys einrichten

1. **Claude API Key** (für KI-Analyse)
   - Account erstellen: https://console.anthropic.com
   - API Key generieren: https://console.anthropic.com/settings/keys

2. **Telegram Bot** (optional, für Benachrichtigungen)
   - BotFather kontaktieren: https://t.me/BotFather
   - `/newbot` eingeben und Anweisungen folgen
   - Bot Token kopieren
   - Chat-ID via @userinfobot holen

3. **EmailJS** (optional, für E-Mail-Benachrichtigungen)
   - Account erstellen: https://www.emailjs.com
   - E-Mail-Service verbinden (Gmail, Outlook, etc.)
   - Template erstellen mit Variablen: `to_email`, `subject`, `stock_name`, `stock_symbol`, `signal_type`, `price`, `change`, `confidence`, `risk_level`, `reasoning`, `target_price`, `stop_loss`, `date`

## 📁 Projektstruktur

```
src/
├── components/
│   ├── Dashboard.tsx      # Hauptübersicht & Schnellanalyse
│   ├── Portfolio.tsx      # Portfolio-Management & KI-Analyse
│   ├── Settings.tsx       # Einstellungen & API Keys
│   ├── Notifications.tsx  # Benachrichtigungs-Übersicht
│   ├── Signals.tsx        # Investment-Signale
│   ├── Watchlist.tsx      # Aktien-Watchlist
│   └── Sidebar.tsx        # Navigation
├── services/
│   ├── aiService.ts       # Claude AI Integration
│   ├── marketData.ts      # Yahoo Finance API
│   └── notifications.ts   # Telegram & EmailJS
├── store/
│   └── useAppStore.ts     # Zustand State Management
├── types/
│   └── index.ts           # TypeScript Types
├── App.tsx
└── main.tsx
```

## 🛠️ Tech Stack

- **Frontend:** React 19 + TypeScript
- **Build Tool:** Vite 7.3
- **Styling:** Tailwind CSS 4.1
- **State Management:** Zustand (mit localStorage Persistenz)
- **KI:** Claude API (claude-sonnet-4-20250514)
- **Kursdaten:** Yahoo Finance via CORS Proxy
- **Notifications:** Telegram Bot API + EmailJS
- **PWA:** vite-plugin-pwa

## 📊 Unterstützte Wertpapiere

Die App unterstützt alle bei Trade Republic handelbaren Wertpapiere:
- 🇺🇸 US-Aktien (automatische USD → EUR Umrechnung)
- 🇩🇪 Deutsche Aktien
- 🇪🇺 EU-Aktien
- 📈 ETFs (z.B. MSCI World, EM IMI)
- 🥇 ETCs (z.B. Gold, Silber)

## 🔐 Sicherheit

- API Keys werden nur im lokalen Browser-Storage gespeichert
- Keine Daten werden an externe Server gesendet (außer an die APIs)
- Claude API läuft direkt im Browser

## 📝 Lizenz

MIT License

## 🤝 Beitragen

Pull Requests sind willkommen! Für größere Änderungen bitte erst ein Issue eröffnen.

---

Made with ❤️ and 🤖 Claude AI
