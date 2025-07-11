const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class RelayTradingBot {
    constructor(config) {
        this.config = {
            // MODE OBLIGATOIRE pour débuter
            paperTrading: config.paperTrading !== false, // true par défaut

            // SYSTÈME DE RELAIS
            timeSlot: parseInt(process.env.TIME_SLOT) || config.timeSlot || 0, // 0, 6, 12, 18
            maxRuntime: config.maxRuntime || (5 * 60 + 57) * 60 * 1000, // 5h57min en ms
            relayBuffer: config.relayBuffer || 3 * 60 * 1000, // 3min de battement

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

        this.startTime = Date.now();
        this.stateFile = path.join(__dirname, 'state.json');
        
        this.state = {
            isRunning: false,
            currentPositions: [],
            dailyStats: this.initDailyStats(),
            consecutiveLosses: 0,
            lastLossTime: null,
            tradingData: {},
            subPortfolioBalances: this.initSubPortfolios(),
            relayInfo: {
                currentSlot: this.config.timeSlot,
                sessionStart: this.startTime,
                totalSessions: 0,
                lastHandoff: null
            }
        };

        this.setupLogging();
        this.validateTimeSlot();
        this.loadPreviousState();
    }

    // Validation du créneau horaire
    validateTimeSlot() {
        const validSlots = [0, 6, 12, 18];
        if (!validSlots.includes(this.config.timeSlot)) {
            throw new Error(`❌ TIME_SLOT invalide: ${this.config.timeSlot}. Doit être: 0, 6, 12, ou 18`);
        }

        const now = new Date();
        const currentHour = now.getUTCHours();
        const expectedHour = this.config.timeSlot;
        
        // Vérifier si on est dans la bonne fenêtre (avec tolérance de 10min)
        const hourDiff = Math.abs(currentHour - expectedHour);
        if (hourDiff > 0 && hourDiff < 6) {
            console.log(`⚠️  Attention: Heure actuelle ${currentHour}h, slot attendu ${expectedHour}h`);
        }

        console.log(`🕐 Slot horaire: ${this.config.timeSlot}h-${(this.config.timeSlot + 6) % 24}h`);
        console.log(`⏰ Durée max: ${Math.floor(this.config.maxRuntime / 1000 / 60)}min`);
    }

    // Chargement de l'état précédent
    loadPreviousState() {
        if (fs.existsSync(this.stateFile)) {
            try {
                const savedState = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
                
                // Vérifier si l'état est récent (< 24h)
                const stateAge = Date.now() - savedState.relayInfo.lastHandoff;
                if (stateAge < 24 * 60 * 60 * 1000) {
                    // Restaurer l'état mais pas les timeouts
                    this.state = {
                        ...this.state,
                        currentPositions: savedState.currentPositions || [],
                        dailyStats: savedState.dailyStats || this.state.dailyStats,
                        consecutiveLosses: savedState.consecutiveLosses || 0,
                        lastLossTime: savedState.lastLossTime,
                        tradingData: savedState.tradingData || {},
                        subPortfolioBalances: savedState.subPortfolioBalances || this.state.subPortfolioBalances,
                        relayInfo: {
                            ...savedState.relayInfo,
                            currentSlot: this.config.timeSlot,
                            sessionStart: this.startTime,
                            totalSessions: (savedState.relayInfo.totalSessions || 0) + 1
                        }
                    };

                    this.log('SUCCESS', 'RELAY', 'État précédent chargé avec succès', {
                        positions: this.state.currentPositions.length,
                        trades: this.state.dailyStats.tradesCount,
                        session: this.state.relayInfo.totalSessions
                    });
                } else {
                    this.log('WARN', 'RELAY', 'État précédent trop ancien, reset');
                    this.resetDailyStats();
                }
            } catch (error) {
                this.log('ERROR', 'RELAY', 'Erreur chargement état', { error: error.message });
            }
        } else {
            this.log('INFO', 'RELAY', 'Première session, aucun état précédent');
        }
    }

    // Sauvegarde de l'état pour le prochain bot
    async saveState() {
        const stateToSave = {
            ...this.state,
            relayInfo: {
                ...this.state.relayInfo,
                lastHandoff: Date.now(),
                nextSlot: (this.config.timeSlot + 6) % 24
            }
        };

        try {
            fs.writeFileSync(this.stateFile, JSON.stringify(stateToSave, null, 2));
            this.log('SUCCESS', 'RELAY', 'État sauvegardé localement');

            // Commit vers GitHub
            await this.commitStateToGitHub();
            
        } catch (error) {
            this.log('ERROR', 'RELAY', 'Erreur sauvegarde état', { error: error.message });
            throw error;
        }
    }

    // Commit automatique vers GitHub
    async commitStateToGitHub() {
        try {
            const commitMessage = `🤖 Bot relay handoff - Slot ${this.config.timeSlot}h → ${(this.config.timeSlot + 6) % 24}h`;
            
            await execAsync('git add state.json');
            await execAsync(`git commit -m "${commitMessage}"`);
            await execAsync('git push origin main');
            
            this.log('SUCCESS', 'RELAY', 'État committé vers GitHub');
        } catch (error) {
            this.log('ERROR', 'RELAY', 'Erreur commit GitHub', { error: error.message });
            // Ne pas faire échouer le processus pour un problème de commit
        }
    }

    // Vérification du temps de fonctionnement
    getRuntimeInfo() {
        const runtime = Date.now() - this.startTime;
        const remaining = this.config.maxRuntime - runtime;
        const runtimeMin = Math.floor(runtime / 1000 / 60);
        const remainingMin = Math.floor(remaining / 1000 / 60);

        return {
            runtime,
            remaining,
            runtimeMin,
            remainingMin,
            shouldStop: remaining <= 0
        };
    }

    // Arrêt gracieux avec handoff
    async gracefulShutdown() {
        this.log('WARN', 'RELAY', 'Début de l\'arrêt gracieux');
        
        // Arrêter les nouveaux trades
        this.state.isRunning = false;

        // Fermer les positions ouvertes (simulation)
        for (const position of this.state.currentPositions) {
            this.closeSimulatedPosition(position);
        }

        // Attendre que les positions se ferment
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Sauvegarder l'état final
        await this.saveState();

        // Logs finaux
        this.log('SUCCESS', 'RELAY', 'Handoff terminé', {
            totalTrades: this.state.dailyStats.tradesCount,
            pnl: this.state.dailyStats.profitLoss.toFixed(2),
            nextSlot: `${(this.config.timeSlot + 6) % 24}h`,
            runtime: this.getRuntimeInfo().runtimeMin + 'min'
        });

        console.log('\n🔄 HANDOFF VERS LE PROCHAIN BOT');
        console.log('═══════════════════════════════');
        console.log(`📊 Session ${this.config.timeSlot}h terminée`);
        console.log(`💰 PnL total: ${this.state.dailyStats.profitLoss.toFixed(2)}$`);
        console.log(`📈 Trades: ${this.state.dailyStats.tradesCount}`);
        console.log(`🔄 Prochain slot: ${(this.config.timeSlot + 6) % 24}h`);
        console.log('⏳ Attente de 3 minutes...\n');

        process.exit(0);
    }

    // Reset stats quotidiennes si nouveau jour
    resetDailyStats() {
        const today = new Date().toISOString().split('T')[0];
        if (this.state.dailyStats.date !== today) {
            this.state.dailyStats = this.initDailyStats();
            this.log('INFO', 'SYSTEM', 'Stats quotidiennes réinitialisées');
        }
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
            performance: path.join(logsDir, 'performance.json'),
            relay: path.join(logsDir, 'relay.log')
        };
    }

    // Système de logs avancé
    log(level, category, message, data = {}) {
        const timestamp = new Date().toISOString();
        const runtimeInfo = this.getRuntimeInfo();
        
        const logEntry = {
            timestamp,
            level,
            category,
            message,
            slot: this.config.timeSlot,
            runtime: runtimeInfo.runtimeMin + 'min',
            remaining: runtimeInfo.remainingMin + 'min',
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
            'DEBUG': '🔍',
            'RELAY': '🔄'
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

        if (category === 'RELAY') {
            fs.appendFileSync(this.logFiles.relay, JSON.stringify(logEntry) + '\n');
        }
    }

    // Génération de données simulées (gardé identique)
    generateSimulatedMarketData(symbol) {
        const basePrice = symbol === 'BTCUSDT' ? 43000 : symbol === 'ETHUSDT' ? 2600 : 0.4;
        const data = [];

        for (let i = 0; i < 100; i++) {
            const timestamp = Date.now() - (99 - i) * 60000;
            const trend = Math.sin(i * 0.1) * 0.5;
            const volatility = 0.005 + Math.random() * 0.025;
            const randomChange = (Math.random() - 0.5) * 2;
            const change = basePrice * volatility * (trend + randomChange * 0.3);
            const price = basePrice + change;
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

    // Analyse technique (gardé identique)
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

    // Calculs techniques (gardés identiques)
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

    calculateSMA(prices, period) {
        if (prices.length < period) return prices[prices.length - 1];
        const slice = prices.slice(-period);
        return slice.reduce((sum, price) => sum + price, 0) / period;
    }

    calculateVolatility(prices, period = 20) {
        if (prices.length < period) return 0.02;
        const slice = prices.slice(-period);
        const mean = slice.reduce((sum, p) => sum + p, 0) / period;
        const variance = slice.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / period;
        return Math.sqrt(variance) / mean;
    }

    // Décision de trading
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

        this.log('DEBUG', 'SIGNALS', `Analyse ${symbol}`, {
            rsi: analysis.rsi.toFixed(2),
            volumeRatio: analysis.volumeRatio.toFixed(2),
            volatility: (analysis.volatility * 100).toFixed(2) + '%',
            signals,
            score,
            threshold: 40
        });

        return score >= 40 ? { direction: 'BUY', score, signals } : null;
    }

    // Exécution de trade (gardé identique)
    async executeSimulatedTrade(signal, symbol) {
        const analysis = this.analyzeMarket(symbol);
        const trade = {
            id: `${Date.now()}_${symbol}`,
            timestamp: Date.now(),
            symbol,
            direction: signal.direction,
            entryPrice: analysis.currentPrice,
            quantity: 0.01,
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

        setTimeout(() => {
            this.closeSimulatedPosition(trade);
        }, 10000 + Math.random() * 20000);

        return trade;
    }

    // Fermeture de position (gardé identique)
    closeSimulatedPosition(position) {
        const index = this.state.currentPositions.findIndex(p => p.id === position.id);
        if (index === -1) return;

        const priceMovement = (Math.random() - 0.5) * 0.02;
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

        this.state.currentPositions.splice(index, 1);
        this.saveTrade(closedTrade);
    }

    saveTrade(trade) {
        const tradeRecord = { ...trade, dailyStats: { ...this.state.dailyStats } };
        fs.appendFileSync(this.logFiles.trades, JSON.stringify(tradeRecord) + '\n');
    }

    // Boucle principale MODIFIÉE avec gestion du temps
    async startTrading() {
        this.state.isRunning = true;
        this.resetDailyStats();
        
        this.log('SUCCESS', 'SYSTEM', 'Bot de trading démarré', {
            slot: `${this.config.timeSlot}h-${(this.config.timeSlot + 6) % 24}h`,
            session: this.state.relayInfo.totalSessions
        });

        console.log(`\n🤖 RELAY TRADING BOT - SLOT ${this.config.timeSlot}H`);
        console.log('═══════════════════════════════════════════════════');
        console.log(`🕐 Créneau: ${this.config.timeSlot}h → ${(this.config.timeSlot + 6) % 24}h`);
        console.log(`⏱️  Durée max: ${Math.floor(this.config.maxRuntime / 1000 / 60)}min`);
        console.log(`🔗 Session #${this.state.relayInfo.totalSessions}`);
        console.log(`📊 Trades repris: ${this.state.dailyStats.tradesCount}`);
        console.log(`💰 PnL actuel: ${this.state.dailyStats.profitLoss.toFixed(2)}$`);
        console.log('⚠️  MODE SIMULATION - Aucun argent réel\n');

        while (this.state.isRunning) {
            try {
                // VÉRIFICATION CRITIQUE DU TEMPS
                const runtimeInfo = this.getRuntimeInfo();
                if (runtimeInfo.shouldStop) {
                    await this.gracefulShutdown();
                    break;
                }

                // Avertissement à 5h45
                if (runtimeInfo.remainingMin <= 12 && runtimeInfo.remainingMin > 10) {
                    this.log('WARN', 'RELAY', `⏰ Arrêt dans ${runtimeInfo.remainingMin}min`);
                }

                // Trading normal
                if (this.canTrade()) {
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

                this.displayStats();
                await new Promise(resolve => setTimeout(resolve, 30000));

            } catch (error) {
                this.log('ERROR', 'SYSTEM', 'Erreur dans la boucle de trading', { error: error.message });
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }

    canTrade() {
        const checks = {
            dailyLimit: this.state.dailyStats.tradesCount < this.config.maxTradesPerDay,
            consecutiveLosses: this.state.consecutiveLosses < this.config.maxConsecutiveLosses,
            cooldown: !this.state.lastLossTime || 
                     (Date.now() - this.state.lastLossTime) > this.config.cooldownAfterLoss
        };
        return Object.values(checks).every(check => check === true);
    }

    displayStats() {
        const stats = this.state.dailyStats;
        const runtime = this.getRuntimeInfo();
        console.log(`📊 [${runtime.runtimeMin}/${Math.floor(this.config.maxRuntime/1000/60)}min] ${stats.tradesCount} trades | Win: ${(stats.winRate * 100).toFixed(1)}% | PnL: ${stats.profitLoss.toFixed(2)}$ | Positions: ${this.state.currentPositions.length}`);
    }

    stop() {
        this.state.isRunning = false;
        this.log('INFO', 'SYSTEM', 'Bot arrêté manuellement');
    }
}

// Configuration par défaut
const defaultConfig = {
    paperTrading: true,
    timeSlot: parseInt(process.env.TIME_SLOT) || 0,
    dailyTargetMin: 0.003,
    dailyTargetMax: 0.005,
    stopLossPercent: 0.015,
    totalCapital: 10000,
    maxPositionPercent: 0.05,
    symbols: ['BTCUSDT', 'ETHUSDT', 'ADAUSDT']
};

// Démarrage du bot
const bot = new RelayTradingBot(defaultConfig);

// Gestion des signaux d'arrêt
process.on('SIGINT', async () => {
    console.log('\n⚠️  Signal d\'arrêt reçu...');
    await bot.gracefulShutdown();
});

process.on('SIGTERM', async () => {
    console.log('\n⚠️  Signal de terminaison reçu...');
    await bot.gracefulShutdown();
});

// Démarrage
bot.startTrading().catch(async (error) => {
    console.error('❌ Erreur fatale:', error);
    await bot.saveState(); // Sauvegarder même en cas d'erreur
    process.exit(1);
});
