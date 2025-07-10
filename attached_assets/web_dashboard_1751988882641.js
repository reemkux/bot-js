// Dashboard Web pour monitoring du bot de trading réaliste
// Interface temps réel avec métriques de performance

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

class TradingDashboard {
    constructor(config) {
        this.config = {
            port: config.port || 3000,
            logsPath: config.logsPath || './logs',
            updateInterval: config.updateInterval || 5000, // 5 secondes
            ...config
        };
        
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });
        
        this.data = {
            trades: [],
            performance: {},
            realTimeStats: {},
            systemHealth: {},
            alerts: []
        };
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebSockets();
        this.startDataCollection();
    }

    setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(express.static('public'));
    }

    setupRoutes() {
        // Page principale
        this.app.get('/', (req, res) => {
            res.send(this.generateDashboardHTML());
        });

        // API - Données des trades
        this.app.get('/api/trades', (req, res) => {
            const limit = parseInt(req.query.limit) || 100;
            const trades = this.loadTrades().slice(-limit);
            res.json(trades);
        });

        // API - Performance globale
        this.app.get('/api/performance', (req, res) => {
            res.json(this.data.performance);
        });

        // API - Statistiques temps réel
        this.app.get('/api/realtime', (req, res) => {
            res.json(this.data.realTimeStats);
        });

        // API - Santé du système
        this.app.get('/api/health', (req, res) => {
            res.json(this.data.systemHealth);
        });

        // API - Arrêt d'urgence
        this.app.post('/api/emergency-stop', (req, res) => {
            this.emergencyStop();
            res.json({ success: true, message: 'Emergency stop initiated' });
        });

        // API - Configuration
        this.app.get('/api/config', (req, res) => {
            res.json(this.getCurrentConfig());
        });

        // API - Historique des alertes
        this.app.get('/api/alerts', (req, res) => {
            res.json(this.data.alerts.slice(-50)); // 50 dernières alertes
        });
    }

    setupWebSockets() {
        this.io.on('connection', (socket) => {
            console.log('📱 Nouvelle connexion dashboard:', socket.id);
            
            // Envoyer les données initiales
            socket.emit('initial-data', {
                trades: this.data.trades.slice(-20),
                performance: this.data.performance,
                realTimeStats: this.data.realTimeStats,
                systemHealth: this.data.systemHealth
            });
            
            socket.on('disconnect', () => {
                console.log('📱 Déconnexion dashboard:', socket.id);
            });
            
            // Écouter les commandes du dashboard
            socket.on('emergency-stop', () => {
                this.emergencyStop();
                this.io.emit('alert', {
                    type: 'EMERGENCY',
                    message: 'Arrêt d\'urgence activé',
                    timestamp: Date.now()
                });
            });
        });
    }

    // Collecte automatique des données
    startDataCollection() {
        setInterval(() => {
            this.updateData();
            this.broadcastUpdate();
        }, this.config.updateInterval);
        
        // Vérification de santé plus fréquente
        setInterval(() => {
            this.checkSystemHealth();
        }, 30000); // 30 secondes
    }

    // Mise à jour des données
    updateData() {
        try {
            this.data.trades = this.loadTrades();
            this.data.performance = this.calculatePerformance();
            this.data.realTimeStats = this.getRealTimeStats();
        } catch (error) {
            console.error('Erreur mise à jour données:', error);
            this.addAlert('ERROR', 'Erreur collecte données: ' + error.message);
        }
    }

    // Chargement des trades depuis les logs
    loadTrades() {
        try {
            const tradesFile = path.join(this.config.logsPath, 'trading/trades.json');
            if (!fs.existsSync(tradesFile)) return [];
            
            const lines = fs.readFileSync(tradesFile, 'utf8').trim().split('\n');
            return lines
                .filter(line => line.trim())
                .map(line => JSON.parse(line))
                .filter(trade => trade.status === 'CLOSED')
                .sort((a, b) => b.exitTime - a.exitTime);
        } catch (error) {
            console.error('Erreur chargement trades:', error);
            return [];
        }
    }

    // Calcul des métriques de performance
    calculatePerformance() {
        const trades = this.data.trades;
        if (trades.length === 0) {
            return {
                totalTrades: 0,
                winRate: 0,
                totalPnL: 0,
                totalPnLPercent: 0,
                avgWin: 0,
                avgLoss: 0,
                profitFactor: 0,
                currentDrawdown: 0,
                monthlyReturn: 0
            };
        }

        const winningTrades = trades.filter(t => t.pnl > 0);
        const losingTrades = trades.filter(t => t.pnl < 0);
        
        const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
        const avgWin = winningTrades.length > 0 ? 
            winningTrades.reduce((sum, t) => sum + t.pnlPercent, 0) / winningTrades.length : 0;
        const avgLoss = losingTrades.length > 0 ?
            Math.abs(losingTrades.reduce((sum, t) => sum + t.pnlPercent, 0) / losingTrades.length) : 0;

        // Calcul du drawdown actuel
        const equity = this.calculateEquityCurve(trades);
        const currentDrawdown = this.calculateCurrentDrawdown(equity);

        // Rendement mensuel (approximatif)
        const monthlyReturn = this.calculateMonthlyReturn(trades);

        return {
            totalTrades: trades.length,
            winRate: (winningTrades.length / trades.length) * 100,
            totalPnL: totalPnL,
            totalPnLPercent: (totalPnL / 10000) * 100, // Assumant capital initial 10k
            avgWin: avgWin,
            avgLoss: avgLoss,
            profitFactor: avgLoss > 0 ? avgWin / avgLoss : 0,
            currentDrawdown: currentDrawdown,
            monthlyReturn: monthlyReturn,
            lastTradeTime: trades[0]?.exitTime || null,
            fees: trades.reduce((sum, t) => sum + (t.fees || 0), 0)
        };
    }

    // Statistiques temps réel
    getRealTimeStats() {
        const now = Date.now();
        const today = new Date().toISOString().split('T')[0];
        
        // Trades du jour
        const todayTrades = this.data.trades.filter(trade => {
            const tradeDate = new Date(trade.exitTime).toISOString().split('T')[0];
            return tradeDate === today;
        });

        // Positions actives (simulation)
        const activePositions = this.getActivePositions();

        return {
            timestamp: now,
            todayTrades: todayTrades.length,
            todayPnL: todayTrades.reduce((sum, t) => sum + t.pnl, 0),
            todayPnLPercent: todayTrades.reduce((sum, t) => sum + t.pnlPercent, 0),
            activePositions: activePositions.length,
            isMarketOpen: this.isMarketOpen(),
            nextTradeETA: this.estimateNextTrade(),
            systemUptime: this.getSystemUptime()
        };
    }

    // Vérification de la santé du système
    checkSystemHealth() {
        const health = {
            timestamp: Date.now(),
            status: 'OK',
            issues: []
        };

        try {
            // Vérifier l'activité des logs
            const logFile = path.join(this.config.logsPath, 'trading/combined.log');
            if (fs.existsSync(logFile)) {
                const stats = fs.statSync(logFile);
                const timeDiff = Date.now() - stats.mtime.getTime();
                
                if (timeDiff > 15 * 60 * 1000) { // 15 minutes
                    health.issues.push('Pas d\'activité récente dans les logs');
                    health.status = 'WARNING';
                }
            } else {
                health.issues.push('Fichier de log principal introuvable');
                health.status = 'ERROR';
            }

            // Vérifier l'espace disque
            const { execSync } = require('child_process');
            try {
                const diskUsage = execSync('df -h . | tail -1').toString();
                const usagePercent = parseInt(diskUsage.split(/\s+/)[4].replace('%', ''));
                
                if (usagePercent > 90) {
                    health.issues.push(`Espace disque critique: ${usagePercent}%`);
                    health.status = 'ERROR';
                } else if (usagePercent > 80) {
                    health.issues.push(`Espace disque élevé: ${usagePercent}%`);
                    if (health.status === 'OK') health.status = 'WARNING';
                }
            } catch (e) {
                health.issues.push('Impossible de vérifier l\'espace disque');
            }

            // Vérifier la mémoire
            const memUsage = process.memoryUsage();
            const memUsageMB = memUsage.heapUsed / 1024 / 1024;
            
            if (memUsageMB > 500) {
                health.issues.push(`Utilisation mémoire élevée: ${memUsageMB.toFixed(0)}MB`);
                if (health.status === 'OK') health.status = 'WARNING';
            }

            // Vérifier les performances récentes
            const recentTrades = this.data.trades.slice(0, 10);
            const recentLosses = recentTrades.filter(t => t.pnl < 0).length;
            
            if (recentLosses >= 5) {
                health.issues.push('5+ pertes consécutives détectées');
                health.status = 'WARNING';
                this.addAlert('WARNING', 'Série de pertes détectée - Vérification recommandée');
            }

        } catch (error) {
            health.status = 'ERROR';
            health.issues.push('Erreur durant vérification santé: ' + error.message);
        }

        this.data.systemHealth = health;

        // Déclencher alerte si problème
        if (health.status !== 'OK') {
            this.addAlert(health.status, `Problème système: ${health.issues.join(', ')}`);
        }
    }

    // Ajout d'alerte
    addAlert(type, message) {
        const alert = {
            type,
            message,
            timestamp: Date.now(),
            id: Date.now().toString()
        };
        
        this.data.alerts.unshift(alert);
        this.data.alerts = this.data.alerts.slice(0, 100); // Garder 100 alertes max
        
        // Diffuser l'alerte
        this.io.emit('alert', alert);
        
        console.log(`🚨 [${type}] ${message}`);
    }

    // Arrêt d'urgence
    emergencyStop() {
        console.log('🚨 ARRÊT D\'URGENCE DÉCLENCHÉ');
        
        try {
            // Arrêter PM2
            const { execSync } = require('child_process');
            execSync('pm2 stop realistic-trading-bot');
            
            this.addAlert('EMERGENCY', 'Arrêt d\'urgence activé - Bot arrêté');
            
            // Log d'urgence
            const emergencyLog = {
                timestamp: new Date().toISOString(),
                action: 'EMERGENCY_STOP',
                trigger: 'DASHBOARD',
                performance: this.data.performance
            };
            
            fs.appendFileSync(
                path.join(this.config.logsPath, 'emergency.log'),
                JSON.stringify(emergencyLog) + '\n'
            );
            
        } catch (error) {
            console.error('Erreur arrêt d\'urgence:', error);
            this.addAlert('ERROR', 'Erreur durant arrêt d\'urgence: ' + error.message);
        }
    }

    // Diffusion des mises à jour
    broadcastUpdate() {
        this.io.emit('data-update', {
            performance: this.data.performance,
            realTimeStats: this.data.realTimeStats,
            systemHealth: this.data.systemHealth,
            latestTrades: this.data.trades.slice(0, 5)
        });
    }

    // Génération du HTML du dashboard
    generateDashboardHTML() {
        return `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Trading Bot Dashboard</title>
    <script src="/socket.io/socket.io.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            background: #1a1a1a; 
            color: #fff; 
            padding: 20px;
        }
        .container { max-width: 1400px; margin: 0 auto; }
        .header { 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            margin-bottom: 30px;
            padding: 20px;
            background: #2d2d2d;
            border-radius: 10px;
        }
        .grid { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); 
            gap: 20px; 
            margin-bottom: 30px;
        }
        .card { 
            background: #2d2d2d; 
            border-radius: 10px; 
            padding: 20px; 
            border-left: 4px solid #4CAF50;
        }
        .card.warning { border-left-color: #FF9800; }
        .card.error { border-left-color: #f44336; }
        .metric { text-align: center; margin-bottom: 15px; }
        .metric-value { font-size: 2em; font-weight: bold; margin-bottom: 5px; }
        .metric-label { font-size: 0.9em; opacity: 0.7; }
        .positive { color: #4CAF50; }
        .negative { color: #f44336; }
        .neutral { color: #FF9800; }
        .trades-table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-top: 15px;
        }
        .trades-table th, .trades-table td { 
            padding: 10px; 
            text-align: left; 
            border-bottom: 1px solid #444;
        }
        .trades-table th { background: #333; }
        .emergency-btn { 
            background: #f44336; 
            color: white; 
            border: none; 
            padding: 15px 30px; 
            border-radius: 5px; 
            cursor: pointer; 
            font-weight: bold;
            font-size: 16px;
        }
        .emergency-btn:hover { background: #d32f2f; }
        .status-indicator { 
            display: inline-block; 
            width: 12px; 
            height: 12px; 
            border-radius: 50%; 
            margin-right: 8px;
        }
        .status-ok { background: #4CAF50; }
        .status-warning { background: #FF9800; }
        .status-error { background: #f44336; }
        .alert { 
            padding: 10px; 
            margin: 5px 0; 
            border-radius: 5px; 
            background: #333;
        }
        .alert.warning { border-left: 4px solid #FF9800; }
        .alert.error { border-left: 4px solid #f44336; }
        .chart-container { height: 300px; background: #333; border-radius: 5px; padding: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤖 Trading Bot Dashboard</h1>
            <div>
                <span id="system-status">
                    <span class="status-indicator status-ok"></span>Système OK
                </span>
                <button class="emergency-btn" onclick="emergencyStop()">🚨 ARRÊT D'URGENCE</button>
            </div>
        </div>

        <div class="grid">
            <div class="card">
                <div class="metric">
                    <div class="metric-value positive" id="total-pnl">+0.00%</div>
                    <div class="metric-label">Performance Totale</div>
                </div>
                <div class="metric">
                    <div class="metric-value" id="total-trades">0</div>
                    <div class="metric-label">Trades Totaux</div>
                </div>
            </div>

            <div class="card">
                <div class="metric">
                    <div class="metric-value" id="win-rate">0%</div>
                    <div class="metric-label">Taux de Réussite</div>
                </div>
                <div class="metric">
                    <div class="metric-value" id="avg-win">0.00%</div>
                    <div class="metric-label">Gain Moyen</div>
                </div>
            </div>

            <div class="card">
                <div class="metric">
                    <div class="metric-value" id="today-trades">0</div>
                    <div class="metric-label">Trades Aujourd'hui</div>
                </div>
                <div class="metric">
                    <div class="metric-value" id="today-pnl">+0.00%</div>
                    <div class="metric-label">Performance Quotidienne</div>
                </div>
            </div>

            <div class="card">
                <div class="metric">
                    <div class="metric-value" id="current-drawdown">0.00%</div>
                    <div class="metric-label">Drawdown Actuel</div>
                </div>
                <div class="metric">
                    <div class="metric-value" id="active-positions">0</div>
                    <div class="metric-label">Positions Actives</div>
                </div>
            </div>
        </div>

        <div class="grid">
            <div class="card">
                <h3>📊 Trades Récents</h3>
                <table class="trades-table" id="trades-table">
                    <thead>
                        <tr>
                            <th>Symbole</th>
                            <th>Direction</th>
                            <th>PnL</th>
                            <th>Temps</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>

            <div class="card">
                <h3>🚨 Alertes Récentes</h3>
                <div id="alerts-container"></div>
            </div>
        </div>
    </div>

    <script>
        const socket = io();
        let data = {};

        socket.on('initial-data', (initialData) => {
            data = initialData;
            updateDashboard();
        });

        socket.on('data-update', (update) => {
            Object.assign(data, update);
            updateDashboard();
        });

        socket.on('alert', (alert) => {
            addAlert(alert);
        });

        function updateDashboard() {
            // Mise à jour des métriques principales
            document.getElementById('total-pnl').textContent = 
                (data.performance?.totalPnLPercent || 0).toFixed(2) + '%';
            document.getElementById('total-trades').textContent = 
                data.performance?.totalTrades || 0;
            document.getElementById('win-rate').textContent = 
                (data.performance?.winRate || 0).toFixed(1) + '%';
            document.getElementById('avg-win').textContent = 
                (data.performance?.avgWin || 0).toFixed(2) + '%';
            document.getElementById('today-trades').textContent = 
                data.realTimeStats?.todayTrades || 0;
            document.getElementById('today-pnl').textContent = 
                (data.realTimeStats?.todayPnLPercent || 0).toFixed(2) + '%';
            document.getElementById('current-drawdown').textContent = 
                (data.performance?.currentDrawdown || 0).toFixed(2) + '%';
            document.getElementById('active-positions').textContent = 
                data.realTimeStats?.activePositions || 0;

            // Mise à jour des couleurs
            updateElementClass('total-pnl', data.performance?.totalPnLPercent || 0);
            updateElementClass('today-pnl', data.realTimeStats?.todayPnLPercent || 0);

            // Mise à jour du statut système
            updateSystemStatus();

            // Mise à jour de la table des trades
            updateTradesTable();
        }

        function updateElementClass(id, value) {
            const element = document.getElementById(id);
            element.className = value > 0 ? 'metric-value positive' : 
                              value < 0 ? 'metric-value negative' : 'metric-value neutral';
        }

        function updateSystemStatus() {
            const statusElement = document.getElementById('system-status');
            const health = data.systemHealth;
            
            if (health?.status === 'OK') {
                statusElement.innerHTML = '<span class="status-indicator status-ok"></span>Système OK';
            } else if (health?.status === 'WARNING') {
                statusElement.innerHTML = '<span class="status-indicator status-warning"></span>Avertissement';
            } else {
                statusElement.innerHTML = '<span class="status-indicator status-error"></span>Erreur';
            }
        }

        function updateTradesTable() {
            const tbody = document.querySelector('#trades-table tbody');
            tbody.innerHTML = '';
            
            (data.latestTrades || []).slice(0, 10).forEach(trade => {
                const row = document.createElement('tr');
                row.innerHTML = \`
                    <td>\${trade.symbol}</td>
                    <td>\${trade.direction}</td>
                    <td class="\${trade.pnl > 0 ? 'positive' : 'negative'}">
                        \${trade.pnlPercent.toFixed(2)}%
                    </td>
                    <td>\${new Date(trade.exitTime).toLocaleTimeString()}</td>
                \`;
                tbody.appendChild(row);
            });
        }

        function addAlert(alert) {
            const container = document.getElementById('alerts-container');
            const alertDiv = document.createElement('div');
            alertDiv.className = \`alert \${alert.type.toLowerCase()}\`;
            alertDiv.innerHTML = \`
                <strong>\${alert.type}:</strong> \${alert.message}
                <br><small>\${new Date(alert.timestamp).toLocaleString()}</small>
            \`;
            container.insertBefore(alertDiv, container.firstChild);
            
            // Garder seulement 5 alertes visibles
            while (container.children.length > 5) {
                container.removeChild(container.lastChild);
            }
        }

        function emergencyStop() {
            if (confirm('⚠️ ATTENTION: Ceci va arrêter immédiatement le bot de trading. Confirmer?')) {
                socket.emit('emergency-stop');
                alert('🚨 Arrêt d\\'urgence envoyé');
            }
        }

        // Mise à jour automatique du temps
        setInterval(() => {
            document.title = \`Trading Bot Dashboard - \${new Date().toLocaleTimeString()}\`;
        }, 1000);
    </script>
</body>
</html>`;
    }

    // Méthodes utilitaires
    getActivePositions() {
        // Simulation - en réalité, interroger le bot principal
        return [];
    }

    isMarketOpen() {
        // Crypto fonctionne 24/7
        return true;
    }

    estimateNextTrade() {
        // Estimation basée sur la fréquence historique
        const trades = this.data.trades.slice(0, 10);
        if (trades.length < 2) return 'Données insuffisantes';
        
        const intervals = [];
        for (let i = 1; i < trades.length; i++) {
            intervals.push(trades[i-1].exitTime - trades[i].exitTime);
        }
        
        const avgInterval = intervals.reduce((sum, i) => sum + i, 0) / intervals.length;
        const lastTradeTime = trades[0]?.exitTime || Date.now();
        const nextEstimate = lastTradeTime + avgInterval;
        
        return nextEstimate > Date.now() ? 
            new Date(nextEstimate).toLocaleTimeString() : 'Bientôt';
    }

    getSystemUptime() {
        return Math.floor(process.uptime() / 3600) + 'h';
    }

    calculateEquityCurve(trades) {
        let equity = 10000; // Capital initial
        return trades.map(trade => {
            equity += trade.pnl;
            return equity;
        });
    }

    calculateCurrentDrawdown(equity) {
        if (equity.length === 0) return 0;
        
        let peak = Math.max(...equity);
        let current = equity[equity.length - 1];
        
        return ((peak - current) / peak) * 100;
    }

    calculateMonthlyReturn(trades) {
        const oneMonthAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        const monthTrades = trades.filter(t => t.exitTime >= oneMonthAgo);
        
        return monthTrades.reduce((sum, t) => sum + t.pnlPercent, 0);
    }

    getCurrentConfig() {
        try {
            const configPath = path.join(__dirname, 'config/paper.json');
            if (fs.existsSync(configPath)) {
                return JSON.parse(fs.readFileSync(configPath, 'utf8'));
            }
        } catch (error) {
            console.error('Erreur lecture config:', error);
        }
        return {};
    }

    // Démarrage du serveur
    start() {
        this.server.listen(this.config.port, () => {
            console.log(`🌐 Dashboard démarré sur http://localhost:${this.config.port}`);
            console.log('📊 Interfaces disponibles:');
            console.log(`   • Dashboard: http://localhost:${this.config.port}`);
            console.log(`   • API Trades: http://localhost:${this.config.port}/api/trades`);
            console.log(`   • API Performance: http://localhost:${this.config.port}/api/performance`);
            console.log(`   • API Santé: http://localhost:${this.config.port}/api/health`);
        });
    }

    stop() {
        this.server.close();
        console.log('🌐 Dashboard arrêté');
    }
}

// Configuration et démarrage
const dashboardConfig = {
    port: process.env.DASHBOARD_PORT || 3000,
    logsPath: process.env.LOGS_PATH || './logs',
    updateInterval: 5000
};

// Démarrage si fichier principal
if (require.main === module) {
    const dashboard = new TradingDashboard(dashboardConfig);
    dashboard.start();
    
    // Arrêt propre
    process.on('SIGINT', () => {
        console.log('\n🛑 Arrêt du dashboard...');
        dashboard.stop();
        process.exit(0);
    });
}

module.exports = TradingDashboard;