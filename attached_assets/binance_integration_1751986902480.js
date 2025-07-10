// Intégration complète API Binance pour trading réel
// Support Spot Trading avec gestion sécurisée des clés

const crypto = require('crypto');
const WebSocket = require('ws');
const fs = require('fs');

class BinanceAPI {
    constructor(config) {
        this.config = {
            apiKey: config.apiKey || '',
            apiSecret: config.apiSecret || '',
            testnet: config.testnet !== false, // true par défaut pour sécurité
            baseURL: config.testnet ? 
                'https://testnet.binance.vision' : 
                'https://api.binance.com',
            wsBaseURL: config.testnet ?
                'wss://testnet.binance.vision/ws' :
                'wss://stream.binance.com:9443/ws',
            recvWindow: config.recvWindow || 5000,
            timeout: config.timeout || 10000,
            retryAttempts: config.retryAttempts || 3,
            retryDelay: config.retryDelay || 1000,
            ...config
        };
        
        this.state = {
            accountInfo: null,
            openOrders: [],
            balances: {},
            exchangeInfo: null,
            serverTime: 0,
            websockets: new Map(),
            rateLimits: {
                requestWeight: 0,
                orderCount: 0,
                lastMinute: Date.now()
            }
        };
        
        this.validateConfig();
        this.initializeConnection();
    }

    // Validation de la configuration
    validateConfig() {
        if (!this.config.apiKey || !this.config.apiSecret) {
            if (!this.config.testnet) {
                throw new Error('⚠️ Clés API requises pour trading réel');
            } else {
                console.log('⚠️ Mode testnet sans clés API - Fonctionnalités limitées');
            }
        }
        
        if (this.config.testnet) {
            console.log('🧪 MODE TESTNET ACTIVÉ - Aucun argent réel');
        } else {
            console.log('🚨 MODE TRADING RÉEL - ATTENTION AUX RISQUES');
        }
        
        // Vérification sécurité des clés
        this.validateAPIKeySecurity();
    }

    // Validation sécurité des clés API
    validateAPIKeySecurity() {
        if (!this.config.apiKey || !this.config.apiSecret) return;
        
        const warnings = [];
        
        // Vérification format des clés
        if (this.config.apiKey.length !== 64) {
            warnings.push('Format de clé API suspect');
        }
        
        if (this.config.apiSecret.length !== 64) {
            warnings.push('Format de clé secrète suspect');
        }
        
        // Recommandations de sécurité
        console.log('🔒 RECOMMANDATIONS SÉCURITÉ:');
        console.log('   • Clés API avec permissions limitées uniquement');
        console.log('   • Restriction IP activée sur Binance');
        console.log('   • Pas de permissions de retrait');
        console.log('   • Surveillance des accès API');
        
        if (warnings.length > 0) {
            console.log('⚠️ Avertissements sécurité:', warnings.join(', '));
        }
    }

    // Initialisation de la connexion
    async initializeConnection() {
        try {
            // Synchronisation du temps serveur
            await this.syncServerTime();
            
            // Récupération des informations d'échange
            await this.getExchangeInfo();
            
            // Test de connectivité API si clés présentes
            if (this.config.apiKey && this.config.apiSecret) {
                await this.testConnectivity();
                await this.getAccountInfo();
            }
            
            console.log('✅ Connexion Binance initialisée');
            
        } catch (error) {
            console.error('❌ Erreur initialisation Binance:', error.message);
            throw error;
        }
    }

    // Synchronisation temps serveur
    async syncServerTime() {
        try {
            const response = await this.makeRequest('GET', '/api/v3/time');
            this.state.serverTime = response.serverTime;
            
            const localTime = Date.now();
            const timeDiff = Math.abs(localTime - this.state.serverTime);
            
            if (timeDiff > 1000) {
                console.log(`⚠️ Différence de temps: ${timeDiff}ms`);
            }
            
            return this.state.serverTime;
        } catch (error) {
            console.error('❌ Erreur synchronisation temps:', error.message);
            throw error;
        }
    }

    // Test de connectivité
    async testConnectivity() {
        try {
            const response = await this.makeRequest('GET', '/api/v3/ping');
            console.log('✅ Ping Binance réussi');
            return true;
        } catch (error) {
            console.error('❌ Test connectivité échoué:', error.message);
            throw error;
        }
    }

    // Récupération informations d'échange
    async getExchangeInfo() {
        try {
            const response = await this.makeRequest('GET', '/api/v3/exchangeInfo');
            this.state.exchangeInfo = response;
            
            console.log(`✅ Informations d'échange: ${response.symbols.length} symboles`);
            return response;
        } catch (error) {
            console.error('❌ Erreur informations d\'échange:', error.message);
            throw error;
        }
    }

    // Récupération informations de compte
    async getAccountInfo() {
        try {
            const response = await this.makeSignedRequest('GET', '/api/v3/account');
            this.state.accountInfo = response;
            
            // Mise à jour des balances
            this.updateBalances(response.balances);
            
            console.log(`✅ Compte: ${response.balances.length} actifs`);
            return response;
        } catch (error) {
            console.error('❌ Erreur informations compte:', error.message);
            throw error;
        }
    }

    // Mise à jour des balances
    updateBalances(balances) {
        this.state.balances = {};
        
        balances.forEach(balance => {
            const free = parseFloat(balance.free);
            const locked = parseFloat(balance.locked);
            
            if (free > 0 || locked > 0) {
                this.state.balances[balance.asset] = {
                    free,
                    locked,
                    total: free + locked
                };
            }
        });
        
        console.log('💰 Balances mises à jour:', Object.keys(this.state.balances).length, 'actifs');
    }

    // Récupération du prix actuel
    async getCurrentPrice(symbol) {
        try {
            const response = await this.makeRequest('GET', '/api/v3/ticker/price', {
                symbol: symbol.toUpperCase()
            });
            
            return parseFloat(response.price);
        } catch (error) {
            console.error(`❌ Erreur prix ${symbol}:`, error.message);
            throw error;
        }
    }

    // Récupération des données de chandelier
    async getKlines(symbol, interval = '1m', limit = 100) {
        try {
            const response = await this.makeRequest('GET', '/api/v3/klines', {
                symbol: symbol.toUpperCase(),
                interval,
                limit
            });
            
            return response.map(kline => ({
                openTime: kline[0],
                open: parseFloat(kline[1]),
                high: parseFloat(kline[2]),
                low: parseFloat(kline[3]),
                close: parseFloat(kline[4]),
                volume: parseFloat(kline[5]),
                closeTime: kline[6]
            }));
        } catch (error) {
            console.error(`❌ Erreur klines ${symbol}:`, error.message);
            throw error;
        }
    }

    // Passage d'ordre
    async createOrder(symbol, side, type, quantity, options = {}) {
        try {
            // Vérifications préalables
            await this.validateOrder(symbol, side, type, quantity, options);
            
            const params = {
                symbol: symbol.toUpperCase(),
                side: side.toUpperCase(),
                type: type.toUpperCase(),
                quantity: this.formatQuantity(symbol, quantity),
                ...options
            };
            
            // Ajout du timestamp et recvWindow
            params.timestamp = Date.now();
            params.recvWindow = this.config.recvWindow;
            
            // Ajout du prix si nécessaire
            if (type.toUpperCase() === 'LIMIT' && options.price) {
                params.price = this.formatPrice(symbol, options.price);
                params.timeInForce = options.timeInForce || 'GTC';
            }
            
            console.log(`📊 Passage d'ordre: ${side} ${quantity} ${symbol} @ ${params.price || 'MARKET'}`);
            
            const response = await this.makeSignedRequest('POST', '/api/v3/order', params);
            
            // Log de l'ordre
            this.logOrder(response);
            
            // Mise à jour des ordres ouverts
            await this.refreshOpenOrders(symbol);
            
            console.log(`✅ Ordre créé: ${response.orderId}`);
            return response;
            
        } catch (error) {
            console.error('❌ Erreur création ordre:', error.message);
            throw error;
        }
    }

    // Validation d'ordre
    async validateOrder(symbol, side, type, quantity, options) {
        // Vérification du symbole
        const symbolInfo = this.getSymbolInfo(symbol);
        if (!symbolInfo) {
            throw new Error(`Symbole ${symbol} non trouvé`);
        }
        
        // Vérification du statut du symbole
        if (symbolInfo.status !== 'TRADING') {
            throw new Error(`Symbole ${symbol} non disponible pour trading`);
        }
        
        // Vérification des filtres du symbole
        this.validateSymbolFilters(symbolInfo, quantity, options.price);
        
        // Vérification du solde
        await this.validateBalance(symbol, side, quantity, options.price);
        
        // Vérification des limites de taux
        this.checkRateLimits();
    }

    // Validation des filtres de symbole
    validateSymbolFilters(symbolInfo, quantity, price) {
        for (const filter of symbolInfo.filters) {
            switch (filter.filterType) {
                case 'LOT_SIZE':
                    if (quantity < parseFloat(filter.minQty)) {
                        throw new Error(`Quantité trop petite: min ${filter.minQty}`);
                    }
                    if (quantity > parseFloat(filter.maxQty)) {
                        throw new Error(`Quantité trop grande: max ${filter.maxQty}`);
                    }
                    break;
                    
                case 'PRICE_FILTER':
                    if (price && price < parseFloat(filter.minPrice)) {
                        throw new Error(`Prix trop bas: min ${filter.minPrice}`);
                    }
                    if (price && price > parseFloat(filter.maxPrice)) {
                        throw new Error(`Prix trop élevé: max ${filter.maxPrice}`);
                    }
                    break;
                    
                case 'MIN_NOTIONAL':
                    const notional = quantity * (price || await this.getCurrentPrice(symbolInfo.symbol));
                    if (notional < parseFloat(filter.minNotional)) {
                        throw new Error(`Montant trop petit: min ${filter.minNotional}`);
                    }
                    break;
            }
        }
    }

    // Validation du solde
    async validateBalance(symbol, side, quantity, price) {
        const symbolInfo = this.getSymbolInfo(symbol);
        
        if (side.toUpperCase() === 'BUY') {
            // Vérifier solde en devise de quote
            const quoteAsset = symbolInfo.quoteAsset;
            const balance = this.state.balances[quoteAsset];
            
            if (!balance) {
                throw new Error(`Pas de solde en ${quoteAsset}`);
            }
            
            const requiredAmount = quantity * (price || await this.getCurrentPrice(symbol));
            if (balance.free < requiredAmount) {
                throw new Error(`Solde insuffisant: ${balance.free} < ${requiredAmount} ${quoteAsset}`);
            }
        } else {
            // Vérifier solde en devise de base
            const baseAsset = symbolInfo.baseAsset;
            const balance = this.state.balances[baseAsset];
            
            if (!balance) {
                throw new Error(`Pas de solde en ${baseAsset}`);
            }
            
            if (balance.free < quantity) {
                throw new Error(`Solde insuffisant: ${balance.free} < ${quantity} ${baseAsset}`);
            }
        }
    }

    // Annulation d'ordre
    async cancelOrder(symbol, orderId) {
        try {
            const params = {
                symbol: symbol.toUpperCase(),
                orderId,
                timestamp: Date.now(),
                recvWindow: this.config.recvWindow
            };
            
            const response = await this.makeSignedRequest('DELETE', '/api/v3/order', params);
            
            console.log(`✅ Ordre annulé: ${orderId}`);
            return response;
            
        } catch (error) {
            console.error('❌ Erreur annulation ordre:', error.message);
            throw error;
        }
    }

    // Récupération des ordres ouverts
    async getOpenOrders(symbol = null) {
        try {
            const params = {
                timestamp: Date.now(),
                recvWindow: this.config.recvWindow
            };
            
            if (symbol) {
                params.symbol = symbol.toUpperCase();
            }
            
            const response = await this.makeSignedRequest('GET', '/api/v3/openOrders', params);
            
            if (symbol) {
                return response;
            } else {
                this.state.openOrders = response;
                return response;
            }
            
        } catch (error) {
            console.error('❌ Erreur ordres ouverts:', error.message);
            throw error;
        }
    }

    // Mise à jour des ordres ouverts
    async refreshOpenOrders(symbol = null) {
        try {
            this.state.openOrders = await this.getOpenOrders(symbol);
        } catch (error) {
            console.error('❌ Erreur refresh ordres:', error.message);
        }
    }

    // WebSocket pour données en temps réel
    connectWebSocket(streams, onMessage, onError = null) {
        const streamStr = Array.isArray(streams) ? streams.join('/') : streams;
        const wsUrl = `${this.config.wsBaseURL}/${streamStr}`;
        
        const ws = new WebSocket(wsUrl);
        
        ws.on('open', () => {
            console.log(`📡 WebSocket connecté: ${streamStr}`);
        });
        
        ws.on('message', (data) => {
            try {
                const parsed = JSON.parse(data);
                onMessage(parsed);
            } catch (error) {
                console.error('Erreur parsing WebSocket:', error);
            }
        });
        
        ws.on('error', (error) => {
            console.error('Erreur WebSocket:', error);
            if (onError) onError(error);
        });
        
        ws.on('close', () => {
            console.log(`📡 WebSocket déconnecté: ${streamStr}`);
            // Reconnexion automatique après 5 secondes
            setTimeout(() => {
                console.log('🔄 Reconnexion WebSocket...');
                this.connectWebSocket(streams, onMessage, onError);
            }, 5000);
        });
        
        // Stocker la référence
        this.state.websockets.set(streamStr, ws);
        
        return ws;
    }

    // WebSocket pour données de kline
    connectKlineWebSocket(symbol, interval, onKline) {
        const stream = `${symbol.toLowerCase()}@kline_${interval}`;
        
        return this.connectWebSocket(stream, (data) => {
            if (data.k) {
                const kline = {
                    symbol: data.k.s,
                    openTime: data.k.t,
                    closeTime: data.k.T,
                    open: parseFloat(data.k.o),
                    high: parseFloat(data.k.h),
                    low: parseFloat(data.k.l),
                    close: parseFloat(data.k.c),
                    volume: parseFloat(data.k.v),
                    isClosed: data.k.x
                };
                
                onKline(kline);
            }
        });
    }

    // WebSocket pour ticker de prix
    connectTickerWebSocket(symbol, onTicker) {
        const stream = `${symbol.toLowerCase()}@ticker`;
        
        return this.connectWebSocket(stream, (data) => {
            const ticker = {
                symbol: data.s,
                price: parseFloat(data.c),
                change: parseFloat(data.P),
                volume: parseFloat(data.v),
                high: parseFloat(data.h),
                low: parseFloat(data.l)
            };
            
            onTicker(ticker);
        });
    }

    // Requête HTTP standard
    async makeRequest(method, endpoint, params = {}) {
        const url = new URL(endpoint, this.config.baseURL);
        
        // Ajout des paramètres à l'URL pour GET
        if (method === 'GET' && Object.keys(params).length > 0) {
            Object.keys(params).forEach(key => 
                url.searchParams.append(key, params[key])
            );
        }
        
        const options = {
            method,
            headers: {
                'X-MBX-APIKEY': this.config.apiKey
            },
            timeout: this.config.timeout
        };
        
        // Ajout du body pour POST/PUT/DELETE
        if (method !== 'GET' && Object.keys(params).length > 0) {
            options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
            options.body = new URLSearchParams(params).toString();
        }
        
        return await this.executeRequest(url.toString(), options);
    }

    // Requête signée (authentifiée)
    async makeSignedRequest(method, endpoint, params = {}) {
        if (!this.config.apiKey || !this.config.apiSecret) {
            throw new Error('Clés API requises pour requêtes signées');
        }
        
        // Ajout du timestamp si pas présent
        if (!params.timestamp) {
            params.timestamp = Date.now();
        }
        
        // Création de la signature
        const queryString = new URLSearchParams(params).toString();
        const signature = crypto
            .createHmac('sha256', this.config.apiSecret)
            .update(queryString)
            .digest('hex');
        
        params.signature = signature;
        
        return await this.makeRequest(method, endpoint, params);
    }

    // Exécution de requête avec retry
    async executeRequest(url, options, attempt = 1) {
        try {
            const fetch = (await import('node-fetch')).default;
            const response = await fetch(url, options);
            
            // Mise à jour des limites de taux
            this.updateRateLimits(response.headers);
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(`API Error: ${error.msg || response.statusText}`);
            }
            
            return await response.json();
            
        } catch (error) {
            if (attempt < this.config.retryAttempts) {
                console.log(`🔄 Retry ${attempt}/${this.config.retryAttempts}: ${error.message}`);
                await this.sleep(this.config.retryDelay * attempt);
                return await this.executeRequest(url, options, attempt + 1);
            } else {
                throw error;
            }
        }
    }

    // Mise à jour des limites de taux
    updateRateLimits(headers) {
        const now = Date.now();
        
        // Reset si nouvelle minute
        if (now - this.state.rateLimits.lastMinute > 60000) {
            this.state.rateLimits.requestWeight = 0;
            this.state.rateLimits.orderCount = 0;
            this.state.rateLimits.lastMinute = now;
        }
        
        // Mise à jour des compteurs
        if (headers.get('x-mbx-used-weight-1m')) {
            this.state.rateLimits.requestWeight = parseInt(headers.get('x-mbx-used-weight-1m'));
        }
        
        if (headers.get('x-mbx-order-count-1m')) {
            this.state.rateLimits.orderCount = parseInt(headers.get('x-mbx-order-count-1m'));
        }
        
        // Avertissement si proche des limites
        if (this.state.rateLimits.requestWeight > 1000) {
            console.log('⚠️ Limite de poids proche:', this.state.rateLimits.requestWeight);
        }
        
        if (this.state.rateLimits.orderCount > 90) {
            console.log('⚠️ Limite d\'ordres proche:', this.state.rateLimits.orderCount);
        }
    }

    // Vérification des limites de taux
    checkRateLimits() {
        if (this.state.rateLimits.requestWeight > 1100) {
            throw new Error('Limite de poids dépassée');
        }
        
        if (this.state.rateLimits.orderCount > 95) {
            throw new Error('Limite d\'ordres dépassée');
        }
    }

    // Méthodes utilitaires
    getSymbolInfo(symbol) {
        if (!this.state.exchangeInfo) return null;
        
        return this.state.exchangeInfo.symbols.find(
            s => s.symbol === symbol.toUpperCase()
        );
    }

    formatQuantity(symbol, quantity) {
        const symbolInfo = this.getSymbolInfo(symbol);
        if (!symbolInfo) return quantity.toString();
        
        const lotSizeFilter = symbolInfo.filters.find(f => f.filterType === 'LOT_SIZE');
        if (!lotSizeFilter) return quantity.toString();
        
        const stepSize = parseFloat(lotSizeFilter.stepSize);
        const precision = Math.abs(Math.log10(stepSize));
        
        return parseFloat(quantity).toFixed(precision);
    }

    formatPrice(symbol, price) {
        const symbolInfo = this.getSymbolInfo(symbol);
        if (!symbolInfo) return price.toString();
        
        const priceFilter = symbolInfo.filters.find(f => f.filterType === 'PRICE_FILTER');
        if (!priceFilter) return price.toString();
        
        const tickSize = parseFloat(priceFilter.tickSize);
        const precision = Math.abs(Math.log10(tickSize));
        
        return parseFloat(price).toFixed(precision);
    }

    // Log des ordres
    logOrder(order) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            orderId: order.orderId,
            symbol: order.symbol,
            side: order.side,
            type: order.type,
            quantity: order.origQty,
            price: order.price,
            status: order.status,
            testnet: this.config.testnet
        };
        
        const logFile = './logs/binance_orders.log';
        fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
        
        console.log('📝 Ordre loggé:', order.orderId);
    }

    // Fermeture propre
    disconnect() {
        console.log('🔌 Fermeture connexions Binance...');
        
        // Fermer tous les WebSockets
        for (const [stream, ws] of this.state.websockets) {
            ws.close();
            console.log(`📡 WebSocket fermé: ${stream}`);
        }
        
        this.state.websockets.clear();
        console.log('✅ Déconnexion Binance terminée');
    }

    // Utilitaire sleep
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Récupération du statut de l'API
    getStatus() {
        return {
            connected: this.state.serverTime > 0,
            testnet: this.config.testnet,
            rateLimits: this.state.rateLimits,
            openOrdersCount: this.state.openOrders.length,
            balancesCount: Object.keys(this.state.balances).length,
            websocketsCount: this.state.websockets.size
        };
    }
}

// Configuration par défaut
const defaultBinanceConfig = {
    // ⚠️ IMPORTANT: Remplacer par vraies clés pour trading réel
    apiKey: 'your-api-key-here',
    apiSecret: 'your-api-secret-here',
    
    // Mode testnet par défaut pour sécurité
    testnet: true,
    
    // Paramètres de sécurité
    recvWindow: 5000,
    timeout: 10000,
    retryAttempts: 3,
    retryDelay: 1000
};

// Export et utilisation
if (require.main === module) {
    // Test de l'API Binance
    async function testBinanceAPI() {
        console.log('🧪 Test API Binance...');
        
        const api = new BinanceAPI(defaultBinanceConfig);
        
        try {
            // Test de connectivité
            await api.testConnectivity();
            
            // Récupération du prix Bitcoin
            const btcPrice = await api.getCurrentPrice('BTCUSDT');
            console.log(`₿ Prix Bitcoin: $${btcPrice}`);
            
            // Test WebSocket (prix en temps réel)
            api.connectTickerWebSocket('BTCUSDT', (ticker) => {
                console.log(`📊 BTC/USDT: $${ticker.price} (${ticker.change > 0 ? '+' : ''}${ticker.change}%)`);
            });
            
        } catch (error) {
            console.error('❌ Erreur test API:', error.message);
        }
    }
    
    // Démarrage du test
    testBinanceAPI();
    
    // Arrêt propre après 30 secondes
    setTimeout(() => {
        process.exit(0);
    }, 30000);
}

module.exports = BinanceAPI;