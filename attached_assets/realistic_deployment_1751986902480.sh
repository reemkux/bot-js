#!/bin/bash

# Script de déploiement complet pour bot de trading réaliste
# Objectifs: 0.3-0.5% quotidien avec gestion des risques stricte

set -e  # Arrêt en cas d'erreur

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration par défaut
PROJECT_NAME="realistic-trading-bot"
PROJECT_DIR="$(pwd)"
NODE_VERSION="18"
PAPER_TRADING_DURATION="30" # jours minimum

# Fonctions utilitaires
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
    exit 1
}

# Vérification des prérequis
check_prerequisites() {
    log_info "Vérification des prérequis..."
    
    # Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js n'est pas installé. Version requise: $NODE_VERSION+"
    fi
    
    local node_version=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$node_version" -lt "$NODE_VERSION" ]; then
        log_error "Node.js version $NODE_VERSION+ requise (actuelle: $(node -v))"
    fi
    
    # NPM
    if ! command -v npm &> /dev/null; then
        log_error "NPM n'est pas installé"
    fi
    
    # Git (optionnel)
    if ! command -v git &> /dev/null; then
        log_warning "Git non installé - suivi de version indisponible"
    fi
    
    log_success "Prérequis validés"
}

# Avertissements de sécurité
show_warnings() {
    echo ""
    echo "⚠️ ═══════════════════════════════════════════════════════════════"
    echo "⚠️  AVERTISSEMENTS IMPORTANTS - BOT DE TRADING"
    echo "⚠️ ═══════════════════════════════════════════════════════════════"
    echo ""
    echo "🛑 RISQUES FINANCIERS:"
    echo "   • Le trading automatisé peut engendrer des pertes importantes"
    echo "   • Aucune garantie de profit, même avec un backtesting positif"
    echo "   • N'investissez que ce que vous pouvez vous permettre de perdre"
    echo ""
    echo "📋 ÉTAPES OBLIGATOIRES:"
    echo "   1. Backtesting complet (minimum 6 mois de données)"
    echo "   2. Paper trading $PAPER_TRADING_DURATION jours MINIMUM"
    echo "   3. Tests avec capital minimal uniquement"
    echo "   4. Surveillance continue des performances"
    echo ""
    echo "🎯 OBJECTIFS RÉALISTES:"
    echo "   • 0.3-0.5% par jour (PAS 2.5%!)"
    echo "   • Stop-loss strict à 1.5-2%"
    echo "   • Maximum 5% du capital par trade"
    echo "   • Diversification obligatoire"
    echo ""
    
    read -p "⚠️  J'ai lu et compris les risques (tapez 'COMPRIS'): " -r
    if [ "$REPLY" != "COMPRIS" ]; then
        log_error "Déploiement annulé - Lecture des avertissements requise"
    fi
}

# Configuration du projet
setup_project() {
    log_info "Configuration du projet $PROJECT_NAME..."
    
    # Création de la structure de dossiers
    mkdir -p logs/{pm2,trading,backtest,performance}
    mkdir -p config
    mkdir -p data/{historical,live}
    mkdir -p backtest_results
    mkdir -p docs
    
    # Package.json avec dépendances réalistes
    cat > package.json << EOL
{
  "name": "$PROJECT_NAME",
  "version": "1.0.0",
  "description": "Bot de trading réaliste - 0.3-0.5% quotidien avec gestion des risques",
  "main": "realistic_bot.js",
  "scripts": {
    "start": "node realistic_bot.js",
    "paper": "NODE_ENV=paper node realistic_bot.js",
    "backtest": "node backtesting_system.js",
    "test": "npm run backtest",
    "dev": "nodemon realistic_bot.js",
    "lint": "eslint *.js",
    "deploy": "pm2 start ecosystem.config.js",
    "stop": "pm2 stop $PROJECT_NAME",
    "logs": "pm2 logs $PROJECT_NAME",
    "monitor": "pm2 monit"
  },
  "dependencies": {
    "ws": "^8.14.2",
    "node-fetch": "^3.3.2",
    "node-cron": "^3.0.3",
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "winston": "^3.11.0",
    "chalk": "^4.1.2"
  },
  "devDependencies": {
    "nodemon": "^3.0.2",
    "eslint": "^8.56.0"
  },
  "keywords": ["trading", "bot", "realistic", "risk-management", "paper-trading"],
  "author": "Realistic Trader",
  "license": "MIT",
  "engines": {
    "node": ">=$NODE_VERSION.0.0"
  }
}
EOL

    log_success "Structure du projet créée"
}

# Installation des dépendances
install_dependencies() {
    log_info "Installation des dépendances..."
    
    npm install
    
    # Installation globale de PM2 si nécessaire
    if ! command -v pm2 &> /dev/null; then
        log_info "Installation de PM2..."
        npm install -g pm2
    fi
    
    # Installation de nodemon pour le développement
    if ! npm list nodemon &> /dev/null; then
        npm install --save-dev nodemon
    fi
    
    log_success "Dépendances installées"
}

# Configuration PM2
setup_pm2() {
    log_info "Configuration PM2..."
    
    # Configuration des logs PM2
    pm2 install pm2-logrotate || true
    pm2 set pm2-logrotate:max_size 10M
    pm2 set pm2-logrotate:retain 30
    pm2 set pm2-logrotate:compress true
    pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
    
    log_success "PM2 configuré"
}

# Configuration des fichiers de configuration
setup_config() {
    log_info "Création des fichiers de configuration..."
    
    # Configuration pour paper trading
    cat > config/paper.json << EOL
{
  "paperTrading": true,
  "dailyTargetMin": 0.003,
  "dailyTargetMax": 0.005,
  "stopLossPercent": 0.015,
  "maxPositionPercent": 0.05,
  "totalCapital": 10000,
  "subPortfolios": 4,
  "maxTradesPerDay": 3,
  "maxConsecutiveLosses": 3,
  "cooldownAfterLoss": 3600000,
  "symbols": ["BTCUSDT", "ETHUSDT", "ADAUSDT"],
  "logLevel": "info"
}
EOL

    # Configuration pour trading réel (plus conservative)
    cat > config/live.json << EOL
{
  "paperTrading": false,
  "dailyTargetMin": 0.002,
  "dailyTargetMax": 0.003,
  "stopLossPercent": 0.015,
  "maxPositionPercent": 0.03,
  "totalCapital": 1000,
  "subPortfolios": 3,
  "maxTradesPerDay": 2,
  "maxConsecutiveLosses": 2,
  "cooldownAfterLoss": 7200000,
  "symbols": ["BTCUSDT", "ETHUSDT"],
  "logLevel": "warn"
}
EOL

    # Configuration de backtesting
    cat > config/backtest.json << EOL
{
  "startDate": "2024-01-01",
  "endDate": "2024-12-31",
  "initialCapital": 10000,
  "symbols": ["BTCUSDT", "ETHUSDT", "ADAUSDT"],
  "dailyTargetMin": 0.003,
  "dailyTargetMax": 0.005,
  "stopLossPercent": 0.015,
  "maxPositionPercent": 0.05,
  "makerFee": 0.001,
  "takerFee": 0.001
}
EOL
    
    log_success "Fichiers de configuration créés"
}

# Mise en place du système de surveillance
setup_monitoring() {
    log_info "Configuration du système de surveillance..."
    
    # Script de health check
    cat > health_check.js << 'EOL'
const fs = require('fs');
const path = require('path');

class HealthChecker {
    constructor() {
        this.checks = [];
    }
    
    async checkLogActivity() {
        try {
            const logFile = path.join(__dirname, 'logs/trading/combined.log');
            if (!fs.existsSync(logFile)) {
                return { status: 'ERROR', message: 'Log file not found' };
            }
            
            const stats = fs.statSync(logFile);
            const timeDiff = Date.now() - stats.mtime.getTime();
            
            if (timeDiff > 10 * 60 * 1000) { // 10 minutes
                return { status: 'WARNING', message: 'No recent log activity' };
            }
            
            return { status: 'OK', message: 'Log activity normal' };
        } catch (error) {
            return { status: 'ERROR', message: error.message };
        }
    }
    
    async checkPM2Status() {
        return new Promise((resolve) => {
            require('child_process').exec('pm2 status realistic-trading-bot', (error, stdout) => {
                if (error) {
                    resolve({ status: 'ERROR', message: 'PM2 process not running' });
                } else if (stdout.includes('online')) {
                    resolve({ status: 'OK', message: 'PM2 process online' });
                } else {
                    resolve({ status: 'WARNING', message: 'PM2 process status unknown' });
                }
            });
        });
    }
    
    async checkDiskSpace() {
        return new Promise((resolve) => {
            require('child_process').exec('df -h .', (error, stdout) => {
                if (error) {
                    resolve({ status: 'ERROR', message: 'Cannot check disk space' });
                } else {
                    const lines = stdout.split('\n');
                    const usage = lines[1].split(/\s+/)[4];
                    const usagePercent = parseInt(usage.replace('%', ''));
                    
                    if (usagePercent > 90) {
                        resolve({ status: 'ERROR', message: `Disk usage critical: ${usage}` });
                    } else if (usagePercent > 80) {
                        resolve({ status: 'WARNING', message: `Disk usage high: ${usage}` });
                    } else {
                        resolve({ status: 'OK', message: `Disk usage normal: ${usage}` });
                    }
                }
            });
        });
    }
    
    async runAllChecks() {
        console.log('🔍 Health Check - ' + new Date().toISOString());
        console.log('═'.repeat(50));
        
        const checks = [
            { name: 'Log Activity', fn: this.checkLogActivity },
            { name: 'PM2 Status', fn: this.checkPM2Status },
            { name: 'Disk Space', fn: this.checkDiskSpace }
        ];
        
        let hasError = false;
        let hasWarning = false;
        
        for (const check of checks) {
            const result = await check.fn.call(this);
            const emoji = result.status === 'OK' ? '✅' : 
                         result.status === 'WARNING' ? '⚠️' : '❌';
            
            console.log(`${emoji} ${check.name}: ${result.message}`);
            
            if (result.status === 'ERROR') hasError = true;
            if (result.status === 'WARNING') hasWarning = true;
        }
        
        console.log('═'.repeat(50));
        
        if (hasError) {
            console.log('🚨 ERREURS DÉTECTÉES - Action requise');
        } else if (hasWarning) {
            console.log('⚠️  Avertissements - Surveillance recommandée');
        } else {
            console.log('✅ Tous les systèmes fonctionnent normalement');
        }
        
        // Log dans fichier
        const healthLog = {
            timestamp: new Date().toISOString(),
            status: hasError ? 'ERROR' : hasWarning ? 'WARNING' : 'OK',
            checks: checks.map(c => ({ name: c.name, result: c.result }))
        };
        
        fs.appendFileSync(
            path.join(__dirname, 'logs/health.log'),
            JSON.stringify(healthLog) + '\n'
        );
    }
}

// Exécution
new HealthChecker().runAllChecks().catch(console.error);
EOL

    # Cron job pour surveillance
    cat > setup_monitoring.sh << 'EOL'
#!/bin/bash

# Health check toutes les 15 minutes
echo "*/15 * * * * cd $(pwd) && node health_check.js >> logs/health_cron.log 2>&1" > health_cron.txt

# Sauvegarde quotidienne des logs à 2h du matin
echo "0 2 * * * cd $(pwd) && tar -czf logs/backup/daily_$(date +\%Y\%m\%d).tar.gz logs/trading/*.log" >> health_cron.txt

# Rapport hebdomadaire le dimanche à 23h
echo "0 23 * * 0 cd $(pwd) && node generate_weekly_report.js" >> health_cron.txt

echo "📋 Pour activer la surveillance automatique:"
echo "   crontab health_cron.txt"
echo ""
echo "📋 Pour voir les tâches cron actuelles:"
echo "   crontab -l"
EOL

    chmod +x setup_monitoring.sh
    
    # Création du répertoire de sauvegarde
    mkdir -p logs/backup
    
    log_success "Système de surveillance configuré"
}

# Validation de la configuration
validate_setup() {
    log_info "Validation de la configuration..."
    
    local errors=0
    
    # Vérifier les fichiers essentiels
    local required_files=(
        "realistic_bot.js"
        "backtesting_system.js"
        "ecosystem.config.js"
        "package.json"
        "config/paper.json"
        "config/live.json"
    )
    
    for file in "${required_files[@]}"; do
        if [ ! -f "$file" ]; then
            log_error "Fichier manquant: $file"
            ((errors++))
        fi
    done
    
    # Vérifier les dossiers
    local required_dirs=(
        "logs"
        "config"
        "data"
        "backtest_results"
    )
    
    for dir in "${required_dirs[@]}"; do
        if [ ! -d "$dir" ]; then
            log_error "Dossier manquant: $dir"
            ((errors++))
        fi
    done
    
    if [ $errors -eq 0 ]; then
        log_success "Configuration validée"
    else
        log_error "$errors erreur(s) détectée(s)"
    fi
}

# Exécution du backtesting obligatoire
run_mandatory_backtest() {
    log_info "Exécution du backtesting obligatoire..."
    
    echo ""
    echo "🧪 BACKTESTING OBLIGATOIRE"
    echo "═══════════════════════════"
    echo "Le backtesting doit valider votre stratégie AVANT tout trading."
    echo "Objectifs minimums:"
    echo "• Rendement total > 5%"
    echo "• Drawdown max < 20%"
    echo "• Win rate > 40%"
    echo "• Sharpe ratio > 0.8"
    echo ""
    
    read -p "Lancer le backtesting maintenant? (y/N): " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if [ -f "backtesting_system.js" ]; then
            node backtesting_system.js
            
            echo ""
            read -p "Les résultats du backtesting sont-ils satisfaisants? (y/N): " -n 1 -r
            echo ""
            
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                log_warning "Backtesting non satisfaisant - Améliorer la stratégie avant de continuer"
                return 1
            fi
        else
            log_error "Fichier backtesting_system.js manquant"
        fi
    else
        log_warning "Backtesting ignoré - FORTEMENT déconseillé"
        read -p "Continuer quand même? (y/N): " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_error "Déploiement annulé"
        fi
    fi
}

# Lancement en mode paper trading
start_paper_trading() {
    log_info "Lancement en mode paper trading..."
    
    echo ""
    echo "📝 PAPER TRADING OBLIGATOIRE"
    echo "═══════════════════════════════"
    echo "Durée minimum recommandée: $PAPER_TRADING_DURATION jours"
    echo "Le bot va démarrer en mode simulation uniquement."
    echo ""
    
    # Vérifier que la configuration est bien en paper trading
    if ! grep -q '"paperTrading": true' config/paper.json; then
        log_error "Configuration paper trading incorrecte"
    fi
    
    # Démarrer avec PM2
    pm2 start ecosystem.config.js --env paper
    pm2 save
    
    log_success "Bot démarré en mode paper trading"
    
    echo ""
    echo "🎛️  COMMANDES DE SURVEILLANCE:"
    echo "   pm2 status              - Statut du bot"
    echo "   pm2 logs                - Logs en temps réel"
    echo "   pm2 monit               - Interface de monitoring"
    echo "   node health_check.js    - Vérification santé"
    echo ""
    echo "📊 FICHIERS DE SUIVI:"
    echo "   logs/trading/trades.json     - Historique des trades"
    echo "   logs/trading/daily_stats.json - Statistiques quotidiennes"
    echo "   logs/trading/performance.json - Rapport de performance"
    echo ""
    echo "⏰ RAPPEL: Laisser tourner minimum $PAPER_TRADING_DURATION jours avant d'envisager le trading réel"
}

# Génération de la documentation
generate_docs() {
    log_info "Génération de la documentation..."
    
    cat > docs/README.md << EOL
# Bot de Trading Réaliste

## 🎯 Objectifs
- **0.3-0.5% de gain quotidien** (objectif réaliste)
- **Gestion des risques stricte** (stop-loss 1.5-2%)
- **Capital divisé en sous-portefeuilles**
- **Paper trading obligatoire 30+ jours**

## 📋 Étapes de Déploiement

### 1. Backtesting (OBLIGATOIRE)
\`\`\`bash
npm run backtest
\`\`\`

### 2. Paper Trading (30+ jours)
\`\`\`bash
npm run paper
pm2 logs
\`\`\`

### 3. Trading Réel (après validation)
⚠️ **Uniquement après validation du paper trading**
\`\`\`bash
# Configurer les clés API dans config/live.json
npm run deploy
\`\`\`

## 📊 Surveillance

### Commandes PM2
- \`pm2 status\` - Statut des processus
- \`pm2 logs\` - Logs en temps réel
- \`pm2 monit\` - Interface de monitoring
- \`pm2 restart realistic-trading-bot\` - Redémarrage

### Health Check
\`\`\`bash
node health_check.js
\`\`\`

### Logs Importants
- \`logs/trading/trades.json\` - Tous les trades
- \`logs/trading/performance.json\` - Métriques de performance
- \`logs/health.log\` - Santé du système

## ⚠️ Sécurité

### Configuration des Clés API
1. Créer des clés API Binance avec permissions limitées
2. Restriction IP recommandée
3. Pas de permissions de retrait
4. Tester d'abord en testnet

### Gestion des Risques
- Maximum 5% du capital par trade
- Stop-loss obligatoire à 1.5-2%
- Maximum 3 trades par jour
- Cooldown après pertes consécutives

## 📈 Métriques de Performance

### Objectifs Minimum
- Rendement quotidien: 0.3-0.5%
- Win rate: >40%
- Drawdown max: <20%
- Sharpe ratio: >0.8

### Validation Paper Trading
Le bot doit tourner 30 jours minimum en paper trading avec:
- Performance cohérente avec le backtesting
- Pas de bugs ou erreurs système
- Métriques dans les objectifs

## 🚨 Arrêt d'Urgence

En cas de problème:
\`\`\`bash
pm2 stop realistic-trading-bot
pm2 delete realistic-trading-bot
\`\`\`

## 📞 Support

En cas de pertes importantes ou de comportement anormal:
1. Arrêter immédiatement le bot
2. Analyser les logs
3. Vérifier la configuration
4. Contacter le support si nécessaire
EOL

    # Guide de démarrage rapide
    cat > docs/QUICKSTART.md << EOL
# Démarrage Rapide

## 1. Installation
\`\`\`bash
git clone <repo>
cd realistic-trading-bot
./deploy.sh install
\`\`\`

## 2. Backtesting
\`\`\`bash
npm run backtest
# Analyser les résultats avant de continuer
\`\`\`

## 3. Paper Trading
\`\`\`bash
npm run paper
# Laisser tourner 30+ jours
\`\`\`

## 4. Surveillance
\`\`\`bash
pm2 monit
# ou
pm2 logs
\`\`\`

## 5. Validation
Après 30 jours de paper trading, analyser:
- Performance moyenne quotidienne
- Stabilité du système
- Cohérence avec le backtesting

## 6. Trading Réel (optionnel)
⚠️ **Uniquement si paper trading réussi**
1. Configurer les clés API
2. Démarrer avec capital minimal
3. Surveillance continue
EOL

    log_success "Documentation générée dans docs/"
}

# Menu principal
show_menu() {
    echo ""
    echo "🤖 DÉPLOIEMENT BOT DE TRADING RÉALISTE"
    echo "═══════════════════════════════════════"
    echo "1. Installation complète"
    echo "2. Backtesting uniquement"
    echo "3. Paper trading"
    echo "4. Configuration live trading"
    echo "5. Surveillance et logs"
    echo "6. Nettoyage"
    echo "7. Aide"
    echo "q. Quitter"
    echo ""
}

# Menu principal d'installation
main() {
    case "${1:-menu}" in
        "install")
            show_warnings
            check_prerequisites
            setup_project
            install_dependencies
            setup_pm2
            setup_config
            setup_monitoring
            validate_setup
            generate_docs
            run_mandatory_backtest
            start_paper_trading
            ;;
        "backtest")
            if [ -f "backtesting_system.js" ]; then
                node backtesting_system.js
            else
                log_error "Fichier backtesting_system.js non trouvé"
            fi
            ;;
        "paper")
            pm2 start ecosystem.config.js --env paper
            pm2 logs
            ;;
        "live")
            log_warning "Trading réel - Vérifications de sécurité..."
            echo "Avez-vous:"
            echo "1. ✅ Fait un backtesting complet?"
            echo "2. ✅ Testé 30+ jours en paper trading?"
            echo "3. ✅ Analysé les performances?"
            echo "4. ✅ Configuré les clés API en mode restreint?"
            read -p "Toutes les étapes sont validées? (y/N): " -n 1 -r
            echo ""
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                pm2 start ecosystem.config.js --env production
                log_success "Bot démarré en mode LIVE"
                log_warning "SURVEILLANCE CONTINUE REQUISE"
            else
                log_error "Étapes de validation incomplètes"
            fi
            ;;
        "monitor")
            echo "🔍 Options de surveillance:"
            echo "1. pm2 monit     - Interface PM2"
            echo "2. pm2 logs      - Logs temps réel"
            echo "3. health check  - Vérification santé"
            echo "4. performance   - Métriques"
            read -p "Choix (1-4): " -n 1 -r
            echo ""
            case $REPLY in
                1) pm2 monit ;;
                2) pm2 logs ;;
                3) node health_check.js ;;
                4) cat logs/trading/performance.json | jq . ;;
                *) log_error "Option invalide" ;;
            esac
            ;;
        "cleanup")
            log_warning "Nettoyage complet du déploiement..."
            pm2 stop realistic-trading-bot 2>/dev/null || true
            pm2 delete realistic-trading-bot 2>/dev/null || true
            pm2 save
            log_success "Nettoyage terminé"
            ;;
        "help")
            echo "Aide - Bot de Trading Réaliste"
            echo "Usage: $0 [commande]"
            echo ""
            echo "Commandes:"
            echo "  install   - Installation complète"
            echo "  backtest  - Backtesting uniquement"
            echo "  paper     - Paper trading"
            echo "  live      - Trading réel (après validation)"
            echo "  monitor   - Surveillance"
            echo "  cleanup   - Nettoyage"
            echo "  help      - Cette aide"
            ;;
        "menu")
            while true; do
                show_menu
                read -p "Choix: " choice
                case $choice in
                    1) main install ;;
                    2) main backtest ;;
                    3) main paper ;;
                    4) main live ;;
                    5) main monitor ;;
                    6) main cleanup ;;
                    7) main help ;;
                    q|Q) exit 0 ;;
                    *) log_error "Option invalide" ;;
                esac
            done
            ;;
        *)
            log_error "Commande inconnue: $1. Utilisez 'help' pour l'aide."
            ;;
    esac
}

# Point d'entrée
if [ $# -eq 0 ]; then
    main menu
else
    main "$1"
fi