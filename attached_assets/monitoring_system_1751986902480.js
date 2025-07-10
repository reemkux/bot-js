// Système de monitoring avancé avec métriques Prometheus
// Dashboard professionnel pour surveillance 24/7

const express = require('express');
const prometheus = require('prom-client');
const fs = require('fs');
const path = require('path');

class TradingBotMonitoring {
    constructor(config) {
        this.config = {
            metricsPort: config.metricsPort || 9090,
            metricsPath: config.metricsPath || '/metrics',
            updateInterval: config.updateInterval || 30000, // 30 secondes
            dataRetentionDays: config.dataRetentionDays || 30,
            ...config
        };
        
        // Initialisation du registre Prometheus
        this.register = new prometheus.Registry();
        
        // Métriques de base système
        this.setupSystemMetrics();
        
        // Métriques trading spécifiques
        this.setupTradingMetrics();
        
        // Métriques de performance
        this.setupPerformanceMetrics();
        
        // Application Express pour exposer les métriques
        this.app = express();
        this.setupRoutes();
        
        // Collecte automatique des métriques
        this.startMetricsCollection();
    }

    // Configuration des métriques système
    setupSystemMetrics() {
        // Métriques système de base
        prometheus.collectDefaultMetrics({ 
            register: this.register,
            prefix: 'trading_bot_'
        });
        
        // Uptime du bot
        this.uptimeGauge = new prometheus.Gauge({
            name: 'trading_bot_uptime_seconds',
            help: 'Temps de fonctionnement du bot en secondes',
            registers: [this.register]
        });
        
        // État du bot
        this.botStatusGauge = new prometheus.Gauge({
            name: 'trading_bot_status',
            help: 'État du bot (1=actif, 0=inactif)',
            registers: [this.register]
        });
        
        // Connexions WebSocket
        this.websocketConnectionsGauge = new prometheus.Gauge({
            name: 'trading_bot_websocket_connections',
            help: 'Nombre de connexions WebSocket actives',
            registers: [this.register]
        });
        
        // Erreurs système
        this.systemErrorsCounter = new prometheus.Counter({
            name: 'trading_bot_system_errors_total',
            help: 'Nombre total d\'erreurs système',
            labelNames: ['error_type'],
            registers: [this.register]
        });
        
        // Utilisation mémoire
        this.memoryUsageGauge = new prometheus.Gauge({
            name: 'trading_bot_memory_usage_bytes',
            help: 'Utilisation mémoire en bytes',
            labelNames: ['type'],
            registers: [this.register]
        });
    }

    // Configuration des métriques trading
    setupTradingMetrics() {
        // Nombre total de trades
        this.tradesCounter = new prometheus.Counter({
            name: 'trading_bot_trades_total',
            help: 'Nombre total de trades exécutés',
            labelNames: ['symbol', 'direction', 'outcome'],
            registers: [this.register]
        });
        
        // P&L par trade
        this.tradePnLHistogram = new prometheus.Histogram({
            name: 'trading_bot_trade_pnl_percent',
            help: 'Distribution des P&L par trade en pourcentage',
            buckets: [-10, -5, -2, -1, -0.5, 0, 0.5, 1, 2, 5, 10],
            labelNames: ['symbol'],
            registers: [this.register]
        });
        
        // Durée des trades
        this.tradeDurationHistogram = new prometheus.Histogram({
            name: 'trading_bot_trade_duration_seconds',
            help: 'Durée des trades en secondes',
            buckets: [60, 300, 600, 1800, 3600, 7200, 14400, 28800, 86400],
            labelNames: ['symbol'],
            registers: [this.register]
        });
        
        // Positions actives
        this.activePositionsGauge = new prometheus.Gauge({
            name: 'trading_bot_active_positions',
            help: 'Nombre de positions actuellement ouvertes',
            labelNames: ['symbol'],
            registers: [this.register]
        });
        
        // Capital total
        this.totalCapitalGauge = new prometheus.Gauge({
            name: 'trading_bot_total_capital_usd',
            help: 'Capital total en USD',
            registers: [this.register]
        });
        
        // P&L quotidien
        this.dailyPnLGauge = new prometheus.Gauge({
            name: 'trading_bot_daily_pnl_usd',
            help: 'P&L quotidien en USD',
            registers: [this.register]
        });
        
        // Drawdown actuel
        this.currentDrawdownGauge = new prometheus.Gauge({
            name: 'trading_bot_current_drawdown_percent',
            help: 'Drawdown actuel en pourcentage',
            registers: [this.register]
        });
        
        // Taux de réussite
        this.winRateGauge = new prometheus.Gauge({
            name: 'trading_bot_win_rate_percent',
            help: 'Taux de réussite en pourcentage',
            registers: [this.register]
        });
    }

    // Configuration des métriques de performance
    setupPerformanceMetrics() {
        // Latence des requêtes API
        this.apiLatencyHistogram = new prometheus.Histogram({
            name: 'trading_bot_api_request_duration_seconds',
            help: 'Durée des requêtes API en secondes',
            buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10],
            labelNames: ['endpoint', 'method'],
            registers: [this.register]
        });
        
        // Requêtes API par minute
        this.apiRequestsCounter = new prometheus.Counter({
            name: 'trading_bot_api_requests_total',
            help: 'Nombre total de requêtes API',
            labelNames: ['endpoint', 'method', 'status'],
            registers: [this.register]
        });
        
        // Délai de traitement des données
        this.dataProcessingLatency = new prometheus.Histogram({
            name: 'trading_bot_data_processing_duration_seconds',
            help: 'Temps de traitement des données de marché',
            buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5],
            labelNames: ['data_type'],
            registers: [this.register]
        });
        
        // Alertes envoyées
        this.alertsCounter = new prometheus.Counter({
            name: 'trading_bot_alerts_sent_total',
            help: 'Nombre total d\'alertes envoyées',
            labelNames: ['alert_type', 'channel'],
            registers: [this.register]
        });
    }

    // Configuration des routes Express
    setupRoutes() {
        // Endpoint pour métriques Prometheus
        this.app.get(this.config.metricsPath, async (req, res) => {
            try {
                res.set('Content-Type', this.register.contentType);
                res.end(await this.register.metrics());
            } catch (error) {
                console.error('Erreur génération métriques:', error);
                res.status(500).end();
            }
        });
        
        // Endpoint de santé
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                version: '1.0.0'
            });
        });
        
        // Endpoint pour métriques custom
        this.app.get('/metrics/trading', (req, res) => {
            res.json(this.getTradingMetrics());
        });
        
        // Dashboard simple intégré
        this.app.get('/dashboard', (req, res) => {
            res.send(this.generateSimpleDashboard());
        });
    }

    // Collecte automatique des métriques
    startMetricsCollection() {
        setInterval(() => {
            this.updateSystemMetrics();
            this.updateTradingMetrics();
        }, this.config.updateInterval);
        
        console.log(`📊 Collecte de métriques démarrée (intervalle: ${this.config.updateInterval}ms)`);
    }

    // Mise à jour des métriques système
    updateSystemMetrics() {
        // Uptime
        this.uptimeGauge.set(process.uptime());
        
        // Utilisation mémoire
        const memUsage = process.memoryUsage();
        this.memoryUsageGauge.set({ type: 'heap_used' }, memUsage.heapUsed);
        this.memoryUsageGauge.set({ type: 'heap_total' }, memUsage.heapTotal);
        this.memoryUsageGauge.set({ type: 'external' }, memUsage.external);
        this.memoryUsageGauge.set({ type: 'rss' }, memUsage.rss);
        
        // État du bot (simulé)
        this.botStatusGauge.set(this.isBotActive() ? 1 : 0);
        
        // Connexions WebSocket (simulé)
        this.websocketConnectionsGauge.set(this.getActiveWebSocketConnections());
    }

    // Mise à jour des métriques trading
    updateTradingMetrics() {
        try {
            const tradingData = this.loadTradingData();
            
            if (tradingData) {
                // Capital total
                this.totalCapitalGauge.set(tradingData.totalCapital || 10000);
                
                // P&L quotidien
                this.dailyPnLGauge.set(tradingData.dailyPnL || 0);
                
                // Drawdown actuel
                this.currentDrawdownGauge.set(tradingData.currentDrawdown || 0);
                
                // Taux de réussite
                this.winRateGauge.set(tradingData.winRate || 0);
                
                // Positions actives par symbole
                if (tradingData.activePositions) {
                    Object.entries(tradingData.activePositions).forEach(([symbol, count]) => {
                        this.activePositionsGauge.set({ symbol }, count);
                    });
                }
            }
        } catch (error) {
            console.error('Erreur mise à jour métriques trading:', error);
            this.systemErrorsCounter.inc({ error_type: 'metrics_update' });
        }
    }

    // Enregistrement d'un trade
    recordTrade(trade) {
        const { symbol, direction, pnlPercent, duration, outcome } = trade;
        
        // Compteur de trades
        this.tradesCounter.inc({
            symbol,
            direction,
            outcome: outcome || (pnlPercent > 0 ? 'profit' : 'loss')
        });
        
        // Distribution P&L
        this.tradePnLHistogram.observe({ symbol }, pnlPercent);
        
        // Durée du trade
        this.tradeDurationHistogram.observe({ symbol }, duration / 1000);
        
        console.log(`📊 Trade enregistré: ${symbol} ${direction} ${pnlPercent.toFixed(2)}%`);
    }

    // Enregistrement d'une requête API
    recordAPIRequest(endpoint, method, duration, status) {
        this.apiLatencyHistogram.observe({ endpoint, method }, duration);
        this.apiRequestsCounter.inc({ endpoint, method, status });
    }

    // Enregistrement du traitement de données
    recordDataProcessing(dataType, duration) {
        this.dataProcessingLatency.observe({ data_type: dataType }, duration);
    }

    // Enregistrement d'une alerte
    recordAlert(alertType, channel) {
        this.alertsCounter.inc({ alert_type: alertType, channel });
    }

    // Enregistrement d'une erreur
    recordError(errorType) {
        this.systemErrorsCounter.inc({ error_type: errorType });
    }

    // Chargement des données de trading
    loadTradingData() {
        try {
            const performanceFile = path.join(__dirname, 'logs', 'trading', 'performance.json');
            if (fs.existsSync(performanceFile)) {
                const data = fs.readFileSync(performanceFile, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Erreur chargement données trading:', error);
        }
        return null;
    }

    // Méthodes utilitaires
    isBotActive() {
        // Vérifier si le bot est actif (exemple simple)
        try {
            const logFile = path.join(__dirname, 'logs', 'trading', 'combined.log');
            if (fs.existsSync(logFile)) {
                const stats = fs.statSync(logFile);
                const timeDiff = Date.now() - stats.mtime.getTime();
                return timeDiff < 5 * 60 * 1000; // 5 minutes
            }
        } catch (error) {
            return false;
        }
        return false;
    }

    getActiveWebSocketConnections() {
        // Simulé - en réalité, interroger le bot principal
        return Math.floor(Math.random() * 5) + 2; // 2-6 connexions
    }

    // Récupération des métriques trading formatées
    getTradingMetrics() {
        const tradingData = this.loadTradingData();
        
        return {
            timestamp: new Date().toISOString(),
            summary: tradingData?.summary || {},
            performance: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                activeConnections: this.getActiveWebSocketConnections(),
                botStatus: this.isBotActive() ? 'active' : 'inactive'
            },
            recent_trades: this.getRecentTrades(10)
        };
    }

    // Récupération des trades récents
    getRecentTrades(limit = 10) {
        try {
            const tradesFile = path.join(__dirname, 'logs', 'trading', 'trades.json');
            if (fs.existsSync(tradesFile)) {
                const lines = fs.readFileSync(tradesFile, 'utf8').trim().split('\n');
                return lines
                    .slice(-limit)
                    .map(line => JSON.parse(line))
                    .reverse();
            }
        } catch (error) {
            console.error('Erreur chargement trades récents:', error);
        }
        return [];
    }

    // Génération d'un dashboard simple
    generateSimpleDashboard() {
        const metrics = this.getTradingMetrics();
        
        return `
<!DOCTYPE html>
<html>
<head>
    <title>Trading Bot Monitoring</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="refresh" content="30">
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: #2c3e50; color: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
        .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .metric-card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .metric-value { font-size: 2em; font-weight: bold; color: #27ae60; }
        .metric-label { color: #7f8c8d; margin-top: 5px; }
        .status-active { color: #27ae60; }
        .status-inactive { color: #e74c3c; }
        .trades-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        .trades-table th, .trades-table td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
        .trades-table th { background: #ecf0f1; }
        .positive { color: #27ae60; }
        .negative { color: #e74c3c; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤖 Trading Bot Monitoring Dashboard</h1>
            <p>Dernière mise à jour: ${new Date().toLocaleString()}</p>
            <p>Statut: <span class="${metrics.performance.botStatus === 'active' ? 'status-active' : 'status-inactive'}">
                ${metrics.performance.botStatus.toUpperCase()}
            </span></p>
        </div>
        
        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-value">${(metrics.performance.uptime / 3600).toFixed(1)}h</div>
                <div class="metric-label">Uptime</div>
            </div>
            
            <div class="metric-card">
                <div class="metric-value">${(metrics.performance.memory.heapUsed / 1024 / 1024).toFixed(1)}MB</div>
                <div class="metric-label">Mémoire Utilisée</div>
            </div>
            
            <div class="metric-card">
                <div class="metric-value">${metrics.performance.activeConnections}</div>
                <div class="metric-label">Connexions WebSocket</div>
            </div>
            
            <div class="metric-card">
                <div class="metric-value">${metrics.summary.totalTrades || 0}</div>
                <div class="metric-label">Trades Totaux</div>
            </div>
            
            <div class="metric-card">
                <div class="metric-value ${(metrics.summary.totalReturnPercent || 0) >= 0 ? 'positive' : 'negative'}">
                    ${(metrics.summary.totalReturnPercent || 0).toFixed(2)}%
                </div>
                <div class="metric-label">Performance Totale</div>
            </div>
            
            <div class="metric-card">
                <div class="metric-value">${(metrics.summary.winRate || 0).toFixed(1)}%</div>
                <div class="metric-label">Taux de Réussite</div>
            </div>
        </div>
        
        <div class="metric-card" style="margin-top: 20px;">
            <h3>📊 Trades Récents</h3>
            <table class="trades-table">
                <thead>
                    <tr>
                        <th>Timestamp</th>
                        <th>Symbole</th>
                        <th>Direction</th>
                        <th>P&L %</th>
                        <th>Raison</th>
                    </tr>
                </thead>
                <tbody>
                    ${metrics.recent_trades.map(trade => `
                        <tr>
                            <td>${new Date(trade.exitTime || trade.timestamp).toLocaleTimeString()}</td>
                            <td>${trade.symbol}</td>
                            <td>${trade.direction}</td>
                            <td class="${trade.pnlPercent >= 0 ? 'positive' : 'negative'}">
                                ${trade.pnlPercent ? trade.pnlPercent.toFixed(2) + '%' : 'N/A'}
                            </td>
                            <td>${trade.reason || 'N/A'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        
        <div class="metric-card" style="margin-top: 20px;">
            <h3>🔗 Liens Utiles</h3>
            <p><a href="/metrics">📊 Métriques Prometheus</a></p>
            <p><a href="/health">❤️ Health Check</a></p>
            <p><a href="/metrics/trading">📈 Métriques Trading JSON</a></p>
            <p><a href="http://localhost:3000">🖥️ Dashboard Principal</a></p>
        </div>
    </div>
</body>
</html>`;
    }

    // Configuration Grafana (génération automatique)
    generateGrafanaDashboard() {
        const dashboard = {
            dashboard: {
                id: null,
                title: "Trading Bot Dashboard",
                tags: ["trading", "bot", "crypto"],
                timezone: "browser",
                panels: [
                    {
                        title: "Bot Status",
                        type: "stat",
                        targets: [
                            {
                                expr: "trading_bot_status",
                                legendFormat: "Status"
                            }
                        ],
                        fieldConfig: {
                            defaults: {
                                mappings: [
                                    { options: { "0": { text: "Inactive" } } },
                                    { options: { "1": { text: "Active" } } }
                                ]
                            }
                        }
                    },
                    {
                        title: "Total Capital",
                        type: "stat",
                        targets: [
                            {
                                expr: "trading_bot_total_capital_usd",
                                legendFormat: "Capital USD"
                            }
                        ]
                    },
                    {
                        title: "Daily P&L",
                        type: "stat",
                        targets: [
                            {
                                expr: "trading_bot_daily_pnl_usd",
                                legendFormat: "Daily P&L"
                            }
                        ]
                    },
                    {
                        title: "Win Rate",
                        type: "stat",
                        targets: [
                            {
                                expr: "trading_bot_win_rate_percent",
                                legendFormat: "Win Rate %"
                            }
                        ]
                    },
                    {
                        title: "Trades Over Time",
                        type: "graph",
                        targets: [
                            {
                                expr: "rate(trading_bot_trades_total[5m])",
                                legendFormat: "Trades/min"
                            }
                        ]
                    },
                    {
                        title: "P&L Distribution",
                        type: "histogram",
                        targets: [
                            {
                                expr: "trading_bot_trade_pnl_percent_bucket",
                                legendFormat: "P&L Distribution"
                            }
                        ]
                    },
                    {
                        title: "API Latency",
                        type: "graph",
                        targets: [
                            {
                                expr: "histogram_quantile(0.95, trading_bot_api_request_duration_seconds_bucket)",
                                legendFormat: "95th percentile"
                            },
                            {
                                expr: "histogram_quantile(0.50, trading_bot_api_request_duration_seconds_bucket)",
                                legendFormat: "50th percentile"
                            }
                        ]
                    },
                    {
                        title: "Memory Usage",
                        type: "graph",
                        targets: [
                            {
                                expr: "trading_bot_memory_usage_bytes",
                                legendFormat: "{{type}}"
                            }
                        ]
                    }
                ],
                time: {
                    from: "now-1h",
                    to: "now"
                },
                refresh: "30s"
            }
        };
        
        const dashboardPath = path.join(__dirname, 'config', 'grafana-dashboard.json');
        fs.writeFileSync(dashboardPath, JSON.stringify(dashboard, null, 2));
        console.log(`📊 Dashboard Grafana généré: ${dashboardPath}`);
        
        return dashboard;
    }

    // Démarrage du serveur de métriques
    start() {
        this.server = this.app.listen(this.config.metricsPort, () => {
            console.log(`📊 Serveur de métriques démarré sur port ${this.config.metricsPort}`);
            console.log(`📈 Métriques Prometheus: http://localhost:${this.config.metricsPort}${this.config.metricsPath}`);
            console.log(`🖥️ Dashboard simple: http://localhost:${this.config.metricsPort}/dashboard`);
        });
        
        // Génération dashboard Grafana
        this.generateGrafanaDashboard();
    }

    // Arrêt du serveur
    stop() {
        if (this.server) {
            this.server.close();
            console.log('📊 Serveur de métriques arrêté');
        }
    }
}

// Configuration par défaut
const defaultMonitoringConfig = {
    metricsPort: 9090,
    metricsPath: '/metrics',
    updateInterval: 30000,
    dataRetentionDays: 30
};

// Export et utilisation
if (require.main === module) {
    const monitoring = new TradingBotMonitoring(defaultMonitoringConfig);
    monitoring.start();
    
    // Simulation de données pour test
    setInterval(() => {
        // Simulation d'un trade
        monitoring.recordTrade({
            symbol: 'BTCUSDT',
            direction: 'BUY',
            pnlPercent: (Math.random() - 0.5) * 4, // -2% à +2%
            duration: Math.random() * 3600000, // 0 à 1h
            outcome: Math.random() > 0.6 ? 'profit' : 'loss'
        });
        
        // Simulation requête API
        monitoring.recordAPIRequest('/api/v3/ticker/price', 'GET', Math.random() * 0.5, '200');
        
        // Simulation traitement données
        monitoring.recordDataProcessing('kline', Math.random() * 0.1);
        
    }, 60000); // Chaque minute
    
    // Arrêt propre
    process.on('SIGINT', () => {
        console.log('\n🛑 Arrêt du monitoring...');
        monitoring.stop();
        process.exit(0);
    });
}

module.exports = TradingBotMonitoring;