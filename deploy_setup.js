
// Configuration pour déploiement automatique
// Le bot tournera 24/7 même fenêtre fermée

const fs = require('fs');

console.log('🚀 CONFIGURATION DÉPLOIEMENT BOT TRADING');
console.log('═══════════════════════════════════════');

// Vérification des prérequis
console.log('\n📋 VÉRIFICATIONS:');

// 1. Vérifier que le bot existe
if (fs.existsSync('realistic_bot.js')) {
    console.log('✅ Bot principal trouvé');
} else {
    console.log('❌ realistic_bot.js manquant');
    process.exit(1);
}

// 2. Vérifier configuration paper trading
try {
    const botContent = fs.readFileSync('realistic_bot.js', 'utf8');
    if (botContent.includes('paperTrading: true')) {
        console.log('✅ Mode paper trading activé');
    } else {
        console.log('⚠️  Vérifier mode paper trading');
    }
} catch (error) {
    console.log('❌ Erreur lecture bot:', error.message);
}

// 3. Créer fichier de démarrage optimisé
const startupScript = `
// Démarrage automatique du bot pour déploiement
// S'exécute en continu même fenêtre fermée

const fs = require('fs');
const path = require('path');

// Logging pour déploiement
function deployLog(message) {
    const timestamp = new Date().toISOString();
    const logMessage = \`[\${timestamp}] \${message}\`;
    console.log(logMessage);
    
    // Sauvegarder aussi dans fichier
    const logDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    
    fs.appendFileSync(
        path.join(logDir, 'deployment.log'), 
        logMessage + '\\n'
    );
}

// Gestion des erreurs pour déploiement
process.on('uncaughtException', (error) => {
    deployLog(\`ERREUR CRITIQUE: \${error.message}\`);
    deployLog('Redémarrage automatique dans 5 secondes...');
    
    setTimeout(() => {
        process.exit(1); // Le déploiement redémarrera automatiquement
    }, 5000);
});

process.on('unhandledRejection', (reason, promise) => {
    deployLog(\`PROMESSE REJETÉE: \${reason}\`);
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
    deployLog(\`❌ Erreur démarrage bot: \${error.message}\`);
    process.exit(1);
}

// Heartbeat pour vérifier que le bot est vivant
setInterval(() => {
    deployLog('💓 Bot actif - ' + new Date().toLocaleString());
}, 300000); // Toutes les 5 minutes
`;

fs.writeFileSync('deploy_bot.js', startupScript);
console.log('✅ Script de déploiement créé');

// Instructions de déploiement
console.log('\n🎯 PROCHAINES ÉTAPES:');
console.log('═══════════════════════');
console.log('1. Cliquer sur "Deploy" dans Replit');
console.log('2. Configurer comme "Autoscale deployment"');
console.log('3. Le bot tournera 24/7 automatiquement');
console.log('');
console.log('📊 SURVEILLANCE:');
console.log('- Logs disponibles dans le dashboard deployment');
console.log('- Historique trades sauvegardé dans logs/');
console.log('- Redémarrage automatique en cas d\'erreur');
console.log('');
console.log('⚠️  IMPORTANT:');
console.log('- Rester en mode PAPER TRADING pour débuter');
console.log('- Surveiller les performances 30+ jours');
console.log('- Consulter régulièrement les logs');

module.exports = { deployLog };
