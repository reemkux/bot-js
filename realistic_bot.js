// ===== REALISTIC BOT ENHANCED - Version Optimisée =====
const fs = require('fs');
const path = require('path');

// ===== CONFIGURATION =====
const CONFIG = {
    TRADING: {
        DAILY_LIMIT: 5,
        MAX_CONSECUTIVE_LOSSES: 3,
        DEFAULT_AMOUNT: 0.1,
        PRICE_UPDATE_INTERVAL: 5000,
        ANALYSIS_INTERVAL: { MIN: 120000, MAX: 300000 }
    },
    LOGGING: {
        TRADES_FILE: './logs/trades_detail.json',
        STATE_FILE: './logs/bot_state.json',
        DAILY_SUMMARY_FILE: './logs/daily_summary.json'
    },
    SESSIONS: {
        NIGHT: '00h-06h',
        MORNING: '06h-12h',
        AFTERNOON: '12h-18h',
        EVENING: '18h-00h'
    }
};

// ===== TRADE TRACKER CLASS AMÉLIORÉE =====
class TradeTracker {
    constructor() {
        this.sessionTrades = [];
        this.sessionStartTime = Date.now();
        this.dailyStats = {};
        this.ensureLogsDirectory();
        this.loadExistingTrades();
    }

    ensureLogsDirectory() {
        const logsDir = path.dirname(CONFIG.LOGGING.TRADES_FILE);
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
            console.log('📁 Dossier logs créé');
        }
    }

    loadExistingTrades() {
        try {
            if (fs.existsSync(CONFIG.LOGGING.TRADES_FILE)) {
                const data = fs.readFileSync(CONFIG.LOGGING.TRADES_FILE, 'utf8');
                this.sessionTrades = JSON.parse(data);
                console.log(`📂 Chargé ${this.sessionTrades.length} trades existants`);
                this.calculateDailyStats();
            } else {
                console.log('📂 Nouveau fichier de trades créé');
                this.sessionTrades = [];
            }
        } catch (error) {
            console.error('❌ Erreur chargement trades:', error.message);
            this.sessionTrades = [];
        }
    }

    calculateDailyStats() {
        const today = new Date().toDateString();
        const todayTrades = this.sessionTrades.filter(t => 
            new Date(t.timestamp).toDateString() === today && t.status === 'CLOSED'
        );
        
        this.dailyStats = {
            date: today,
            totalTrades: todayTrades.length,
            winningTrades: todayTrades.filter(t => t.isWin).length,
            totalPnL: todayTrades.reduce((sum, t) => sum + (t.pnl || 0), 0),
            winRate: todayTrades.length > 0 ? (todayTrades.filter(t => t.isWin).length / todayTrades.length * 100) : 0
        };
    }

    recordTrade(symbol, entryPrice, direction, amount = CONFIG.TRADING.DEFAULT_AMOUNT) {
        const trade = {
            id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            timestamp: new Date().toISOString(),
            symbol: symbol,
            entryPrice: entryPrice,
            direction: direction,
            amount: amount,
            status: 'OPEN',
            session: this.getCurrentSession(),
            openedAt: Date.now()
        };

        this.sessionTrades.push(trade);
        this.logTradeOpen(trade);
        this.saveTrades();
        return trade.id;
    }

    closeTrade(tradeId, exitPrice, pnl) {
        const trade = this.sessionTrades.find(t => t.id === tradeId);
        if (!trade) {
            console.error(`❌ Trade ${tradeId} non trouvé`);
            return null;
        }

        trade.exitPrice = exitPrice;
        trade.pnl = pnl;
        trade.isWin = pnl > 0;
        trade.status = 'CLOSED';
        trade.closedAt = new Date().toISOString();
        trade.duration = Date.now() - trade.openedAt;
        
        this.logTradeClose(trade);
        this.saveTrades();
        this.calculateDailyStats();
        this.saveDailySummary();
        this.showSessionStats();
        
        return trade;
    }

    getCurrentSession() {
        const hour = new Date().getHours();
        if (hour >= 0 && hour < 6) return CONFIG.SESSIONS.NIGHT;
        if (hour >= 6 && hour < 12) return CONFIG.SESSIONS.MORNING;
        if (hour >= 12 && hour < 18) return CONFIG.SESSIONS.AFTERNOON;
        return CONFIG.SESSIONS.EVENING;
    }

    logTradeOpen(trade) {
        const timestamp = new Date(trade.timestamp).toLocaleString('fr-FR');
        console.log('\n' + '🎯'.repeat(15));
        console.log(`🚀 TRADE OUVERT - ${trade.direction}`);
        console.log(`📅 ${timestamp}`);
        console.log(`🔢 ID: ${trade.id}`);
        console.log(`💰 ${trade.symbol} @ ${trade.entryPrice}$`);
        console.log(`📦 Quantité: ${trade.amount}`);
        console.log(`⏰ Session: ${trade.session}`);
        console.log('🎯'.repeat(15));
    }

    logTradeClose(trade) {
        const emoji = trade.isWin ? '🟢' : '🔴';
        const result = trade.isWin ? 'GAGNANT' : 'PERDANT';
        const durationSec = Math.round(trade.duration / 1000);
        const pnlFormatted = trade.pnl > 0 ? `+${trade.pnl.toFixed(4)}` : trade.pnl.toFixed(4);
        
        console.log('\n' + emoji.repeat(15));
        console.log(`${emoji} TRADE ${result}`);
        console.log(`🔢 ${trade.id}`);
        console.log(`📊 ${trade.direction} ${trade.symbol}`);
        console.log(`📈 ${trade.entryPrice}$ → ${trade.exitPrice}$`);
        console.log(`💰 PnL: ${pnlFormatted}$`);
        console.log(`⏱️ Durée: ${durationSec}s`);
        console.log(`⏰ Session: ${trade.session}`);
        console.log(emoji.repeat(15));
    }

    showSessionStats() {
        const currentSession = this.getCurrentSession();
        const sessionTrades = this.sessionTrades.filter(t => 
            t.session === currentSession && t.status === 'CLOSED'
        );
        
        if (sessionTrades.length === 0) return;

        const winningTrades = sessionTrades.filter(t => t.isWin);
        const totalPnL = sessionTrades.reduce((sum, t) => sum + t.pnl, 0);
        const winRate = (winningTrades.length / sessionTrades.length * 100);
        
        console.log('\n' + '📊'.repeat(20));
        console.log(`📈 STATS SESSION ${currentSession}`);
        console.log('📊'.repeat(20));
        console.log(`📊 Trades: ${sessionTrades.length} | Win: ${winRate.toFixed(1)}% | PnL: ${totalPnL.toFixed(4)}$`);
        console.log('📊'.repeat(20));
    }

    saveTrades() {
        try {
            fs.writeFileSync(CONFIG.LOGGING.TRADES_FILE, JSON.stringify(this.sessionTrades, null, 2));
        } catch (error) {
            console.error('❌ Erreur sauvegarde trades:', error.message);
        }
    }

    saveDailySummary() {
        try {
            const summaryData = {
                ...this.dailyStats,
                lastUpdated: new Date().toISOString(),
                currentSession: this.getCurrentSession()
            };
            
            fs.writeFileSync(CONFIG.LOGGING.DAILY_SUMMARY_FILE, JSON.stringify(summaryData, null, 2));
        } catch (error) {
            console.error('❌ Erreur sauvegarde résumé:', error.message);
        }
    }

    getDailyStats() {
        return this.dailyStats;
    }

    getOpenTrades() {
        return this.sessionTrades.filter(t => t.status === 'OPEN');
    }

    exportTradesToCSV() {
        const csvContent = this.sessionTrades.map(trade => ({
            id: trade.id,
            timestamp: trade.timestamp,
            symbol: trade.symbol,
            direction: trade.direction,
            entryPrice: trade.entryPrice,
            exitPrice: trade.exitPrice || 'N/A',
            pnl: trade.pnl || 0,
            isWin: trade.isWin || false,
            status: trade.status,
            session: trade.session,
            duration: trade.duration || 0
        }));

        const csvFile = './logs/trades_export.csv';
        const header = Object.keys(csvContent[0] || {}).join(',');
        const rows = csvContent.map(row => Object.values(row).join(','));
        const csvString = [header, ...rows].join('\n');

        fs.writeFileSync(csvFile, csvString);
        console.log(`📁 Export CSV créé: ${csvFile}`);
    }
}

// ===== BOT PRINCIPAL AMÉLIORÉ =====
class RealisticTradingBot {
    constructor() {
        this.isRunning = false;
        this.balance = 1000;
        this.positions = {};
        this.tradeCount = 0;
        this.winCount = 0;
        this.totalPnL = 0;
        this.consecutiveLosses = 0;
        
        this.tracker = new TradeTracker();
        this.state = this.loadState();
        
        // Prix simulés avec volatilité réaliste
        this.prices = {
            'BTC/USD': 45000 + Math.random() * 10000,
            'ETH/USD': 3000 + Math.random() * 1000,
            'ADA/USD': 0.5 + Math.random() * 0.3,
            'SOL/USD': 100 + Math.random() * 50,
            'DOT/USD': 8 + Math.random() * 4
        };
        
        this.startPriceUpdates();
        this.setupPeriodicReports();
    }

    loadState() {
        try {
            if (fs.existsSync(CONFIG.LOGGING.STATE_FILE)) {
                const data = JSON.parse(fs.readFileSync(CONFIG.LOGGING.STATE_FILE, 'utf8'));
                console.log('📂 État précédent chargé');
                return data;
            }
        } catch (error) {
            console.log('📂 Nouvel état créé');
        }
        return { 
            dailyTrades: 0, 
            lastTradeDate: null,
            totalSessionTrades: 0,
            startTime: Date.now()
        };
    }

    saveState() {
        try {
            this.state.lastSaved = new Date().toISOString();
            fs.writeFileSync(CONFIG.LOGGING.STATE_FILE, JSON.stringify(this.state, null, 2));
        } catch (error) {
            console.error('❌ Erreur sauvegarde état:', error.message);
        }
    }

    startPriceUpdates() {
        setInterval(() => {
            Object.keys(this.prices).forEach(symbol => {
                // Volatilité variable selon la crypto
                const volatility = symbol.includes('BTC') ? 0.01 : 
                                 symbol.includes('ETH') ? 0.015 : 0.02;
                
                const change = (Math.random() - 0.5) * volatility;
                this.prices[symbol] *= (1 + change);
                this.prices[symbol] = Math.round(this.prices[symbol] * 10000) / 10000;
            });
        }, CONFIG.TRADING.PRICE_UPDATE_INTERVAL);
    }

    setupPeriodicReports() {
        // Rapport toutes les heures
        setInterval(() => {
            const dailyStats = this.tracker.getDailyStats();
            console.log('\n⏰ RAPPORT HORAIRE');
            console.log(`📊 Trades du jour: ${dailyStats.totalTrades}`);
            console.log(`🏆 Taux de réussite: ${dailyStats.winRate.toFixed(1)}%`);
            console.log(`💰 PnL total: ${dailyStats.totalPnL.toFixed(4)}$`);
            
            // Export CSV automatique
            if (dailyStats.totalTrades > 0) {
                this.tracker.exportTradesToCSV();
            }
        }, 3600000); // 1 heure
    }

    checkSafetyLimits() {
        const today = new Date().toDateString();
        if (this.state.lastTradeDate !== today) {
            this.state.dailyTrades = 0;
            this.state.lastTradeDate = today;
        }

        const reasons = [];
        if (this.state.dailyTrades >= CONFIG.TRADING.DAILY_LIMIT) {
            reasons.push(`dailyTrades: ${this.state.dailyTrades}/${CONFIG.TRADING.DAILY_LIMIT}`);
        }
        if (this.consecutiveLosses >= CONFIG.TRADING.MAX_CONSECUTIVE_LOSSES) {
            reasons.push(`consecutiveLosses: ${this.consecutiveLosses}/${CONFIG.TRADING.MAX_CONSECUTIVE_LOSSES}`);
        }

        if (reasons.length > 0) {
            console.log(`⚠️ [SAFETY] Trading bloqué: ${reasons.join(', ')}`);
            return false;
        }
        return true;
    }

    analyzeMarket() {
        const symbols = Object.keys(this.prices);
        const selectedSymbol = symbols[Math.floor(Math.random() * symbols.length)];
        const currentPrice = this.prices[selectedSymbol];
        
        // Analyse technique améliorée
        const rsi = Math.random() * 100;
        const macd = Math.random() > 0.5 ? 'BUY' : 'SELL';
        const volume = Math.random();
        const trend = Math.random() > 0.5 ? 'UP' : 'DOWN';
        
        // Probabilité de trade basée sur plusieurs facteurs
        const shouldTrade = (rsi < 30 || rsi > 70) && volume > 0.6 && Math.random() > 0.6;
        const direction = (rsi < 30 && trend === 'UP') || (rsi > 70 && trend === 'DOWN') ? 
                         (rsi < 30 ? 'LONG' : 'SHORT') : 
                         (Math.random() > 0.5 ? 'LONG' : 'SHORT');
        
        return {
            symbol: selectedSymbol,
            price: currentPrice,
            direction: direction,
            confidence: volume,
            shouldTrade: shouldTrade,
            analysis: { rsi, macd, volume, trend }
        };
    }

    async executeTrade(analysis) {
        if (!this.checkSafetyLimits()) return;

        const { symbol, price, direction, confidence } = analysis;
        
        const tradeId = this.tracker.recordTrade(symbol, price, direction);
        
        console.log(`\n🚀 EXÉCUTION TRADE:`);
        console.log(`   ${symbol} ${direction} @ ${price}$`);
        console.log(`   Confiance: ${(confidence * 100).toFixed(1)}%`);
        
        this.tradeCount++;
        this.state.dailyTrades++;
        this.state.totalSessionTrades++;
        this.saveState();
        
        // Durée variable selon la volatilité
        const tradeDuration = 15000 + Math.random() * 45000;
        
        setTimeout(() => {
            this.closeTrade(tradeId, symbol, price, direction);
        }, tradeDuration);
    }

    closeTrade(tradeId, symbol, entryPrice, direction) {
        const currentPrice = this.prices[symbol];
        
        // Résultat plus réaliste (55% de chance de gain)
        const isWin = Math.random() > 0.45;
        const changePercent = isWin ? 
            (0.005 + Math.random() * 0.025) : // 0.5-3% gain
            -(0.005 + Math.random() * 0.02);   // 0.5-2.5% perte
        
        const exitPrice = entryPrice * (1 + changePercent);
        const pnlMultiplier = direction === 'LONG' ? 1 : -1;
        const pnl = (exitPrice - entryPrice) * CONFIG.TRADING.DEFAULT_AMOUNT * pnlMultiplier;
        
        const closedTrade = this.tracker.closeTrade(tradeId, exitPrice, pnl);
        
        if (closedTrade) {
            if (closedTrade.isWin) {
                this.winCount++;
                this.consecutiveLosses = 0;
            } else {
                this.consecutiveLosses++;
            }
            
            this.totalPnL += pnl;
        }
    }

    showStats() {
        const winRate = this.tradeCount > 0 ? (this.winCount / this.tradeCount * 100) : 0;
        const openTrades = this.tracker.getOpenTrades();
        const dailyStats = this.tracker.getDailyStats();
        
        console.log(`\n📊 BOT STATS | Trades: ${this.tradeCount} | Win: ${winRate.toFixed(1)}% | PnL: ${this.totalPnL.toFixed(2)}$ | Ouverts: ${openTrades.length}`);
        console.log(`📊 DAILY STATS | Trades: ${dailyStats.totalTrades} | Win: ${dailyStats.winRate.toFixed(1)}% | PnL: ${dailyStats.totalPnL.toFixed(2)}$`);
        
        if (!this.checkSafetyLimits()) {
            console.log(`⚠️ [SAFETY] Trading suspendu`);
        }
    }

    async start() {
        console.log('🤖 Realistic Trading Bot - Version Enhanced avec Logging complet');
        console.log(`⏰ Session: ${this.tracker.getCurrentSession()}`);
        console.log(`📊 Logs: ${CONFIG.LOGGING.TRADES_FILE}`);
        console.log('🚀 Démarrage...\n');
        
        this.isRunning = true;

        while (this.isRunning) {
            try {
                this.showStats();
                
                const analysis = this.analyzeMarket();
                
                if (analysis.shouldTrade && this.checkSafetyLimits()) {
                    await this.executeTrade(analysis);
                } else {
                    console.log('⏳ Analyse... Pas de signal de trade');
                }
                
                const waitTime = CONFIG.TRADING.ANALYSIS_INTERVAL.MIN + 
                               Math.random() * (CONFIG.TRADING.ANALYSIS_INTERVAL.MAX - CONFIG.TRADING.ANALYSIS_INTERVAL.MIN);
                
                await new Promise(resolve => setTimeout(resolve, waitTime));
                
            } catch (error) {
                console.error('❌ Erreur boucle principale:', error);
                await new Promise(resolve => setTimeout(resolve, 30000));
            }
        }
    }

    stop() {
        console.log('\n🛑 Arrêt du bot...');
        this.isRunning = false;
        
        // Rapport final
        const dailyStats = this.tracker.getDailyStats();
        console.log('\n📊 RAPPORT FINAL:');
        console.log(`📊 Trades totaux: ${dailyStats.totalTrades}`);
        console.log(`🏆 Taux de réussite: ${dailyStats.winRate.toFixed(1)}%`);
        console.log(`💰 PnL total: ${dailyStats.totalPnL.toFixed(4)}$`);
        
        // Export final
        this.tracker.exportTradesToCSV();
        this.tracker.showSessionStats();
        this.saveState();
        
        console.log('✅ Bot arrêté proprement');
    }
}

// ===== DÉMARRAGE =====
const bot = new RealisticTradingBot();

// Gestion des signaux
process.on('SIGINT', () => {
    console.log('\n🛑 Signal d\'arrêt reçu (Ctrl+C)');
    bot.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Signal de terminaison reçu');
    bot.stop();
    process.exit(0);
});

// Gestion des erreurs non capturées
process.on('uncaughtException', (error) => {
    console.error('❌ Erreur non capturée:', error);
    bot.stop();
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promesse rejetée:', reason);
    bot.stop();
    process.exit(1);
});

// Démarrage
bot.start().catch(error => {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
});

module.exports = { RealisticTradingBot, TradeTracker, CONFIG };
