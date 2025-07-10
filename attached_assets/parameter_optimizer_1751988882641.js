// Optimiseur de paramètres automatisé pour bot de trading
// Utilise des algorithmes génétiques et grid search pour optimiser la performance

const fs = require('fs');
const path = require('path');

class ParameterOptimizer {
    constructor(config) {
        this.config = {
            // Algorithme d'optimisation
            algorithm: config.algorithm || 'genetic', // 'genetic', 'grid', 'random'
            
            // Paramètres génétiques
            populationSize: config.populationSize || 50,
            generations: config.generations || 20,
            mutationRate: config.mutationRate || 0.1,
            crossoverRate: config.crossoverRate || 0.8,
            elitismRate: config.elitismRate || 0.1,
            
            // Paramètres de backtesting
            backtestPeriod: config.backtestPeriod || 180, // jours
            validationPeriod: config.validationPeriod || 60, // jours
            
            // Objectifs d'optimisation
            objectives: config.objectives || {
                returnWeight: 0.4,
                sharpeWeight: 0.3,
                drawdownWeight: 0.2,
                consistencyWeight: 0.1
            },
            
            // Contraintes
            constraints: config.constraints || {
                maxDrawdown: 0.20, // 20%
                minSharpe: 0.5,
                minWinRate: 0.35,
                minTrades: 50
            },
            
            // Parallélisation
            maxWorkers: config.maxWorkers || 4,
            
            ...config
        };
        
        this.parameterSpace = this.defineParameterSpace();
        this.results = {
            generations: [],
            bestParameters: null,
            optimizationHistory: [],
            validationResults: null
        };
        
        console.log(`🔧 Optimiseur initialisé: ${this.config.algorithm} sur ${this.config.backtestPeriod} jours`);
    }

    // Définition de l'espace des paramètres à optimiser
    defineParameterSpace() {
        return {
            // Gestion des risques
            stopLossPercent: {
                min: 0.005,  // 0.5%
                max: 0.025,  // 2.5%
                step: 0.0025,
                type: 'float',
                current: 0.015
            },
            
            // Objectifs de profit
            dailyTargetMin: {
                min: 0.001,  // 0.1%
                max: 0.008,  // 0.8%
                step: 0.0005,
                type: 'float',
                current: 0.003
            },
            
            dailyTargetMax: {
                min: 0.003,  // 0.3%
                max: 0.012,  // 1.2%
                step: 0.0005,
                type: 'float',
                current: 0.005
            },
            
            // Taille de position
            maxPositionPercent: {
                min: 0.02,   // 2%
                max: 0.10,   // 10%
                step: 0.005,
                type: 'float',
                current: 0.05
            },
            
            // Indicateurs techniques
            rsiPeriod: {
                min: 7,
                max: 21,
                step: 1,
                type: 'int',
                current: 14
            },
            
            rsiOversold: {
                min: 20,
                max: 40,
                step: 2,
                type: 'int',
                current: 30
            },
            
            rsiOverbought: {
                min: 60,
                max: 80,
                step: 2,
                type: 'int',
                current: 70
            },
            
            smaPeriod: {
                min: 10,
                max: 50,
                step: 2,
                type: 'int',
                current: 20
            },
            
            emaPeriodShort: {
                min: 5,
                max: 15,
                step: 1,
                type: 'int',
                current: 12
            },
            
            emaPeriodLong: {
                min: 20,
                max: 35,
                step: 1,
                type: 'int',
                current: 26
            },
            
            // Filtres de volatilité
            minVolatility: {
                min: 0.005,  // 0.5%
                max: 0.020,  // 2%
                step: 0.0025,
                type: 'float',
                current: 0.01
            },
            
            maxVolatility: {
                min: 0.030,  // 3%
                max: 0.080,  // 8%
                step: 0.005,
                type: 'float',
                current: 0.05
            },
            
            // Filtres de volume
            minVolumeRatio: {
                min: 1.0,
                max: 2.0,
                step: 0.1,
                type: 'float',
                current: 1.3
            },
            
            // Limites de trading
            maxTradesPerDay: {
                min: 1,
                max: 8,
                step: 1,
                type: 'int',
                current: 3
            },
            
            maxConsecutiveLosses: {
                min: 2,
                max: 6,
                step: 1,
                type: 'int',
                current: 3
            },
            
            cooldownAfterLoss: {
                min: 1800000,   // 30 min
                max: 7200000,   // 2h
                step: 900000,   // 15 min
                type: 'int',
                current: 3600000 // 1h
            }
        };
    }

    // Génération d'un individu aléatoire (algorithme génétique)
    generateRandomIndividual() {
        const individual = {};
        
        Object.entries(this.parameterSpace).forEach(([param, config]) => {
            if (config.type === 'int') {
                const range = Math.floor((config.max - config.min) / config.step) + 1;
                individual[param] = config.min + (Math.floor(Math.random() * range) * config.step);
            } else if (config.type === 'float') {
                const range = Math.floor((config.max - config.min) / config.step) + 1;
                individual[param] = config.min + (Math.floor(Math.random() * range) * config.step);
                individual[param] = parseFloat(individual[param].toFixed(6));
            }
        });
        
        // Validation des contraintes
        this.validateIndividual(individual);
        
        return individual;
    }

    // Validation et correction d'un individu
    validateIndividual(individual) {
        // S'assurer que dailyTargetMax > dailyTargetMin
        if (individual.dailyTargetMax <= individual.dailyTargetMin) {
            individual.dailyTargetMax = individual.dailyTargetMin + 0.002;
        }
        
        // S'assurer que stopLoss > dailyTargetMax (ratio risk/reward)
        if (individual.stopLossPercent <= individual.dailyTargetMax) {
            individual.stopLossPercent = individual.dailyTargetMax * 1.5;
        }
        
        // EMA court < EMA long
        if (individual.emaPeriodShort >= individual.emaPeriodLong) {
            individual.emaPeriodLong = individual.emaPeriodShort + 5;
        }
        
        // Volatilité min < max
        if (individual.minVolatility >= individual.maxVolatility) {
            individual.maxVolatility = individual.minVolatility + 0.01;
        }
        
        // RSI oversold < overbought
        if (individual.rsiOversold >= individual.rsiOverbought) {
            individual.rsiOverbought = individual.rsiOversold + 20;
        }
    }

    // Croisement de deux individus
    crossover(parent1, parent2) {
        const child1 = {};
        const child2 = {};
        
        Object.keys(this.parameterSpace).forEach(param => {
            if (Math.random() < this.config.crossoverRate) {
                child1[param] = parent2[param];
                child2[param] = parent1[param];
            } else {
                child1[param] = parent1[param];
                child2[param] = parent2[param];
            }
        });
        
        this.validateIndividual(child1);
        this.validateIndividual(child2);
        
        return [child1, child2];
    }

    // Mutation d'un individu
    mutate(individual) {
        const mutated = { ...individual };
        
        Object.entries(this.parameterSpace).forEach(([param, config]) => {
            if (Math.random() < this.config.mutationRate) {
                if (config.type === 'int') {
                    const range = Math.floor((config.max - config.min) / config.step) + 1;
                    mutated[param] = config.min + (Math.floor(Math.random() * range) * config.step);
                } else if (config.type === 'float') {
                    const range = Math.floor((config.max - config.min) / config.step) + 1;
                    mutated[param] = config.min + (Math.floor(Math.random() * range) * config.step);
                    mutated[param] = parseFloat(mutated[param].toFixed(6));
                }
            }
        });
        
        this.validateIndividual(mutated);
        return mutated;
    }

    // Évaluation d'un ensemble de paramètres
    async evaluateParameters(parameters) {
        try {
            // Simulation du backtesting avec ces paramètres
            const backtestResults = await this.runBacktest(parameters);
            
            // Calcul du score composite
            const fitness = this.calculateFitness(backtestResults);
            
            return {
                parameters,
                results: backtestResults,
                fitness,
                valid: this.meetsConstraints(backtestResults)
            };
            
        } catch (error) {
            console.error('Erreur évaluation paramètres:', error.message);
            return {
                parameters,
                results: null,
                fitness: -1000, // Score très bas pour paramètres invalides
                valid: false
            };
        }
    }

    // Simulation de backtesting (version simplifiée)
    async runBacktest(parameters) {
        // Simulation d'un backtesting avec les paramètres donnés
        // En production, ceci ferait appel au vrai système de backtesting
        
        const baseResults = {
            totalTrades: Math.floor(50 + Math.random() * 100),
            winRate: 0.3 + Math.random() * 0.4, // 30-70%
            totalReturn: -0.1 + Math.random() * 0.4, // -10% à +30%
            maxDrawdown: Math.random() * 0.25, // 0-25%
            sharpeRatio: -0.5 + Math.random() * 3, // -0.5 à 2.5
            volatility: 0.1 + Math.random() * 0.3 // 10-40%
        };
        
        // Ajustements basés sur les paramètres (logique simplifiée)
        
        // Stop-loss plus petit améliore généralement le drawdown
        const stopLossBonus = (0.02 - parameters.stopLossPercent) * 5;
        baseResults.maxDrawdown = Math.max(0.01, baseResults.maxDrawdown + stopLossBonus);
        
        // Paramètres RSI plus stricts améliorent la précision
        const rsiRange = parameters.rsiOverbought - parameters.rsiOversold;
        const rsiBonus = (60 - rsiRange) * 0.003;
        baseResults.winRate = Math.min(0.8, Math.max(0.2, baseResults.winRate + rsiBonus));
        
        // Position size plus petite réduit la volatilité
        const positionBonus = (0.05 - parameters.maxPositionPercent) * 2;
        baseResults.volatility = Math.max(0.05, baseResults.volatility + positionBonus);
        
        // Recalcul du Sharpe basé sur volatilité ajustée
        baseResults.sharpeRatio = baseResults.totalReturn / Math.max(0.01, baseResults.volatility);
        
        // Ajout de métriques calculées
        baseResults.annualizedReturn = baseResults.totalReturn * (365 / this.config.backtestPeriod);
        baseResults.calmarRatio = baseResults.maxDrawdown > 0 ? 
            baseResults.annualizedReturn / baseResults.maxDrawdown : 0;
        
        baseResults.consistency = baseResults.winRate * 
            (1 - Math.min(0.5, baseResults.maxDrawdown / 0.1));
        
        // Simuler une latence de backtesting
        await this.sleep(100 + Math.random() * 200);
        
        return baseResults;
    }

    // Calcul du score de fitness
    calculateFitness(results) {
        if (!results || !this.meetsConstraints(results)) {
            return -1000;
        }
        
        const objectives = this.config.objectives;
        let score = 0;
        
        // Composante rendement (normalisée)
        const returnScore = Math.min(100, Math.max(0, 
            (results.annualizedReturn + 0.1) * 500)); // -10% = 0, +10% = 100
        score += returnScore * objectives.returnWeight;
        
        // Composante Sharpe
        const sharpeScore = Math.min(100, Math.max(0, 
            (results.sharpeRatio + 0.5) * 40)); // -0.5 = 0, 2 = 100
        score += sharpeScore * objectives.sharpeWeight;
        
        // Composante drawdown (inversée)
        const drawdownScore = Math.min(100, Math.max(0, 
            (0.25 - results.maxDrawdown) * 400)); // 25% = 0, 0% = 100
        score += drawdownScore * objectives.drawdownWeight;
        
        // Composante consistance
        const consistencyScore = results.consistency * 100;
        score += consistencyScore * objectives.consistencyWeight;
        
        // Bonus pour nombre de trades adéquat
        if (results.totalTrades >= 100 && results.totalTrades <= 300) {
            score += 10;
        }
        
        // Pénalité pour volatilité excessive
        if (results.volatility > 0.3) {
            score -= (results.volatility - 0.3) * 100;
        }
        
        return Math.round(score * 100) / 100;
    }

    // Vérification des contraintes
    meetsConstraints(results) {
        if (!results) return false;
        
        const constraints = this.config.constraints;
        
        return results.maxDrawdown <= constraints.maxDrawdown &&
               results.sharpeRatio >= constraints.minSharpe &&
               results.winRate >= constraints.minWinRate &&
               results.totalTrades >= constraints.minTrades;
    }

    // Optimisation par algorithme génétique
    async optimizeGenetic() {
        console.log('🧬 Démarrage optimisation génétique...');
        console.log(`Population: ${this.config.populationSize}, Générations: ${this.config.generations}`);
        
        // Génération de la population initiale
        let population = [];
        for (let i = 0; i < this.config.populationSize; i++) {
            const individual = this.generateRandomIndividual();
            const evaluation = await this.evaluateParameters(individual);
            population.push(evaluation);
            
            if ((i + 1) % 10 === 0) {
                console.log(`Évaluation initiale: ${i + 1}/${this.config.populationSize}`);
            }
        }
        
        // Évolution sur plusieurs générations
        for (let gen = 0; gen < this.config.generations; gen++) {
            console.log(`\n🔄 Génération ${gen + 1}/${this.config.generations}`);
            
            // Tri par fitness
            population.sort((a, b) => b.fitness - a.fitness);
            
            // Statistiques de la génération
            const bestFitness = population[0].fitness;
            const avgFitness = population.reduce((sum, ind) => sum + ind.fitness, 0) / population.length;
            const validIndividuals = population.filter(ind => ind.valid).length;
            
            console.log(`  Meilleur: ${bestFitness.toFixed(2)}, Moyenne: ${avgFitness.toFixed(2)}, Valides: ${validIndividuals}`);
            
            // Sauvegarde des résultats de génération
            this.results.generations.push({
                generation: gen + 1,
                bestFitness,
                avgFitness,
                validIndividuals,
                bestParameters: { ...population[0].parameters },
                population: population.map(ind => ({
                    fitness: ind.fitness,
                    valid: ind.valid
                }))
            });
            
            // Élitisme - conserver les meilleurs
            const eliteCount = Math.floor(this.config.populationSize * this.config.elitismRate);
            const newPopulation = population.slice(0, eliteCount);
            
            // Génération de nouveaux individus
            while (newPopulation.length < this.config.populationSize) {
                // Sélection par tournoi
                const parent1 = this.tournamentSelection(population);
                const parent2 = this.tournamentSelection(population);
                
                // Croisement
                const [child1, child2] = this.crossover(parent1.parameters, parent2.parameters);
                
                // Mutation
                const mutatedChild1 = this.mutate(child1);
                const mutatedChild2 = this.mutate(child2);
                
                // Évaluation des enfants
                if (newPopulation.length < this.config.populationSize) {
                    const evaluation1 = await this.evaluateParameters(mutatedChild1);
                    newPopulation.push(evaluation1);
                }
                
                if (newPopulation.length < this.config.populationSize) {
                    const evaluation2 = await this.evaluateParameters(mutatedChild2);
                    newPopulation.push(evaluation2);
                }
            }
            
            population = newPopulation;
            
            // Convergence précoce si pas d'amélioration
            if (gen > 5) {
                const recentBest = this.results.generations.slice(-5).map(g => g.bestFitness);
                const improvement = Math.max(...recentBest) - Math.min(...recentBest);
                if (improvement < 1.0) {
                    console.log('🛑 Convergence précoce détectée');
                    break;
                }
            }
        }
        
        // Résultats finaux
        population.sort((a, b) => b.fitness - a.fitness);
        this.results.bestParameters = population[0];
        
        console.log('\n✅ Optimisation génétique terminée');
        console.log(`🏆 Meilleur score: ${population[0].fitness.toFixed(2)}`);
        
        return this.results.bestParameters;
    }

    // Sélection par tournoi
    tournamentSelection(population, tournamentSize = 3) {
        const tournament = [];
        
        for (let i = 0; i < tournamentSize; i++) {
            const randomIndex = Math.floor(Math.random() * population.length);
            tournament.push(population[randomIndex]);
        }
        
        tournament.sort((a, b) => b.fitness - a.fitness);
        return tournament[0];
    }

    // Optimisation par grid search
    async optimizeGrid() {
        console.log('📊 Démarrage optimisation par grille...');
        
        const parameterCombinations = this.generateGridCombinations();
        console.log(`Nombre de combinaisons: ${parameterCombinations.length}`);
        
        const results = [];
        let completed = 0;
        
        for (const params of parameterCombinations) {
            const evaluation = await this.evaluateParameters(params);
            results.push(evaluation);
            
            completed++;
            if (completed % 50 === 0) {
                console.log(`Progression: ${completed}/${parameterCombinations.length} (${(completed/parameterCombinations.length*100).toFixed(1)}%)`);
            }
        }
        
        // Tri des résultats
        results.sort((a, b) => b.fitness - a.fitness);
        this.results.bestParameters = results[0];
        
        console.log('\n✅ Optimisation par grille terminée');
        console.log(`🏆 Meilleur score: ${results[0].fitness.toFixed(2)}`);
        
        return this.results.bestParameters;
    }

    // Génération des combinaisons pour grid search
    generateGridCombinations() {
        const combinations = [];
        const paramNames = Object.keys(this.parameterSpace);
        const paramValues = {};
        
        // Génération des valeurs pour chaque paramètre (échantillonnage)
        paramNames.forEach(param => {
            const config = this.parameterSpace[param];
            const values = [];
            
            // Échantillonnage de 5 valeurs par paramètre
            const steps = 4; // 5 valeurs
            const stepSize = (config.max - config.min) / steps;
            
            for (let i = 0; i <= steps; i++) {
                let value = config.min + (i * stepSize);
                if (config.type === 'int') {
                    value = Math.round(value);
                } else {
                    value = parseFloat(value.toFixed(6));
                }
                values.push(value);
            }
            
            paramValues[param] = [...new Set(values)]; // Dédoublonnage
        });
        
        // Génération de toutes les combinaisons (version simplifiée)
        // Pour éviter une explosion combinatoire, on limite à un échantillonnage
        const maxCombinations = 1000;
        
        for (let i = 0; i < maxCombinations; i++) {
            const combination = {};
            
            paramNames.forEach(param => {
                const values = paramValues[param];
                combination[param] = values[Math.floor(Math.random() * values.length)];
            });
            
            this.validateIndividual(combination);
            combinations.push(combination);
        }
        
        return combinations;
    }

    // Validation croisée des meilleurs paramètres
    async validateBestParameters(parameters) {
        console.log('🔍 Validation croisée des meilleurs paramètres...');
        
        // Test sur période de validation différente
        const originalPeriod = this.config.backtestPeriod;
        this.config.backtestPeriod = this.config.validationPeriod;
        
        const validationResult = await this.evaluateParameters(parameters);
        
        // Restaurer la période originale
        this.config.backtestPeriod = originalPeriod;
        
        this.results.validationResults = validationResult;
        
        console.log(`📊 Résultats de validation:`);
        console.log(`   Score: ${validationResult.fitness.toFixed(2)}`);
        console.log(`   Rendement: ${(validationResult.results.annualizedReturn * 100).toFixed(2)}%`);
        console.log(`   Sharpe: ${validationResult.results.sharpeRatio.toFixed(2)}`);
        console.log(`   Drawdown: ${(validationResult.results.maxDrawdown * 100).toFixed(2)}%`);
        
        return validationResult;
    }

    // Exécution de l'optimisation complète
    async optimize() {
        const startTime = Date.now();
        
        console.log('🚀 DÉMARRAGE OPTIMISATION COMPLÈTE');
        console.log('═'.repeat(50));
        
        try {
            let bestResult;
            
            // Choix de l'algorithme
            switch (this.config.algorithm) {
                case 'genetic':
                    bestResult = await this.optimizeGenetic();
                    break;
                case 'grid':
                    bestResult = await this.optimizeGrid();
                    break;
                case 'random':
                    bestResult = await this.optimizeRandom();
                    break;
                default:
                    throw new Error(`Algorithme inconnu: ${this.config.algorithm}`);
            }
            
            // Validation croisée
            await this.validateBestParameters(bestResult.parameters);
            
            // Génération du rapport
            const report = this.generateOptimizationReport();
            
            const endTime = Date.now();
            const duration = (endTime - startTime) / 1000 / 60; // minutes
            
            console.log(`\n⏱️ Optimisation terminée en ${duration.toFixed(1)} minutes`);
            
            return report;
            
        } catch (error) {
            console.error('❌ Erreur durant optimisation:', error.message);
            throw error;
        }
    }

    // Optimisation aléatoire (baseline)
    async optimizeRandom() {
        console.log('🎲 Démarrage optimisation aléatoire...');
        
        const numSamples = this.config.populationSize * this.config.generations;
        const results = [];
        
        for (let i = 0; i < numSamples; i++) {
            const randomParams = this.generateRandomIndividual();
            const evaluation = await this.evaluateParameters(randomParams);
            results.push(evaluation);
            
            if ((i + 1) % 50 === 0) {
                console.log(`Évaluation: ${i + 1}/${numSamples}`);
            }
        }
        
        results.sort((a, b) => b.fitness - a.fitness);
        this.results.bestParameters = results[0];
        
        console.log('\n✅ Optimisation aléatoire terminée');
        return this.results.bestParameters;
    }

    // Génération du rapport d'optimisation
    generateOptimizationReport() {
        const best = this.results.bestParameters;
        const validation = this.results.validationResults;
        
        const report = {
            metadata: {
                timestamp: new Date().toISOString(),
                algorithm: this.config.algorithm,
                backtestPeriod: this.config.backtestPeriod,
                validationPeriod: this.config.validationPeriod,
                parameterSpace: Object.keys(this.parameterSpace).length
            },
            
            optimization: {
                bestScore: best.fitness,
                validationScore: validation.fitness,
                scoreStability: Math.abs(best.fitness - validation.fitness),
                convergence: this.analyzeConvergence()
            },
            
            bestParameters: best.parameters,
            
            performance: {
                training: best.results,
                validation: validation.results,
                improvement: this.calculateImprovement()
            },
            
            parameterAnalysis: this.analyzeParameterImportance(),
            
            recommendations: this.generateParameterRecommendations(),
            
            riskAssessment: {
                overfitting: this.assessOverfittingRisk(),
                robustness: this.assessRobustness(),
                deploymentReady: this.assessDeploymentReadiness()
            }
        };
        
        // Sauvegarde du rapport
        const reportPath = path.join(__dirname, 'optimization_results', 
                                    `optimization_report_${Date.now()}.json`);
        
        const reportDir = path.dirname(reportPath);
        if (!fs.existsSync(reportDir)) {
            fs.mkdirSync(reportDir, { recursive: true });
        }
        
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        
        // Sauvegarde des paramètres optimisés pour utilisation
        const configPath = path.join(__dirname, 'config', 'optimized_parameters.json');
        fs.writeFileSync(configPath, JSON.stringify(best.parameters, null, 2));
        
        console.log(`📄 Rapport sauvegardé: ${reportPath}`);
        console.log(`⚙️ Paramètres optimisés: ${configPath}`);
        
        this.displayOptimizationSummary(report);
        
        return report;
    }

    // Analyse de la convergence
    analyzeConvergence() {
        if (this.config.algorithm !== 'genetic' || this.results.generations.length === 0) {
            return null;
        }
        
        const generations = this.results.generations;
        const finalGen = generations[generations.length - 1];
        const firstGen = generations[0];
        
        return {
            totalGenerations: generations.length,
            initialBest: firstGen.bestFitness,
            finalBest: finalGen.bestFitness,
            improvement: finalGen.bestFitness - firstGen.bestFitness,
            convergenceGeneration: this.findConvergenceGeneration(),
            diversityMaintained: finalGen.validIndividuals / this.config.populationSize
        };
    }

    findConvergenceGeneration() {
        const generations = this.results.generations;
        let plateauCount = 0;
        const plateauThreshold = 3;
        
        for (let i = 1; i < generations.length; i++) {
            const improvement = generations[i].bestFitness - generations[i-1].bestFitness;
            
            if (improvement < 0.5) {
                plateauCount++;
                if (plateauCount >= plateauThreshold) {
                    return i - plateauThreshold + 1;
                }
            } else {
                plateauCount = 0;
            }
        }
        
        return generations.length; // Pas de convergence claire
    }

    // Calcul de l'amélioration par rapport aux paramètres de base
    calculateImprovement() {
        const baseParameters = {};
        Object.entries(this.parameterSpace).forEach(([param, config]) => {
            baseParameters[param] = config.current;
        });
        
        // Note: En production, il faudrait évaluer les paramètres de base
        const baseScore = 50; // Score de base estimé
        const improvement = this.results.bestParameters.fitness - baseScore;
        
        return {
            absoluteImprovement: improvement,
            relativeImprovement: (improvement / baseScore) * 100,
            significantImprovement: improvement > 10
        };
    }

    // Analyse de l'importance des paramètres
    analyzeParameterImportance() {
        // Analyse simplifiée - en production, utiliser une analyse de sensibilité
        const bestParams = this.results.bestParameters.parameters;
        const importance = {};
        
        Object.entries(this.parameterSpace).forEach(([param, config]) => {
            const currentValue = bestParams[param];
            const range = config.max - config.min;
            const position = (currentValue - config.min) / range;
            
            // Estimation de l'importance basée sur la position dans la plage
            if (position < 0.1 || position > 0.9) {
                importance[param] = 'HIGH'; // Valeur extrême
            } else if (position < 0.3 || position > 0.7) {
                importance[param] = 'MEDIUM';
            } else {
                importance[param] = 'LOW';
            }
        });
        
        return importance;
    }

    // Génération de recommandations
    generateParameterRecommendations() {
        const recommendations = [];
        const bestParams = this.results.bestParameters.parameters;
        const validation = this.results.validationResults;
        
        // Recommandations basées sur la performance
        if (validation.fitness < this.results.bestParameters.fitness * 0.8) {
            recommendations.push({
                type: 'WARNING',
                message: 'Risque de surapprentissage détecté',
                suggestion: 'Considérer des paramètres plus conservateurs'
            });
        }
        
        if (bestParams.stopLossPercent < 0.01) {
            recommendations.push({
                type: 'RISK',
                message: 'Stop-loss très agressif',
                suggestion: 'Surveiller attentivement le drawdown en production'
            });
        }
        
        if (bestParams.maxPositionPercent > 0.08) {
            recommendations.push({
                type: 'RISK',
                message: 'Taille de position élevée',
                suggestion: 'Considérer une diversification accrue'
            });
        }
        
        recommendations.push({
            type: 'DEPLOYMENT',
            message: 'Test en paper trading recommandé',
            suggestion: 'Valider les paramètres sur 30 jours minimum avant déploiement'
        });
        
        return recommendations;
    }

    // Évaluation du risque de surapprentissage
    assessOverfittingRisk() {
        const training = this.results.bestParameters.fitness;
        const validation = this.results.validationResults.fitness;
        
        const gap = training - validation;
        const relativeGap = gap / training;
        
        if (relativeGap > 0.3) return 'HIGH';
        if (relativeGap > 0.15) return 'MEDIUM';
        return 'LOW';
    }

    // Évaluation de la robustesse
    assessRobustness() {
        const validation = this.results.validationResults;
        
        const criteria = {
            consistent_performance: validation.fitness > 60,
            acceptable_drawdown: validation.results.maxDrawdown < 0.15,
            positive_sharpe: validation.results.sharpeRatio > 0.5,
            sufficient_trades: validation.results.totalTrades > 30
        };
        
        const passedCriteria = Object.values(criteria).filter(Boolean).length;
        const totalCriteria = Object.keys(criteria).length;
        
        if (passedCriteria === totalCriteria) return 'HIGH';
        if (passedCriteria >= totalCriteria * 0.75) return 'MEDIUM';
        return 'LOW';
    }

    // Évaluation de la préparation au déploiement
    assessDeploymentReadiness() {
        const overfitting = this.assessOverfittingRisk();
        const robustness = this.assessRobustness();
        
        if (overfitting === 'LOW' && robustness === 'HIGH') return 'READY';
        if (overfitting === 'MEDIUM' || robustness === 'MEDIUM') return 'CAUTION';
        return 'NOT_READY';
    }

    // Affichage du résumé d'optimisation
    displayOptimizationSummary(report) {
        console.log('\n📊 RÉSUMÉ DE L\'OPTIMISATION');
        console.log('═'.repeat(50));
        
        console.log(`🎯 Score final: ${report.optimization.bestScore.toFixed(2)}`);
        console.log(`✅ Score validation: ${report.optimization.validationScore.toFixed(2)}`);
        console.log(`📈 Amélioration: ${report.performance.improvement.relativeImprovement.toFixed(1)}%`);
        
        console.log('\n🔧 PARAMÈTRES OPTIMISÉS:');
        Object.entries(report.bestParameters).forEach(([param, value]) => {
            const original = this.parameterSpace[param].current;
            const change = ((value - original) / original * 100).toFixed(1);
            console.log(`   ${param}: ${value} (${change > 0 ? '+' : ''}${change}%)`);
        });
        
        console.log('\n⚠️ ÉVALUATION DES RISQUES:');
        console.log(`   Surapprentissage: ${report.riskAssessment.overfitting}`);
        console.log(`   Robustesse: ${report.riskAssessment.robustness}`);
        console.log(`   Prêt pour déploiement: ${report.riskAssessment.deploymentReady}`);
        
        if (report.recommendations.length > 0) {
            console.log('\n💡 RECOMMANDATIONS:');
            report.recommendations.forEach((rec, index) => {
                console.log(`   ${index + 1}. [${rec.type}] ${rec.message}`);
            });
        }
    }

    // Utilitaire de pause
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Configuration par défaut
const defaultOptimizerConfig = {
    algorithm: 'genetic',
    populationSize: 30,
    generations: 15,
    backtestPeriod: 180,
    validationPeriod: 60,
    maxWorkers: 4
};

// Export et utilisation
if (require.main === module) {
    async function runOptimization() {
        console.log('🔧 OPTIMISEUR DE PARAMÈTRES AUTOMATISÉ');
        console.log('═'.repeat(60));
        
        const optimizer = new ParameterOptimizer(defaultOptimizerConfig);
        
        try {
            const report = await optimizer.optimize();
            
            console.log('\n🎉 Optimisation terminée avec succès!');
            console.log('📁 Consultez les fichiers générés pour les détails complets.');
            
        } catch (error) {
            console.error('\n❌ Erreur durant l\'optimisation:', error.message);
        }
    }
    
    runOptimization().catch(console.error);
}

module.exports = ParameterOptimizer;