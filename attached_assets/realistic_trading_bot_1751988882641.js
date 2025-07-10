// Bot de Trading Réaliste avec Gestion des Risques
// COMMENCER OBLIGATOIREMENT EN PAPER TRADING

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

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
            apiKey: config.apiKey || 'PAPER_TRADING',
            apiSecret: config.apiSecret || 'PAPER_TRADING',
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
            'TRADE': '💰'
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

    // Vérifications de sécurité avant trade
    canTrade() {
        const checks = {
            dailyLimit: this.state.dailyStats.tradesCount < this.config.maxTradesPerDay,
            consecutiveLosses: this.state.consecutiveLosses < this.config.maxConsecutiveLosses,
            cooldown: !this.state.lastLossTime || 
                     (Date.now() - this.state.lastLossTime) > this.config.cooldownAfterLoss,
            dailyRisk: this.state.dailyStats.totalRisk < this.config.maxDailyRisk,
            availablePortfolio: this.getAvailablePortfolio() !== null
        };
        
        const canTrade = Object.values(checks).every(check => check === true);
        
        if (!canTrade) {
            this.log('WARN', 'SAFETY', 'Trade bloqué par sécurités', checks);
        }
        
        return canTrade;
    }

    // Sélection du sous-portefeuille disponible
    getAvailablePortfolio() {
        const portfolios = Object.entries(this.state.subPortfolioBalances);
        
        // Prioriser les portefeuilles avec le moins de positions actives
        const available = portfolios
            .filter(([_, portfolio]) => portfolio.activePositions === 0)
            .sort((a, b) => a[1].balance - b[1].balance); // Plus petit en premier
        
        return available.length > 0 ? available[0][0] : null;
    }

    // Calcul de la taille de position optimale
    calculatePositionSize(portfolioId, price, volatility) {
        const portfolio = this.state.subPortfolioBalances[portfolioId];
        
        // Taille basée sur Kelly Criterion simplifié et volatilité
        const baseSize = portfolio.balance * this.config.maxPositionPercent;
        
        // Ajustement selon la volatilité
        const volatilityAdjustment = Math.max(0.5, Math.min(1.5, 1 / volatility));
        
        // Ajustement selon le stop-loss
        const riskAdjustment = this.config.stopLossPercent / 0.02; // Normalisé sur 2%
        
        const adjustedSize = baseSize * volatilityAdjustment * riskAdjustment;
        
        return Math.min(adjustedSize, portfolio.balance * 0.1); // Max 10% du portefeuille
    }

    // Analyse technique avancée
    analyzeMarket(symbol) {
        const data = this.state.tradingData[symbol];
        if (!data || data.length < 100) return null;
        
        const prices = data.map(d => d.close);
        const volumes = data.map(d => d.volume);
        
        return {
            // Indicateurs techniques
            rsi: this.calculateRSI(prices, 14),
            rsi_short: this.calculateRSI(prices, 7),
            sma_20: this.calculateSMA(prices, 20),
            sma_50: this.calculateSMA(prices, 50),
            ema_12: this.calculateEMA(prices, 12),
            ema_26: this.calculateEMA(prices, 26),
            
            // Volatilité et momentum
            volatility: this.calculateVolatility(prices, 20),
            atr: this.calculateATR(data, 14),
            momentum: this.calculateMomentum(prices, 10),
            
            // Volume et liquidité
            volumeAvg: this.calculateSMA(volumes, 20),
            volumeRatio: volumes[volumes.length - 1] / this.calculateSMA(volumes, 20),
            
            // Support/Résistance
            support: Math.min(...prices.slice(-20)),
            resistance: Math.max(...prices.slice(-20)),
            
            // Prix actuel
            currentPrice: prices[prices.length - 1]
        };
    }

    // Algorithme de décision de trading
    shouldTrade(analysis, symbol) {
        if (!analysis || !this.canTrade()) return null;
        
        const signals = {
            // Tendance
            bullish_trend: analysis.ema_12 > analysis.ema_26 && 
                          analysis.currentPrice > analysis.sma_20,
            
            // RSI
            rsi_oversold: analysis.rsi < 35 && analysis.rsi_short < 30,
            rsi_overbought: analysis.rsi > 65 && analysis.rsi_short > 70,
            
            // Volume
            high_volume: analysis.volumeRatio > 1.3,
            
            // Volatilité
            good_volatility: analysis.volatility > 0.01 && analysis.volatility < 0.05,
            
            // Prix près du support/résistance
            near_support: Math.abs(analysis.currentPrice - analysis.support) / 
                         analysis.currentPrice < 0.02,
            near_resistance: Math.abs(analysis.currentPrice - analysis.resistance) / 
                            analysis.currentPrice < 0.02
        };
        
        // Score de confiance
        let score = 0;
        let direction = null;
        
        // Signal d'achat
        if (signals.bullish_trend && signals.rsi_oversold && 
            signals.high_volume && signals.good_volatility) {
            score = 70;
            direction = 'BUY';
        }
        
        // Signal de vente
        if (!signals.bullish_trend && signals.rsi_overbought && 
            signals.high_volume && signals.near_resistance) {
            score = 70;
            direction = 'SELL';
        }
        
        // Filtres supplémentaires
        if (analysis.volatility > 0.08) score -= 20; // Trop volatile
        if (!signals.high_volume) score -= 15; // Volume faible
        
        return score >= 60 ? { direction, score, signals, analysis } : null;
    }

    // Exécution de trade (simulation ou réel)
    async executeTrade(signal, symbol) {
        const portfolioId = this.getAvailablePortfolio();
        if (!portfolioId) {
            this.log('WARN', 'TRADE', 'Aucun portefeuille disponible');
            return;
        }
        
        const portfolio = this.state.subPortfolioBalances[portfolioId];
        const positionSize = this.calculatePositionSize(
            portfolioId, 
            signal.analysis.currentPrice, 
            signal.analysis.volatility
        );
        
        const quantity = positionSize / signal.analysis.currentPrice;
        
        // Calcul des niveaux de sortie
        const stopLossPrice = signal.direction === 'BUY' ? 
            signal.analysis.currentPrice * (1 - this.config.stopLossPercent) :
            signal.analysis.currentPrice * (1 + this.config.stopLossPercent);
            
        const takeProfitPrice = signal.direction === 'BUY' ?
            signal.analysis.currentPrice * (1 + this.config.dailyTargetMax) :
            signal.analysis.currentPrice * (1 - this.config.dailyTargetMax);
        
        const trade = {
            id: `${Date.now()}_${symbol}`,
            timestamp: Date.now(),
            symbol,
            portfolioId,
            direction: signal.direction,
            entryPrice: signal.analysis.currentPrice,
            quantity,
            positionSize,
            stopLossPrice,
            takeProfitPrice,
            confidence: signal.score,
            signals: signal.signals,
            paperTrading: this.config.paperTrading,
            status: 'ACTIVE'
        };
        
        if (this.config.paperTrading) {
            this.log('TRADE', 'SIMULATION', `Trade simulé ${signal.direction}`, trade);
        } else {
            // ICI: Intégration avec API réelle Binance
            this.log('TRADE', 'REAL', `Trade réel ${signal.direction}`, trade);
        }
        
        // Mise à jour des états
        this.state.currentPositions.push(trade);
        portfolio.activePositions++;
        portfolio.totalTrades++;
        this.state.dailyStats.tradesCount++;
        this.state.dailyStats.totalRisk += positionSize / this.config.totalCapital;
        
        return trade;
    }

    // Gestion des positions ouvertes
    managePositions() {
        this.state.currentPositions.forEach((position, index) => {
            const currentData = this.state.tradingData[position.symbol];
            if (!currentData || currentData.length === 0) return;
            
            const currentPrice = currentData[currentData.length - 1].close;
            const unrealizedPnL = this.calculateUnrealizedPnL(position, currentPrice);
            
            // Vérification stop-loss
            if (this.shouldStopLoss(position, currentPrice)) {
                this.closePosition(position, index, currentPrice, 'STOP_LOSS');
            }
            // Vérification take-profit
            else if (this.shouldTakeProfit(position, currentPrice)) {
                this.closePosition(position, index, currentPrice, 'TAKE_PROFIT');
            }
            // Vérification trailing stop ou conditions particulières
            else if (this.shouldTrailingStop(position, currentPrice)) {
                this.closePosition(position, index, currentPrice, 'TRAILING_STOP');
            }
        });
    }

    // Calcul PnL non réalisé
    calculateUnrealizedPnL(position, currentPrice) {
        const priceChange = position.direction === 'BUY' ?
            currentPrice - position.entryPrice :
            position.entryPrice - currentPrice;
            
        return (priceChange / position.entryPrice) * position.positionSize;
    }

    // Fermeture de position
    closePosition(position, index, exitPrice, reason) {
        const realizedPnL = this.calculateUnrealizedPnL(position, exitPrice);
        const pnLPercent = (realizedPnL / position.positionSize) * 100;
        
        // Mise à jour du portefeuille
        const portfolio = this.state.subPortfolioBalances[position.portfolioId];
        portfolio.balance += realizedPnL;
        portfolio.profitLoss += realizedPnL;
        portfolio.activePositions--;
        portfolio.lastTradeTime = Date.now();
        
        // Mise à jour des stats
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
            reason,
            status: 'CLOSED'
        };
        
        this.log('TRADE', 'CLOSE', 
               `Position fermée: ${reason} | PnL: ${pnLPercent.toFixed(2)}%`, 
               closedTrade);
        
        // Supprimer de la liste active
        this.state.currentPositions.splice(index, 1);
        
        // Sauvegarde
        this.saveTrade(closedTrade);
    }

    // Conditions de stop-loss
    shouldStopLoss(position, currentPrice) {
        if (position.direction === 'BUY') {
            return currentPrice <= position.stopLossPrice;
        } else {
            return currentPrice >= position.stopLossPrice;
        }
    }

    // Conditions de take-profit
    shouldTakeProfit(position, currentPrice) {
        if (position.direction === 'BUY') {
            return currentPrice >= position.takeProfitPrice;
        } else {
            return currentPrice <= position.takeProfitPrice;
        }
    }

    // Trailing stop (optionnel)
    shouldTrailingStop(position, currentPrice) {
        // Implémentation simple du trailing stop
        const timeInPosition = Date.now() - position.timestamp;
        const hourInMs = 3600000;
        
        // Si position ouverte depuis plus de 4h sans profit significatif
        if (timeInPosition > 4 * hourInMs) {
            const unrealizedPnL = this.calculateUnrealizedPnL(position, currentPrice);
            const pnLPercent = (unrealizedPnL / position.positionSize);
            
            // Fermer si < 0.1% de profit après 4h
            return pnLPercent < 0.001;
        }
        
        return false;
    }

    // Sauvegarde des trades
    saveTrade(trade) {
        const tradeRecord = {
            ...trade,
            dailyStats: { ...this.state.dailyStats },
            portfolioState: { ...this.state.subPortfolioBalances }
        };
        
        fs.appendFileSync(this.logFiles.trades, JSON.stringify(tradeRecord) + '\n');
    }

    // Sauvegarde quotidienne des stats
    saveDailyStats() {
        const today = new Date().toISOString().split('T')[0];
        if (this.state.dailyStats.date !== today) {
            // Nouvelle journée
            fs.appendFileSync(this.logFiles.daily, 
                            JSON.stringify(this.state.dailyStats) + '\n');
            this.state.dailyStats = this.initDailyStats();
        }
    }

    // Méthodes de calcul technique (RSI, SMA, etc.)
    calculateRSI(prices, period = 14) {
        if (prices.length < period + 1) return null;
        
        let gains = 0, losses = 0;
        
        for (let i = 1; i <= period; i++) {
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
    
    calculateSMA(prices, period) {
        if (prices.length < period) return null;
        const slice = prices.slice(-period);
        return slice.reduce((sum, price) => sum + price, 0) / period;
    }
    
    calculateEMA(prices, period) {
        if (prices.length < period) return null;
        
        const k = 2 / (period + 1);
        let ema = prices[0];
        
        for (let i = 1; i < prices.length; i++) {
            ema = prices[i] * k + ema * (1 - k);
        }
        
        return ema;
    }
    
    calculateVolatility(prices, period = 20) {
        if (prices.length < period) return null;
        
        const slice = prices.slice(-period);
        const mean = slice.reduce((sum, p) => sum + p, 0) / period;
        const variance = slice.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / period;
        
        return Math.sqrt(variance) / mean; // Volatilité relative
    }
    
    calculateATR(data, period = 14) {
        if (data.length < period) return null;
        
        const trs = [];
        for (let i = 1; i < data.length; i++) {
            const high = data[i].high;
            const low = data[i].low;
            const prevClose = data[i-1].close;
            
            const tr = Math.max(
                high - low,
                Math.abs(high - prevClose),
                Math.abs(low - prevClose)
            );
            trs.push(tr);
        }
        
        return trs.slice(-period).reduce((sum, tr) => sum + tr, 0) / period;
    }
    
    calculateMomentum(prices, period = 10) {
        if (prices.length < period) return null;
        return (prices[prices.length - 1] - prices[prices.length - period]) / 
               prices[prices.length - period];
    }

    // Génération de rapport de performance
    generatePerformanceReport() {
        const totalBalance = Object.values(this.state.subPortfolioBalances)
            .reduce((sum, portfolio) => sum + portfolio.balance, 0);
            
        const totalPnL = totalBalance - this.config.totalCapital;
        const totalPnLPercent = (totalPnL / this.config.totalCapital) * 100;
        
        const report = {
            timestamp: new Date().toISOString(),
            paperTrading: this.config.paperTrading,
            summary: {
                initialCapital: this.config.totalCapital,
                currentBalance: totalBalance,
                totalPnL,
                totalPnLPercent: totalPnLPercent.toFixed(2) + '%',
                dailyStats: this.state.dailyStats
            },
            portfolios: this.state.subPortfolioBalances,
            activePositions: this.state.currentPositions.length,
            riskMetrics: {
                maxDrawdown: 'À calculer', // Implementation needed
                sharpeRatio: 'À calculer', // Implementation needed
                consecutiveLosses: this.state.consecutiveLosses
            }
        };
        
        console.log('📊 RAPPORT DE PERFORMANCE:');
        console.table(report.summary);
        
        fs.writeFileSync(this.logFiles.performance, JSON.stringify(report, null, 2));
        
        return report;
    }

    // Démarrage du bot
    start() {
        if (this.state.isRunning) {
            this.log('WARN', 'SYSTEM', 'Bot déjà en cours d\'exécution');
            return;
        }
        
        this.log('INFO', 'SYSTEM', 'Démarrage du bot de trading réaliste');
        this.log('INFO', 'CONFIG', 'Mode:', this.config.paperTrading ? 'PAPER TRADING' : 'TRADING RÉEL');
        
        this.state.isRunning = true;
        
        // Symboles à trader (exemple conservateur)
        const symbols = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT', 'DOTUSDT'];
        
        // Connexion WebSockets
        symbols.forEach(symbol => {
            this.connectWebSocket(symbol);
        });
        
        // Tâches périodiques
        setInterval(() => {
            if (this.state.isRunning) {
                this.managePositions();
                this.saveDailyStats();
            }
        }, 30000); // Toutes les 30 secondes
        
        // Rapport quotidien
        setInterval(() => {
            if (this.state.isRunning) {
                this.generatePerformanceReport();
            }
        }, 3600000); // Toutes les heures
        
        this.log('SUCCESS', 'SYSTEM', 'Bot démarré avec succès');
    }

    // Connexion WebSocket (méthode simplifiée)
    connectWebSocket(symbol) {
        const wsUrl = `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_1m`;
        const ws = new WebSocket(wsUrl);
        
        ws.on('open', () => {
            this.log('INFO', 'WEBSOCKET', `Connecté à ${symbol}`);
        });
        
        ws.on('message', (data) => {
            try {
                const parsed = JSON.parse(data);
                this.processMarketData(symbol, parsed);
            } catch (error) {
                this.log('ERROR', 'WEBSOCKET', 'Erreur parsing', { error: error.message });
            }
        });
        
        ws.on('error', (error) => {
            this.log('ERROR', 'WEBSOCKET', `Erreur ${symbol}`, { error: error.message });
            setTimeout(() => this.connectWebSocket(symbol), 5000);
        });
    }

    // Traitement des données de marché
    processMarketData(symbol, data) {
        if (!data.k || !data.k.x) return; // Seulement les chandeliers fermés
        
        const kline = data.k;
        const candleData = {
            timestamp: kline.t,
            open: parseFloat(kline.o),
            high: parseFloat(kline.h),
            low: parseFloat(kline.l),
            close: parseFloat(kline.c),
            volume: parseFloat(kline.v)
        };
        
        // Stockage des données
        if (!this.state.tradingData[symbol]) {
            this.state.tradingData[symbol] = [];
        }
        
        this.state.tradingData[symbol].push(candleData);
        
        // Garder 500 chandeliers max
        if (this.state.tradingData[symbol].length > 500) {
            this.state.tradingData[symbol].shift();
        }
        
        // Analyse et décision de trading
        const analysis = this.analyzeMarket(symbol);
        if (analysis) {
            const signal = this.shouldTrade(analysis, symbol);
            if (signal) {
                this.executeTrade(signal, symbol);
            }
        }
    }

    // Arrêt propre du bot
    stop() {
        this.log('INFO', 'SYSTEM', 'Arrêt du bot...');
        this.state.isRunning = false;
        
        // Fermer toutes les positions
        this.state.currentPositions.forEach((position, index) => {
            const currentData = this.state.tradingData[position.symbol];
            if (currentData && currentData.length > 0) {
                const currentPrice = currentData[currentData.length - 1].close;
                this.closePosition(position, index, currentPrice, 'BOT_STOPPED');
            }
        });
        
        // Rapport final
        this.generatePerformanceReport();
        this.log('SUCCESS', 'SYSTEM', 'Bot arrêté proprement');
    }
}

// Configuration recommandée pour débuter
const defaultConfig = {
    // OBLIGATOIRE: Commencer en paper trading
    paperTrading: true,
    
    // Objectifs réalistes
    dailyTargetMin: 0.003, // 0.3%
    dailyTargetMax: 0.005, // 0.5%
    
    // Gestion des risques
    stopLossPercent: 0.015, // 1.5%
    maxPositionPercent: 0.05, // 5% par trade
    maxDailyRisk: 0.02, // 2% risque quotidien max
    
    // Capital (simulation)
    totalCapital: 10000,
    subPortfolios: 4,
    
    // Limites de sécurité
    maxTradesPerDay: 3,
    maxConsecutiveLosses: 3,
    cooldownAfterLoss: 3600000 // 1h
};

// Export et utilisation
if (require.main === module) {
    const bot = new RealisticTradingBot(defaultConfig);
    
    // Gestion propre de l'arrêt
    process.on('SIGINT', () => {
        console.log('\n🛑 Signal d\'arrêt reçu...');
        bot.stop();
        setTimeout(() => process.exit(0), 2000);
    });
    
    // Démarrage
    bot.start();
    
    // Rapport initial
    setTimeout(() => {
        bot.generatePerformanceReport();
    }, 10000);
}

module.exports = RealisticTradingBot;