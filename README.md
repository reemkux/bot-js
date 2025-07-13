# 🤖 Enhanced Trading Bot

Bot de trading de cryptomonnaies avec système de logging avancé et tracking des performances.

## 🚀 Fonctionnalités

### ✨ **Nouvelles fonctionnalités v2.0**
- **Système de logging complet** - Enregistrement détaillé de tous les trades
- **Statistiques en temps réel** - Suivi des performances par session
- **Export automatique** - Génération de rapports CSV
- **Limites de sécurité** - Protection contre les pertes excessives
- **Analyse technique** - Indicateurs RSI, MACD, volume
- **Sessions multiples** - Tracking par tranches horaires

### 🔧 **Fonctionnalités techniques**
- Trading simulé sur 5 cryptomonnaies
- Gestion des positions longues/courtes
- Système de stop-loss automatique
- Persistance des données
- Rapports quotidiens automatiques

## 📁 Structure du projet

```
bot-js/
├── realistic-bots/
│   ├── realistic-bot.js     # Bot principal amélioré
│   ├── legacy-bot.js        # Version précédente
│   └── test-bot.js          # Tests unitaires
├── logs/
│   ├── trades_detail.json   # Détails des trades
│   ├── bot_state.json       # État du bot
│   ├── daily_summary.json   # Résumé quotidien
│   └── trades_export.csv    # Export pour analyse
├── scripts/
│   ├── analyze-logs.js      # Analyse des logs
│   ├── export-data.js       # Export des données
│   └── clean-logs.js        # Nettoyage des logs
├── .github/workflows/       # Actions GitHub
├── package.json
├── .gitignore
└── README.md
```

## 🛠️ Installation

### Prérequis
- Node.js >= 14.0.0
- npm ou yarn

### Installation
```bash
# Cloner le repository
git clone https://github.com/reemkux/bot-js.git
cd bot-js

# Installer les dépendances
npm install

# Démarrer le bot
npm start
```

### Scripts disponibles
```bash
npm start      # Démarrer le bot
npm run dev    # Mode développement (auto-restart)
npm test       # Lancer les tests
npm run logs   # Analyser les logs
npm run export # Exporter les données
npm run clean  # Nettoyer les logs
```

## 📊 Logging et Monitoring

### Fichiers de logs générés
- **`logs/trades_detail.json`** - Historique complet des trades
- **`logs/bot_state.json`** - État actuel du bot
- **`logs/daily_summary.json`** - Résumé des performances quotidiennes
- **`logs/trades_export.csv`** - Export formaté pour Excel/Google Sheets

### Exemple de structure de trade
```json
{
  "id": "trade_1703123456789_abc123",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "symbol": "BTC/USD",
  "direction": "LONG",
  "entryPrice": 45000,
  "exitPrice": 45500,
  "pnl": 0.1111,
  "isWin": true,
  "status": "CLOSED",
  "session": "12h-18h",
  "duration": 30000
}
```

## 🔒 Sécurité

### Limites de protection
- **Limite quotidienne** : 5 trades maximum par jour
- **Pertes consécutives** : Arrêt après 3 pertes consécutives
- **Stop-loss automatique** : Protection des capitaux
- **Gestion des erreurs** : Arrêt propre en cas de problème

### Configuration des limites
```javascript
const CONFIG = {
    TRADING: {
        DAILY_LIMIT: 5,
        MAX_CONSECUTIVE_LOSSES: 3,
        DEFAULT_AMOUNT: 0.1
    }
};
```

## 📈 Performances

### Métriques suivies
- **Taux de réussite** (Win Rate)
- **PnL total** et par session
- **Durée moyenne des trades**
- **Performance par cryptomonnaie**
- **Statistiques par session horaire**

### Exemple de sortie
```
📊 BOT STATS | Trades: 25 | Win: 60.0% | PnL: +12.45$ | Ouverts: 2
📊 DAILY STATS | Trades: 8 | Win: 62.5% | PnL: +4.23$
```

## 🔄 Sessions de trading

Le bot divise la journée en 4 sessions :
- **00h-06h** : Session nuit
- **06h-12h** : Session matin
- **12h-18h** : Session après-midi
- **18h-00h** : Session soir

## 🛡️ Gestion des erreurs

- **Arrêt propre** avec Ctrl+C
- **Sauvegarde automatique** de l'état
- **Récupération après crash**
- **Logs d'erreur détaillés**

## 🧪 Tests

```bash
# Lancer les tests
npm test

# Test en mode développement
npm run dev
```

## 📝 Changelog

### v2.0.0 (Actuel)
- ✅ Système de logging complet
- ✅ Export CSV automatique
- ✅ Statistiques par session
- ✅ Configuration centralisée
- ✅ Gestion d'erreurs améliorée

### v1.0.0
- ✅ Bot de trading de base
- ✅ Simulation de prix
- ✅ Positions longues/courtes

## 📧 Support

Pour toute question ou problème :
- Ouvrir une issue sur GitHub
- Vérifier la documentation
- Consulter les logs pour le debugging

## 📄 License

MIT License - voir le fichier LICENSE pour plus de détails.

---

**⚠️ Avertissement** : Ce bot est à des fins éducatives uniquement. Le trading réel implique des risques financiers importants.
