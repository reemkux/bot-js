// Système d'alertes avancé pour bot de trading
// Support email, SMS, Discord, Telegram et webhooks

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

class AlertSystem {
    constructor(config) {
        this.config = {
            // Configuration email
            email: {
                enabled: config.email?.enabled || false,
                service: config.email?.service || 'gmail',
                user: config.email?.user || '',
                password: config.email?.password || '', // App password
                to: config.email?.to || []
            },
            
            // Configuration Discord
            discord: {
                enabled: config.discord?.enabled || false,
                webhookUrl: config.discord?.webhookUrl || ''
            },
            
            // Configuration Telegram
            telegram: {
                enabled: config.telegram?.enabled || false,
                botToken: config.telegram?.botToken || '',
                chatId: config.telegram?.chatId || ''
            },
            
            // Configuration SMS (via API)
            sms: {
                enabled: config.sms?.enabled || false,
                provider: config.sms?.provider || 'twilio', // twilio, nexmo, etc.
                apiKey: config.sms?.apiKey || '',
                apiSecret: config.sms?.apiSecret || '',
                from: config.sms?.from || '',
                to: config.sms?.to || []
            },
            
            // Webhooks personnalisés
            webhooks: config.webhooks || [],
            
            // Filtres d'alertes
            filters: {
                minPnLPercent: config.filters?.minPnLPercent || 1.0, // 1%
                maxDrawdownPercent: config.filters?.maxDrawdownPercent || 10.0, // 10%
                consecutiveLossesThreshold: config.filters?.consecutiveLossesThreshold || 3,
                systemHealthErrors: config.filters?.systemHealthErrors !== false,
                emergencyOnly: config.filters?.emergencyOnly || false
            },
            
            // Limitations anti-spam
            rateLimits: {
                maxAlertsPerHour: config.rateLimits?.maxAlertsPerHour || 10,
                cooldownMinutes: config.rateLimits?.cooldownMinutes || 15,
                duplicateSuppressionMinutes: config.rateLimits?.duplicateSuppressionMinutes || 60
            },
            
            ...config
        };
        
        this.state = {
            alertsSentThisHour: 0,
            lastAlertTime: 0,
            recentAlerts: [], // Pour détection de doublons
            emailTransporter: null
        };
        
        this.initializeTransports();
        this.startHourlyReset();
    }

    // Initialisation des transports
    initializeTransports() {
        // Configuration email
        if (this.config.email.enabled) {
            try {
                this.state.emailTransporter = nodemailer.createTransporter({
                    service: this.config.email.service,
                    auth: {
                        user: this.config.email.user,
                        pass: this.config.email.password
                    }
                });
                console.log('✅ Transport email configuré');
            } catch (error) {
                console.error('❌ Erreur configuration email:', error.message);
                this.config.email.enabled = false;
            }
        }
        
        // Validation autres services
        this.validateConfig();
    }

    // Validation de la configuration
    validateConfig() {
        const validations = [];
        
        if (this.config.discord.enabled && !this.config.discord.webhookUrl) {
            validations.push('Discord webhook URL manquante');
            this.config.discord.enabled = false;
        }
        
        if (this.config.telegram.enabled && 
            (!this.config.telegram.botToken || !this.config.telegram.chatId)) {
            validations.push('Configuration Telegram incomplète');
            this.config.telegram.enabled = false;
        }
        
        if (this.config.sms.enabled && 
            (!this.config.sms.apiKey || !this.config.sms.apiSecret)) {
            validations.push('Configuration SMS incomplète');
            this.config.sms.enabled = false;
        }
        
        if (validations.length > 0) {
            console.log('⚠️ Alertes désactivées:', validations.join(', '));
        }
        
        const enabledServices = [
            this.config.email.enabled && 'Email',
            this.config.discord.enabled && 'Discord',
            this.config.telegram.enabled && 'Telegram',
            this.config.sms.enabled && 'SMS'
        ].filter(Boolean);
        
        console.log('📱 Services d\'alerte actifs:', enabledServices.join(', ') || 'Aucun');
    }

    // Point d'entrée principal pour envoyer une alerte
    async sendAlert(type, title, message, data = {}) {
        try {
            // Vérification des filtres
            if (!this.shouldSendAlert(type, message, data)) {
                return false;
            }
            
            // Vérification des limites
            if (!this.checkRateLimits(type, message)) {
                return false;
            }
            
            const alert = {
                id: Date.now().toString(),
                type,
                title,
                message,
                data,
                timestamp: new Date().toISOString(),
                emoji: this.getEmojiForType(type)
            };
            
            // Formatage du message enrichi
            const enrichedAlert = this.enrichAlert(alert);
            
            // Envoi sur tous les canaux activés
            const promises = [];
            
            if (this.config.email.enabled) {
                promises.push(this.sendEmailAlert(enrichedAlert));
            }
            
            if (this.config.discord.enabled) {
                promises.push(this.sendDiscordAlert(enrichedAlert));
            }
            
            if (this.config.telegram.enabled) {
                promises.push(this.sendTelegramAlert(enrichedAlert));
            }
            
            if (this.config.sms.enabled && ['EMERGENCY', 'CRITICAL'].includes(type)) {
                promises.push(this.sendSMSAlert(enrichedAlert));
            }
            
            // Webhooks personnalisés
            for (const webhook of this.config.webhooks) {
                promises.push(this.sendWebhookAlert(enrichedAlert, webhook));
            }
            
            // Attendre tous les envois
            const results = await Promise.allSettled(promises);
            const successful = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.filter(r => r.status === 'rejected').length;
            
            // Mise à jour des statistiques
            this.updateStats(alert, successful, failed);
            
            // Log de l'alerte
            this.logAlert(alert, successful, failed);
            
            console.log(`📱 Alerte envoyée: ${successful}/${results.length} services`);
            return true;
            
        } catch (error) {
            console.error('❌ Erreur envoi alerte:', error);
            return false;
        }
    }

    // Vérification des filtres
    shouldSendAlert(type, message, data) {
        const filters = this.config.filters;
        
        // Mode urgence uniquement
        if (filters.emergencyOnly && !['EMERGENCY', 'CRITICAL'].includes(type)) {
            return false;
        }
        
        // Filtre par type de données
        if (data.pnlPercent !== undefined) {
            if (Math.abs(data.pnlPercent) < filters.minPnLPercent) {
                return false;
            }
        }
        
        if (data.drawdownPercent !== undefined) {
            if (data.drawdownPercent < filters.maxDrawdownPercent) {
                return false;
            }
        }
        
        if (data.consecutiveLosses !== undefined) {
            if (data.consecutiveLosses < filters.consecutiveLossesThreshold) {
                return false;
            }
        }
        
        return true;
    }

    // Vérification des limites de taux
    checkRateLimits(type, message) {
        const now = Date.now();
        const hourAgo = now - (60 * 60 * 1000);
        const cooldownPeriod = this.config.rateLimits.cooldownMinutes * 60 * 1000;
        
        // Vérifier cooldown global
        if (now - this.state.lastAlertTime < cooldownPeriod && type !== 'EMERGENCY') {
            console.log('⏸️ Alerte ignorée - Cooldown actif');
            return false;
        }
        
        // Vérifier limite horaire
        if (this.state.alertsSentThisHour >= this.config.rateLimits.maxAlertsPerHour && 
            type !== 'EMERGENCY') {
            console.log('⏸️ Alerte ignorée - Limite horaire atteinte');
            return false;
        }
        
        // Vérifier doublons récents
        const duplicateWindow = this.config.rateLimits.duplicateSuppressionMinutes * 60 * 1000;
        const isDuplicate = this.state.recentAlerts.some(alert => 
            alert.message === message && 
            now - alert.timestamp < duplicateWindow
        );
        
        if (isDuplicate && type !== 'EMERGENCY') {
            console.log('⏸️ Alerte ignorée - Doublon récent');
            return false;
        }
        
        return true;
    }

    // Enrichissement de l'alerte
    enrichAlert(alert) {
        return {
            ...alert,
            formattedTitle: `${alert.emoji} ${alert.title}`,
            formattedMessage: this.formatMessage(alert),
            htmlMessage: this.formatHTMLMessage(alert),
            shortMessage: this.formatShortMessage(alert),
            context: this.getContext()
        };
    }

    // Formatage du message
    formatMessage(alert) {
        let message = `${alert.title}\n\n${alert.message}`;
        
        // Ajout des données contextuelles
        if (alert.data && Object.keys(alert.data).length > 0) {
            message += '\n\n📊 Données:';
            for (const [key, value] of Object.entries(alert.data)) {
                message += `\n• ${key}: ${value}`;
            }
        }
        
        // Ajout du contexte
        const context = this.getContext();
        message += `\n\n🕐 ${alert.timestamp}`;
        message += `\n🤖 Bot: ${context.botMode}`;
        
        return message;
    }

    // Formatage HTML pour email
    formatHTMLMessage(alert) {
        const context = this.getContext();
        
        return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: ${this.getColorForType(alert.type)}; color: white; padding: 20px; border-radius: 10px 10px 0 0;">
                <h2>${alert.emoji} ${alert.title}</h2>
            </div>
            <div style="background: #f9f9f9; padding: 20px; border-radius: 0 0 10px 10px;">
                <p style="font-size: 16px; margin-bottom: 20px;">${alert.message}</p>
                
                ${alert.data && Object.keys(alert.data).length > 0 ? `
                <div style="background: white; padding: 15px; border-radius: 5px; margin-bottom: 15px;">
                    <h4 style="margin-top: 0;">📊 Données détaillées:</h4>
                    <ul style="margin: 0; padding-left: 20px;">
                        ${Object.entries(alert.data).map(([key, value]) => 
                            `<li><strong>${key}:</strong> ${value}</li>`
                        ).join('')}
                    </ul>
                </div>
                ` : ''}
                
                <div style="background: white; padding: 15px; border-radius: 5px; font-size: 14px; color: #666;">
                    <p><strong>Timestamp:</strong> ${alert.timestamp}</p>
                    <p><strong>Mode bot:</strong> ${context.botMode}</p>
                    <p><strong>Uptime:</strong> ${context.uptime}</p>
                </div>
                
                <div style="margin-top: 20px; text-align: center;">
                    <a href="http://localhost:3000" style="background: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                        📊 Voir Dashboard
                    </a>
                </div>
            </div>
        </div>`;
    }

    // Message court pour SMS
    formatShortMessage(alert) {
        const data = alert.data;
        let short = `${alert.emoji} ${alert.title}: ${alert.message}`;
        
        if (data.pnlPercent) {
            short += ` (${data.pnlPercent}%)`;
        }
        
        return short.substring(0, 160); // Limite SMS
    }

    // Envoi email
    async sendEmailAlert(alert) {
        if (!this.state.emailTransporter) {
            throw new Error('Email transporter non configuré');
        }
        
        const mailOptions = {
            from: this.config.email.user,
            to: this.config.email.to.join(','),
            subject: `🤖 Trading Bot Alert: ${alert.title}`,
            text: alert.formattedMessage,
            html: alert.htmlMessage
        };
        
        return await this.state.emailTransporter.sendMail(mailOptions);
    }

    // Envoi Discord
    async sendDiscordAlert(alert) {
        const fetch = (await import('node-fetch')).default;
        
        const embed = {
            title: alert.title,
            description: alert.message,
            color: this.getDiscordColorForType(alert.type),
            timestamp: alert.timestamp,
            fields: [],
            footer: {
                text: `Trading Bot • ${alert.context.botMode}`,
                icon_url: 'https://cdn.discordapp.com/attachments/placeholder/bot-icon.png'
            }
        };
        
        // Ajout des données comme fields
        if (alert.data && Object.keys(alert.data).length > 0) {
            for (const [key, value] of Object.entries(alert.data)) {
                embed.fields.push({
                    name: key,
                    value: String(value),
                    inline: true
                });
            }
        }
        
        const payload = {
            embeds: [embed],
            username: 'Trading Bot',
            avatar_url: 'https://cdn.discordapp.com/attachments/placeholder/bot-icon.png'
        };
        
        const response = await fetch(this.config.discord.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            throw new Error(`Discord webhook failed: ${response.status}`);
        }
        
        return response;
    }

    // Envoi Telegram
    async sendTelegramAlert(alert) {
        const fetch = (await import('node-fetch')).default;
        
        const url = `https://api.telegram.org/bot${this.config.telegram.botToken}/sendMessage`;
        
        const message = alert.formattedMessage.replace(/\n/g, '%0A');
        
        const payload = {
            chat_id: this.config.telegram.chatId,
            text: message,
            parse_mode: 'HTML'
        };
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            throw new Error(`Telegram API failed: ${response.status}`);
        }
        
        return response;
    }

    // Envoi SMS
    async sendSMSAlert(alert) {
        // Implémentation pour Twilio
        if (this.config.sms.provider === 'twilio') {
            return await this.sendTwilioSMS(alert);
        }
        
        throw new Error(`SMS provider '${this.config.sms.provider}' non supporté`);
    }

    // SMS via Twilio
    async sendTwilioSMS(alert) {
        const fetch = (await import('node-fetch')).default;
        
        const accountSid = this.config.sms.apiKey;
        const authToken = this.config.sms.apiSecret;
        const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
        
        const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
        
        for (const phoneNumber of this.config.sms.to) {
            const params = new URLSearchParams({
                From: this.config.sms.from,
                To: phoneNumber,
                Body: alert.shortMessage
            });
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: params
            });
            
            if (!response.ok) {
                throw new Error(`Twilio SMS failed: ${response.status}`);
            }
        }
        
        return true;
    }

    // Webhooks personnalisés
    async sendWebhookAlert(alert, webhook) {
        const fetch = (await import('node-fetch')).default;
        
        const payload = {
            alert: alert,
            webhook_name: webhook.name,
            timestamp: Date.now()
        };
        
        const response = await fetch(webhook.url, {
            method: webhook.method || 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...webhook.headers
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            throw new Error(`Webhook '${webhook.name}' failed: ${response.status}`);
        }
        
        return response;
    }

    // Alertes prédéfinies pour événements communs
    async alertTradeExecuted(trade) {
        const type = trade.pnl > 0 ? 'SUCCESS' : 'WARNING';
        const title = trade.pnl > 0 ? 'Trade Profitable' : 'Trade en Perte';
        const message = `Trade ${trade.direction} sur ${trade.symbol} fermé`;
        
        return await this.sendAlert(type, title, message, {
            symbol: trade.symbol,
            direction: trade.direction,
            pnlPercent: trade.pnlPercent.toFixed(2) + '%',
            duration: Math.round(trade.duration / 60000) + ' min',
            reason: trade.reason
        });
    }

    async alertDrawdownExceeded(currentDrawdown, maxAllowed) {
        return await this.sendAlert(
            'CRITICAL',
            'Drawdown Critique',
            `Le drawdown actuel (${currentDrawdown.toFixed(2)}%) dépasse la limite (${maxAllowed}%)`,
            {
                currentDrawdown: currentDrawdown.toFixed(2) + '%',
                maxAllowed: maxAllowed + '%',
                action: 'Arrêt automatique recommandé'
            }
        );
    }

    async alertConsecutiveLosses(count, threshold) {
        return await this.sendAlert(
            'WARNING',
            'Pertes Consécutives',
            `${count} pertes consécutives détectées (seuil: ${threshold})`,
            {
                consecutiveLosses: count,
                threshold: threshold,
                recommendation: 'Vérifier la stratégie'
            }
        );
    }

    async alertSystemError(error, context = {}) {
        return await this.sendAlert(
            'ERROR',
            'Erreur Système',
            `Erreur critique détectée: ${error.message}`,
            {
                errorType: error.constructor.name,
                errorMessage: error.message,
                stack: error.stack?.split('\n')[0],
                ...context
            }
        );
    }

    async alertEmergencyStop(reason) {
        return await this.sendAlert(
            'EMERGENCY',
            'ARRÊT D\'URGENCE',
            `Le bot a été arrêté d'urgence: ${reason}`,
            {
                reason: reason,
                timestamp: new Date().toISOString(),
                action: 'Intervention manuelle requise'
            }
        );
    }

    // Méthodes utilitaires
    getEmojiForType(type) {
        const emojis = {
            'SUCCESS': '✅',
            'INFO': 'ℹ️',
            'WARNING': '⚠️',
            'ERROR': '❌',
            'CRITICAL': '🚨',
            'EMERGENCY': '🆘'
        };
        return emojis[type] || '📢';
    }

    getColorForType(type) {
        const colors = {
            'SUCCESS': '#4CAF50',
            'INFO': '#2196F3',
            'WARNING': '#FF9800',
            'ERROR': '#f44336',
            'CRITICAL': '#d32f2f',
            'EMERGENCY': '#b71c1c'
        };
        return colors[type] || '#9E9E9E';
    }

    getDiscordColorForType(type) {
        const colors = {
            'SUCCESS': 0x4CAF50,
            'INFO': 0x2196F3,
            'WARNING': 0xFF9800,
            'ERROR': 0xf44336,
            'CRITICAL': 0xd32f2f,
            'EMERGENCY': 0xb71c1c
        };
        return colors[type] || 0x9E9E9E;
    }

    getContext() {
        return {
            botMode: process.env.NODE_ENV || 'development',
            uptime: Math.floor(process.uptime() / 3600) + 'h',
            memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
            timestamp: new Date().toISOString()
        };
    }

    // Mise à jour des statistiques
    updateStats(alert, successful, failed) {
        this.state.alertsSentThisHour++;
        this.state.lastAlertTime = Date.now();
        
        // Ajouter aux alertes récentes
        this.state.recentAlerts.push({
            message: alert.message,
            timestamp: Date.now()
        });
        
        // Nettoyer les anciennes entrées
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        this.state.recentAlerts = this.state.recentAlerts.filter(
            a => a.timestamp > oneHourAgo
        );
    }

    // Log des alertes
    logAlert(alert, successful, failed) {
        const logEntry = {
            timestamp: alert.timestamp,
            type: alert.type,
            title: alert.title,
            successful,
            failed,
            data: alert.data
        };
        
        const logFile = path.join(__dirname, 'logs', 'alerts.log');
        fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
    }

    // Reset horaire des limites
    startHourlyReset() {
        setInterval(() => {
            this.state.alertsSentThisHour = 0;
            console.log('📱 Reset compteur alertes horaire');
        }, 60 * 60 * 1000); // Chaque heure
    }

    // Test de tous les services
    async testAllServices() {
        console.log('🧪 Test des services d\'alerte...');
        
        const testAlert = {
            type: 'INFO',
            title: 'Test du Système d\'Alertes',
            message: 'Ceci est un test de fonctionnement du système d\'alertes.',
            data: {
                testTime: new Date().toISOString(),
                services: 'Email, Discord, Telegram, SMS',
                status: 'Opérationnel'
            }
        };
        
        return await this.sendAlert(
            testAlert.type,
            testAlert.title,
            testAlert.message,
            testAlert.data
        );
    }
}

// Configuration par défaut
const defaultAlertConfig = {
    email: {
        enabled: false, // À activer avec vraies credentials
        service: 'gmail',
        user: 'your-email@gmail.com',
        password: 'your-app-password',
        to: ['admin@example.com']
    },
    
    discord: {
        enabled: false, // À activer avec vrai webhook
        webhookUrl: 'https://discord.com/api/webhooks/YOUR_WEBHOOK_URL'
    },
    
    telegram: {
        enabled: false, // À activer avec vrai bot
        botToken: 'YOUR_BOT_TOKEN',
        chatId: 'YOUR_CHAT_ID'
    },
    
    sms: {
        enabled: false, // À activer avec vraies credentials
        provider: 'twilio',
        apiKey: 'YOUR_TWILIO_SID',
        apiSecret: 'YOUR_TWILIO_TOKEN',
        from: '+1234567890',
        to: ['+1234567890']
    },
    
    filters: {
        minPnLPercent: 1.0,
        maxDrawdownPercent: 10.0,
        consecutiveLossesThreshold: 3,
        emergencyOnly: false
    },
    
    rateLimits: {
        maxAlertsPerHour: 10,
        cooldownMinutes: 15,
        duplicateSuppressionMinutes: 60
    }
};

// Export et utilisation
if (require.main === module) {
    // Test du système d'alertes
    const alertSystem = new AlertSystem(defaultAlertConfig);
    
    // Test après 2 secondes
    setTimeout(async () => {
        await alertSystem.testAllServices();
    }, 2000);
}

module.exports = AlertSystem;