// Suite de tests complète pour bot de trading
// Tests unitaires, intégration et validation de stratégie

const assert = require('assert');
const fs = require('fs');
const path = require('path');

class TradingBotTester {
    constructor() {
        this.testResults = {
            passed: 0,
            failed: 0,
            errors: [],
            performance: {}
        };
        
        this.mockData = this.generateMockData();
        this.testConfig = this.getTestConfig();
    }

    // Configuration de test
    getTestConfig() {
        return {
            paperTrading: true,
            dailyTargetMin: 0.003,
            dailyTargetMax: 0.005,
            stopLossPercent: 0.015,
            maxPositionPercent: 0.05,
            totalCapital: 10000,
            subPortfolios: 4,
            symbols: ['BTCUSDT', 'ETHUSDT']
        };
    }

    // Génération de données de test
    generateMockData() {
        const data = [];
        let basePrice = 45000;
        const startTime = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 jours
        
        for (let i = 0; i < 1000; i++) {
            const timestamp = startTime + (i * 60 * 60 * 1000); // 1h intervals
            const volatility = 0.02 + Math.random() * 0.03;
            const direction = Math.random() > 0.5 ? 1 : -1;
            const change = basePrice * volatility * direction * (Math.random() * 0.5);
            
            const open = basePrice;
            const close = basePrice + change;
            const high = Math.max(open, close) * (1 + Math.random() * 0.01);
            const low = Math.min(open, close) * (1 - Math.random() * 0.01);
            const volume = 100 + Math.random() * 1000;
            
            data.push({
                timestamp,
                open,
                high,
                low,
                close,
                volume
            });
            
            basePrice = close;
        }
        
        return data;
    }

    // Exécution de tous les tests
    async runAllTests() {
        console.log('🧪 DÉMARRAGE SUITE DE TESTS COMPLÈTE');
        console.log('═'.repeat(50));
        
        const testSuites = [
            { name: 'Tests Unitaires', fn: this.runUnitTests },
            { name: 'Tests de Configuration', fn: this.runConfigTests },
            { name: 'Tests d\'Indicateurs Techniques', fn: this.runIndicatorTests },
            { name: 'Tests de Gestion des Risques', fn: this.runRiskManagementTests },
            { name: 'Tests de Stratégie', fn: this.runStrategyTests },
            { name: 'Tests de Performance', fn: this.runPerformanceTests },
            { name: 'Tests d\'Intégration', fn: this.runIntegrationTests },
            { name: 'Tests de Stress', fn: this.runStressTests }
        ];
        
        for (const suite of testSuites) {
            console.log(`\n📋 ${suite.name}...`);
            try {
                await suite.fn.call(this);
                console.log(`✅ ${suite.name} - RÉUSSI`);
            } catch (error) {
                console.log(`❌ ${suite.name} - ÉCHEC: ${error.message}`);
                this.testResults.errors.push({
                    suite: suite.name,
                    error: error.message
                });
            }
        }
        
        this.generateTestReport();
    }

    // Tests unitaires de base
    async runUnitTests() {
        console.log('  🔍 Test calcul RSI...');
        const prices = [44, 44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.85, 47.69, 46.49, 46.26, 47.09, 46.66, 46.80, 47.79];
        const rsi = this.calculateRSI(prices, 14);
        this.assert(rsi > 0 && rsi < 100, 'RSI doit être entre 0 et 100');
        this.assert(Math.abs(rsi - 70.53) < 5, 'RSI approximativement correct');
        
        console.log('  🔍 Test calcul SMA...');
        const sma = this.calculateSMA([1, 2, 3, 4, 5], 5);
        this.assert(sma === 3, 'SMA doit être 3');
        
        console.log('  🔍 Test formatage prix...');
        const formattedPrice = this.formatPrice(12.3456789, 2);
        this.assert(formattedPrice === '12.35', 'Prix correctement formaté');
        
        console.log('  🔍 Test calcul pourcentage...');
        const pnlPercent = this.calculatePnLPercent(100, 105);
        this.assert(Math.abs(pnlPercent - 5) < 0.01, 'PnL percent correct');
    }

    // Tests de configuration
    async runConfigTests() {
        console.log('  🔍 Validation configuration de base...');
        this.assert(this.testConfig.paperTrading === true, 'Paper trading activé');
        this.assert(this.testConfig.dailyTargetMax <= 0.01, 'Objectif quotidien réaliste');
        this.assert(this.testConfig.stopLossPercent <= 0.02, 'Stop-loss conservateur');
        this.assert(this.testConfig.maxPositionPercent <= 0.1, 'Taille position raisonnable');
        
        console.log('  🔍 Validation cohérence des paramètres...');
        this.assert(
            this.testConfig.dailyTargetMax > this.testConfig.dailyTargetMin,
            'Target max > target min'
        );
        this.assert(
            this.testConfig.stopLossPercent > this.testConfig.dailyTargetMax,
            'Stop-loss > target pour ratio risk/reward'
        );
    }

    // Tests des indicateurs techniques
    async runIndicatorTests() {
        const testPrices = this.mockData.map(d => d.close).slice(-100);
        
        console.log('  🔍 Test RSI sur données réelles...');
        const rsi = this.calculateRSI(testPrices, 14);
        this.assert(rsi >= 0 && rsi <= 100, 'RSI dans plage valide');
        
        console.log('  🔍 Test SMA...');
        const sma20 = this.calculateSMA(testPrices, 20);
        const sma50 = this.calculateSMA(testPrices, 50);
        this.assert(sma20 > 0 && sma50 > 0, 'SMA positives');
        
        console.log('  🔍 Test EMA...');
        const ema12 = this.calculateEMA(testPrices, 12);
        this.assert(ema12 > 0, 'EMA positive');
        
        console.log('  🔍 Test volatilité...');
        const volatility = this.calculateVolatility(testPrices, 20);
        this.assert(volatility >= 0 && volatility <= 1, 'Volatilité dans plage raisonnable');
    }

    // Tests de gestion des risques
    async runRiskManagementTests() {
        console.log('  🔍 Test calcul position size...');
        const positionSize = this.calculatePositionSize(10000, 0.05, 45000);
        this.assert(positionSize === 500, 'Position size correcte');
        
        console.log('  🔍 Test stop-loss...');
        const stopPrice = this.calculateStopLoss(45000, 'BUY', 0.015);
        this.assert(Math.abs(stopPrice - 44325) < 1, 'Stop-loss calculé correctement');
        
        console.log('  🔍 Test take-profit...');
        const takeProfit = this.calculateTakeProfit(45000, 'BUY', 0.005);
        this.assert(Math.abs(takeProfit - 45225) < 1, 'Take-profit calculé correctement');
        
        console.log('  🔍 Test validation balance...');
        const hasBalance = this.validateBalance({ USDT: 1000 }, 'BTCUSDT', 'BUY', 0.01, 45000);
        this.assert(hasBalance === true, 'Balance suffisante détectée');
        
        const noBalance = this.validateBalance({ USDT: 100 }, 'BTCUSDT', 'BUY', 0.01, 45000);
        this.assert(noBalance === false, 'Balance insuffisante détectée');
    }

    // Tests de stratégie de trading
    async runStrategyTests() {
        console.log('  🔍 Test génération de signaux...');
        
        // Simulation d'analyse bullish
        const bullishAnalysis = {
            rsi: 25, // Oversold
            ema_12: 45100,
            ema_26: 45000,
            currentPrice: 45050,
            sma_20: 45020,
            volatility: 0.02,
            volumeRatio: 1.5
        };
        
        const bullishSignal = this.shouldTrade(bullishAnalysis);
        this.assert(bullishSignal !== null, 'Signal bullish généré');
        this.assert(bullishSignal.direction === 'BUY', 'Direction correcte');
        
        // Simulation d'analyse bearish
        const bearishAnalysis = {
            rsi: 75, // Overbought
            ema_12: 44900,
            ema_26: 45000,
            currentPrice: 44950,
            sma_20: 44980,
            volatility: 0.02,
            volumeRatio: 1.5
        };
        
        const bearishSignal = this.shouldTrade(bearishAnalysis);
        this.assert(bearishSignal === null, 'Signal bearish rejeté correctement');
    }

    // Tests de performance
    async runPerformanceTests() {
        console.log('  🔍 Test performance du backtesting...');
        
        const startTime = Date.now();
        
        // Simulation backtesting sur 1000 points
        for (let i = 50; i < this.mockData.length; i++) {
            const slice = this.mockData.slice(i - 50, i + 1);
            const analysis = this.analyzeMarketData(slice);
            const signal = this.shouldTrade(analysis);
        }
        
        const endTime = Date.now();
        const executionTime = endTime - startTime;
        
        console.log(`    ⏱️ Temps d'exécution: ${executionTime}ms`);
        this.assert(executionTime < 5000, 'Performance acceptable (<5s pour 1000 points)');
        
        this.testResults.performance.backtestingSpeed = executionTime;
    }

    // Tests d'intégration
    async runIntegrationTests() {
        console.log('  🔍 Test intégration fichiers logs...');
        
        // Test écriture/lecture logs
        const testLog = {
            timestamp: new Date().toISOString(),
            type: 'TEST',
            message: 'Test log entry'
        };
        
        const logFile = path.join(__dirname, 'test_logs.json');
        fs.writeFileSync(logFile, JSON.stringify(testLog) + '\n');
        
        const logContent = fs.readFileSync(logFile, 'utf8');
        const parsedLog = JSON.parse(logContent.trim());
        
        this.assert(parsedLog.type === 'TEST', 'Log correctement sauvegardé et lu');
        
        // Nettoyage
        fs.unlinkSync(logFile);
    }

    // Tests de stress
    async runStressTests() {
        console.log('  🔍 Test gestion mémoire...');
        
        const initialMemory = process.memoryUsage().heapUsed;
        
        // Simulation charge importante
        const largeDataSet = [];
        for (let i = 0; i < 10000; i++) {
            largeDataSet.push({
                timestamp: Date.now() + i,
                price: Math.random() * 50000,
                volume: Math.random() * 1000
            });
        }
        
        // Traitement des données
        for (const data of largeDataSet) {
            this.calculateRSI([data.price], 1);
        }
        
        const finalMemory = process.memoryUsage().heapUsed;
        const memoryIncrease = finalMemory - initialMemory;
        
        console.log(`    💾 Augmentation mémoire: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
        this.assert(memoryIncrease < 100 * 1024 * 1024, 'Consommation mémoire raisonnable (<100MB)');
    }

    // Simulation de bot complet
    async runBotSimulation() {
        console.log('\n🤖 SIMULATION BOT COMPLÈTE');
        console.log('═'.repeat(30));
        
        let capital = 10000;
        let trades = [];
        let position = null;
        
        for (let i = 50; i < Math.min(this.mockData.length, 200); i++) {
            const slice = this.mockData.slice(i - 50, i + 1);
            const analysis = this.analyzeMarketData(slice);
            const currentPrice = this.mockData[i].close;
            
            // Pas de position - chercher entrée
            if (!position) {
                const signal = this.shouldTrade(analysis);
                if (signal && capital > 100) {
                    const positionSize = Math.min(capital * 0.05, capital * 0.95);
                    position = {
                        entryPrice: currentPrice,
                        entryTime: this.mockData[i].timestamp,
                        direction: signal.direction,
                        size: positionSize,
                        quantity: positionSize / currentPrice,
                        stopLoss: this.calculateStopLoss(currentPrice, signal.direction, 0.015),
                        takeProfit: this.calculateTakeProfit(currentPrice, signal.direction, 0.005)
                    };
                    capital -= positionSize;
                }
            }
            // Position ouverte - vérifier sortie
            else {
                let shouldExit = false;
                let exitReason = '';
                
                // Stop-loss
                if ((position.direction === 'BUY' && currentPrice <= position.stopLoss) ||
                    (position.direction === 'SELL' && currentPrice >= position.stopLoss)) {
                    shouldExit = true;
                    exitReason = 'STOP_LOSS';
                }
                // Take-profit
                else if ((position.direction === 'BUY' && currentPrice >= position.takeProfit) ||
                         (position.direction === 'SELL' && currentPrice <= position.takeProfit)) {
                    shouldExit = true;
                    exitReason = 'TAKE_PROFIT';
                }
                
                if (shouldExit) {
                    const pnl = this.calculatePnL(position, currentPrice);
                    capital += position.size + pnl;
                    
                    trades.push({
                        ...position,
                        exitPrice: currentPrice,
                        exitTime: this.mockData[i].timestamp,
                        pnl,
                        pnlPercent: (pnl / position.size) * 100,
                        reason: exitReason
                    });
                    
                    position = null;
                }
            }
        }
        
        // Analyse des résultats
        const totalReturn = capital - 10000;
        const totalReturnPercent = (totalReturn / 10000) * 100;
        const winningTrades = trades.filter(t => t.pnl > 0).length;
        const winRate = trades.length > 0 ? (winningTrades / trades.length) * 100 : 0;
        
        console.log(`📊 Résultats de simulation:`);
        console.log(`   Capital final: $${capital.toFixed(2)}`);
        console.log(`   Rendement: ${totalReturnPercent.toFixed(2)}%`);
        console.log(`   Trades: ${trades.length}`);
        console.log(`   Taux de réussite: ${winRate.toFixed(1)}%`);
        
        // Validation des résultats
        this.assert(trades.length > 0, 'Au moins un trade exécuté');
        this.assert(totalReturnPercent > -50, 'Pas de perte catastrophique');
        
        this.testResults.performance.simulation = {
            totalReturn: totalReturnPercent,
            trades: trades.length,
            winRate
        };
        
        return { capital, trades, totalReturn };
    }

    // Méthodes de test pour indicateurs techniques
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

    // Méthodes utilitaires de test
    analyzeMarketData(data) {
        const prices = data.map(d => d.close);
        const volumes = data.map(d => d.volume);
        
        return {
            rsi: this.calculateRSI(prices, 14),
            sma_20: this.calculateSMA(prices, 20),
            ema_12: this.calculateEMA(prices, 12),
            ema_26: this.calculateEMA(prices, 26),
            volatility: this.calculateVolatility(prices, 20),
            volumeRatio: volumes[volumes.length - 1] / this.calculateSMA(volumes, 20),
            currentPrice: prices[prices.length - 1]
        };
    }

    shouldTrade(analysis) {
        if (!analysis || !analysis.rsi) return null;
        
        const signals = {
            bullish_trend: analysis.ema_12 > analysis.ema_26 && 
                          analysis.currentPrice > analysis.sma_20,
            rsi_oversold: analysis.rsi < 35,
            high_volume: analysis.volumeRatio > 1.3,
            good_volatility: analysis.volatility > 0.01 && analysis.volatility < 0.05
        };
        
        let score = 0;
        if (signals.bullish_trend) score += 30;
        if (signals.rsi_oversold) score += 25;
        if (signals.high_volume) score += 20;
        if (signals.good_volatility) score += 15;
        
        return score >= 60 ? { direction: 'BUY', score, signals } : null;
    }

    calculatePositionSize(capital, maxPercent, price) {
        return capital * maxPercent;
    }

    calculateStopLoss(price, direction, stopPercent) {
        return direction === 'BUY' ? 
            price * (1 - stopPercent) : 
            price * (1 + stopPercent);
    }

    calculateTakeProfit(price, direction, targetPercent) {
        return direction === 'BUY' ? 
            price * (1 + targetPercent) : 
            price * (1 - targetPercent);
    }

    validateBalance(balances, symbol, side, quantity, price) {
        if (side === 'BUY') {
            const required = quantity * price;
            return balances.USDT >= required;
        } else {
            return balances.BTC >= quantity;
        }
    }

    calculatePnL(position, exitPrice) {
        if (position.direction === 'BUY') {
            return (exitPrice - position.entryPrice) * position.quantity;
        } else {
            return (position.entryPrice - exitPrice) * position.quantity;
        }
    }

    formatPrice(price, decimals) {
        return parseFloat(price).toFixed(decimals);
    }

    calculatePnLPercent(entryPrice, exitPrice) {
        return ((exitPrice - entryPrice) / entryPrice) * 100;
    }

    // Assertion helper
    assert(condition, message) {
        try {
            assert.strictEqual(condition, true, message);
            this.testResults.passed++;
        } catch (error) {
            this.testResults.failed++;
            throw new Error(message);
        }
    }

    // Génération du rapport de test
    generateTestReport() {
        console.log('\n📋 RAPPORT DE TESTS');
        console.log('═'.repeat(50));
        
        const total = this.testResults.passed + this.testResults.failed;
        const successRate = total > 0 ? (this.testResults.passed / total) * 100 : 0;
        
        console.log(`✅ Tests réussis: ${this.testResults.passed}`);
        console.log(`❌ Tests échoués: ${this.testResults.failed}`);
        console.log(`📊 Taux de réussite: ${successRate.toFixed(1)}%`);
        
        if (this.testResults.errors.length > 0) {
            console.log('\n🚨 ERREURS DÉTECTÉES:');
            this.testResults.errors.forEach((error, index) => {
                console.log(`${index + 1}. ${error.suite}: ${error.error}`);
            });
        }
        
        if (this.testResults.performance) {
            console.log('\n⚡ MÉTRIQUES DE PERFORMANCE:');
            Object.entries(this.testResults.performance).forEach(([key, value]) => {
                console.log(`   ${key}: ${JSON.stringify(value)}`);
            });
        }
        
        // Recommandations
        console.log('\n🎯 RECOMMANDATIONS:');
        if (successRate >= 95) {
            console.log('✅ Code prêt pour déploiement');
        } else if (successRate >= 80) {
            console.log('⚠️ Corrections mineures recommandées');
        } else {
            console.log('❌ Corrections majeures requises');
        }
        
        // Sauvegarde du rapport
        const report = {
            timestamp: new Date().toISOString(),
            results: this.testResults,
            successRate,
            recommendations: this.generateRecommendations(successRate)
        };
        
        const reportPath = path.join(__dirname, 'test_reports', `test_report_${Date.now()}.json`);
        
        // Créer le dossier si nécessaire
        const reportDir = path.dirname(reportPath);
        if (!fs.existsSync(reportDir)) {
            fs.mkdirSync(reportDir, { recursive: true });
        }
        
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        console.log(`\n📁 Rapport sauvegardé: ${reportPath}`);
    }

    generateRecommendations(successRate) {
        const recommendations = [];
        
        if (successRate < 100) {
            recommendations.push('Corriger tous les tests échoués avant déploiement');
        }
        
        if (this.testResults.performance.backtestingSpeed > 3000) {
            recommendations.push('Optimiser les performances du backtesting');
        }
        
        if (this.testResults.failed > 0) {
            recommendations.push('Réviser la logique des fonctions échouées');
        }
        
        recommendations.push('Exécuter les tests après chaque modification');
        recommendations.push('Ajouter des tests pour nouvelles fonctionnalités');
        
        return recommendations;
    }
}

// Fonction principale de test
async function runTestSuite() {
    console.log('🎯 SUITE DE TESTS - BOT DE TRADING RÉALISTE');
    console.log('═'.repeat(60));
    
    const tester = new TradingBotTester();
    
    try {
        await tester.runAllTests();
        await tester.runBotSimulation();
        
        console.log('\n🏁 TESTS TERMINÉS');
        
    } catch (error) {
        console.error('\n💥 ERREUR CRITIQUE DURANT LES TESTS:', error.message);
        process.exit(1);
    }
}

// Export et exécution
if (require.main === module) {
    runTestSuite().catch(console.error);
}

module.exports = TradingBotTester;