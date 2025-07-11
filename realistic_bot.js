const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

class RealisticTradingBot {
    constructor(config) {
        this.config = {
            // MODE OBLIGATOIRE pour débuter
            paperTrading: config.paperTrading !== false, // true par défaut

            // OBJECTIFS RÉALISTES
            dailyTargetMin: config.dailyTargetMin || 0.003, // 0.3%
            dailyTargetMax: config.dailyTargetMax || 0.005, // 0.5%

            // GESTION DES RISQUES
            stopLossPercent: config.stopLossPercent || 0.015, // 1.5%
            maxStopLossPercent: config.maxStopLossPercent || 0.02, // 2% max

            // GESTION DU CAPITAL
            totalCapital: config.totalCapital || 10000, // Capital total
            maxPositionPercent: config.maxPositionPercent || 0.05, // 5% max par trade
            maxDailyRisk: config.maxDailyRisk || 0.02, // 2% du capital/jour max
            subPortfolios: config.subPortfolios || 4, // Diviser en 4 sous-portefeuilles

            // LIMITES DE SÉCURITÉ
            maxTradesPerDay: config.maxTradesPerDay || 3,
            maxConsecutiveLosses: config.maxConsecutiveLosses || 3,
            cooldownAfterLoss: config.cooldownAfterLoss || 3600000, // 1h en ms

            // CONFIGURATION
            symbols: config.symbols || ['BTCUSDT', 'ETHUSDT', 'ADAUSDT'],
            ...config
        };

        this.state = {
            isRunning: false,
            currentPositions: [],
            dailyStats: this.initDailyStats(),
            consecutiveLosses: 0,
            lastLossTime: null,
            tradingData: {},
            subPortfolioBalances: this.initSubPortfolios()
        };

        this.setupLogging();
        this.validateConfig();
    }

    // Validation de configuration
    validateConfig() {
        if (!this.config.paperTrading) {
            console.log('⚠️  ATTENTION: Mode trading réel détecté');
            console.log('🛑 FORTEMENT recommandé de commencer en paper trading');
        }

        if (this.config.dailyTargetMax > 0.01) { // > 1%
            console.log('⚠️  Objectif quotidien élevé, risque accru');
        }

        console.log('📋 Configuration validée:', {
            paperTrading: this.config.paperTrading,
            dailyTarget: `${(this.config.dailyTargetMin*100).toFixed(1)}-${(this.config.dailyTargetMax*100).toFixed(1)}%`,
            stopLoss: `${(this.config.stopLossPercent*100).toFixed(1)}%`,
            maxPositionSize: `${(this.config.maxPositionPercent*100).toFixed(1)}%`,
            subPortfolios: this.config.subPortfolios
        });
    }

    // Initialisation des sous-portefeuilles
    initSubPortfolios() {
        const balancePerPortfolio = this.config.totalCapital / this.config.subPortfolios;
        const portfolios = {};

        for (let i = 1; i <= this.config.subPortfolios; i++) {
            portfolios[`portfolio_${i}`] = {
                balance: balancePerPortfolio,
                initialBalance: balancePerPortfolio,
                activePositions: 0,
                totalTrades: 0,
                profitLoss: 0,
                lastTradeTime: null
            };
        }

        return portfolios;
    }

    // Initialisation stats journalières
    initDailyStats() {
        return {
            date: new Date().toISOString().split('T')[0],
            tradesCount: 0,
            profitLoss: 0,
            fees: 0,
            winRate: 0,
            wins: 0,
            losses: 0,
            totalRisk: 0
        };
    }

    // Configuration du système de logs
    setupLogging() {
        const logsDir = path.join(__dirname, 'logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }

        this.logFiles = {
            trades: path.join(logsDir, 'trades.json'),
            daily: path.join(logsDir, 'daily_stats.json'),
            errors: path.join(logsDir, 'errors.log'),
            performance: path.join(logsDir, 'performance.json')
        };
    }

    // Système de logs avancé
    log(level, category, message, data = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            category,
            message,
            paperTrading: this.config.paperTrading,
            ...data
        };

        // Console
        const emoji = {
            'INFO': 'ℹ️',
            'WARN': '⚠️',
            'ERROR': '❌',
            'SUCCESS': '✅',
            'TRADE': '💰',
            'DEBUG': '🔍'
        };

        console.log(`${emoji[level] || '📝'} [${category}] ${message}`, 
                   Object.keys(data).length > 0 ? data : '');

        // Fichier selon le type
        if (level === 'ERROR') {
            fs.appendFileSync(this.logFiles.errors, JSON.stringify(logEntry) + '\n');
        }

        if (category === 'TRADE') {
            fs.appendFileSync(this.logFiles.trades, JSON.stringify(logEntry) + '\n');
        }
    }

    // Génération de données simulées
    generateSimulatedMarketData(symbol) {
        const basePrice = symbol === 'BTCUSDT' ? 43000 : symbol === 'ETHUSDT' ? 2600 : 0.4;
        const data = [];

        for (let i = 0; i < 100; i++) {
            const timestamp = Date.now() - (99 - i) * 60000; // 1 minute intervals

            // Simuler des conditions de marché variées
            const trend = Math.sin(i * 0.1) * 0.5; // Tendance oscillante
            const volatility = 0.005 + Math.random() * 0.025; // Volatilité plus réaliste
            const randomChange = (Math.random() - 0.5) * 2;

            const change = basePrice * volatility * (trend + randomChange * 0.3);
            const price = basePrice + change;

            // Volume avec pics occasionnels
            const volumeSpike = Math.random() > 0.9 ? 3 : 1;
            const volume = (800 + Math.random() * 2000) * volumeSpike;

            data.push({
                timestamp,
                close: price,
                volume: volume,
                high: price + Math.abs(change) * 0.5,
                low: price - Math.abs(change) * 0.5
            });
        }

        return data;
    }

    // Analyse technique simplifiée
    analyzeMarket(symbol) {
        if (!this.state.tradingData[symbol]) {
            this.state.tradingData[symbol] = this.generateSimulatedMarketData(symbol);
        }

        const data = this.state.tradingData[symbol];
        const prices = data.map(d => d.close);
        const volumes = data.map(d => d.volume);

        const rsi = this.calculateRSI(prices, 14);
        const sma_20 = this.calculateSMA(prices, 20);
        const currentPrice = prices[prices.length - 1];

        return {
            rsi,
            sma_20,
            currentPrice,
            volatility: this.calculateVolatility(prices, 20),
            volumeRatio: volumes[volumes.length - 1] / this.calculateSMA(volumes, 20)
        };
    }

    // Calcul RSI
    calculateRSI(prices, period = 14) {
        if (prices.length < period + 1) return 50;

        let gains = 0, losses = 0;

        for (let i = prices.length - period; i < prices.length; i++) {
            const change = prices[i] - prices[i - 1];
            if (change > 0) gains += change;
            else losses += Math.abs(change);
        }

        const avgGain = gains / period;
        const avgLoss = losses / period;

        if (avgLoss === 0) return 100;

        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    }

    // Calcul SMA
    calculateSMA(prices, period) {
        if (prices.length < period) return prices[prices.length - 1];
        const slice = prices.slice(-period);
        return slice.reduce((sum, price) => sum + price, 0) / period;
    }

    // Calcul volatilité
    calculateVolatility(prices, period = 20) {
        if (prices.length < period) return 0.02;

        const slice = prices.slice(-period);
        const mean = slice.reduce((sum, p) => sum + p, 0) / period;
        const variance = slice.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / period;

        return Math.sqrt(variance) / mean;
    }

    // Décision de trading (MODIFIÉ avec debug et seuil abaissé)
    shouldTrade(analysis, symbol) {
        const signals = {
            rsi_oversold: analysis.rsi < 35,
            rsi_overbought: analysis.rsi > 65,
            high_volume: analysis.volumeRatio > 1.3,
            good_volatility: analysis.volatility > 0.01 && analysis.volatility < 0.05
        };

        let score = 0;
        if (signals.rsi_oversold) score += 30;
        if (signals.high_volume) score += 20;
        if (signals.good_volatility) score += 20;

        // AJOUT DU DEBUG LOGGING
        this.log('DEBUG', 'SIGNALS', `Analyse ${symbol}`, {
            rsi: analysis.rsi.toFixed(2),
            volumeRatio: analysis.volumeRatio.toFixed(2),
            volatility: (analysis.volatility * 100).toFixed(2) + '%',
            signals,
            score,
            threshold: 40
        });

        // SEUIL ABAISSÉ DE 60 À 40
        return score >= 40 ? { direction: 'BUY', score, signals } : null;
    }

    // Exécution de trade simulé
    async executeSimulatedTrade(signal, symbol) {
        const analysis = this.analyzeMarket(symbol);

        const trade = {
            id: `${Date.now()}_${symbol}`,
            timestamp: Date.now(),
            symbol,
            direction: signal.direction,
            entryPrice: analysis.currentPrice,
            quantity: 0.01, // Quantité fixe pour simulation
            positionSize: analysis.currentPrice * 0.01,
            stopLossPrice: analysis.currentPrice * (1 - this.config.stopLossPercent),
            takeProfitPrice: analysis.currentPrice * (1 + this.config.dailyTargetMax),
            confidence: signal.score,
            paperTrading: true,
            status: 'ACTIVE'
        };

        this.state.currentPositions.push(trade);
        this.state.dailyStats.tradesCount++;

        this.log('TRADE', 'SIMULATION', `Trade simulé ${signal.direction} sur ${symbol}`, {
            price: analysis.currentPrice,
            confidence: signal.score,
            signals: signal.signals
        });

        // Simuler fermeture après quelques secondes
        setTimeout(() => {
            this.closeSimulatedPosition(trade);
        }, 10000 + Math.random() * 20000); // 10-30 secondes

        return trade;
    }

    // Fermeture de position simulée
    closeSimulatedPosition(position) {
        const index = this.state.currentPositions.findIndex(p => p.id === position.id);
        if (index === -1) return;

        // Simuler mouvement de prix
        const priceMovement = (Math.random() - 0.5) * 0.02; // +/- 1%
        const exitPrice = position.entryPrice * (1 + priceMovement);

        const realizedPnL = (exitPrice - position.entryPrice) * position.quantity;
        const pnLPercent = ((exitPrice - position.entryPrice) / position.entryPrice) * 100;

        this.state.dailyStats.profitLoss += realizedPnL;

        if (realizedPnL > 0) {
            this.state.dailyStats.wins++;
            this.state.consecutiveLosses = 0;
        } else {
            this.state.dailyStats.losses++;
            this.state.consecutiveLosses++;
            this.state.lastLossTime = Date.now();
        }

        this.state.dailyStats.winRate = 
            this.state.dailyStats.wins / 
            (this.state.dailyStats.wins + this.state.dailyStats.losses);

        const closedTrade = {
            ...position,
            exitPrice,
            exitTime: Date.now(),
            realizedPnL,
            pnLPercent: pnLPercent.toFixed(3),
            reason: realizedPnL > 0 ? 'TAKE_PROFIT' : 'STOP_LOSS',
            status: 'CLOSED'
        };

        this.log('TRADE', 'CLOSE', 
               `Position fermée: ${closedTrade.reason} | PnL: ${pnLPercent.toFixed(2)}%`, 
               closedTrade);

        // Supprimer de la liste active
        this.state.currentPositions.splice(index, 1);

        // Sauvegarde
        this.saveTrade(closedTrade);
    }

    // Sauvegarde des trades
    saveTrade(trade) {
        const tradeRecord = {
            ...trade,
            dailyStats: { ...this.state.dailyStats }
        };

        fs.appendFileSync(this.logFiles.trades, JSON.stringify(tradeRecord) + '\n');
    }

    // Boucle principale de trading
    async startTrading() {
        this.state.isRunning = true;
        this.log('SUCCESS', 'SYSTEM', 'Bot de trading démarré en mode paper trading');

        console.log('\n🤖 REALISTIC TRADING BOT - PAPER TRADING (DEBUG MODE)');
        console.log('═══════════════════════════════════════════════════════');
        console.log('📊 Objectif quotidien: 0.3-0.5%');
        console.log('🛡️  Stop-loss: 1.5%');
        console.log('💰 Capital: $' + this.config.totalCapital.toLocaleString());
        console.log('📈 Symboles: ' + this.config.symbols.join(', '));
        console.log('🔍 Seuil de trade abaissé à 40 (au lieu de 60)');
        console.log('⚠️  MODE SIMULATION - Aucun argent réel\n');

        while (this.state.isRunning) {
            try {
                // Vérifier si on peut trader
                if (this.canTrade()) {
                    // Analyser chaque symbole
                    for (const symbol of this.config.symbols) {
                        const analysis = this.analyzeMarket(symbol);
                        const signal = this.shouldTrade(analysis, symbol);

                        if (signal) {
                            await this.executeSimulatedTrade(signal, symbol);
                        }
                    }
                } else {
                    this.log('WARN', 'SAFETY', 'Trading bloqué par les limites de sécurité', {
                        dailyTrades: this.state.dailyStats.tradesCount,
                        maxDaily: this.config.maxTradesPerDay,
                        consecutiveLosses: this.state.consecutiveLosses,
                        maxLosses: this.config.maxConsecutiveLosses
                    });
                }

                // Afficher stats toutes les minutes
                this.displayStats();

                // Attendre 30 secondes
                await new Promise(resolve => setTimeout(resolve, 30000));

            } catch (error) {
                this.log('ERROR', 'SYSTEM', 'Erreur dans la boucle de trading', { error: error.message });
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }

    // Vérifications de sécurité avant trade
    canTrade() {
        const checks = {
            dailyLimit: this.state.dailyStats.tradesCount < this.config.maxTradesPerDay,
            consecutiveLosses: this.state.consecutiveLosses < this.config.maxConsecutiveLosses,
            cooldown: !this.state.lastLossTime || 
                     (Date.now() - this.state.lastLossTime) > this.config.cooldownAfterLoss
        };

        return Object.values(checks).every(check => check === true);
    }

    // Affichage des statistiques
    displayStats() {
        const stats = this.state.dailyStats;
        console.log(`📊 Stats: ${stats.tradesCount} trades | Win: ${(stats.winRate * 100).toFixed(1)}% | PnL: ${stats.profitLoss.toFixed(2)}$ | Positions: ${this.state.currentPositions.length}`);
    }

    // Arrêt du bot
    stop() {
        this.state.isRunning = false;
        this.log('INFO', 'SYSTEM', 'Bot arrêté');
        console.log('\n🛑 Bot arrêté');
    }
}

// Configuration par défaut pour paper trading
const defaultConfig = {
    paperTrading: true,
    dailyTargetMin: 0.003,
    dailyTargetMax: 0.005,
    stopLossPercent: 0.015,
    totalCapital: 10000,
    maxPositionPercent: 0.05,
    symbols: ['BTCUSDT', 'ETHUSDT', 'ADAUSDT']
};

// Démarrage du bot
const bot = new RealisticTradingBot(defaultConfig);

// Gestion des signaux d'arrêt
process.on('SIGINT', () => {
    console.log('\n⚠️  Signal d\'arrêt reçu...');
    bot.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n⚠️  Signal de terminaison reçu...');
    bot.stop();
    process.exit(0);
});

// Démarrage
bot.startTrading().catch(error => {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
});
