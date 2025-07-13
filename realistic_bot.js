// ===== REALISTIC BOT ENHANCED - Version avec Trade Tracking =====
const fs = require('fs');
const path = require('path');

// ===== TRADE TRACKER CLASS =====
class TradeTracker {
    constructor() {
        this.sessionTrades = [];
        this.sessionStartTime = Date.now();
        this.logFile = './logs/trades_detail.json';
        this.loadExistingTrades();
    }

    loadExistingTrades() {
        try {
            if (fs.existsSync(this.logFile)) {
                const data = fs.readFileSync(this.logFile, 'utf8');
                this.sessionTrades = JSON.parse(data);
                console.log(`📂 Chargé ${this.sessionTrades.length} trades existants`);
            }
        } catch (error) {
            console.log('📂 Nouveau fichier de trades créé');
            this.sessionTrades = [];
        }
    }

    recordTrade(symbol, entryPrice, direction, amount = 1) {
        const trade = {
            id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            timestamp: new Date().toISOString(),
            symbol: symbol,
            entryPrice: entryPrice,
            direction: direction, // 'LONG' ou 'SHORT'
            amount: amount,
            status: 'OPEN',
            session: this.getCurrentSession()
        };

        this.sessionTrades.push(trade);
        this.logTradeOpen(trade);
        this.saveTrades();
        return trade.id;
    }

    closeTrade(tradeId, exitPrice, pnl) {
        const trade = this.sessionTrades.find(t => t.id === tradeId);
        if (trade) {
            trade.exitPrice = exitPrice;
            trade.pnl = pnl;
            trade.isWin = pnl > 0;
            trade.status = 'CLOSED';
            trade.closedAt = new Date().toISOString();
            trade.duration = Date.now() - new Date(trade.timestamp).getTime();
            
            this.logTradeClose(trade);
            this.saveTrades();
            this.showSessionStats();
            return trade;
        }
        return null;
    }

    getCurrentSession() {
        const hour = new Date().getHours();
        if (hour >= 0 && hour < 6) return '00h-06h';
        if (hour >= 6 && hour < 12) return '06h-12h';
        if (hour >= 12 && hour < 18) return '12h-18h';
        return '18h-00h';
    }

    logTradeOpen(trade) {
        console.log('\n' + '🎯'.repeat(15));
        console.log(`🚀 TRADE OUVERT - ${trade.direction}`);
        console.log(`📅 Timestamp: ${new Date(trade.timestamp).toLocaleString()}`);
        console.log(`🔢 ID: ${trade.id}`);
        console.log(`💰 Symbole: ${trade.symbol}`);
        console.log(`💵 Prix entrée: ${trade.entryPrice}$`);
        console.log(`📦 Quantité: ${trade.amount}`);
        console.log(`⏰ Session: ${trade.session}`);
        console.log('🎯'.repeat(15));
    }

    logTradeClose(trade) {
        const emoji = trade.isWin ? '🟢' : '🔴';
        const result = trade.isWin ? 'GAGNANT' : 'PERDANT';
        const durationSec = Math.round(trade.duration / 1000);
        
        console.log('\n' + emoji.repeat(15));
        console.log(`${emoji} TRADE ${result}`);
        console.log(`🔢 ID: ${trade.id}`);
        console.log(`📊 ${trade.direction} ${trade.symbol}`);
        console.log(`📈 Prix: ${trade.entryPrice}$ → ${trade.exitPrice}$`);
        console.log(`💰 PnL: ${trade.pnl > 0 ? '+' : ''}${trade.pnl.toFixed(4)}$`);
        console.log(`⏱️ Durée: ${durationSec}s`);
        console.log(`⏰ Session: ${trade.session}`);
        console.log(emoji.repeat(15));
    }

    showSessionStats() {
        const closedTrades = this.sessionTrades.filter(t => t.status === 'CLOSED');
        const currentSession = this.getCurrentSession();
        const sessionTrades = closedTrades.filter(t => t.session === currentSession);
        
        if (sessionTrades.length === 0) return;

        const winningTrades = sessionTrades.filter(t => t.isWin);
        const totalPnL = sessionTrades.reduce((sum, t) => sum + t.pnl, 0);
        const winRate = (winningTrades.length / sessionTrades.length * 100);
        
        console.log('\n' + '📊'.repeat(20));
        console.log(`📈 STATS SESSION ${currentSession}`);
        console.log('📊'.repeat(20));
        console.log(`📊 Trades: ${sessionTrades.length} | Win: ${winRate.toFixed(1)}% | PnL: ${totalPnL.toFixed(4)}$`);
        
        if (winningTrades.length > 0) {
            console.log(`🏆 GAGNANTS (${winningTrades.length}):`);
            winningTrades.forEach((trade, i) => {
                console.log(`   ${i+1}. ${trade.direction} ${trade.symbol} → +${trade.pnl.toFixed(4)}$`);
            });
        }
        
        const losingTrades = sessionTrades.filter(t => !t.isWin);
        if (losingTrades.length > 0) {
            console.log(`💸 PERDANTS (${losingTrades.length}):`);
            losingTrades.forEach((trade, i) => {
                console.log(`   ${i+1}. ${trade.direction} ${trade.symbol} → ${trade.pnl.toFixed(4)}$`);
            });
        }
        console.log('📊'.repeat(20));
    }

    saveTrades() {
        try {
            const logsDir = path.dirname(this.logFile);
            if (!fs.existsSync(logsDir)) {
                fs.mkdirSync(logsDir, { recursive: true });
            }
            fs.writeFileSync(this.logFile, JSON.stringify(this.sessionTrades, null, 2));
        } catch (error) {
            console.error('❌ Erreur sauvegarde trades:', error.message);
        }
    }
}

// ===== BOT PRINCIPAL =====
class RealisticTradingBot {
    constructor() {
        this.isRunning = false;
        this.balance = 1000;
        this.positions = {};
        this.tradeCount = 0;
        this.winCount = 0;
        this.totalPnL = 0;
        this.state = this.loadState();
        
        // Système de sécurité
        this.dailyTradeLimit = 3;
        this.maxConsecutiveLosses = 3;
        this.consecutiveLosses = 0;
        
        // Trade Tracker intégré
        this.tracker = new TradeTracker();
        
        // Prix simulés
        this.prices = {
            'BTC/USD': 45000 + Math.random() * 10000,
            'ETH/USD': 3000 + Math.random() * 1000,
            'ADA/USD': 0.5 + Math.random() * 0.3
        };
        
        this.startPriceUpdates();
    }

    loadState() {
        try {
            if (fs.existsSync('./state.json')) {
                const data = JSON.parse(fs.readFileSync('./state.json', 'utf8'));
                console.log('📂 État précédent chargé');
                return data;
            }
        } catch (error) {
            console.log('📂 Nouvel état créé');
        }
        return { dailyTrades: 0, lastTradeDate: null };
    }

    saveState() {
        try {
            fs.writeFileSync('./state.json', JSON.stringify(this.state, null, 2));
        } catch (error) {
            console.error('❌ Erreur sauvegarde état:', error.message);
        }
    }

    // Simulateur de prix réaliste
    startPriceUpdates() {
        setInterval(() => {
            Object.keys(this.prices).forEach(symbol => {
                const change = (Math.random() - 0.5) * 0.02; // ±1% par update
                this.prices[symbol] *= (1 + change);
                this.prices[symbol] = Math.round(this.prices[symbol] * 10000) / 10000;
            });
        }, 5000); // Update toutes les 5 secondes
    }

    // Vérifier les limites de sécurité
    checkSafetyLimits() {
        const today = new Date().toDateString();
        if (this.state.lastTradeDate !== today) {
            this.state.dailyTrades = 0;
            this.state.lastTradeDate = today;
        }

        const reasons = [];
        if (this.state.dailyTrades >= this.dailyTradeLimit) {
            reasons.push(`dailyTrades: ${this.state.dailyTrades}, maxDaily: ${this.dailyTradeLimit}`);
        }
        if (this.consecutiveLosses >= this.maxConsecutiveLosses) {
            reasons.push(`consecutiveLosses: ${this.consecutiveLosses}, maxLosses: ${this.maxConsecutiveLosses}`);
        }

        if (reasons.length > 0) {
            console.log(`⚠️ [SAFETY] Trading bloqué par les limites de sécurité { ${reasons.join(', ')} }`);
            return false;
        }
        return true;
    }

    // Analyser le marché (simulation)
    analyzeMarket() {
        const symbols = Object.keys(this.prices);
        const selectedSymbol = symbols[Math.floor(Math.random() * symbols.length)];
        const currentPrice = this.prices[selectedSymbol];
        
        // Simulation d'analyse technique
        const rsi = Math.random() * 100;
        const macdSignal = Math.random() > 0.5 ? 'BUY' : 'SELL';
        const volumeStrength = Math.random();
        
        // Logique de décision simplifiée
        const shouldTrade = Math.random() > 0.7; // 30% de chance de trade
        const direction = rsi < 30 ? 'LONG' : rsi > 70 ? 'SHORT' : (Math.random() > 0.5 ? 'LONG' : 'SHORT');
        
        return {
            symbol: selectedSymbol,
            price: currentPrice,
            direction: direction,
            confidence: volumeStrength,
            shouldTrade: shouldTrade,
            analysis: { rsi, macdSignal, volumeStrength }
        };
    }

    // Exécuter un trade
    async executeTrade(analysis) {
        if (!this.checkSafetyLimits()) return;

        const { symbol, price, direction, confidence } = analysis;
        const amount = 0.1; // Quantité fixe pour simulation
        
        // Enregistrer le trade dans le tracker
        const tradeId = this.tracker.recordTrade(symbol, price, direction, amount);
        
        // Simuler l'exécution
        console.log(`\n🚀 EXÉCUTION TRADE:`);
        console.log(`   Symbole: ${symbol}`);
        console.log(`   Direction: ${direction}`);
        console.log(`   Prix entrée: ${price}$`);
        console.log(`   Confiance: ${(confidence * 100).toFixed(1)}%`);
        
        // Mise à jour des compteurs
        this.tradeCount++;
        this.state.dailyTrades++;
        this.saveState();
        
        // Simuler la durée du trade (15-60 secondes)
        const tradeDuration = 15000 + Math.random() * 45000;
        
        setTimeout(() => {
            this.closeTrade(tradeId, symbol, price, direction, amount);
        }, tradeDuration);
    }

    // Fermer un trade
    closeTrade(tradeId, symbol, entryPrice, direction, amount) {
        const currentPrice = this.prices[symbol];
        
        // Simuler un résultat réaliste (60% de chance de gain)
        const marketDirection = Math.random() > 0.4 ? 1 : -1;
        const priceChange = (Math.random() * 0.03 + 0.005) * marketDirection; // 0.5-3.5%
        const exitPrice = entryPrice * (1 + priceChange);
        
        // Calculer PnL
        const pnlMultiplier = direction === 'LONG' ? 1 : -1;
        const pnl = (exitPrice - entryPrice) * amount * pnlMultiplier;
        const isWin = pnl > 0;
        
        // Enregistrer dans le tracker
        const closedTrade = this.tracker.closeTrade(tradeId, exitPrice, pnl);
        
        // Mettre à jour les stats du bot
        if (isWin) {
            this.winCount++;
            this.consecutiveLosses = 0;
        } else {
            this.consecutiveLosses++;
        }
        
        this.totalPnL += pnl;
        
        // Log de fermeture
        console.log(`\n💰 TRADE FERMÉ:`);
        console.log(`   Prix sortie: ${exitPrice.toFixed(4)}$`);
        console.log(`   PnL: ${pnl > 0 ? '+' : ''}${pnl.toFixed(4)}$`);
        console.log(`   Résultat: ${isWin ? '🟢 GAGNANT' : '🔴 PERDANT'}`);
    }

    // Afficher les statistiques
    showStats() {
        const winRate = this.tradeCount > 0 ? (this.winCount / this.tradeCount * 100) : 0;
        const currentSession = this.tracker.getCurrentSession();
        
        console.log(`\n📊 [${Math.floor(Date.now()/60000) % 1000}/${Math.floor(Date.now()/60000) % 1000}min] ${this.tradeCount} trades | Win: ${winRate.toFixed(1)}% | PnL: ${this.totalPnL.toFixed(2)}$ | Positions: ${Object.keys(this.positions).length}`);
        
        if (!this.checkSafetyLimits()) {
            console.log(`⚠️ [SAFETY] Trading suspendu pour cette session`);
        }
    }

    // Boucle principale du bot
    async start() {
        console.log('🤖 Realistic Trading Bot - Version Enhanced démarré!');
        console.log(`⏰ Session: ${this.tracker.getCurrentSession()}`);
        console.log('📊 Système de tracking des trades activé');
        
        this.isRunning = true;

        while (this.isRunning) {
            try {
                // Afficher les stats toutes les minutes
                this.showStats();
                
                // Analyser le marché
                const analysis = this.analyzeMarket();
                
                // Exécuter un trade si les conditions sont réunies
                if (analysis.shouldTrade && this.checkSafetyLimits()) {
                    await this.executeTrade(analysis);
                } else {
                    console.log('⏳ Analyse du marché... Aucun signal de trade');
                }
                
                // Attendre avant la prochaine analyse (2-5 minutes)
                const waitTime = 120000 + Math.random() * 180000;
                await new Promise(resolve => setTimeout(resolve, waitTime));
                
            } catch (error) {
                console.error('❌ Erreur dans la boucle principale:', error);
                await new Promise(resolve => setTimeout(resolve, 30000));
            }
        }
    }

    // Arrêter le bot proprement
    stop() {
        console.log('🛑 Arrêt du bot...');
        this.isRunning = false;
        this.tracker.showSessionStats();
        this.saveState();
    }
}

// ===== DÉMARRAGE DU BOT =====
const bot = new RealisticTradingBot();

// Gestion des signaux d'arrêt
process.on('SIGINT', () => {
    console.log('\n🛑 Signal d\'arrêt reçu');
    bot.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Signal de terminaison reçu');
    bot.stop();
    process.exit(0);
});

// Démarrer le bot
bot.start().catch(error => {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
});

// Export pour tests
module.exports = { RealisticTradingBot, TradeTracker };
