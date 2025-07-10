// Analyseur de performance avancé pour bot de trading
// Analyse détaillée, optimisations et recommandations

const fs = require('fs');
const path = require('path');

class PerformanceAnalyzer {
    constructor(config) {
        this.config = {
            dataPath: config.dataPath || './logs',
            analysisWindow: config.analysisWindow || 30, // jours
            benchmarkReturn: config.benchmarkReturn || 0.1, // 10% annuel
            riskFreeRate: config.riskFreeRate || 0.02, // 2% annuel
            maxAcceptableDrawdown: config.maxAcceptableDrawdown || 0.15, // 15%
            targetSharpeRatio: config.targetSharpeRatio || 1.5,
            ...config
        };
        
        this.data = {
            trades: [],
            dailyReturns: [],
            portfolioValue: [],
            drawdowns: [],
            metrics: {}
        };
        
        this.analysis = {
            performance: {},
            risk: {},
            efficiency: {},
            consistency: {},
            recommendations: []
        };
    }

    // Chargement et traitement des données
    async loadData() {
        console.log('📊 Chargement des données de performance...');
        
        try {
            await this.loadTrades();
            await this.loadPortfolioData();
            this.calculateDailyReturns();
            this.calculateDrawdowns();
            
            console.log(`✅ Données chargées: ${this.data.trades.length} trades, ${this.data.dailyReturns.length} jours`);
        } catch (error) {
            console.error('❌ Erreur chargement données:', error.message);
            throw error;
        }
    }

    // Chargement des trades
    async loadTrades() {
        const tradesFile = path.join(this.config.dataPath, 'trading', 'trades.json');
        
        if (!fs.existsSync(tradesFile)) {
            console.log('⚠️ Fichier de trades non trouvé');
            return;
        }
        
        const lines = fs.readFileSync(tradesFile, 'utf8').trim().split('\n');
        this.data.trades = lines
            .filter(line => line.trim())
            .map(line => JSON.parse(line))
            .filter(trade => trade.status === 'CLOSED')
            .sort((a, b) => a.exitTime - b.exitTime);
        
        // Filtrer par fenêtre d'analyse
        const cutoffDate = Date.now() - (this.config.analysisWindow * 24 * 60 * 60 * 1000);
        this.data.trades = this.data.trades.filter(trade => trade.exitTime >= cutoffDate);
    }

    // Chargement des données de portefeuille
    async loadPortfolioData() {
        const performanceFile = path.join(this.config.dataPath, 'trading', 'performance.json');
        
        if (fs.existsSync(performanceFile)) {
            const data = fs.readFileSync(performanceFile, 'utf8');
            const portfolioData = JSON.parse(data);
            
            // Reconstruction de l'historique de valeur du portefeuille
            let currentValue = 10000; // Capital initial
            
            this.data.trades.forEach(trade => {
                currentValue += trade.pnl || 0;
                this.data.portfolioValue.push({
                    timestamp: trade.exitTime,
                    value: currentValue
                });
            });
        }
    }

    // Calcul des rendements quotidiens
    calculateDailyReturns() {
        if (this.data.trades.length === 0) return;
        
        // Grouper les trades par jour
        const tradesByDay = {};
        this.data.trades.forEach(trade => {
            const day = new Date(trade.exitTime).toISOString().split('T')[0];
            if (!tradesByDay[day]) {
                tradesByDay[day] = [];
            }
            tradesByDay[day].push(trade);
        });
        
        // Calculer le rendement quotidien
        let cumulativeCapital = 10000;
        
        Object.keys(tradesByDay).sort().forEach(day => {
            const dayTrades = tradesByDay[day];
            const dayPnL = dayTrades.reduce((sum, trade) => sum + (trade.pnl || 0), 0);
            const dayReturn = (dayPnL / cumulativeCapital);
            
            this.data.dailyReturns.push({
                date: day,
                return: dayReturn,
                returnPercent: dayReturn * 100,
                pnl: dayPnL,
                trades: dayTrades.length,
                capitalBefore: cumulativeCapital,
                capitalAfter: cumulativeCapital + dayPnL
            });
            
            cumulativeCapital += dayPnL;
        });
    }

    // Calcul des drawdowns
    calculateDrawdowns() {
        if (this.data.portfolioValue.length === 0) return;
        
        let peak = this.data.portfolioValue[0].value;
        let peakTime = this.data.portfolioValue[0].timestamp;
        
        this.data.portfolioValue.forEach(point => {
            if (point.value > peak) {
                peak = point.value;
                peakTime = point.timestamp;
            }
            
            const drawdown = (peak - point.value) / peak;
            const drawdownPercent = drawdown * 100;
            
            this.data.drawdowns.push({
                timestamp: point.timestamp,
                portfolioValue: point.value,
                peak,
                drawdown: drawdownPercent,
                daysSincePeak: (point.timestamp - peakTime) / (24 * 60 * 60 * 1000)
            });
        });
    }

    // Analyse complète des performances
    async analyzePerformance() {
        console.log('🔍 Analyse des performances en cours...');
        
        await this.loadData();
        
        this.analyzeReturns();
        this.analyzeRisk();
        this.analyzeEfficiency();
        this.analyzeConsistency();
        this.analyzeTradingBehavior();
        this.generateRecommendations();
        
        console.log('✅ Analyse terminée');
        
        return this.analysis;
    }

    // Analyse des rendements
    analyzeReturns() {
        const trades = this.data.trades;
        const dailyReturns = this.data.dailyReturns;
        
        if (trades.length === 0) {
            this.analysis.performance = { insufficient_data: true };
            return;
        }
        
        // Métriques de base
        const totalReturn = trades.reduce((sum, trade) => sum + (trade.pnl || 0), 0);
        const totalReturnPercent = (totalReturn / 10000) * 100;
        
        const winningTrades = trades.filter(t => (t.pnl || 0) > 0);
        const losingTrades = trades.filter(t => (t.pnl || 0) < 0);
        
        const winRate = (winningTrades.length / trades.length) * 100;
        const avgWin = winningTrades.length > 0 ? 
            winningTrades.reduce((sum, t) => sum + (t.pnlPercent || 0), 0) / winningTrades.length : 0;
        const avgLoss = losingTrades.length > 0 ?
            Math.abs(losingTrades.reduce((sum, t) => sum + (t.pnlPercent || 0), 0) / losingTrades.length) : 0;
        
        // Rendements annualisés
        const daysTrading = this.data.dailyReturns.length;
        const annualizedReturn = daysTrading > 0 ? 
            (Math.pow(1 + totalReturn / 10000, 365 / daysTrading) - 1) * 100 : 0;
        
        // Rendement quotidien moyen
        const avgDailyReturn = dailyReturns.length > 0 ?
            dailyReturns.reduce((sum, day) => sum + day.returnPercent, 0) / dailyReturns.length : 0;
        
        this.analysis.performance = {
            totalTrades: trades.length,
            totalReturn,
            totalReturnPercent,
            annualizedReturn,
            avgDailyReturn,
            winRate,
            avgWin,
            avgLoss,
            profitFactor: avgLoss > 0 ? avgWin / avgLoss : 0,
            expectancy: (avgWin * winningTrades.length - avgLoss * losingTrades.length) / trades.length,
            tradingDays: daysTrading,
            avgTradesPerDay: daysTrading > 0 ? trades.length / daysTrading : 0
        };
    }

    // Analyse des risques
    analyzeRisk() {
        const dailyReturns = this.data.dailyReturns;
        const drawdowns = this.data.drawdowns;
        
        if (dailyReturns.length === 0) {
            this.analysis.risk = { insufficient_data: true };
            return;
        }
        
        // Volatilité
        const returns = dailyReturns.map(day => day.return);
        const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
        const dailyVolatility = Math.sqrt(variance);
        const annualizedVolatility = dailyVolatility * Math.sqrt(252) * 100;
        
        // Drawdown maximum
        const maxDrawdown = Math.max(...drawdowns.map(d => d.drawdown));
        const maxDrawdownDuration = Math.max(...drawdowns.map(d => d.daysSincePeak));
        
        // VaR (Value at Risk) 95%
        const sortedReturns = [...returns].sort((a, b) => a - b);
        const var95Index = Math.floor(returns.length * 0.05);
        const var95 = sortedReturns[var95Index] * 100;
        
        // Ratio de Sharpe
        const excessReturn = avgReturn - (this.config.riskFreeRate / 252);
        const sharpeRatio = dailyVolatility > 0 ? (excessReturn / dailyVolatility) * Math.sqrt(252) : 0;
        
        // Ratio de Sortino
        const downside = returns.filter(r => r < 0);
        const downsideDeviation = downside.length > 0 ? 
            Math.sqrt(downside.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downside.length) : 0;
        const sortinoRatio = downsideDeviation > 0 ? (excessReturn / downsideDeviation) * Math.sqrt(252) : 0;
        
        // Ratio de Calmar
        const calmarRatio = maxDrawdown > 0 ? 
            (this.analysis.performance.annualizedReturn / maxDrawdown) : 0;
        
        this.analysis.risk = {
            dailyVolatility: dailyVolatility * 100,
            annualizedVolatility,
            maxDrawdown,
            maxDrawdownDuration,
            var95,
            sharpeRatio,
            sortinoRatio,
            calmarRatio,
            riskAdjustedReturn: sharpeRatio * annualizedVolatility
        };
    }

    // Analyse de l'efficacité
    analyzeEfficiency() {
        const trades = this.data.trades;
        
        if (trades.length === 0) {
            this.analysis.efficiency = { insufficient_data: true };
            return;
        }
        
        // Durée moyenne des trades
        const tradeDurations = trades
            .filter(t => t.duration)
            .map(t => t.duration / (1000 * 60 * 60)); // en heures
        
        const avgTradeDuration = tradeDurations.length > 0 ?
            tradeDurations.reduce((sum, d) => sum + d, 0) / tradeDurations.length : 0;
        
        // Analyse par symbole
        const symbolStats = {};
        trades.forEach(trade => {
            const symbol = trade.symbol;
            if (!symbolStats[symbol]) {
                symbolStats[symbol] = {
                    trades: 0,
                    totalPnL: 0,
                    wins: 0,
                    losses: 0
                };
            }
            
            symbolStats[symbol].trades++;
            symbolStats[symbol].totalPnL += trade.pnl || 0;
            if ((trade.pnl || 0) > 0) {
                symbolStats[symbol].wins++;
            } else {
                symbolStats[symbol].losses++;
            }
        });
        
        // Meilleur et pire symbole
        const bestSymbol = Object.entries(symbolStats)
            .sort((a, b) => b[1].totalPnL - a[1].totalPnL)[0];
        const worstSymbol = Object.entries(symbolStats)
            .sort((a, b) => a[1].totalPnL - b[1].totalPnL)[0];
        
        // Analyse temporelle
        const hourlyStats = {};
        trades.forEach(trade => {
            const hour = new Date(trade.exitTime).getHours();
            if (!hourlyStats[hour]) {
                hourlyStats[hour] = { trades: 0, totalPnL: 0 };
            }
            hourlyStats[hour].trades++;
            hourlyStats[hour].totalPnL += trade.pnl || 0;
        });
        
        const bestHour = Object.entries(hourlyStats)
            .sort((a, b) => b[1].totalPnL - a[1].totalPnL)[0];
        
        this.analysis.efficiency = {
            avgTradeDuration,
            symbolStats,
            bestSymbol: bestSymbol ? {
                symbol: bestSymbol[0],
                ...bestSymbol[1],
                winRate: (bestSymbol[1].wins / bestSymbol[1].trades) * 100
            } : null,
            worstSymbol: worstSymbol ? {
                symbol: worstSymbol[0],
                ...worstSymbol[1],
                winRate: (worstSymbol[1].wins / worstSymbol[1].trades) * 100
            } : null,
            bestTradingHour: bestHour ? {
                hour: parseInt(bestHour[0]),
                ...bestHour[1]
            } : null,
            totalSymbols: Object.keys(symbolStats).length
        };
    }

    // Analyse de la consistance
    analyzeConsistency() {
        const dailyReturns = this.data.dailyReturns;
        
        if (dailyReturns.length === 0) {
            this.analysis.consistency = { insufficient_data: true };
            return;
        }
        
        // Jours gagnants vs perdants
        const profitableDays = dailyReturns.filter(day => day.returnPercent > 0).length;
        const breakEvenDays = dailyReturns.filter(day => day.returnPercent === 0).length;
        const losingDays = dailyReturns.filter(day => day.returnPercent < 0).length;
        
        const profitableDaysPercent = (profitableDays / dailyReturns.length) * 100;
        
        // Plus longue série de gains/pertes
        let currentWinStreak = 0;
        let currentLossStreak = 0;
        let maxWinStreak = 0;
        let maxLossStreak = 0;
        
        dailyReturns.forEach(day => {
            if (day.returnPercent > 0) {
                currentWinStreak++;
                currentLossStreak = 0;
                maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
            } else if (day.returnPercent < 0) {
                currentLossStreak++;
                currentWinStreak = 0;
                maxLossStreak = Math.max(maxLossStreak, currentLossStreak);
            } else {
                currentWinStreak = 0;
                currentLossStreak = 0;
            }
        });
        
        // Analyse mensuelle
        const monthlyReturns = {};
        dailyReturns.forEach(day => {
            const month = day.date.substring(0, 7); // YYYY-MM
            if (!monthlyReturns[month]) {
                monthlyReturns[month] = { return: 0, days: 0 };
            }
            monthlyReturns[month].return += day.returnPercent;
            monthlyReturns[month].days++;
        });
        
        const monthlyData = Object.values(monthlyReturns);
        const profitableMonths = monthlyData.filter(month => month.return > 0).length;
        const monthlyConsistency = monthlyData.length > 0 ? 
            (profitableMonths / monthlyData.length) * 100 : 0;
        
        this.analysis.consistency = {
            profitableDays,
            breakEvenDays,
            losingDays,
            profitableDaysPercent,
            maxWinStreak,
            maxLossStreak,
            monthlyConsistency,
            totalMonths: monthlyData.length,
            avgDailyReturn: dailyReturns.reduce((sum, day) => sum + day.returnPercent, 0) / dailyReturns.length,
            stdDevDailyReturn: this.calculateStandardDeviation(dailyReturns.map(day => day.returnPercent))
        };
    }

    // Analyse du comportement de trading
    analyzeTradingBehavior() {
        const trades = this.data.trades;
        
        if (trades.length === 0) return;
        
        // Analyse des raisons de sortie
        const exitReasons = {};
        trades.forEach(trade => {
            const reason = trade.reason || 'UNKNOWN';
            exitReasons[reason] = (exitReasons[reason] || 0) + 1;
        });
        
        // Analyse des tailles de position
        const positionSizes = trades
            .filter(t => t.positionSize)
            .map(t => t.positionSize);
        
        const avgPositionSize = positionSizes.length > 0 ?
            positionSizes.reduce((sum, size) => sum + size, 0) / positionSizes.length : 0;
        
        // Analyse des spreads d'entrée/sortie
        const spreads = trades
            .filter(t => t.entryPrice && t.exitPrice)
            .map(t => Math.abs((t.exitPrice - t.entryPrice) / t.entryPrice) * 100);
        
        const avgSpread = spreads.length > 0 ?
            spreads.reduce((sum, spread) => sum + spread, 0) / spreads.length : 0;
        
        // Trades par direction
        const buyTrades = trades.filter(t => t.direction === 'BUY').length;
        const sellTrades = trades.filter(t => t.direction === 'SELL').length;
        
        this.analysis.tradingBehavior = {
            exitReasons,
            avgPositionSize,
            avgSpread,
            buyTrades,
            sellTrades,
            buyVsSellRatio: sellTrades > 0 ? buyTrades / sellTrades : buyTrades,
            avgConfidence: trades
                .filter(t => t.confidence)
                .reduce((sum, t, _, arr) => sum + t.confidence / arr.length, 0) || 0
        };
    }

    // Génération des recommandations
    generateRecommendations() {
        const recommendations = [];
        const perf = this.analysis.performance;
        const risk = this.analysis.risk;
        const efficiency = this.analysis.efficiency;
        const consistency = this.analysis.consistency;
        
        // Recommandations sur les performances
        if (perf.annualizedReturn < 10) {
            recommendations.push({
                type: 'PERFORMANCE',
                severity: 'HIGH',
                title: 'Rendement Insuffisant',
                description: `Rendement annualisé de ${perf.annualizedReturn.toFixed(1)}% en dessous de l'objectif de 10%`,
                suggestions: [
                    'Réviser la stratégie d\'entrée/sortie',
                    'Optimiser les paramètres de trading',
                    'Considérer l\'ajout de nouveaux indicateurs'
                ]
            });
        }
        
        if (perf.winRate < 45) {
            recommendations.push({
                type: 'PERFORMANCE',
                severity: 'MEDIUM',
                title: 'Taux de Réussite Faible',
                description: `Taux de réussite de ${perf.winRate.toFixed(1)}% en dessous de 45%`,
                suggestions: [
                    'Améliorer la précision des signaux d\'entrée',
                    'Revoir les conditions de filtrage',
                    'Analyser les trades perdants pour identifier les patterns'
                ]
            });
        }
        
        // Recommandations sur les risques
        if (risk.maxDrawdown > this.config.maxAcceptableDrawdown * 100) {
            recommendations.push({
                type: 'RISK',
                severity: 'HIGH',
                title: 'Drawdown Excessif',
                description: `Drawdown maximum de ${risk.maxDrawdown.toFixed(1)}% dépasse la limite de ${this.config.maxAcceptableDrawdown * 100}%`,
                suggestions: [
                    'Renforcer la gestion des risques',
                    'Réduire la taille des positions',
                    'Implémenter des stop-loss plus stricts'
                ]
            });
        }
        
        if (risk.sharpeRatio < this.config.targetSharpeRatio) {
            recommendations.push({
                type: 'RISK',
                severity: 'MEDIUM',
                title: 'Ratio de Sharpe Insuffisant',
                description: `Ratio de Sharpe de ${risk.sharpeRatio.toFixed(2)} en dessous de ${this.config.targetSharpeRatio}`,
                suggestions: [
                    'Améliorer le ratio rendement/risque',
                    'Réduire la volatilité des trades',
                    'Optimiser les sorties de positions'
                ]
            });
        }
        
        // Recommandations sur l\'efficacité
        if (efficiency.avgTradeDuration > 24) {
            recommendations.push({
                type: 'EFFICIENCY',
                severity: 'LOW',
                title: 'Durée de Trade Élevée',
                description: `Durée moyenne de ${efficiency.avgTradeDuration.toFixed(1)}h par trade`,
                suggestions: [
                    'Considérer des sorties plus rapides',
                    'Implémenter des trailing stops',
                    'Revoir les conditions de take-profit'
                ]
            });
        }
        
        if (perf.avgTradesPerDay < 0.5) {
            recommendations.push({
                type: 'EFFICIENCY',
                severity: 'MEDIUM',
                title: 'Fréquence de Trading Faible',
                description: `Seulement ${perf.avgTradesPerDay.toFixed(1)} trades par jour en moyenne`,
                suggestions: [
                    'Assouplir les conditions d\'entrée',
                    'Ajouter de nouveaux symboles',
                    'Optimiser la détection d\'opportunités'
                ]
            });
        }
        
        // Recommandations sur la consistance
        if (consistency.profitableDaysPercent < 60) {
            recommendations.push({
                type: 'CONSISTENCY',
                severity: 'MEDIUM',
                title: 'Consistance Quotidienne Faible',
                description: `Seulement ${consistency.profitableDaysPercent.toFixed(1)}% de jours profitables`,
                suggestions: [
                    'Améliorer la régularité des performances',
                    'Diversifier les stratégies',
                    'Réduire les variations quotidiennes'
                ]
            });
        }
        
        if (consistency.maxLossStreak > 5) {
            recommendations.push({
                type: 'CONSISTENCY',
                severity: 'HIGH',
                title: 'Série de Pertes Excessive',
                description: `Série maximale de ${consistency.maxLossStreak} jours perdants`,
                suggestions: [
                    'Implémenter un circuit breaker',
                    'Réviser la stratégie après 3 pertes consécutives',
                    'Analyser les conditions de marché des séries perdantes'
                ]
            });
        }
        
        // Recommandations positives
        if (perf.annualizedReturn > 15 && risk.maxDrawdown < 10) {
            recommendations.push({
                type: 'POSITIVE',
                severity: 'INFO',
                title: 'Performance Excellente',
                description: 'Bon équilibre rendement/risque atteint',
                suggestions: [
                    'Maintenir la stratégie actuelle',
                    'Considérer une augmentation graduelle du capital',
                    'Documenter les bonnes pratiques'
                ]
            });
        }
        
        this.analysis.recommendations = recommendations;
    }

    // Génération du rapport complet
    generateDetailedReport() {
        const report = {
            metadata: {
                generatedAt: new Date().toISOString(),
                analysisWindow: this.config.analysisWindow,
                dataPoints: {
                    trades: this.data.trades.length,
                    tradingDays: this.data.dailyReturns.length,
                    symbols: this.analysis.efficiency?.totalSymbols || 0
                }
            },
            
            executive_summary: {
                overall_rating: this.calculateOverallRating(),
                key_metrics: {
                    total_return: this.analysis.performance?.totalReturnPercent || 0,
                    annualized_return: this.analysis.performance?.annualizedReturn || 0,
                    max_drawdown: this.analysis.risk?.maxDrawdown || 0,
                    sharpe_ratio: this.analysis.risk?.sharpeRatio || 0,
                    win_rate: this.analysis.performance?.winRate || 0
                },
                critical_issues: this.analysis.recommendations
                    .filter(r => r.severity === 'HIGH').length,
                improvement_areas: this.analysis.recommendations
                    .filter(r => r.severity === 'MEDIUM').length
            },
            
            detailed_analysis: this.analysis,
            
            actionable_insights: this.generateActionableInsights(),
            
            optimization_suggestions: this.generateOptimizationSuggestions(),
            
            risk_assessment: this.generateRiskAssessment()
        };
        
        // Sauvegarde du rapport
        const reportPath = path.join(this.config.dataPath, 'performance_analysis', 
                                    `detailed_report_${Date.now()}.json`);
        
        const reportDir = path.dirname(reportPath);
        if (!fs.existsSync(reportDir)) {
            fs.mkdirSync(reportDir, { recursive: true });
        }
        
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        
        console.log(`📄 Rapport détaillé sauvegardé: ${reportPath}`);
        
        return report;
    }

    // Calcul de la note globale
    calculateOverallRating() {
        const perf = this.analysis.performance;
        const risk = this.analysis.risk;
        const consistency = this.analysis.consistency;
        
        let score = 0;
        let maxScore = 0;
        
        // Performance (40%)
        maxScore += 40;
        if (perf.annualizedReturn >= 15) score += 40;
        else if (perf.annualizedReturn >= 10) score += 30;
        else if (perf.annualizedReturn >= 5) score += 20;
        else if (perf.annualizedReturn >= 0) score += 10;
        
        // Risque (30%)
        maxScore += 30;
        if (risk.maxDrawdown <= 5) score += 30;
        else if (risk.maxDrawdown <= 10) score += 25;
        else if (risk.maxDrawdown <= 15) score += 20;
        else if (risk.maxDrawdown <= 20) score += 10;
        
        // Consistance (20%)
        maxScore += 20;
        if (consistency.profitableDaysPercent >= 70) score += 20;
        else if (consistency.profitableDaysPercent >= 60) score += 15;
        else if (consistency.profitableDaysPercent >= 50) score += 10;
        else if (consistency.profitableDaysPercent >= 40) score += 5;
        
        // Sharpe ratio (10%)
        maxScore += 10;
        if (risk.sharpeRatio >= 2) score += 10;
        else if (risk.sharpeRatio >= 1.5) score += 8;
        else if (risk.sharpeRatio >= 1) score += 5;
        else if (risk.sharpeRatio >= 0.5) score += 2;
        
        const finalScore = (score / maxScore) * 100;
        
        if (finalScore >= 85) return 'EXCELLENT';
        if (finalScore >= 70) return 'GOOD';
        if (finalScore >= 55) return 'AVERAGE';
        if (finalScore >= 40) return 'POOR';
        return 'VERY_POOR';
    }

    // Insights actionnables
    generateActionableInsights() {
        const insights = [];
        const perf = this.analysis.performance;
        const risk = this.analysis.risk;
        const efficiency = this.analysis.efficiency;
        
        // Insights basés sur les données
        if (efficiency.bestSymbol && efficiency.worstSymbol) {
            insights.push({
                category: 'Symbol Selection',
                insight: `${efficiency.bestSymbol.symbol} performe significativement mieux que ${efficiency.worstSymbol.symbol}`,
                action: `Considérer augmenter l'allocation sur ${efficiency.bestSymbol.symbol} et réduire ${efficiency.worstSymbol.symbol}`,
                impact: 'MEDIUM'
            });
        }
        
        if (efficiency.bestTradingHour) {
            insights.push({
                category: 'Timing',
                insight: `Meilleure performance à ${efficiency.bestTradingHour.hour}h`,
                action: 'Concentrer l\'activité de trading durant les heures les plus profitables',
                impact: 'LOW'
            });
        }
        
        if (perf.profitFactor < 1.5) {
            insights.push({
                category: 'Risk/Reward',
                insight: 'Ratio profit/perte insuffisant',
                action: 'Améliorer les take-profit ou réduire les stop-loss',
                impact: 'HIGH'
            });
        }
        
        return insights;
    }

    // Suggestions d'optimisation
    generateOptimizationSuggestions() {
        return [
            {
                parameter: 'Stop Loss',
                current: '1.5%',
                suggested: '1.2%',
                rationale: 'Réduire les pertes moyennes tout en maintenant la flexibilité'
            },
            {
                parameter: 'Take Profit',
                current: '0.5%',
                suggested: '0.6%',
                rationale: 'Améliorer le ratio risk/reward basé sur l\'analyse historique'
            },
            {
                parameter: 'Position Size',
                current: '5%',
                suggested: '4%',
                rationale: 'Réduire l\'exposition par trade pour limiter le drawdown'
            }
        ];
    }

    // Évaluation des risques
    generateRiskAssessment() {
        const risk = this.analysis.risk;
        
        return {
            overall_risk_level: risk.maxDrawdown > 15 ? 'HIGH' : 
                               risk.maxDrawdown > 10 ? 'MEDIUM' : 'LOW',
            
            key_risk_factors: [
                {
                    factor: 'Drawdown Risk',
                    level: risk.maxDrawdown > 15 ? 'HIGH' : 'MEDIUM',
                    description: `Maximum drawdown de ${risk.maxDrawdown?.toFixed(1)}%`
                },
                {
                    factor: 'Volatility Risk',
                    level: risk.annualizedVolatility > 30 ? 'HIGH' : 'MEDIUM',
                    description: `Volatilité annualisée de ${risk.annualizedVolatility?.toFixed(1)}%`
                }
            ],
            
            risk_mitigation_measures: [
                'Diversification accrue des actifs',
                'Implémentation de circuit breakers',
                'Surveillance continue des corrélations',
                'Stress testing régulier'
            ]
        };
    }

    // Méthodes utilitaires
    calculateStandardDeviation(values) {
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        return Math.sqrt(variance);
    }

    // Affichage du rapport en console
    displayConsoleReport() {
        const report = this.generateDetailedReport();
        
        console.log('\n📊 RAPPORT D\'ANALYSE DE PERFORMANCE');
        console.log('═'.repeat(60));
        
        console.log(`\n🎯 RÉSUMÉ EXÉCUTIF:`);
        console.log(`   Note globale: ${report.executive_summary.overall_rating}`);
        console.log(`   Rendement total: ${report.executive_summary.key_metrics.total_return.toFixed(2)}%`);
        console.log(`   Rendement annualisé: ${report.executive_summary.key_metrics.annualized_return.toFixed(1)}%`);
        console.log(`   Drawdown max: ${report.executive_summary.key_metrics.max_drawdown.toFixed(1)}%`);
        console.log(`   Ratio de Sharpe: ${report.executive_summary.key_metrics.sharpe_ratio.toFixed(2)}`);
        console.log(`   Taux de réussite: ${report.executive_summary.key_metrics.win_rate.toFixed(1)}%`);
        
        console.log(`\n🚨 PROBLÈMES CRITIQUES: ${report.executive_summary.critical_issues}`);
        console.log(`⚠️  AMÉLIORATIONS POSSIBLES: ${report.executive_summary.improvement_areas}`);
        
        if (this.analysis.recommendations.length > 0) {
            console.log('\n📋 RECOMMANDATIONS PRINCIPALES:');
            this.analysis.recommendations
                .filter(r => r.severity === 'HIGH')
                .slice(0, 3)
                .forEach((rec, index) => {
                    console.log(`   ${index + 1}. ${rec.title}: ${rec.description}`);
                });
        }
        
        return report;
    }
}

// Export et utilisation
if (require.main === module) {
    async function runPerformanceAnalysis() {
        console.log('🔍 ANALYSE DE PERFORMANCE AVANCÉE');
        console.log('═'.repeat(50));
        
        const analyzer = new PerformanceAnalyzer({
            dataPath: './logs',
            analysisWindow: 30
        });
        
        try {
            await analyzer.analyzePerformance();
            const report = analyzer.displayConsoleReport();
            
            console.log('\n✅ Analyse terminée avec succès');
            
        } catch (error) {
            console.error('\n❌ Erreur durant l\'analyse:', error.message);
        }
    }
    
    runPerformanceAnalysis().catch(console.error);
}

module.exports = PerformanceAnalyzer;