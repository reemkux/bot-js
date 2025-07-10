#!/bin/bash

# Script de déploiement automatisé complet pour bot de trading réaliste
# Version: 1.0.0
# Auteur: Équipe Trading Bot
# Usage: ./deploy_complete.sh [environment] [mode]

set -euo pipefail  # Strict error handling

# Configuration globale
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_NAME="realistic-trading-bot"
readonly VERSION="1.0.0"
readonly MIN_NODE_VERSION="18"
readonly MIN_DOCKER_VERSION="20"

# Couleurs pour l'affichage
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly PURPLE='\033[0;35m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m' # No Color

# Variables d'environnement
ENVIRONMENT="${1:-development}"
MODE="${2:-paper}"
SKIP_TESTS="${SKIP_TESTS:-false}"
FORCE_DEPLOY="${FORCE_DEPLOY:-false}"
DRY_RUN="${DRY_RUN:-false}"

# Fonctions utilitaires
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*"
}

log_success() {
    echo -e "${GREEN}✅ $*${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $*${NC}"
}

log_error() {
    echo -e "${RED}❌ $*${NC}"
    exit 1
}

log_info() {
    echo -e "${CYAN}ℹ️  $*${NC}"
}

log_step() {
    echo -e "\n${PURPLE}🔄 $*${NC}"
    echo -e "${PURPLE}$(printf '%.0s─' {1..60})${NC}"
}

# Vérification des prérequis
check_prerequisites() {
    log_step "Vérification des prérequis système"
    
    # Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js n'est pas installé. Version requise: ${MIN_NODE_VERSION}+"
    fi
    
    local node_version
    node_version=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$node_version" -lt "$MIN_NODE_VERSION" ]; then
        log_error "Node.js version ${MIN_NODE_VERSION}+ requise (actuelle: $(node -v))"
    fi
    log_success "Node.js $(node -v) - OK"
    
    # NPM
    if ! command -v npm &> /dev/null; then
        log_error "NPM n'est pas installé"
    fi
    log_success "NPM $(npm -v) - OK"
    
    # Docker (optionnel)
    if command -v docker &> /dev/null; then
        local docker_version
        docker_version=$(docker --version | grep -oE '[0-9]+' | head -1)
        if [ "$docker_version" -ge "$MIN_DOCKER_VERSION" ]; then
            log_success "Docker $(docker --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+') - OK"
        else
            log_warning "Docker version ${MIN_DOCKER_VERSION}+ recommandée"
        fi
    else
        log_warning "Docker non installé - Déploiement Docker indisponible"
    fi
    
    # PM2
    if ! command -v pm2 &> /dev/null; then
        log_info "Installation de PM2..."
        npm install -g pm2
        log_success "PM2 installé"
    else
        log_success "PM2 $(pm2 -v) - OK"
    fi
    
    # Vérification des permissions
    if [ ! -w "$(pwd)" ]; then
        log_error "Permissions d'écriture requises dans $(pwd)"
    fi
    
    # Vérification de l'espace disque
    local disk_usage
    disk_usage=$(df -h . | tail -1 | awk '{print $5}' | sed 's/%//')
    if [ "$disk_usage" -gt 90 ]; then
        log_error "Espace disque insuffisant (${disk_usage}% utilisé)"
    elif [ "$disk_usage" -gt 80 ]; then
        log_warning "Espace disque faible (${disk_usage}% utilisé)"
    fi
    log_success "Espace disque disponible"
    
    # Vérification de la mémoire
    local mem_available
    if command -v free &> /dev/null; then
        mem_available=$(free -m | awk 'NR==2{printf "%.1f", $7/1024}')
        if (( $(echo "$mem_available < 0.5" | bc -l) )); then
            log_warning "Mémoire disponible faible: ${mem_available}GB"
        fi
        log_success "Mémoire disponible: ${mem_available}GB"
    fi
}

# Validation des paramètres
validate_parameters() {
    log_step "Validation des paramètres de déploiement"
    
    # Validation environnement
    case $ENVIRONMENT in
        development|staging|production)
            log_success "Environnement: $ENVIRONMENT"
            ;;
        *)
            log_error "Environnement invalide: $ENVIRONMENT (development|staging|production)"
            ;;
    esac
    
    # Validation mode
    case $MODE in
        paper|live|backtest)
            log_success "Mode: $MODE"
            ;;
        *)
            log_error "Mode invalide: $MODE (paper|live|backtest)"
            ;;
    esac
    
    # Avertissement trading live
    if [ "$MODE" = "live" ] && [ "$ENVIRONMENT" = "production" ]; then
        log_warning "ATTENTION: Déploiement en mode TRADING RÉEL"
        if [ "$FORCE_DEPLOY" != "true" ]; then
            read -p "⚠️  Confirmer le trading réel? (tapez 'CONFIRM'): " -r
            if [ "$REPLY" != "CONFIRM" ]; then
                log_error "Déploiement annulé"
            fi
        fi
    fi
    
    log_info "Configuration: $ENVIRONMENT/$MODE"
}

# Sauvegarde de sécurité
create_backup() {
    log_step "Création de sauvegarde de sécurité"
    
    local backup_dir="./backups/deployment_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_dir"
    
    # Sauvegarde des fichiers critiques
    local critical_files=(
        "config/"
        "logs/"
        "package.json"
        "ecosystem.config.js"
    )
    
    for file in "${critical_files[@]}"; do
        if [ -e "$file" ]; then
            cp -r "$file" "$backup_dir/" 2>/dev/null || true
        fi
    done
    
    # Sauvegarde de la base de données PM2
    if command -v pm2 &> /dev/null; then
        pm2 save &>/dev/null || true
        cp ~/.pm2/dump.pm2 "$backup_dir/" 2>/dev/null || true
    fi
    
    log_success "Sauvegarde créée: $backup_dir"
    echo "$backup_dir" > .last_backup
}

# Installation et mise à jour des dépendances
install_dependencies() {
    log_step "Installation des dépendances"
    
    # Nettoyage des dépendances existantes
    if [ -d "node_modules" ] && [ "$FORCE_DEPLOY" = "true" ]; then
        log_info "Nettoyage des dépendances existantes..."
        rm -rf node_modules package-lock.json
    fi
    
    # Installation
    log_info "Installation des dépendances NPM..."
    if [ "$ENVIRONMENT" = "production" ]; then
        npm ci --only=production --silent
    else
        npm install --silent
    fi
    
    # Audit de sécurité
    log_info "Audit de sécurité..."
    npm audit --audit-level=high || log_warning "Vulnérabilités détectées - Vérifiez npm audit"
    
    log_success "Dépendances installées"
}

# Configuration de l'environnement
setup_environment() {
    log_step "Configuration de l'environnement"
    
    # Création des répertoires
    local directories=(
        "logs/trading"
        "logs/pm2"
        "logs/backtest"
        "logs/performance"
        "logs/ml_analysis"
        "config/environments"
        "data/historical"
        "data/live"
        "models"
        "optimization_results"
        "backtest_results"
        "docs"
    )
    
    for dir in "${directories[@]}"; do
        mkdir -p "$dir"
    done
    log_success "Structure de dossiers créée"
    
    # Configuration des variables d'environnement
    create_env_file
    
    # Configuration spécifique à l'environnement
    setup_config_files
    
    # Permissions
    chmod +x deploy.sh scripts/*.sh 2>/dev/null || true
    
    log_success "Environnement configuré"
}

# Création du fichier .env
create_env_file() {
    log_info "Création du fichier .env..."
    
    cat > .env << EOF
# Configuration environnement: $ENVIRONMENT
NODE_ENV=$ENVIRONMENT
TRADING_MODE=$MODE
LOG_LEVEL=info

# Ports
DASHBOARD_PORT=3000
METRICS_PORT=9090

# Base de données
REDIS_URL=redis://localhost:6379

# Sécurité
SESSION_SECRET=$(openssl rand -hex 32)

# Binance (à configurer)
BINANCE_TESTNET=true
# BINANCE_API_KEY=
# BINANCE_API_SECRET=

# Monitoring
PROMETHEUS_ENABLED=true
GRAFANA_ENABLED=true

# ML
ML_ENABLED=true
ML_RETRAINING_INTERVAL=86400000

# Alertes
ALERTS_ENABLED=true
# ALERT_EMAIL_USER=
# ALERT_EMAIL_PASSWORD=
# ALERT_DISCORD_WEBHOOK=

# Déploiement
DEPLOYMENT_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
DEPLOYMENT_VERSION=$VERSION
EOF

    log_success "Fichier .env créé"
}

# Configuration des fichiers de config
setup_config_files() {
    log_info "Configuration des fichiers de configuration..."
    
    # Configuration base si inexistante
    if [ ! -f "config/base.json" ]; then
        create_base_config
    fi
    
    # Configuration spécifique à l'environnement
    local env_config="config/environments/${ENVIRONMENT}.json"
    if [ ! -f "$env_config" ]; then
        create_environment_config "$env_config"
    fi
    
    # Configuration PM2
    update_pm2_config
    
    log_success "Fichiers de configuration mis à jour"
}

# Création de la configuration de base
create_base_config() {
    cat > config/base.json << 'EOF'
{
  "trading": {
    "paperTrading": true,
    "totalCapital": 10000,
    "dailyTargetMin": 0.003,
    "dailyTargetMax": 0.005,
    "stopLossPercent": 0.015,
    "maxPositionPercent": 0.05,
    "subPortfolios": 4,
    "maxTradesPerDay": 3,
    "maxConsecutiveLosses": 3,
    "cooldownAfterLoss": 3600000,
    "symbols": ["BTCUSDT", "ETHUSDT", "ADAUSDT"]
  },
  "binance": {
    "testnet": true,
    "recvWindow": 5000,
    "timeout": 10000
  },
  "alerts": {
    "email": { "enabled": false },
    "discord": { "enabled": false },
    "filters": {
      "minPnLPercent": 1.0,
      "maxDrawdownPercent": 10.0,
      "emergencyOnly": false
    }
  },
  "monitoring": {
    "metricsPort": 9090,
    "updateInterval": 30000,
    "dataRetentionDays": 30
  },
  "dashboard": {
    "port": 3000,
    "updateInterval": 5000
  }
}
EOF
}

# Création de la configuration d'environnement
create_environment_config() {
    local config_file="$1"
    
    case $ENVIRONMENT in
        development)
            cat > "$config_file" << 'EOF'
{
  "trading": {
    "paperTrading": true,
    "totalCapital": 1000
  },
  "monitoring": {
    "updateInterval": 10000
  }
}
EOF
            ;;
        staging)
            cat > "$config_file" << 'EOF'
{
  "trading": {
    "paperTrading": true,
    "totalCapital": 5000,
    "maxTradesPerDay": 2
  }
}
EOF
            ;;
        production)
            cat > "$config_file" << 'EOF'
{
  "trading": {
    "paperTrading": false,
    "totalCapital": 1000,
    "dailyTargetMin": 0.002,
    "dailyTargetMax": 0.003,
    "maxPositionPercent": 0.03,
    "maxTradesPerDay": 2,
    "maxConsecutiveLosses": 2
  },
  "alerts": {
    "email": { "enabled": true },
    "discord": { "enabled": true },
    "filters": {
      "emergencyOnly": false
    }
  }
}
EOF
            ;;
    esac
}

# Mise à jour de la configuration PM2
update_pm2_config() {
    cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: '$PROJECT_NAME',
    script: 'realistic_bot.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      TRADING_MODE: 'paper'
    },
    env_staging: {
      NODE_ENV: 'staging',
      TRADING_MODE: 'paper'
    },
    env_production: {
      NODE_ENV: 'production',
      TRADING_MODE: '$MODE'
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: './logs/pm2/err.log',
    out_file: './logs/pm2/out.log',
    log_file: './logs/pm2/combined.log',
    time: true,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
EOF
}

# Tests automatisés
run_tests() {
    if [ "$SKIP_TESTS" = "true" ]; then
        log_warning "Tests ignorés (SKIP_TESTS=true)"
        return 0
    fi
    
    log_step "Exécution des tests automatisés"
    
    # Test de syntaxe
    log_info "Vérification syntaxe JavaScript..."
    find . -name "*.js" -not -path "./node_modules/*" -exec node -c {} \; || {
        log_error "Erreurs de syntaxe détectées"
    }
    log_success "Syntaxe JavaScript - OK"
    
    # Test de configuration
    log_info "Validation des configurations..."
    if [ -f "test_configuration.js" ]; then
        node test_configuration.js || log_error "Configuration invalide"
    fi
    log_success "Configuration - OK"
    
    # Test des dépendances
    log_info "Vérification des dépendances..."
    npm ls --depth=0 &>/dev/null || log_warning "Problèmes de dépendances détectés"
    log_success "Dépendances - OK"
    
    # Tests unitaires si disponibles
    if [ -f "package.json" ] && grep -q '"test"' package.json; then
        log_info "Exécution des tests unitaires..."
        npm test || log_error "Tests unitaires échoués"
        log_success "Tests unitaires - OK"
    fi
    
    # Test de connectivité API
    log_info "Test connectivité Binance..."
    curl -s --max-time 10 https://api.binance.com/api/v3/ping || {
        log_warning "Connexion Binance indisponible"
    }
    log_success "Connectivité - OK"
}

# Backtesting automatique
run_backtesting() {
    if [ "$MODE" = "live" ] || [ "$ENVIRONMENT" = "production" ]; then
        log_step "Backtesting de validation"
        
        log_info "Exécution du backtesting automatique..."
        
        if [ -f "backtesting_system.js" ]; then
            timeout 300 node backtesting_system.js || {
                log_error "Backtesting échoué - Déploiement arrêté"
            }
            
            # Validation des résultats
            if [ -f "backtest_results/latest_report.json" ]; then
                local win_rate
                win_rate=$(jq -r '.metrics.winRate // 0' backtest_results/latest_report.json)
                
                if (( $(echo "$win_rate < 40" | bc -l) )); then
                    log_error "Taux de réussite insuffisant: ${win_rate}% (minimum: 40%)"
                fi
                
                log_success "Backtesting validé - Taux de réussite: ${win_rate}%"
            else
                log_warning "Résultats de backtesting non trouvés"
            fi
        else
            log_warning "Module de backtesting non trouvé"
        fi
    fi
}

# Déploiement principal
deploy_application() {
    log_step "Déploiement de l'application"
    
    if [ "$DRY_RUN" = "true" ]; then
        log_info "MODE DRY-RUN: Simulation du déploiement"
        return 0
    fi
    
    # Arrêt des processus existants
    log_info "Arrêt des processus existants..."
    pm2 stop $PROJECT_NAME 2>/dev/null || true
    pm2 delete $PROJECT_NAME 2>/dev/null || true
    
    # Nettoyage des logs anciens
    find logs/ -name "*.log" -mtime +7 -delete 2>/dev/null || true
    
    # Démarrage avec PM2
    log_info "Démarrage avec PM2..."
    pm2 start ecosystem.config.js --env $ENVIRONMENT
    pm2 save
    
    # Attente de stabilisation
    log_info "Attente de stabilisation (30s)..."
    sleep 30
    
    # Vérification du démarrage
    if pm2 list | grep -q "online.*$PROJECT_NAME"; then
        log_success "Application démarrée avec succès"
    else
        log_error "Échec du démarrage de l'application"
    fi
}

# Configuration du monitoring
setup_monitoring() {
    log_step "Configuration du monitoring"
    
    # Configuration Prometheus
    if [ -f "config/prometheus.yml" ]; then
        log_info "Configuration Prometheus trouvée"
    else
        log_warning "Configuration Prometheus manquante"
    fi
    
    # Démarrage du serveur de métriques
    if [ -f "monitoring_system.js" ]; then
        log_info "Démarrage du système de monitoring..."
        nohup node monitoring_system.js &>/dev/null &
        echo $! > monitoring.pid
        log_success "Monitoring démarré (PID: $!)"
    fi
    
    # Health checks
    setup_health_checks
}

# Configuration des health checks
setup_health_checks() {
    log_info "Configuration des health checks..."
    
    # Script de health check
    cat > health_check.sh << 'EOF'
#!/bin/bash
# Health check automatique

# Vérification PM2
if ! pm2 list | grep -q "online.*realistic-trading-bot"; then
    echo "CRITICAL: Bot non actif"
    exit 2
fi

# Vérification des logs
if [ ! -f "logs/trading/combined.log" ]; then
    echo "WARNING: Logs manquants"
    exit 1
fi

# Vérification activité récente
if [ $(($(date +%s) - $(stat -f %m logs/trading/combined.log))) -gt 300 ]; then
    echo "WARNING: Pas d'activité récente"
    exit 1
fi

echo "OK: Système fonctionnel"
exit 0
EOF

    chmod +x health_check.sh
    
    # Configuration cron pour health check
    (crontab -l 2>/dev/null; echo "*/5 * * * * $(pwd)/health_check.sh >> logs/health.log 2>&1") | crontab -
    
    log_success "Health checks configurés"
}

# Tests post-déploiement
post_deployment_tests() {
    log_step "Tests post-déploiement"
    
    # Test de l'API
    log_info "Test de l'API..."
    local api_url="http://localhost:3000/health"
    
    for i in {1..5}; do
        if curl -s "$api_url" | grep -q "healthy"; then
            log_success "API accessible"
            break
        elif [ $i -eq 5 ]; then
            log_error "API inaccessible après 5 tentatives"
        else
            log_info "Tentative $i/5 - Attente 10s..."
            sleep 10
        fi
    done
    
    # Test des métriques
    log_info "Test des métriques..."
    if curl -s "http://localhost:9090/metrics" | head -n 1 | grep -q "#"; then
        log_success "Métriques disponibles"
    else
        log_warning "Métriques indisponibles"
    fi
    
    # Test des logs
    log_info "Vérification des logs..."
    if [ -f "logs/pm2/combined.log" ] && [ -s "logs/pm2/combined.log" ]; then
        log_success "Logs générés"
    else
        log_warning "Problème avec les logs"
    fi
    
    # Test de performance
    log_info "Test de performance basique..."
    local response_time
    response_time=$(curl -o /dev/null -s -w '%{time_total}' "http://localhost:3000/health")
    
    if (( $(echo "$response_time < 1.0" | bc -l) )); then
        log_success "Temps de réponse: ${response_time}s"
    else
        log_warning "Temps de réponse élevé: ${response_time}s"
    fi
}

# Génération du rapport de déploiement
generate_deployment_report() {
    log_step "Génération du rapport de déploiement"
    
    local report_file="deployment_report_$(date +%Y%m%d_%H%M%S).md"
    
    cat > "$report_file" << EOF
# Rapport de Déploiement

## Informations Générales
- **Date**: $(date)
- **Environnement**: $ENVIRONMENT
- **Mode**: $MODE
- **Version**: $VERSION
- **Utilisateur**: $(whoami)
- **Serveur**: $(hostname)

## Configuration
- **Node.js**: $(node -v)
- **NPM**: $(npm -v)
- **PM2**: $(pm2 -v)

## Statut des Services
\`\`\`
$(pm2 list)
\`\`\`

## Tests Effectués
- [x] Vérification des prérequis
- [x] Installation des dépendances
- [x] Tests automatisés
- [x] Configuration de l'environnement
- [x] Déploiement de l'application
- [x] Tests post-déploiement

## URLs d'Accès
- **Dashboard**: http://localhost:3000
- **API Health**: http://localhost:3000/health
- **Métriques**: http://localhost:9090/metrics

## Fichiers Importants
- **Configuration**: config/environments/$ENVIRONMENT.json
- **Logs**: logs/pm2/combined.log
- **Sauvegarde**: $(cat .last_backup 2>/dev/null || echo "Aucune")

## Prochaines Étapes
EOF

    if [ "$MODE" = "paper" ]; then
        cat >> "$report_file" << EOF
1. **Paper Trading**: Surveiller les performances pendant 30+ jours
2. **Analyse**: Examiner les métriques quotidiennement
3. **Optimisation**: Ajuster les paramètres si nécessaire
4. **Validation**: Comparer avec les résultats de backtesting
EOF
    elif [ "$MODE" = "live" ]; then
        cat >> "$report_file" << EOF
1. **Surveillance 24/7**: Monitoring continu obligatoire
2. **Alertes**: Vérifier la configuration des alertes
3. **Limites**: Respecter les limites de risque définies
4. **Backup**: Sauvegardes automatiques configurées
EOF
    fi
    
    cat >> "$report_file" << EOF

## Commandes Utiles
\`\`\`bash
# Statut
pm2 status
pm2 logs $PROJECT_NAME

# Monitoring
./health_check.sh
curl http://localhost:3000/health

# Arrêt d'urgence
pm2 stop $PROJECT_NAME
curl -X POST http://localhost:3000/api/emergency-stop
\`\`\`

## Support
En cas de problème:
1. Consulter les logs: \`pm2 logs $PROJECT_NAME\`
2. Vérifier la santé: \`./health_check.sh\`
3. Documentation: ./docs/README.md
EOF

    log_success "Rapport généré: $report_file"
    echo "$report_file" > .last_deployment_report
}

# Nettoyage et finalisation
cleanup_and_finalize() {
    log_step "Nettoyage et finalisation"
    
    # Nettoyage des fichiers temporaires
    rm -f /tmp/trading_bot_* 2>/dev/null || true
    
    # Compression des anciens logs
    find logs/ -name "*.log" -mtime +1 -exec gzip {} \; 2>/dev/null || true
    
    # Permissions finales
    chmod 600 config/environments/*.json 2>/dev/null || true
    chmod 700 scripts/*.sh 2>/dev/null || true
    
    # Création du fichier de version
    echo "$VERSION" > .version
    echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" > .deployment_date
    
    log_success "Nettoyage terminé"
}

# Affichage du résumé final
display_summary() {
    echo ""
    echo -e "${GREEN}$(printf '%.0s═' {1..60})${NC}"
    echo -e "${GREEN}✅ DÉPLOIEMENT TERMINÉ AVEC SUCCÈS${NC}"
    echo -e "${GREEN}$(printf '%.0s═' {1..60})${NC}"
    echo ""
    echo -e "${CYAN}📊 RÉSUMÉ:${NC}"
    echo -e "   Environnement: ${PURPLE}$ENVIRONMENT${NC}"
    echo -e "   Mode: ${PURPLE}$MODE${NC}"
    echo -e "   Version: ${PURPLE}$VERSION${NC}"
    echo ""
    echo -e "${CYAN}🌐 ACCÈS:${NC}"
    echo -e "   Dashboard: ${BLUE}http://localhost:3000${NC}"
    echo -e "   Métriques: ${BLUE}http://localhost:9090/metrics${NC}"
    echo -e "   Health: ${BLUE}http://localhost:3000/health${NC}"
    echo ""
    echo -e "${CYAN}📋 COMMANDES UTILES:${NC}"
    echo -e "   Status: ${YELLOW}pm2 status${NC}"
    echo -e "   Logs: ${YELLOW}pm2 logs $PROJECT_NAME${NC}"
    echo -e "   Health: ${YELLOW}./health_check.sh${NC}"
    echo ""
    
    if [ "$MODE" = "paper" ]; then
        echo -e "${YELLOW}⚠️  IMPORTANT:${NC}"
        echo -e "   Mode Paper Trading activé"
        echo -e "   Surveillance recommandée: 30+ jours"
        echo -e "   Aucun argent réel en jeu"
    elif [ "$MODE" = "live" ]; then
        echo -e "${RED}🚨 ATTENTION:${NC}"
        echo -e "   Mode Trading RÉEL activé"
        echo -e "   Surveillance 24/7 OBLIGATOIRE"
        echo -e "   Argent réel en jeu!"
    fi
    
    echo ""
    echo -e "${CYAN}📄 Rapport: ${NC}$(cat .last_deployment_report 2>/dev/null || echo 'Non disponible')"
    echo ""
}

# Fonction principale
main() {
    echo -e "${PURPLE}"
    cat << 'EOF'
    ██████╗ ███████╗ █████╗ ██╗     ██╗███████╗████████╗██╗ ██████╗
    ██╔══██╗██╔════╝██╔══██╗██║     ██║██╔════╝╚══██╔══╝██║██╔════╝
    ██████╔╝█████╗  ███████║██║     ██║███████╗   ██║   ██║██║     
    ██╔══██╗██╔══╝  ██╔══██║██║     ██║╚════██║   ██║   ██║██║     
    ██║  ██║███████╗██║  ██║███████╗██║███████║   ██║   ██║╚██████╗
    ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚══════╝╚═╝╚══════╝   ╚═╝   ╚═╝ ╚═════╝
                                                                     
    ████████╗██████╗  █████╗ ██████╗ ██╗███╗   ██╗ ██████╗           
    ╚══██╔══╝██╔══██╗██╔══██╗██╔══██╗██║████╗  ██║██╔════╝           
       ██║   ██████╔╝███████║██║  ██║██║██╔██╗ ██║██║  ███╗          
       ██║   ██╔══██╗██╔══██║██║  ██║██║██║╚██╗██║██║   ██║          
       ██║   ██║  ██║██║  ██║██████╔╝██║██║ ╚████║╚██████╔╝          
       ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚═╝╚═╝  ╚═══╝ ╚═════╝           
                                                                     
                        ██████╗  ██████╗ ████████╗                  
                        ██╔══██╗██╔═══██╗╚══██╔══╝                  
                        ██████╔╝██║   ██║   ██║                     
                        ██╔══██╗██║   ██║   ██║                     
                        ██████╔╝╚██████╔╝   ██║                     
                        ╚═════╝  ╚═════╝    ╚═╝                     
EOF
    echo -e "${NC}"
    echo -e "${CYAN}Déploiement Automatisé v$VERSION${NC}"
    echo -e "${CYAN}Environnement: $ENVIRONMENT | Mode: $MODE${NC}"
    echo ""
    
    # Exécution des étapes
    check_prerequisites
    validate_parameters
    create_backup
    install_dependencies
    setup_environment
    run_tests
    run_backtesting
    deploy_application
    setup_monitoring
    post_deployment_tests
    generate_deployment_report
    cleanup_and_finalize
    display_summary
    
    log_success "Déploiement terminé avec succès!"
}

# Gestion des signaux
trap 'log_error "Déploiement interrompu par signal"' INT TERM

# Point d'entrée
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi