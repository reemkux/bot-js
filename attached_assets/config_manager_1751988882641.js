// Gestionnaire de configuration avancé pour bot de trading
// Support multi-environnements, hot-reload, validation et historique

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const EventEmitter = require('events');

class ConfigurationManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            configDir: options.configDir || './config',
            environment: options.environment || process.env.NODE_ENV || 'development',
            hotReload: options.hotReload !== false,
            validation: options.validation !== false,
            encryption: options.encryption || false,
            backupCount: options.backupCount || 10,
            ...options
        };
        
        this.state = {
            currentConfig: {},
            configHistory: [],
            watchers: new Map(),
            validators: new Map(),
            schemas: new Map(),
            lastModified: {},
            encrypted: new Set()
        };
        
        this.initializeManager();
    }

    // Initialisation du gestionnaire
    initializeManager() {
        console.log(`⚙️ Initialisation gestionnaire de configuration`);
        console.log(`   Environnement: ${this.options.environment}`);
        console.log(`   Répertoire: ${this.options.configDir}`);
        console.log(`   Hot-reload: ${this.options.hotReload ? 'Activé' : 'Désactivé'}`);
        
        // Création des répertoires
        this.ensureDirectories();
        
        // Définition des schémas
        this.defineSchemas();
        
        // Chargement de la configuration
        this.loadConfiguration();
        
        // Configuration du hot-reload
        if (this.options.hotReload) {
            this.setupHotReload();
        }
        
        // Sauvegarde périodique
        this.setupPeriodicBackup();
    }

    // Création des répertoires nécessaires
    ensureDirectories() {
        const dirs = [
            this.options.configDir,
            path.join(this.options.configDir, 'environments'),
            path.join(this.options.configDir, 'schemas'),
            path.join(this.options.configDir, 'backups'),
            path.join(this.options.configDir, 'templates')
        ];
        
        dirs.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }

    // Définition des schémas de validation
    defineSchemas() {
        // Schéma pour configuration de trading
        this.registerSchema('trading', {
            type: 'object',
            required: ['paperTrading', 'totalCapital', 'symbols'],
            properties: {
                paperTrading: { type: 'boolean' },
                totalCapital: { type: 'number', minimum: 100 },
                dailyTargetMin: { type: 'number', minimum: 0, maximum: 0.1 },
                dailyTargetMax: { type: 'number', minimum: 0, maximum: 0.1 },
                stopLossPercent: { type: 'number', minimum: 0.001, maximum: 0.05 },
                maxPositionPercent: { type: 'number', minimum: 0.01, maximum: 0.2 },
                subPortfolios: { type: 'integer', minimum: 1, maximum: 10 },
                maxTradesPerDay: { type: 'integer', minimum: 1, maximum: 20 },
                maxConsecutiveLosses: { type: 'integer', minimum: 1, maximum: 10 },
                cooldownAfterLoss: { type: 'integer', minimum: 60000 },
                symbols: {
                    type: 'array',
                    items: { type: 'string', pattern: '^[A-Z]{6,10}$' },
                    minItems: 1,
                    maxItems: 20
                }
            },
            additionalProperties: false
        });
        
        // Schéma pour configuration des alertes
        this.registerSchema('alerts', {
            type: 'object',
            properties: {
                email: {
                    type: 'object',
                    properties: {
                        enabled: { type: 'boolean' },
                        service: { type: 'string' },
                        user: { type: 'string', format: 'email' },
                        password: { type: 'string' },
                        to: {
                            type: 'array',
                            items: { type: 'string', format: 'email' }
                        }
                    }
                },
                discord: {
                    type: 'object',
                    properties: {
                        enabled: { type: 'boolean' },
                        webhookUrl: { type: 'string', format: 'uri' }
                    }
                },
                filters: {
                    type: 'object',
                    properties: {
                        minPnLPercent: { type: 'number', minimum: 0 },
                        maxDrawdownPercent: { type: 'number', minimum: 0 },
                        emergencyOnly: { type: 'boolean' }
                    }
                }
            }
        });
        
        // Schéma pour API Binance
        this.registerSchema('binance', {
            type: 'object',
            required: ['testnet'],
            properties: {
                testnet: { type: 'boolean' },
                apiKey: { type: 'string', minLength: 64, maxLength: 64 },
                apiSecret: { type: 'string', minLength: 64, maxLength: 64 },
                baseURL: { type: 'string', format: 'uri' },
                recvWindow: { type: 'integer', minimum: 1000, maximum: 60000 },
                timeout: { type: 'integer', minimum: 1000, maximum: 30000 }
            }
        });
    }

    // Enregistrement d'un schéma
    registerSchema(name, schema) {
        this.state.schemas.set(name, schema);
        
        // Sauvegarde du schéma
        const schemaPath = path.join(this.options.configDir, 'schemas', `${name}.json`);
        fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2));
    }

    // Chargement de la configuration
    loadConfiguration() {
        console.log('📂 Chargement de la configuration...');
        
        // Ordre de priorité:
        // 1. Fichier spécifique à l'environnement
        // 2. Fichier de base
        // 3. Variables d'environnement
        // 4. Paramètres optimisés
        
        const configs = [
            this.loadBaseConfig(),
            this.loadEnvironmentConfig(),
            this.loadOptimizedConfig(),
            this.loadEnvironmentVariables()
        ];
        
        // Fusion des configurations
        this.state.currentConfig = this.mergeConfigs(configs);
        
        // Validation
        if (this.options.validation) {
            this.validateConfiguration();
        }
        
        // Sauvegarde de l'historique
        this.saveConfigHistory();
        
        console.log('✅ Configuration chargée avec succès');
        this.emit('configLoaded', this.state.currentConfig);
    }

    // Chargement de la configuration de base
    loadBaseConfig() {
        const basePath = path.join(this.options.configDir, 'base.json');
        
        if (!fs.existsSync(basePath)) {
            console.log('📝 Création de la configuration de base...');
            const baseConfig = this.generateDefaultConfig();
            fs.writeFileSync(basePath, JSON.stringify(baseConfig, null, 2));
            return baseConfig;
        }
        
        return this.loadJsonFile(basePath);
    }

    // Chargement de la configuration d'environnement
    loadEnvironmentConfig() {
        const envPath = path.join(this.options.configDir, 'environments', `${this.options.environment}.json`);
        
        if (fs.existsSync(envPath)) {
            return this.loadJsonFile(envPath);
        }
        
        console.log(`⚠️ Pas de configuration pour l'environnement: ${this.options.environment}`);
        return {};
    }

    // Chargement des paramètres optimisés
    loadOptimizedConfig() {
        const optimizedPath = path.join(this.options.configDir, 'optimized_parameters.json');
        
        if (fs.existsSync(optimizedPath)) {
            console.log('🔧 Chargement des paramètres optimisés');
            return { trading: this.loadJsonFile(optimizedPath) };
        }
        
        return {};
    }

    // Chargement des variables d'environnement
    loadEnvironmentVariables() {
        const envConfig = {};
        
        // Mapping des variables d'environnement
        const envMappings = {
            'TRADING_PAPER_MODE': 'trading.paperTrading',
            'TRADING_CAPITAL': 'trading.totalCapital',
            'BINANCE_API_KEY': 'binance.apiKey',
            'BINANCE_API_SECRET': 'binance.apiSecret',
            'BINANCE_TESTNET': 'binance.testnet',
            'ALERT_EMAIL_USER': 'alerts.email.user',
            'ALERT_EMAIL_PASSWORD': 'alerts.email.password',
            'ALERT_DISCORD_WEBHOOK': 'alerts.discord.webhookUrl'
        };
        
        Object.entries(envMappings).forEach(([envVar, configPath]) => {
            const value = process.env[envVar];
            if (value !== undefined) {
                this.setNestedProperty(envConfig, configPath, this.parseEnvValue(value));
            }
        });
        
        return envConfig;
    }

    // Analyse de valeur d'environnement
    parseEnvValue(value) {
        // Boolean
        if (value.toLowerCase() === 'true') return true;
        if (value.toLowerCase() === 'false') return false;
        
        // Number
        if (!isNaN(value) && !isNaN(parseFloat(value))) {
            return parseFloat(value);
        }
        
        // String
        return value;
    }

    // Fusion des configurations
    mergeConfigs(configs) {
        return configs.reduce((merged, config) => {
            return this.deepMerge(merged, config || {});
        }, {});
    }

    // Fusion profonde d'objets
    deepMerge(target, source) {
        const result = { ...target };
        
        Object.keys(source).forEach(key => {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.deepMerge(result[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        });
        
        return result;
    }

    // Configuration par défaut
    generateDefaultConfig() {
        return {
            trading: {
                paperTrading: true,
                totalCapital: 10000,
                dailyTargetMin: 0.003,
                dailyTargetMax: 0.005,
                stopLossPercent: 0.015,
                maxPositionPercent: 0.05,
                subPortfolios: 4,
                maxTradesPerDay: 3,
                maxConsecutiveLosses: 3,
                cooldownAfterLoss: 3600000,
                symbols: ['BTCUSDT', 'ETHUSDT', 'ADAUSDT']
            },
            
            binance: {
                testnet: true,
                recvWindow: 5000,
                timeout: 10000
            },
            
            alerts: {
                email: {
                    enabled: false,
                    service: 'gmail'
                },
                discord: {
                    enabled: false
                },
                filters: {
                    minPnLPercent: 1.0,
                    maxDrawdownPercent: 10.0,
                    emergencyOnly: false
                }
            },
            
            monitoring: {
                metricsPort: 9090,
                updateInterval: 30000,
                dataRetentionDays: 30
            },
            
            dashboard: {
                port: 3000,
                updateInterval: 5000
            }
        };
    }

    // Validation de la configuration
    validateConfiguration() {
        console.log('🔍 Validation de la configuration...');
        
        const errors = [];
        
        // Validation par schéma
        this.state.schemas.forEach((schema, name) => {
            const configSection = this.state.currentConfig[name];
            if (configSection) {
                const validation = this.validateAgainstSchema(configSection, schema);
                if (!validation.valid) {
                    errors.push(`Section ${name}: ${validation.errors.join(', ')}`);
                }
            }
        });
        
        // Validations métier personnalisées
        const businessValidation = this.validateBusinessRules();
        if (!businessValidation.valid) {
            errors.push(...businessValidation.errors);
        }
        
        if (errors.length > 0) {
            console.error('❌ Erreurs de validation:');
            errors.forEach(error => console.error(`   ${error}`));
            throw new Error(`Configuration invalide: ${errors.length} erreur(s)`);
        }
        
        console.log('✅ Configuration validée');
    }

    // Validation contre un schéma
    validateAgainstSchema(data, schema) {
        // Validation simplifiée - en production, utiliser une librairie comme Ajv
        const errors = [];
        
        // Vérification des propriétés requises
        if (schema.required) {
            schema.required.forEach(prop => {
                if (!data.hasOwnProperty(prop)) {
                    errors.push(`Propriété requise manquante: ${prop}`);
                }
            });
        }
        
        // Vérification des types et contraintes
        if (schema.properties) {
            Object.entries(schema.properties).forEach(([prop, propSchema]) => {
                if (data.hasOwnProperty(prop)) {
                    const value = data[prop];
                    
                    // Type
                    if (propSchema.type && typeof value !== propSchema.type) {
                        if (!(propSchema.type === 'integer' && Number.isInteger(value))) {
                            errors.push(`${prop}: type attendu ${propSchema.type}`);
                        }
                    }
                    
                    // Minimum/Maximum
                    if (typeof value === 'number') {
                        if (propSchema.minimum && value < propSchema.minimum) {
                            errors.push(`${prop}: valeur minimale ${propSchema.minimum}`);
                        }
                        if (propSchema.maximum && value > propSchema.maximum) {
                            errors.push(`${prop}: valeur maximale ${propSchema.maximum}`);
                        }
                    }
                    
                    // Longueur des chaînes
                    if (typeof value === 'string') {
                        if (propSchema.minLength && value.length < propSchema.minLength) {
                            errors.push(`${prop}: longueur minimale ${propSchema.minLength}`);
                        }
                        if (propSchema.maxLength && value.length > propSchema.maxLength) {
                            errors.push(`${prop}: longueur maximale ${propSchema.maxLength}`);
                        }
                    }
                    
                    // Tableaux
                    if (Array.isArray(value) && propSchema.minItems) {
                        if (value.length < propSchema.minItems) {
                            errors.push(`${prop}: minimum ${propSchema.minItems} éléments`);
                        }
                    }
                }
            });
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }

    // Validation des règles métier
    validateBusinessRules() {
        const errors = [];
        const config = this.state.currentConfig;
        
        // Validation trading
        if (config.trading) {
            const t = config.trading;
            
            if (t.dailyTargetMax <= t.dailyTargetMin) {
                errors.push('dailyTargetMax doit être supérieur à dailyTargetMin');
            }
            
            if (t.stopLossPercent <= t.dailyTargetMax) {
                errors.push('stopLossPercent doit être supérieur à dailyTargetMax');
            }
            
            if (t.maxPositionPercent * t.maxTradesPerDay > 0.5) {
                errors.push('Exposition totale quotidienne trop élevée (>50%)');
            }
        }
        
        // Validation Binance
        if (config.binance && !config.binance.testnet) {
            if (!config.binance.apiKey || !config.binance.apiSecret) {
                errors.push('Clés API Binance requises pour le mode réel');
            }
        }
        
        // Validation alertes
        if (config.alerts) {
            if (config.alerts.email?.enabled && !config.alerts.email.user) {
                errors.push('Configuration email incomplète');
            }
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }

    // Configuration du hot-reload
    setupHotReload() {
        console.log('🔥 Configuration hot-reload activée');
        
        const watchPaths = [
            path.join(this.options.configDir, 'base.json'),
            path.join(this.options.configDir, 'environments', `${this.options.environment}.json`),
            path.join(this.options.configDir, 'optimized_parameters.json')
        ];
        
        watchPaths.forEach(configPath => {
            if (fs.existsSync(configPath)) {
                const watcher = fs.watch(configPath, (eventType) => {
                    if (eventType === 'change') {
                        console.log(`🔄 Rechargement détecté: ${path.basename(configPath)}`);
                        this.reloadConfiguration();
                    }
                });
                
                this.state.watchers.set(configPath, watcher);
            }
        });
    }

    // Rechargement de la configuration
    async reloadConfiguration() {
        try {
            console.log('🔄 Rechargement de la configuration...');
            
            const previousConfig = JSON.parse(JSON.stringify(this.state.currentConfig));
            
            // Attendre un peu pour éviter les lectures partielles
            await new Promise(resolve => setTimeout(resolve, 100));
            
            this.loadConfiguration();
            
            // Comparaison des changements
            const changes = this.detectChanges(previousConfig, this.state.currentConfig);
            
            if (changes.length > 0) {
                console.log('📝 Changements détectés:');
                changes.forEach(change => {
                    console.log(`   ${change.path}: ${change.oldValue} → ${change.newValue}`);
                });
                
                this.emit('configChanged', {
                    previous: previousConfig,
                    current: this.state.currentConfig,
                    changes
                });
            }
            
        } catch (error) {
            console.error('❌ Erreur rechargement configuration:', error.message);
            this.emit('configError', error);
        }
    }

    // Détection des changements
    detectChanges(oldConfig, newConfig, basePath = '') {
        const changes = [];
        
        const allKeys = new Set([
            ...Object.keys(oldConfig || {}),
            ...Object.keys(newConfig || {})
        ]);
        
        allKeys.forEach(key => {
            const currentPath = basePath ? `${basePath}.${key}` : key;
            const oldValue = oldConfig?.[key];
            const newValue = newConfig?.[key];
            
            if (typeof oldValue === 'object' && typeof newValue === 'object' && 
                !Array.isArray(oldValue) && !Array.isArray(newValue)) {
                changes.push(...this.detectChanges(oldValue, newValue, currentPath));
            } else if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
                changes.push({
                    path: currentPath,
                    oldValue: oldValue,
                    newValue: newValue
                });
            }
        });
        
        return changes;
    }

    // Sauvegarde de l'historique
    saveConfigHistory() {
        const historyEntry = {
            timestamp: new Date().toISOString(),
            environment: this.options.environment,
            config: JSON.parse(JSON.stringify(this.state.currentConfig)),
            hash: this.calculateConfigHash(this.state.currentConfig)
        };
        
        this.state.configHistory.unshift(historyEntry);
        
        // Garder seulement les N dernières versions
        if (this.state.configHistory.length > this.options.backupCount) {
            this.state.configHistory = this.state.configHistory.slice(0, this.options.backupCount);
        }
        
        // Sauvegarde sur disque
        const historyPath = path.join(this.options.configDir, 'backups', 'history.json');
        fs.writeFileSync(historyPath, JSON.stringify(this.state.configHistory, null, 2));
    }

    // Calcul du hash de configuration
    calculateConfigHash(config) {
        const configString = JSON.stringify(config, Object.keys(config).sort());
        return crypto.createHash('sha256').update(configString).digest('hex').substring(0, 8);
    }

    // Sauvegarde périodique
    setupPeriodicBackup() {
        setInterval(() => {
            this.createBackup();
        }, 24 * 60 * 60 * 1000); // Quotidien
    }

    // Création d'une sauvegarde
    createBackup() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = path.join(this.options.configDir, 'backups', timestamp);
        
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        
        // Sauvegarde de la configuration actuelle
        fs.writeFileSync(
            path.join(backupDir, 'current_config.json'),
            JSON.stringify(this.state.currentConfig, null, 2)
        );
        
        // Copie des fichiers de configuration
        const configFiles = [
            'base.json',
            path.join('environments', `${this.options.environment}.json`),
            'optimized_parameters.json'
        ];
        
        configFiles.forEach(file => {
            const sourcePath = path.join(this.options.configDir, file);
            if (fs.existsSync(sourcePath)) {
                const destPath = path.join(backupDir, file);
                const destDir = path.dirname(destPath);
                if (!fs.existsSync(destDir)) {
                    fs.mkdirSync(destDir, { recursive: true });
                }
                fs.copyFileSync(sourcePath, destPath);
            }
        });
        
        console.log(`💾 Sauvegarde créée: ${timestamp}`);
    }

    // Accès à la configuration
    get(keyPath, defaultValue = undefined) {
        return this.getNestedProperty(this.state.currentConfig, keyPath, defaultValue);
    }

    // Mise à jour de la configuration
    set(keyPath, value, persist = true) {
        const oldValue = this.get(keyPath);
        this.setNestedProperty(this.state.currentConfig, keyPath, value);
        
        // Validation si activée
        if (this.options.validation) {
            try {
                this.validateConfiguration();
            } catch (error) {
                // Rollback en cas d'erreur
                this.setNestedProperty(this.state.currentConfig, keyPath, oldValue);
                throw error;
            }
        }
        
        // Persistance si demandée
        if (persist) {
            this.persistConfiguration();
        }
        
        this.emit('configUpdated', { keyPath, oldValue, newValue: value });
        
        console.log(`⚙️ Configuration mise à jour: ${keyPath} = ${JSON.stringify(value)}`);
    }

    // Persistance de la configuration
    persistConfiguration() {
        // Sauvegarde dans le fichier d'environnement
        const envPath = path.join(this.options.configDir, 'environments', `${this.options.environment}.json`);
        fs.writeFileSync(envPath, JSON.stringify(this.state.currentConfig, null, 2));
        
        // Mise à jour de l'historique
        this.saveConfigHistory();
    }

    // Restauration d'une version précédente
    restoreVersion(version) {
        if (version < 0 || version >= this.state.configHistory.length) {
            throw new Error('Version invalide');
        }
        
        const targetConfig = this.state.configHistory[version];
        this.state.currentConfig = JSON.parse(JSON.stringify(targetConfig.config));
        
        // Validation
        if (this.options.validation) {
            this.validateConfiguration();
        }
        
        // Persistance
        this.persistConfiguration();
        
        console.log(`🔄 Configuration restaurée vers version ${version} (${targetConfig.timestamp})`);
        this.emit('configRestored', { version, config: this.state.currentConfig });
    }

    // Exportation de la configuration
    export(format = 'json') {
        const exportData = {
            metadata: {
                timestamp: new Date().toISOString(),
                environment: this.options.environment,
                version: '1.0.0',
                hash: this.calculateConfigHash(this.state.currentConfig)
            },
            configuration: this.state.currentConfig,
            history: this.state.configHistory.slice(0, 5) // 5 dernières versions
        };
        
        switch (format) {
            case 'json':
                return JSON.stringify(exportData, null, 2);
            case 'yaml':
                // En production, utiliser une librairie YAML
                return '# YAML export non implémenté';
            default:
                throw new Error(`Format d'export non supporté: ${format}`);
        }
    }

    // Importation de configuration
    import(data, format = 'json') {
        let importedData;
        
        switch (format) {
            case 'json':
                importedData = typeof data === 'string' ? JSON.parse(data) : data;
                break;
            default:
                throw new Error(`Format d'import non supporté: ${format}`);
        }
        
        // Validation de la structure d'import
        if (!importedData.configuration) {
            throw new Error('Données d\'import invalides');
        }
        
        // Sauvegarde de la configuration actuelle
        this.createBackup();
        
        // Importation
        this.state.currentConfig = importedData.configuration;
        
        // Validation
        if (this.options.validation) {
            this.validateConfiguration();
        }
        
        // Persistance
        this.persistConfiguration();
        
        console.log('📥 Configuration importée avec succès');
        this.emit('configImported', importedData);
    }

    // Méthodes utilitaires
    getNestedProperty(obj, path, defaultValue = undefined) {
        const keys = path.split('.');
        let current = obj;
        
        for (const key of keys) {
            if (current && typeof current === 'object' && key in current) {
                current = current[key];
            } else {
                return defaultValue;
            }
        }
        
        return current;
    }

    setNestedProperty(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        let current = obj;
        
        for (const key of keys) {
            if (!(key in current) || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }
        
        current[lastKey] = value;
    }

    loadJsonFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.error(`❌ Erreur lecture fichier ${filePath}:`, error.message);
            return {};
        }
    }

    // Interface de gestion
    getStatus() {
        return {
            environment: this.options.environment,
            lastModified: new Date(Math.max(...Object.values(this.state.lastModified))).toISOString(),
            configHash: this.calculateConfigHash(this.state.currentConfig),
            historyCount: this.state.configHistory.length,
            watchersActive: this.state.watchers.size,
            hotReloadEnabled: this.options.hotReload,
            validationEnabled: this.options.validation
        };
    }

    // Nettoyage
    cleanup() {
        console.log('🧹 Nettoyage du gestionnaire de configuration...');
        
        // Fermeture des watchers
        this.state.watchers.forEach(watcher => {
            watcher.close();
        });
        this.state.watchers.clear();
        
        // Sauvegarde finale
        this.createBackup();
        
        console.log('✅ Nettoyage terminé');
    }

    // Affichage de la configuration
    display() {
        console.log('\n⚙️ CONFIGURATION ACTUELLE');
        console.log('═'.repeat(50));
        console.log(JSON.stringify(this.state.currentConfig, null, 2));
        console.log('\n📊 STATUT:');
        console.table(this.getStatus());
    }
}

// Export et utilisation
if (require.main === module) {
    // Test du gestionnaire de configuration
    const configManager = new ConfigurationManager({
        environment: 'development',
        hotReload: true,
        validation: true
    });
    
    // Écouteurs d'événements
    configManager.on('configLoaded', () => {
        console.log('🎉 Configuration chargée');
    });
    
    configManager.on('configChanged', (event) => {
        console.log(`🔄 Configuration modifiée: ${event.changes.length} changement(s)`);
    });
    
    configManager.on('configError', (error) => {
        console.error('❌ Erreur configuration:', error.message);
    });
    
    // Test des fonctionnalités
    setTimeout(() => {
        console.log('\n🧪 Test des fonctionnalités...');
        
        // Lecture de valeur
        console.log('Trading paper mode:', configManager.get('trading.paperTrading'));
        
        // Modification de valeur
        try {
            configManager.set('trading.dailyTargetMax', 0.006);
            console.log('✅ Modification réussie');
        } catch (error) {
            console.error('❌ Modification échouée:', error.message);
        }
        
        // Affichage du statut
        configManager.display();
        
    }, 1000);
    
    // Nettoyage propre
    process.on('SIGINT', () => {
        console.log('\n🛑 Arrêt du gestionnaire...');
        configManager.cleanup();
        process.exit(0);
    });
}

module.exports = ConfigurationManager;