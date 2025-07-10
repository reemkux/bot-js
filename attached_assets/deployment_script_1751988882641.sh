#!/bin/bash

# Script de déploiement pour bot de trading éducatif
# ATTENTION: Seulement pour simulation et apprentissage

echo "🚀 Déploiement du bot de trading éducatif..."

# Vérification des prérequis
check_prerequisites() {
    echo "📋 Vérification des prérequis..."
    
    # Node.js
    if ! command -v node &> /dev/null; then
        echo "❌ Node.js n'est pas installé"
        exit 1
    fi
    
    # PM2
    if ! command -v pm2 &> /dev/null; then
        echo "📦 Installation de PM2..."
        npm install -g pm2
    fi
    
    echo "✅ Prérequis OK"
}

# Installation des dépendances
install_dependencies() {
    echo "📦 Installation des dépendances..."
    
    # Créer package.json si inexistant
    if [ ! -f "package.json" ]; then
        cat > package.json << EOL
{
  "name": "trading-bot-educational",
  "version": "1.0.0",
  "description": "Bot de trading éducatif - SIMULATION UNIQUEMENT",
  "main": "bot.js",
  "scripts": {
    "start": "node bot.js",
    "dev": "nodemon bot.js",
    "test": "echo \\"Mode test uniquement\\" && exit 1"
  },
  "dependencies": {
    "ws": "^8.13.0",
    "node-fetch": "^3.3.2",
    "node-cron": "^3.0.2"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  },
  "keywords": ["trading", "simulation", "educational"],
  "author": "Educational Purpose",
  "license": "MIT"
}
EOL
    fi
    
    npm install
    echo "✅ Dépendances installées"
}

# Configuration des logs
setup_logging() {
    echo "📝 Configuration des logs..."
    mkdir -p logs
    
    # Rotation des logs avec PM2
    pm2 install pm2-logrotate
    pm2 set pm2-logrotate:max_size 10M
    pm2 set pm2-logrotate:retain 30
    pm2 set pm2-logrotate:compress true
    
    echo "✅ Logs configurés"
}

# Démarrage avec PM2
start_with_pm2() {
    echo "🚀 Démarrage avec PM2..."
    
    # Arrêter le processus s'il existe
    pm2 stop trading-bot-educational 2>/dev/null || true
    pm2 delete trading-bot-educational 2>/dev/null || true
    
    # Démarrer avec la configuration
    pm2 start ecosystem.config.js
    
    # Sauvegarder la configuration
    pm2 save
    
    # Auto-démarrage au boot (optionnel)
    # pm2 startup
    
    echo "✅ Bot démarré avec PM2"
}

# Monitoring et vérifications
setup_monitoring() {
    echo "📊 Configuration du monitoring..."
    
    # Script de health check
    cat > health_check.js << 'EOL'
const fs = require('fs');

function healthCheck() {
    try {
        // Vérifier si le bot fonctionne
        const logFile = './logs/combined.log';
        if (fs.existsSync(logFile)) {
            const stats = fs.statSync(logFile);
            const now = new Date();
            const timeDiff = now - stats.mtime;
            
            // Si pas de logs depuis 5 minutes, alerte
            if (timeDiff > 5 * 60 * 1000) {
                console.log('⚠️ Bot possiblement inactif');
                return false;
            }
        }
        
        console.log('✅ Health check OK');
        return true;
    } catch (error) {
        console.error('❌ Health check failed:', error);
        return false;
    }
}

// Exécuter le check
healthCheck();
EOL
    
    # Cron job pour health check (optionnel)
    echo "# Health check toutes les 5 minutes" > health_cron.txt
    echo "*/5 * * * * cd $(pwd) && node health_check.js >> logs/health.log 2>&1" >> health_cron.txt
    
    echo "✅ Monitoring configuré"
    echo "📄 Pour activer le cron: crontab health_cron.txt"
}

# Affichage des commandes utiles
show_commands() {
    echo ""
    echo "🎛️  COMMANDES UTILES:"
    echo "   pm2 status              - Statut des processus"
    echo "   pm2 logs                - Voir les logs en temps réel"
    echo "   pm2 monit               - Interface de monitoring"
    echo "   pm2 restart trading-bot-educational  - Redémarrer"
    echo "   pm2 stop trading-bot-educational     - Arrêter"
    echo "   pm2 delete trading-bot-educational   - Supprimer"
    echo ""
    echo "📊 SURVEILLANCE:"
    echo "   tail -f logs/combined.log    - Logs en temps réel"
    echo "   cat trading_log.json         - Historique des trades"
    echo ""
    echo "⚠️  RAPPEL: Mode simulation uniquement!"
}

# Fonction principale
main() {
    echo "🤖 Configuration du bot de trading éducatif"
    echo "⚠️  IMPORTANT: Ceci est uniquement pour la simulation!"
    echo ""
    
    read -p "Continuer? (y/N): " -n 1 -r
    echo ""
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Arrêt du déploiement"
        exit 1
    fi
    
    check_prerequisites
    install_dependencies
    setup_logging
    start_with_pm2
    setup_monitoring
    show_commands
    
    echo ""
    echo "✅ Déploiement terminé!"
    echo "🔍 Utilisez 'pm2 monit' pour surveiller le bot"
}

# Fonction de nettoyage
cleanup() {
    echo ""
    echo "🧹 Nettoyage..."
    pm2 stop trading-bot-educational 2>/dev/null || true
    pm2 delete trading-bot-educational 2>/dev/null || true
    echo "✅ Nettoyage terminé"
}

# Gestion des arguments
case "${1:-}" in
    "start")
        main
        ;;
    "stop")
        pm2 stop trading-bot-educational
        ;;
    "restart")
        pm2 restart trading-bot-educational
        ;;
    "logs")
        pm2 logs trading-bot-educational
        ;;
    "status")
        pm2 status
        ;;
    "cleanup")
        cleanup
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|logs|status|cleanup}"
        echo ""
        echo "Commandes disponibles:"
        echo "  start     - Déployer et démarrer le bot"
        echo "  stop      - Arrêter le bot"
        echo "  restart   - Redémarrer le bot"
        echo "  logs      - Afficher les logs"
        echo "  status    - Statut du bot"
        echo "  cleanup   - Nettoyer l'installation"
        exit 1
        ;;
esac