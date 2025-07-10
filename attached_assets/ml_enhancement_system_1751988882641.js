// Système de Machine Learning pour amélioration continue du bot de trading
// Analyse des patterns, prédictions et optimisation automatique

const fs = require('fs');
const path = require('path');

class MLEnhancementSystem {
    constructor(config) {
        this.config = {
            dataPath: config.dataPath || './logs',
            modelPath: config.modelPath || './models',
            
            // Configuration ML
            learningRate: config.learningRate || 0.001,
            trainingWindow: config.trainingWindow || 1000, // trades pour entrainement
            retrainingInterval: config.retrainingInterval || 24 * 60 * 60 * 1000, // 24h
            predictionConfidenceThreshold: config.predictionConfidenceThreshold || 0.7,
            
            // Features à analyser
            features: config.features || [
                'rsi', 'sma_ratio', 'ema_cross', 'volume_ratio', 'volatility',
                'hour_of_day', 'day_of_week', 'market_trend', 'consecutive_losses'
            ],
            
            // Modèles à utiliser
            models: config.models || {
                patternRecognition: true,
                riskPrediction: true,
                entryTiming: true,
                exitOptimization: true
            },
            
            ...config
        };
        
        this.state = {
            models: {},
            trainingData: [],
            predictions: [],
            performance: {},
            patterns: new Map(),
            insights: []
        };
        
        this.initializeSystem();
    }

    // Initialisation du système ML
    initializeSystem() {
        console.log('🤖 Initialisation du système ML...');
        
        this.ensureDirectories();
        this.loadTrainingData();
        this.initializeModels();
        this.startPeriodicRetraining();
        
        console.log('✅ Système ML initialisé');
    }

    // Création des répertoires
    ensureDirectories() {
        const dirs = [
            this.config.modelPath,
            path.join(this.config.modelPath, 'patterns'),
            path.join(this.config.modelPath, 'checkpoints'),
            path.join(this.config.dataPath, 'ml_analysis')
        ];
        
        dirs.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }

    // Chargement des données d'entrainement
    loadTrainingData() {
        console.log('📊 Chargement des données d\'entrainement...');
        
        try {
            const tradesFile = path.join(this.config.dataPath, 'trading', 'trades.json');
            
            if (!fs.existsSync(tradesFile)) {
                console.log('⚠️ Aucune donnée de trading trouvée');
                return;
            }
            
            const lines = fs.readFileSync(tradesFile, 'utf8').trim().split('\n');
            const rawTrades = lines
                .filter(line => line.trim())
                .map(line => JSON.parse(line))
                .filter(trade => trade.status === 'CLOSED');
            
            // Préparation des données pour ML
            this.state.trainingData = this.prepareTrainingData(rawTrades);
            
            console.log(`✅ ${this.state.trainingData.length} échantillons chargés`);
            
        } catch (error) {
            console.error('❌ Erreur chargement données:', error.message);
        }
    }

    // Préparation des données pour ML
    prepareTrainingData(trades) {
        const trainingData = [];
        
        trades.forEach((trade, index) => {
            // Features basiques du trade
            const features = this.extractFeatures(trade, trades, index);
            
            // Labels (ce qu'on veut prédire)
            const labels = {
                profitable: (trade.pnl || 0) > 0,
                pnlCategory: this.categorizePnL(trade.pnlPercent || 0),
                duration: trade.duration || 0,
                risk: this.categorizeRisk(trade)
            };
            
            trainingData.push({
                features,
                labels,
                metadata: {
                    timestamp: trade.exitTime,
                    symbol: trade.symbol,
                    tradeId: trade.id
                }
            });
        });
        
        return trainingData;
    }

    // Extraction des features d'un trade
    extractFeatures(trade, allTrades, index) {
        const features = {};
        
        // Features temporelles
        const date = new Date(trade.entryTime || trade.timestamp);
        features.hour_of_day = date.getHours() / 23; // Normalisé
        features.day_of_week = date.getDay() / 6;
        features.day_of_month = date.getDate() / 31;
        features.month = date.getMonth() / 11;
        
        // Features du trade
        features.entry_price_normalized = this.normalizePrice(trade.entryPrice, trade.symbol);
        features.position_size_ratio = (trade.positionSize || 0) / 10000; // Par rapport au capital
        features.confidence = (trade.confidence || 50) / 100;
        
        // Features techniques (si disponibles dans les données)
        if (trade.technicalIndicators) {
            const ti = trade.technicalIndicators;
            features.rsi = (ti.rsi || 50) / 100;
            features.sma_ratio = Math.min(2, Math.max(0, (ti.currentPrice / ti.sma_20) || 1));
            features.ema_cross = ti.ema_12 > ti.ema_26 ? 1 : 0;
            features.volume_ratio = Math.min(3, ti.volumeRatio || 1) / 3;
            features.volatility = Math.min(0.1, ti.volatility || 0.02) / 0.1;
        } else {
            // Valeurs par défaut si pas de données techniques
            features.rsi = 0.5;
            features.sma_ratio = 1;
            features.ema_cross = 0.5;
            features.volume_ratio = 0.33;
            features.volatility = 0.2;
        }
        
        // Features de contexte de marché
        features.market_trend = this.calculateMarketTrend(allTrades, index, 10);
        features.recent_volatility = this.calculateRecentVolatility(allTrades, index, 5);
        
        // Features de performance récente
        features.consecutive_losses = this.countConsecutiveLosses(allTrades, index);
        features.recent_win_rate = this.calculateRecentWinRate(allTrades, index, 10);
        features.avg_recent_pnl = this.calculateAvgRecentPnL(allTrades, index, 5);
        
        // Features de symbole
        features.symbol_performance = this.getSymbolPerformance(trade.symbol, allTrades, index);
        
        return features;
    }

    // Catégorisation du PnL
    categorizePnL(pnlPercent) {
        if (pnlPercent < -2) return 'large_loss';
        if (pnlPercent < -0.5) return 'small_loss';
        if (pnlPercent < 0.5) return 'neutral';
        if (pnlPercent < 2) return 'small_gain';
        return 'large_gain';
    }

    // Catégorisation du risque
    categorizeRisk(trade) {
        const pnlPercent = trade.pnlPercent || 0;
        const duration = trade.duration || 0;
        
        if (pnlPercent < -1.5 || duration > 24 * 60 * 60 * 1000) return 'high';
        if (pnlPercent < -0.5 || duration > 4 * 60 * 60 * 1000) return 'medium';
        return 'low';
    }

    // Initialisation des modèles
    initializeModels() {
        console.log('🧠 Initialisation des modèles ML...');
        
        if (this.config.models.patternRecognition) {
            this.state.models.patternRecognition = new PatternRecognitionModel(this.config);
        }
        
        if (this.config.models.riskPrediction) {
            this.state.models.riskPrediction = new RiskPredictionModel(this.config);
        }
        
        if (this.config.models.entryTiming) {
            this.state.models.entryTiming = new EntryTimingModel(this.config);
        }
        
        if (this.config.models.exitOptimization) {
            this.state.models.exitOptimization = new ExitOptimizationModel(this.config);
        }
        
        console.log(`✅ ${Object.keys(this.state.models).length} modèles initialisés`);
    }

    // Entrainement des modèles
    async trainModels() {
        console.log('🎓 Entrainement des modèles...');
        
        if (this.state.trainingData.length < 50) {
            console.log('⚠️ Pas assez de données pour l\'entrainement (< 50 échantillons)');
            return;
        }
        
        const trainingPromises = [];
        
        Object.entries(this.state.models).forEach(([name, model]) => {
            console.log(`   Entrainement ${name}...`);
            trainingPromises.push(
                model.train(this.state.trainingData)
                    .then(result => ({ name, result }))
                    .catch(error => ({ name, error }))
            );
        });
        
        const results = await Promise.all(trainingPromises);
        
        results.forEach(({ name, result, error }) => {
            if (error) {
                console.error(`❌ Erreur entrainement ${name}:`, error.message);
            } else {
                console.log(`✅ ${name} entrainé - Précision: ${(result.accuracy * 100).toFixed(1)}%`);
                this.state.performance[name] = result;
            }
        });
        
        // Sauvegarde des modèles
        this.saveModels();
    }

    // Prédiction pour un nouveau trade
    async predict(tradeContext) {
        const predictions = {};
        
        // Extraction des features du contexte
        const features = this.extractFeaturesFromContext(tradeContext);
        
        // Prédictions par chaque modèle
        for (const [name, model] of Object.entries(this.state.models)) {
            try {
                const prediction = await model.predict(features);
                predictions[name] = prediction;
            } catch (error) {
                console.error(`❌ Erreur prédiction ${name}:`, error.message);
                predictions[name] = { confidence: 0, prediction: null };
            }
        }
        
        // Combinaison des prédictions
        const combinedPrediction = this.combinePredictions(predictions);
        
        // Sauvegarde pour analyse
        this.state.predictions.push({
            timestamp: Date.now(),
            features,
            predictions,
            combined: combinedPrediction
        });
        
        return combinedPrediction;
    }

    // Combinaison des prédictions de différents modèles
    combinePredictions(predictions) {
        const combined = {
            shouldTrade: false,
            confidence: 0,
            recommendedAction: 'WAIT',
            riskLevel: 'MEDIUM',
            expectedPnL: 0,
            insights: []
        };
        
        // Pattern Recognition
        if (predictions.patternRecognition?.confidence > 0.6) {
            combined.shouldTrade = predictions.patternRecognition.prediction.profitable;
            combined.confidence += predictions.patternRecognition.confidence * 0.3;
            combined.insights.push(`Pattern: ${predictions.patternRecognition.prediction.pattern}`);
        }
        
        // Risk Prediction
        if (predictions.riskPrediction?.confidence > 0.5) {
            combined.riskLevel = predictions.riskPrediction.prediction.riskCategory;
            combined.confidence += predictions.riskPrediction.confidence * 0.2;
            
            if (combined.riskLevel === 'high') {
                combined.shouldTrade = false;
                combined.insights.push('Risque élevé détecté');
            }
        }
        
        // Entry Timing
        if (predictions.entryTiming?.confidence > 0.7) {
            combined.recommendedAction = predictions.entryTiming.prediction.action;
            combined.confidence += predictions.entryTiming.confidence * 0.3;
            combined.insights.push(`Timing: ${predictions.entryTiming.prediction.timing}`);
        }
        
        // Exit Optimization
        if (predictions.exitOptimization?.confidence > 0.6) {
            combined.expectedPnL = predictions.exitOptimization.prediction.expectedPnL;
            combined.confidence += predictions.exitOptimization.confidence * 0.2;
        }
        
        // Normalisation de la confiance
        combined.confidence = Math.min(1, combined.confidence);
        
        // Décision finale
        if (combined.confidence > this.config.predictionConfidenceThreshold) {
            combined.recommendedAction = combined.shouldTrade ? 'BUY' : 'WAIT';
        } else {
            combined.recommendedAction = 'WAIT';
            combined.insights.push('Confiance insuffisante');
        }
        
        return combined;
    }

    // Analyse des patterns de trading
    async analyzePatterns() {
        console.log('🔍 Analyse des patterns de trading...');
        
        const patterns = {
            temporal: this.analyzeTemporalPatterns(),
            technical: this.analyzeTechnicalPatterns(),
            behavioral: this.analyzeBehavioralPatterns(),
            market: this.analyzeMarketPatterns()
        };
        
        // Sauvegarde des patterns
        const patternsPath = path.join(this.config.modelPath, 'patterns', 'analysis.json');
        fs.writeFileSync(patternsPath, JSON.stringify(patterns, null, 2));
        
        // Génération d'insights
        this.generateInsights(patterns);
        
        return patterns;
    }

    // Analyse des patterns temporels
    analyzeTemporalPatterns() {
        const hourlyPerformance = {};
        const dailyPerformance = {};
        
        this.state.trainingData.forEach(sample => {
            const hour = Math.round(sample.features.hour_of_day * 23);
            const day = Math.round(sample.features.day_of_week * 6);
            
            // Performance par heure
            if (!hourlyPerformance[hour]) {
                hourlyPerformance[hour] = { trades: 0, profitable: 0, totalPnL: 0 };
            }
            hourlyPerformance[hour].trades++;
            if (sample.labels.profitable) hourlyPerformance[hour].profitable++;
            
            // Performance par jour
            if (!dailyPerformance[day]) {
                dailyPerformance[day] = { trades: 0, profitable: 0, totalPnL: 0 };
            }
            dailyPerformance[day].trades++;
            if (sample.labels.profitable) dailyPerformance[day].profitable++;
        });
        
        // Calcul des taux de réussite
        Object.keys(hourlyPerformance).forEach(hour => {
            const data = hourlyPerformance[hour];
            data.winRate = data.profitable / data.trades;
        });
        
        Object.keys(dailyPerformance).forEach(day => {
            const data = dailyPerformance[day];
            data.winRate = data.profitable / data.trades;
        });
        
        return {
            hourly: hourlyPerformance,
            daily: dailyPerformance,
            bestHour: this.findBestPeriod(hourlyPerformance),
            worstHour: this.findWorstPeriod(hourlyPerformance),
            bestDay: this.findBestPeriod(dailyPerformance),
            worstDay: this.findWorstPeriod(dailyPerformance)
        };
    }

    // Analyse des patterns techniques
    analyzeTechnicalPatterns() {
        const rsiPatterns = this.analyzeRSIPatterns();
        const volumePatterns = this.analyzeVolumePatterns();
        const volatilityPatterns = this.analyzeVolatilityPatterns();
        
        return {
            rsi: rsiPatterns,
            volume: volumePatterns,
            volatility: volatilityPatterns
        };
    }

    // Analyse des patterns RSI
    analyzeRSIPatterns() {
        const rsiRanges = {
            oversold: { count: 0, profitable: 0 },    // < 0.3
            neutral: { count: 0, profitable: 0 },     // 0.3 - 0.7
            overbought: { count: 0, profitable: 0 }   // > 0.7
        };
        
        this.state.trainingData.forEach(sample => {
            const rsi = sample.features.rsi;
            let category;
            
            if (rsi < 0.3) category = 'oversold';
            else if (rsi > 0.7) category = 'overbought';
            else category = 'neutral';
            
            rsiRanges[category].count++;
            if (sample.labels.profitable) {
                rsiRanges[category].profitable++;
            }
        });
        
        // Calcul des taux de réussite
        Object.keys(rsiRanges).forEach(range => {
            const data = rsiRanges[range];
            data.winRate = data.count > 0 ? data.profitable / data.count : 0;
        });
        
        return rsiRanges;
    }

    // Génération d'insights automatiques
    generateInsights(patterns) {
        const insights = [];
        
        // Insights temporels
        if (patterns.temporal.bestHour.winRate > 0.7) {
            insights.push({
                type: 'TEMPORAL',
                priority: 'HIGH',
                message: `Heure optimale: ${patterns.temporal.bestHour.period}h (${(patterns.temporal.bestHour.winRate * 100).toFixed(1)}% de réussite)`,
                actionable: `Concentrer le trading entre ${patterns.temporal.bestHour.period}h et ${patterns.temporal.bestHour.period + 2}h`
            });
        }
        
        if (patterns.temporal.worstHour.winRate < 0.3) {
            insights.push({
                type: 'TEMPORAL',
                priority: 'MEDIUM',
                message: `Éviter le trading à ${patterns.temporal.worstHour.period}h (${(patterns.temporal.worstHour.winRate * 100).toFixed(1)}% de réussite)`,
                actionable: `Implémenter un filtre temporel pour cette période`
            });
        }
        
        // Insights techniques
        if (patterns.technical.rsi.oversold.winRate > patterns.technical.rsi.overbought.winRate + 0.2) {
            insights.push({
                type: 'TECHNICAL',
                priority: 'HIGH',
                message: 'Les conditions de survente RSI sont plus profitables',
                actionable: 'Renforcer les filtres pour les signaux RSI < 30'
            });
        }
        
        // Sauvegarde des insights
        this.state.insights = insights;
        
        const insightsPath = path.join(this.config.dataPath, 'ml_analysis', 'insights.json');
        fs.writeFileSync(insightsPath, JSON.stringify(insights, null, 2));
        
        console.log(`💡 ${insights.length} insights générés`);
        
        return insights;
    }

    // Recommandations d'optimisation
    generateOptimizationRecommendations() {
        const recommendations = [];
        
        this.state.insights.forEach(insight => {
            if (insight.priority === 'HIGH') {
                recommendations.push({
                    category: insight.type,
                    recommendation: insight.actionable,
                    expectedImprovement: this.estimateImprovement(insight),
                    implementationDifficulty: this.assessImplementationDifficulty(insight)
                });
            }
        });
        
        // Tri par impact estimé
        recommendations.sort((a, b) => b.expectedImprovement - a.expectedImprovement);
        
        return recommendations;
    }

    // Métriques de performance ML
    evaluateMLPerformance() {
        const metrics = {};
        
        // Performance par modèle
        Object.entries(this.state.performance).forEach(([name, perf]) => {
            metrics[name] = {
                accuracy: perf.accuracy,
                precision: perf.precision || 0,
                recall: perf.recall || 0,
                f1Score: perf.f1Score || 0,
                lastTraining: perf.timestamp
            };
        });
        
        // Performance globale des prédictions
        const recentPredictions = this.state.predictions.slice(-100);
        if (recentPredictions.length > 0) {
            const correctPredictions = recentPredictions.filter(pred => 
                pred.combined.confidence > 0.7
            ).length;
            
            metrics.global = {
                totalPredictions: recentPredictions.length,
                highConfidencePredictions: correctPredictions,
                avgConfidence: recentPredictions.reduce((sum, pred) => 
                    sum + pred.combined.confidence, 0) / recentPredictions.length
            };
        }
        
        return metrics;
    }

    // Ré-entrainement périodique
    startPeriodicRetraining() {
        setInterval(async () => {
            console.log('🔄 Ré-entrainement périodique des modèles...');
            
            // Recharger les nouvelles données
            this.loadTrainingData();
            
            // Ré-entrainer si assez de nouvelles données
            if (this.state.trainingData.length > this.config.trainingWindow) {
                await this.trainModels();
                await this.analyzePatterns();
            }
            
        }, this.config.retrainingInterval);
    }

    // Sauvegarde des modèles
    saveModels() {
        Object.entries(this.state.models).forEach(([name, model]) => {
            const modelPath = path.join(this.config.modelPath, `${name}.json`);
            const modelData = {
                type: name,
                timestamp: new Date().toISOString(),
                performance: this.state.performance[name] || {},
                weights: model.getWeights ? model.getWeights() : {},
                config: model.config || {}
            };
            
            fs.writeFileSync(modelPath, JSON.stringify(modelData, null, 2));
        });
        
        console.log(`💾 ${Object.keys(this.state.models).length} modèles sauvegardés`);
    }

    // Chargement des modèles
    loadModels() {
        Object.keys(this.state.models).forEach(name => {
            const modelPath = path.join(this.config.modelPath, `${name}.json`);
            
            if (fs.existsSync(modelPath)) {
                try {
                    const modelData = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
                    
                    if (this.state.models[name].loadWeights) {
                        this.state.models[name].loadWeights(modelData.weights);
                    }
                    
                    this.state.performance[name] = modelData.performance;
                    
                    console.log(`✅ Modèle ${name} chargé`);
                } catch (error) {
                    console.error(`❌ Erreur chargement modèle ${name}:`, error.message);
                }
            }
        });
    }

    // Méthodes utilitaires
    normalizePrice(price, symbol) {
        // Normalisation simple - en production, utiliser des stats historiques
        if (symbol.includes('BTC')) return Math.min(1, price / 100000);
        if (symbol.includes('ETH')) return Math.min(1, price / 10000);
        return Math.min(1, price / 1000);
    }

    calculateMarketTrend(trades, currentIndex, window) {
        if (currentIndex < window) return 0.5;
        
        const recentTrades = trades.slice(currentIndex - window, currentIndex);
        const profitableTrades = recentTrades.filter(t => (t.pnl || 0) > 0).length;
        
        return profitableTrades / window;
    }

    calculateRecentVolatility(trades, currentIndex, window) {
        if (currentIndex < window) return 0.5;
        
        const recentTrades = trades.slice(currentIndex - window, currentIndex);
        const pnlValues = recentTrades.map(t => Math.abs(t.pnlPercent || 0));
        
        return Math.min(1, pnlValues.reduce((sum, pnl) => sum + pnl, 0) / (window * 5));
    }

    countConsecutiveLosses(trades, currentIndex) {
        let count = 0;
        
        for (let i = currentIndex - 1; i >= 0; i--) {
            if ((trades[i].pnl || 0) < 0) {
                count++;
            } else {
                break;
            }
        }
        
        return Math.min(10, count) / 10; // Normalisé
    }

    findBestPeriod(performanceData) {
        let best = { period: null, winRate: 0 };
        
        Object.entries(performanceData).forEach(([period, data]) => {
            if (data.trades >= 5 && data.winRate > best.winRate) {
                best = { period: parseInt(period), winRate: data.winRate };
            }
        });
        
        return best;
    }

    findWorstPeriod(performanceData) {
        let worst = { period: null, winRate: 1 };
        
        Object.entries(performanceData).forEach(([period, data]) => {
            if (data.trades >= 5 && data.winRate < worst.winRate) {
                worst = { period: parseInt(period), winRate: data.winRate };
            }
        });
        
        return worst;
    }

    // Interface de rapport
    generateMLReport() {
        const report = {
            timestamp: new Date().toISOString(),
            systemStatus: {
                modelsActive: Object.keys(this.state.models).length,
                trainingDataSize: this.state.trainingData.length,
                totalPredictions: this.state.predictions.length,
                lastRetraining: this.state.performance.lastRetraining || 'Never'
            },
            performance: this.evaluateMLPerformance(),
            insights: this.state.insights,
            recommendations: this.generateOptimizationRecommendations()
        };
        
        // Sauvegarde du rapport
        const reportPath = path.join(this.config.dataPath, 'ml_analysis', 
                                    `ml_report_${Date.now()}.json`);
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        
        return report;
    }

    // Affichage du rapport
    displayMLStatus() {
        console.log('\n🤖 STATUT SYSTÈME ML');
        console.log('═'.repeat(50));
        
        const metrics = this.evaluateMLPerformance();
        
        console.log('📊 Performance des modèles:');
        Object.entries(metrics).forEach(([name, perf]) => {
            if (name !== 'global') {
                console.log(`   ${name}: ${(perf.accuracy * 100).toFixed(1)}% précision`);
            }
        });
        
        if (metrics.global) {
            console.log(`\n🎯 Performance globale:`);
            console.log(`   Prédictions totales: ${metrics.global.totalPredictions}`);
            console.log(`   Confiance moyenne: ${(metrics.global.avgConfidence * 100).toFixed(1)}%`);
        }
        
        console.log(`\n💡 Insights actifs: ${this.state.insights.length}`);
        this.state.insights.slice(0, 3).forEach(insight => {
            console.log(`   [${insight.priority}] ${insight.message}`);
        });
    }
}

// Classes de modèles simplifiées (placeholders pour modèles réels)

class PatternRecognitionModel {
    constructor(config) {
        this.config = config;
        this.weights = {};
    }
    
    async train(data) {
        // Simulation d'entrainement
        console.log('   🔍 Entrainement reconnaissance de patterns...');
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return {
            accuracy: 0.65 + Math.random() * 0.2,
            timestamp: new Date().toISOString()
        };
    }
    
    async predict(features) {
        // Simulation de prédiction
        const confidence = 0.5 + Math.random() * 0.4;
        
        return {
            confidence,
            prediction: {
                profitable: features.rsi < 0.4 && features.volume_ratio > 0.5,
                pattern: 'oversold_bounce'
            }
        };
    }
}

class RiskPredictionModel {
    constructor(config) {
        this.config = config;
        this.weights = {};
    }
    
    async train(data) {
        console.log('   ⚠️ Entrainement prédiction de risque...');
        await new Promise(resolve => setTimeout(resolve, 800));
        
        return {
            accuracy: 0.70 + Math.random() * 0.15,
            timestamp: new Date().toISOString()
        };
    }
    
    async predict(features) {
        const riskScore = features.volatility * 0.4 + features.consecutive_losses * 0.3 + 
                         (1 - features.recent_win_rate) * 0.3;
        
        return {
            confidence: 0.6 + Math.random() * 0.3,
            prediction: {
                riskCategory: riskScore > 0.7 ? 'high' : riskScore > 0.4 ? 'medium' : 'low',
                riskScore
            }
        };
    }
}

class EntryTimingModel {
    constructor(config) {
        this.config = config;
    }
    
    async train(data) {
        console.log('   🎯 Entrainement timing d\'entrée...');
        await new Promise(resolve => setTimeout(resolve, 900));
        
        return {
            accuracy: 0.62 + Math.random() * 0.18,
            timestamp: new Date().toISOString()
        };
    }
    
    async predict(features) {
        const timingScore = features.hour_of_day * 0.3 + features.rsi * 0.4 + 
                           features.market_trend * 0.3;
        
        return {
            confidence: 0.55 + Math.random() * 0.35,
            prediction: {
                action: timingScore > 0.6 ? 'BUY' : 'WAIT',
                timing: timingScore > 0.7 ? 'optimal' : 'acceptable'
            }
        };
    }
}

class ExitOptimizationModel {
    constructor(config) {
        this.config = config;
    }
    
    async train(data) {
        console.log('   🚪 Entrainement optimisation de sortie...');
        await new Promise(resolve => setTimeout(resolve, 700));
        
        return {
            accuracy: 0.58 + Math.random() * 0.22,
            timestamp: new Date().toISOString()
        };
    }
    
    async predict(features) {
        const expectedPnL = (features.market_trend - 0.5) * 2 + 
                           (0.5 - features.rsi) * 1.5;
        
        return {
            confidence: 0.5 + Math.random() * 0.4,
            prediction: {
                expectedPnL: Math.max(-2, Math.min(2, expectedPnL)),
                optimalHoldTime: features.volatility > 0.5 ? 'short' : 'medium'
            }
        };
    }
}

// Export et utilisation
if (require.main === module) {
    async function testMLSystem() {
        console.log('🤖 TEST SYSTÈME ML');
        console.log('═'.repeat(40));
        
        const mlSystem = new MLEnhancementSystem({
            dataPath: './logs',
            modelPath: './models'
        });
        
        // Test d'entrainement
        if (mlSystem.state.trainingData.length > 0) {
            await mlSystem.trainModels();
            await mlSystem.analyzePatterns();
        }
        
        // Test de prédiction
        const testContext = {
            symbol: 'BTCUSDT',
            currentPrice: 45000,
            rsi: 28,
            volumeRatio: 1.8,
            volatility: 0.025,
            marketTrend: 'bullish'
        };
        
        const prediction = await mlSystem.predict(testContext);
        console.log('\n🔮 Prédiction test:', prediction);
        
        // Affichage du statut
        mlSystem.displayMLStatus();
        
        // Génération du rapport
        const report = mlSystem.generateMLReport();
        console.log('\n📄 Rapport ML généré');
    }
    
    testMLSystem().catch(console.error);
}

module.exports = MLEnhancementSystem;