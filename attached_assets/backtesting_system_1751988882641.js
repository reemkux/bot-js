// Système de Backtesting pour validation de stratégie
// OBLIGATOIRE avant tout trading réel

const fs = require('fs');
const path = require('path');

class BacktestingEngine {
    constructor(config) {
        this.config = {
            startDate: config.startDate || '2024-01-01',
            endDate: config.endDate || '2024-12-31',
            initialCapital: config.initialCapital || 10000,
            symbols: config.symbols || ['BTCUSDT', 'ETHUSDT'],
            
            // Paramètres de stratégie à tester
            dailyTargetMin: config.dailyTargetMin || 0.003,
            dailyTargetMax: config.dailyTargetMax || 0.005,
            stopLossPercent: config.stopLossPercent || 0.015,
            maxPositionPercent: config.maxPositionPercent || 0.05,
            
            // Frais de trading
            makerFee: config.makerFee || 0.001, // 0.1%
            takerFee: config.takerFee || 0.001, // 0.1%
            
            ...config
        };
        
        this.results = {
            trades: [],
            dailyReturns: [],
            metrics: {},
            equity: [],
            drawdowns: []
        };
        
        this.setupResults();
    }

    setupResults() {
        const resultsDir = path.join(__dirname, 'backtest_results');
        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir, { recursive: true });
        }
        this.resultsDir = resultsDir;
    }

    // Chargement des données historiques (simulation)
    async loadHistoricalData(symbol, startDate, endDate) {
        console.log(`📊 Chargement données historiques ${symbol}...`);
        
        // Simulation de données OHLCV
        // En réalité: charger depuis Binance API ou fichiers CSV
        const data = this.generateSimulatedData(symbol, startDate, endDate);
        
        console.log(`✅ ${data.length} chandeliers chargés pour ${symbol}`);
        return data;
    }

    // Génération de données simulées (remplacer par vraies données)
    generateSimulatedData(symbol, startDate, endDate) {
        const data = [];
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        let basePrice = symbol === 'BTCUSDT' ? 45000 : 3000;
        let currentTime = start.getTime();
        
        while (currentTime <= end.getTime()) {
            // Simulation d'une chandelle 1h
            const volatility = 0.02 + Math.random() * 0.03; // 2-5% volatilité
            const direction = Math.random() > 0.5 ? 1 : -1;
            const change = basePrice * volatility * direction * (Math.random() * 0.5);
            
            const open = basePrice;
            const close = basePrice + change;
            const high = Math.max(open, close) * (1 + Math.random() * 0.01);
            const low = Math.min(open, close) * (1 - Math.random() * 0.01);
            const volume = 100 + Math.random() * 1000;
            
            data.push({
                timestamp: currentTime,
                open,
                high,
                low,
                close,
                volume
            });
            
            basePrice = close;
            currentTime += 3600000; // +1h
        }
        
        return data;
    }

    // Calcul des indicateurs techniques pour backtesting
    calculateIndicators(data, index) {
        if (index < 50) return null; // Pas assez de données
        
        const slice = data.slice(Math.max(0, index - 100), index + 1);
        const prices = slice.map(d => d.close);
        const volumes = slice.map(d => d.volume);
        
        return {
            rsi: this.calculateRSI(prices, 14),
            sma_20: this.calculateSMA(prices, 20),
            sma_50: this.calculateSMA(prices, 50),
            ema_12: this.calculateEMA(prices, 12),
            ema_26: this.calculateEMA(prices, 26),
            volatility: this.calculateVolatility(prices, 20),
            volumeRatio: volumes[volumes.length - 1] / this.calculateSMA(volumes, 20),
            currentPrice: prices[prices.length - 1]
        };
    }

    // Simulation de la stratégie de trading
    simulateStrategy(data, symbol) {
        let capital = this.config.initialCapital;
        let position = null;
        let trades = [];
        let equity = [capital];
        
        console.log(`🧮 Simulation stratégie pour ${symbol}...`);
        
        for (let i = 50; i < data.length; i++) {
            const candle = data[i];
            const indicators = this.calculateIndicators(data, i);
            
            if (!indicators) continue;
            
            // Pas de position ouverte - chercher signal d'entrée
            if (!position) {
                const signal = this.getEntrySignal(indicators);
                
                if (signal && capital > 100) { // Capital minimum
                    const positionSize = Math.min(
                        capital * this.config.maxPositionPercent,
                        capital * 0.95 // Max 95% du capital
                    );
                    
                    position = {
                        symbol,
                        entryTime: candle.timestamp,
                        entryPrice: candle.close,
                        direction: signal.direction,
                        size: positionSize,
                        quantity: positionSize / candle.close,
                        stopLoss: signal.direction === 'BUY' ?
                            candle.close * (1 - this.config.stopLossPercent) :
                            candle.close * (1 + this.config.stopLossPercent),
                        takeProfit: signal.direction === 'BUY' ?
                            candle.close * (1 + this.config.dailyTargetMax) :
                            candle.close * (1 - this.config.dailyTargetMax),
                        confidence: signal.confidence
                    };
                    
                    capital -= positionSize;
                    console.log(`📈 Entrée ${signal.direction} à ${candle.close} (${new Date(candle.timestamp).toISOString()})`);
                }
            }
            // Position ouverte - vérifier sortie
            else {
                const exitSignal = this.getExitSignal(position, candle, indicators);
                
                if (exitSignal) {
                    const exitPrice = candle.close;
                    const pnl = this.calculatePnL(position, exitPrice);
                    const fees = (position.size + Math.abs(pnl)) * this.config.takerFee;
                    const netPnL = pnl - fees;
                    
                    capital += position.size + netPnL;
                    
                    const trade = {
                        symbol,
                        entryTime: position.entryTime,
                        exitTime: candle.timestamp,
                        entryPrice: position.entryPrice,
                        exitPrice,
                        direction: position.direction,
                        size: position.size,
                        pnl: netPnL,
                        pnlPercent: (netPnL / position.size) * 100,
                        fees,
                        reason: exitSignal.reason,
                        confidence: position.confidence,
                        duration: candle.timestamp - position.entryTime
                    };
                    
                    trades.push(trade);
                    console.log(`📉 Sortie ${exitSignal.reason}: PnL ${trade.pnlPercent.toFixed(2)}%`);
                    
                    position = null;
                }
            }
            
            // Enregistrer la valeur du portefeuille
            const portfolioValue = capital + (position ? 
                position.size + this.calculatePnL(position, candle.close) : 0);
            equity.push(portfolioValue);
        }
        
        return { trades, equity, finalCapital: capital };
    }

    // Signal d'entrée en position
    getEntrySignal(indicators) {
        const signals = {
            bullish_trend: indicators.ema_12 > indicators.ema_26 && 
                          indicators.currentPrice > indicators.sma_20,
            rsi_oversold: indicators.rsi < 35,
            high_volume: indicators.volumeRatio > 1.3,
            good_volatility: indicators.volatility > 0.01 && indicators.volatility < 0.05
        };
        
        let score = 0;
        if (signals.bullish_trend) score += 30;
        if (signals.rsi_oversold) score += 25;
        if (signals.high_volume) score += 20;
        if (signals.good_volatility) score += 15;
        
        // Filtres négatifs
        if (indicators.volatility > 0.08) score -= 30; // Trop volatile
        if (indicators.rsi > 70) score -= 20; // Surachat
        
        return score >= 60 ? { 
            direction: 'BUY', 
            confidence: score,
            signals 
        } : null;
    }

    // Signal de sortie
    getExitSignal(position, candle, indicators) {
        const currentPrice = candle.close;
        
        // Stop-loss
        if ((position.direction === 'BUY' && currentPrice <= position.stopLoss) ||
            (position.direction === 'SELL' && currentPrice >= position.stopLoss)) {
            return { reason: 'STOP_LOSS' };
        }
        
        // Take-profit
        if ((position.direction === 'BUY' && currentPrice >= position.takeProfit) ||
            (position.direction === 'SELL' && currentPrice <= position.takeProfit)) {
            return { reason: 'TAKE_PROFIT' };
        }
        
        // Sortie sur signal technique
        if (position.direction === 'BUY' && indicators.rsi > 75) {
            return { reason: 'RSI_OVERBOUGHT' };
        }
        
        // Sortie temporelle (max 24h en position)
        const maxDuration = 24 * 3600000; // 24h en ms
        if (candle.timestamp - position.entryTime > maxDuration) {
            return { reason: 'TIME_EXIT' };
        }
        
        return null;
    }

    // Calcul PnL
    calculatePnL(position, currentPrice) {
        if (position.direction === 'BUY') {
            return (currentPrice - position.entryPrice) * position.quantity;
        } else {
            return (position.entryPrice - currentPrice) * position.quantity;
        }
    }

    // Exécution du backtest complet
    async runBacktest() {
        console.log('🚀 Démarrage du backtesting...');
        console.log(`📅 Période: ${this.config.startDate} → ${this.config.endDate}`);
        console.log(`💰 Capital initial: $${this.config.initialCapital}`);
        
        const allTrades = [];
        const allEquity = [this.config.initialCapital];
        let totalCapital = this.config.initialCapital;
        
        // Test sur chaque symbole
        for (const symbol of this.config.symbols) {
            const data = await this.loadHistoricalData(
                symbol, 
                this.config.startDate, 
                this.config.endDate
            );
            
            const result = this.simulateStrategy(data, symbol);
            allTrades.push(...result.trades);
            
            // Mise à jour du capital total (simulation multi-actifs)
            totalCapital += (result.finalCapital - this.config.initialCapital);
        }
        
        this.results.trades = allTrades;
        this.results.finalCapital = totalCapital;
        
        // Calcul des métriques
        this.calculateMetrics();
        
        // Génération du rapport
        this.generateReport();
        
        console.log('✅ Backtesting terminé');
        return this.results;
    }

    // Calcul des métriques de performance
    calculateMetrics() {
        const trades = this.results.trades;
        if (trades.length === 0) {
            console.log('❌ Aucun trade exécuté');
            return;
        }
        
        // Métriques de base
        const winningTrades = trades.filter(t => t.pnl > 0);
        const losingTrades = trades.filter(t => t.pnl < 0);
        
        const totalReturn = this.results.finalCapital - this.config.initialCapital;
        const totalReturnPercent = (totalReturn / this.config.initialCapital) * 100;
        
        const avgWin = winningTrades.length > 0 ? 
            winningTrades.reduce((sum, t) => sum + t.pnlPercent, 0) / winningTrades.length : 0;
        const avgLoss = losingTrades.length > 0 ? 
            losingTrades.reduce((sum, t) => sum + Math.abs(t.pnlPercent), 0) / losingTrades.length : 0;
        
        // Métriques avancées
        const dailyReturns = this.calculateDailyReturns();
        const maxDrawdown = this.calculateMaxDrawdown();
        const sharpeRatio = this.calculateSharpeRatio(dailyReturns);
        const calmarRatio = totalReturnPercent / Math.abs(maxDrawdown.percent);
        
        this.results.metrics = {
            // Performance globale
            totalTrades: trades.length,
            winRate: (winningTrades.length / trades.length) * 100,
            totalReturn: totalReturn,
            totalReturnPercent: totalReturnPercent,
            
            // Métriques par trade
            avgWin: avgWin,
            avgLoss: avgLoss,
            profitFactor: avgWin / (avgLoss || 1),
            expectancy: (avgWin * winningTrades.length - avgLoss * losingTrades.length) / trades.length,
            
            // Métriques de risque
            maxDrawdown: maxDrawdown,
            sharpeRatio: sharpeRatio,
            calmarRatio: calmarRatio,
            
            // Autres
            avgTradeDuration: trades.reduce((sum, t) => sum + t.duration, 0) / trades.length / 3600000, // en heures
            totalFees: trades.reduce((sum, t) => sum + t.fees, 0),
            
            // Validation des objectifs
            avgDailyReturn: totalReturnPercent / this.getDaysBetween(this.config.startDate, this.config.endDate),
            meetsTarget: this.validateTargets(dailyReturns)
        };
    }

    // Calcul des rendements quotidiens
    calculateDailyReturns() {
        const dailyReturns = [];
        let previousCapital = this.config.initialCapital;
        
        // Grouper les trades par jour
        const tradesByDay = {};
        this.results.trades.forEach(trade => {
            const day = new Date(trade.exitTime).toISOString().split('T')[0];
            if (!tradesByDay[day]) tradesByDay[day] = [];
            tradesByDay[day].push(trade);
        });
        
        // Calculer le rendement quotidien
        Object.keys(tradesByDay).sort().forEach(day => {
            const dayTrades = tradesByDay[day];
            const dayPnL = dayTrades.reduce((sum, trade) => sum + trade.pnl, 0);
            const dayReturn = (dayPnL / previousCapital) * 100;
            
            dailyReturns.push({
                date: day,
                return: dayReturn,
                trades: dayTrades.length,
                pnl: dayPnL
            });
            
            previousCapital += dayPnL;
        });
        
        return dailyReturns;
    }

    // Calcul du drawdown maximum
    calculateMaxDrawdown() {
        let peak = this.config.initialCapital;
        let maxDrawdown = 0;
        let maxDrawdownPercent = 0;
        let currentCapital = this.config.initialCapital;
        
        this.results.trades.forEach(trade => {
            currentCapital += trade.pnl;
            
            if (currentCapital > peak) {
                peak = currentCapital;
            }
            
            const drawdown = peak - currentCapital;
            const drawdownPercent = (drawdown / peak) * 100;
            
            if (drawdown > maxDrawdown) {
                maxDrawdown = drawdown;
                maxDrawdownPercent = drawdownPercent;
            }
        });
        
        return {
            amount: maxDrawdown,
            percent: maxDrawdownPercent
        };
    }

    // Calcul du ratio de Sharpe
    calculateSharpeRatio(dailyReturns) {
        if (dailyReturns.length === 0) return 0;
        
        const returns = dailyReturns.map(d => d.return);
        const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
        const stdDev = Math.sqrt(variance);
        
        // Ratio de Sharpe annualisé (assumant 252 jours de trading)
        const annualizedReturn = avgReturn * 252;
        const annualizedVolatility = stdDev * Math.sqrt(252);
        
        return annualizedVolatility !== 0 ? annualizedReturn / annualizedVolatility : 0;
    }

    // Validation des objectifs
    validateTargets(dailyReturns) {
        const avgDailyReturn = dailyReturns.reduce((sum, d) => sum + d.return, 0) / dailyReturns.length;
        const targetMin = this.config.dailyTargetMin * 100;
        const targetMax = this.config.dailyTargetMax * 100;
        
        return {
            avgDailyReturn: avgDailyReturn,
            meetsMinTarget: avgDailyReturn >= targetMin,
            meetsMaxTarget: avgDailyReturn <= targetMax * 2, // Tolérance 2x
            withinRange: avgDailyReturn >= targetMin && avgDailyReturn <= targetMax * 1.5
        };
    }

    // Génération du rapport détaillé
    generateReport() {
        const report = {
            timestamp: new Date().toISOString(),
            config: this.config,
            metrics: this.results.metrics,
            summary: this.generateSummary(),
            recommendations: this.generateRecommendations()
        };
        
        // Sauvegarde JSON
        const reportPath = path.join(this.resultsDir, `backtest_${Date.now()}.json`);
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        
        // Rapport console
        console.log('\n📊 RAPPORT DE BACKTESTING');
        console.log('═══════════════════════════════════════');
        console.table(this.results.metrics);
        
        console.log('\n💰 RÉSUMÉ FINANCIER:');
        console.log(`Capital initial: $${this.config.initialCapital.toLocaleString()}`);
        console.log(`Capital final: $${this.results.finalCapital.toLocaleString()}`);
        console.log(`Profit/Perte: $${this.results.metrics.totalReturn.toLocaleString()} (${this.results.metrics.totalReturnPercent.toFixed(2)}%)`);
        console.log(`Drawdown max: ${this.results.metrics.maxDrawdown.percent.toFixed(2)}%`);
        
        console.log('\n🎯 VALIDATION DES OBJECTIFS:');
        const validation = this.results.metrics.meetsTarget;
        console.log(`Rendement quotidien moyen: ${validation.avgDailyReturn.toFixed(3)}%`);
        console.log(`Objectif min (${(this.config.dailyTargetMin*100).toFixed(1)}%): ${validation.meetsMinTarget ? '✅' : '❌'}`);
        console.log(`Dans la fourchette cible: ${validation.withinRange ? '✅' : '❌'}`);
        
        console.log('\n📈 RECOMMANDATIONS:');
        report.recommendations.forEach(rec => {
            console.log(`${rec.type === 'SUCCESS' ? '✅' : rec.type === 'WARNING' ? '⚠️' : '❌'} ${rec.message}`);
        });
        
        console.log(`\n📁 Rapport sauvegardé: ${reportPath}`);
        
        return report;
    }

    // Génération des recommandations
    generateRecommendations() {
        const recommendations = [];
        const metrics = this.results.metrics;
        
        // Validation performance
        if (metrics.totalReturnPercent > 20) {
            recommendations.push({
                type: 'SUCCESS',
                message: 'Performance excellente, stratégie prometteuse'
            });
        } else if (metrics.totalReturnPercent > 5) {
            recommendations.push({
                type: 'WARNING',
                message: 'Performance modérée, optimisations possibles'
            });
        } else {
            recommendations.push({
                type: 'ERROR',
                message: 'Performance insuffisante, réviser la stratégie'
            });
        }
        
        // Validation winrate
        if (metrics.winRate < 40) {
            recommendations.push({
                type: 'ERROR',
                message: 'Taux de réussite trop faible (<40%), améliorer les signaux d\'entrée'
            });
        }
        
        // Validation drawdown
        if (metrics.maxDrawdown.percent > 20) {
            recommendations.push({
                type: 'ERROR',
                message: 'Drawdown trop élevé (>20%), renforcer la gestion des risques'
            });
        }
        
        // Validation Sharpe
        if (metrics.sharpeRatio < 1) {
            recommendations.push({
                type: 'WARNING',
                message: 'Ratio de Sharpe faible (<1), risque élevé par rapport au rendement'
            });
        }
        
        // Validation objectifs quotidiens
        if (!metrics.meetsTarget.withinRange) {
            recommendations.push({
                type: 'WARNING',
                message: 'Objectifs quotidiens non atteints, ajuster les paramètres'
            });
        }
        
        return recommendations;
    }

    generateSummary() {
        return {
            recommendation: this.results.metrics.totalReturnPercent > 10 && 
                          this.results.metrics.maxDrawdown.percent < 15 &&
                          this.results.metrics.winRate > 45 ? 'APPROVED' : 'NEEDS_IMPROVEMENT',
            readyForLive: this.results.metrics.totalReturnPercent > 8 &&
                         this.results.metrics.maxDrawdown.percent < 20 &&
                         this.results.metrics.sharpeRatio > 0.8
        };
    }

    // Méthodes utilitaires
    getDaysBetween(startDate, endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    }

    // Méthodes de calcul technique (réutilisées du bot principal)
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
        
        return Math.sqrt(variance) / mean;
    }
}

// Configuration pour le backtesting
const backtestConfig = {
    startDate: '2024-01-01',
    endDate: '2024-06-30',
    initialCapital: 10000,
    symbols: ['BTCUSDT', 'ETHUSDT'],
    
    // Paramètres de stratégie
    dailyTargetMin: 0.003, // 0.3%
    dailyTargetMax: 0.005, // 0.5%
    stopLossPercent: 0.015, // 1.5%
    maxPositionPercent: 0.05, // 5%
    
    // Frais
    makerFee: 0.001,
    takerFee: 0.001
};

// Utilisation
if (require.main === module) {
    async function runBacktest() {
        console.log('🧪 BACKTESTING - Validation de stratégie');
        console.log('⚠️  OBLIGATOIRE avant tout trading réel\n');
        
        const backtest = new BacktestingEngine(backtestConfig);
        const results = await backtest.runBacktest();
        
        console.log('\n🎯 PROCHAINES ÉTAPES:');
        if (results.summary.readyForLive) {
            console.log('✅ Stratégie validée pour paper trading étendu');
            console.log('📝 Étapes suivantes:');
            console.log('   1. Paper trading 30 jours minimum');
            console.log('   2. Analyser performances réelles vs backtest');
            console.log('   3. Si cohérent, tester avec capital minimal');
        } else {
            console.log('❌ Stratégie nécessite des améliorations');
            console.log('🔧 Actions requises:');
            console.log('   1. Optimiser paramètres de stratégie');
            console.log('   2. Améliorer signaux d\'entrée/sortie');
            console.log('   3. Relancer le backtesting');
        }
    }
    
    runBacktest().catch(console.error);
}

module.exports = BacktestingEngine;