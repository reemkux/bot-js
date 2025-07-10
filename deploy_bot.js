
// Démarrage automatique du bot pour déploiement
// S'exécute en continu même fenêtre fermée

const fs = require('fs');
const path = require('path');

// Logging pour déploiement
function deployLog(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    
    // Sauvegarder aussi dans fichier
    const logDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    
    fs.appendFileSync(
        path.join(logDir, 'deployment.log'), 
        logMessage + '\n'
    );
}

// Gestion des erreurs pour déploiement
process.on('uncaughtException', (error) => {
    deployLog(`ERREUR CRITIQUE: ${error.message}`);
    deployLog('Redémarrage automatique dans 5 secondes...');
    
    setTimeout(() => {
        process.exit(1); // Le déploiement redémarrera automatiquement
    }, 5000);
});

process.on('unhandledRejection', (reason, promise) => {
    deployLog(`PROMESSE REJETÉE: ${reason}`);
});

// Signal de fermeture propre
process.on('SIGTERM', () => {
    deployLog('Signal SIGTERM reçu, arrêt propre...');
    process.exit(0);
});

// Démarrage du bot
deployLog('🚀 Démarrage bot en mode déploiement');
deployLog('📡 Bot actif 24/7 - fenêtre fermable');

// Charger et démarrer le bot principal
try {
    require('./realistic_bot.js');
    deployLog('✅ Bot démarré avec succès');
} catch (error) {
    deployLog(`❌ Erreur démarrage bot: ${error.message}`);
    process.exit(1);
}

// Heartbeat pour vérifier que le bot est vivant
setInterval(() => {
    deployLog('💓 Bot actif - ' + new Date().toLocaleString());
}, 300000); // Toutes les 5 minutes
