let chart;
const maxDataPoints = 30;
let timeLabels = [];
let phData = [];
let ecData = [];
let tempData = [];

// ===== ESTADO GLOBAL DO SISTEMA =====
// Centraliza todos os dados para sincronização em tempo real
const globalState = {
    // Parâmetros do sistema
    system: {
        volume: 0,             // Volume do reservatório (L) - removido valor padrão
        flowRate: 0,           // Taxa de vazão (ml/s) - removido valor padrão
        baseDose: 0,           // EC base (µS/cm) - removido valor padrão
        ecSetpoint: 0,         // Setpoint EC (µS/cm) - removido valor padrão
        totalMlPorLitro: 0     // Soma automática dos ml/L
    },
    
    // Plano nutricional
    nutrition: {
        'Grow': { mlPorLitro: 0, relay: 3 },      // removido valor padrão
        'Micro': { mlPorLitro: 0, relay: 4 },     // removido valor padrão
        'Bloom': { mlPorLitro: 0, relay: 5 },     // removido valor padrão  
        'CalMag': { mlPorLitro: 0, relay: 6 },    // removido valor padrão
        'pH-': { mlPorLitro: 0, relay: 1 },       // removido valor padrão
        'pH+': { mlPorLitro: 0, relay: 2 }        // removido valor padrão
    },
    
    // Controle automático
    control: {
        autoECEnabled: false,
        lastDosage: 0,
        currentECValue: 0,
        intervaloBetweenNutrients: 0,  // removido valor padrão
        intervaloAutoEC: 0             // removido valor padrão
    },
    
    // Callbacks para notificação de mudanças
    listeners: []
};

// ===== SISTEMA DE MONITORAMENTO DE COMUNICAÇÃO =====
const communicationMonitor = {
    // Estatísticas
    stats: {
        commandsSent: 0,
        commandsSuccess: 0,
        commandsFailed: 0,
        startTime: Date.now()
    },
    
    // Status da conexão
    connectionStatus: 'offline', // 'online', 'offline', 'connecting'
    lastCommunication: null,
    
    // Log de comunicação
    logs: [],
    maxLogs: 100,
    
    // Configurações
    config: {
        autoScroll: true,
        logFilter: 'all'
    },
    
    // Inicializar sistema de monitoramento
    init() {
        console.log('🚀 Inicializando sistema de monitoramento...');
        this.setupEventListeners();
        this.updateUI();
        this.startConnectionMonitoring();
        this.addLog('info', 'Sistema de monitoramento iniciado');
    },
    
    // Configurar event listeners
    setupEventListeners() {
        // Botão limpar logs
        const clearBtn = document.getElementById('clear-logs');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearLogs());
        }
        
        // Botão minimizar dashboard
        const toggleBtn = document.getElementById('toggle-dashboard');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggleDashboard());
        }
        
        // Botão testar conexão
        const testBtn = document.getElementById('test-connection');
        if (testBtn) {
            testBtn.addEventListener('click', () => this.testConnection());
        }
        
        // Botão resumo de dados
        const summaryBtn = document.getElementById('show-data-summary');
        if (summaryBtn) {
            summaryBtn.addEventListener('click', () => this.showDataSummary());
        }
        
        // Filtro de logs
        const logFilter = document.getElementById('log-filter');
        if (logFilter) {
            logFilter.addEventListener('change', (e) => {
                this.config.logFilter = e.target.value;
                this.updateLogDisplay();
            });
        }
        
        // Auto-scroll checkbox
        const autoScrollCheck = document.getElementById('auto-scroll');
        if (autoScrollCheck) {
            autoScrollCheck.addEventListener('change', (e) => {
                this.config.autoScroll = e.target.checked;
            });
        }
    },
    
    // Interceptar todas as comunicações fetch
    interceptFetch() {
        const originalFetch = window.fetch;
        
        window.fetch = async (...args) => {
            const [url, options = {}] = args;
            const method = options.method || 'GET';
            const startTime = Date.now();
            
            // Log do envio
            this.logRequest(method, url, options.body);
            
            try {
                this.setConnectionStatus('connecting');
                const response = await originalFetch(...args);
                const duration = Date.now() - startTime;
                
                // Log da resposta
                this.logResponse(method, url, response.status, duration, response.ok);
                
                if (response.ok) {
                    this.setConnectionStatus('online');
                    this.stats.commandsSuccess++;
                } else {
                    this.stats.commandsFailed++;
                }
                
                this.stats.commandsSent++;
                this.updateStats();
                
                return response;
            } catch (error) {
                const duration = Date.now() - startTime;
                this.logError(method, url, error.message, duration);
                this.setConnectionStatus('offline');
                this.stats.commandsFailed++;
                this.stats.commandsSent++;
                this.updateStats();
                throw error;
            }
        };
    },
    
    // Log de requisição
    logRequest(method, url, body) {
        const urlPath = url.replace(window.location.origin, '');
        let message = `${method} ${urlPath}`;
        
        if (body && method !== 'GET') {
            try {
                const data = JSON.parse(body);
                const preview = this.formatDataPreview(data);
                message += ` → ${preview}`;
                this.addLog('data', message);
                
                // Atualizar info do último envio
                this.updateLastSent(urlPath, preview, 'enviando...');
            } catch (e) {
                this.addLog('data', message);
            }
        } else {
            this.addLog('info', message);
        }
    },
    
    // Log de resposta
    logResponse(method, url, status, duration, success) {
        const urlPath = url.replace(window.location.origin, '');
        const statusText = success ? '✅' : '❌';
        const message = `${statusText} ${method} ${urlPath} (${status}) - ${duration}ms`;
        
        this.addLog(success ? 'success' : 'error', message);
        this.updateLastSent(urlPath, null, success ? '✅ Sucesso' : `❌ Erro ${status}`);
    },
    
    // Log de erro
    logError(method, url, error, duration) {
        const urlPath = url.replace(window.location.origin, '');
        const message = `❌ ${method} ${urlPath} - ERRO: ${error} (${duration}ms)`;
        this.addLog('error', message);
        this.updateLastSent(urlPath, null, `❌ ${error}`);
    },
    
    // Formatar preview dos dados
    formatDataPreview(data) {
        if (data.totalUt !== undefined) {
            return `Dosagem: ${data.totalUt.toFixed(2)}ml`;
        } else if (data.baseDose !== undefined) {
            return `Params EC: ${data.baseDose}µS/cm`;
        } else if (data.setpoint !== undefined) {
            return `Setpoint: ${data.setpoint}µS/cm`;
        } else if (data.relay !== undefined) {
            return `Relé ${data.relay}: ${data.state ? 'ON' : 'OFF'}`;
        }
        return 'Dados JSON';
    },
    
    // Adicionar log
    addLog(type, message) {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = {
            timestamp,
            type,
            message,
            id: Date.now() + Math.random()
        };
        
        this.logs.unshift(logEntry);
        
        // Limitar número de logs
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(0, this.maxLogs);
        }
        
        this.updateLogDisplay();
        console.log(`📋 [${timestamp}] ${type.toUpperCase()}: ${message}`);
    },
    
    // Atualizar display do log
    updateLogDisplay() {
        const container = document.getElementById('communication-log');
        if (!container) return;
        
        // Filtrar logs
        let filteredLogs = this.logs;
        if (this.config.logFilter !== 'all') {
            filteredLogs = this.logs.filter(log => log.type === this.config.logFilter);
        }
        
        // Renderizar logs
        container.innerHTML = filteredLogs.map(log => 
            `<div class="log-entry ${log.type}">
                <span class="timestamp">${log.timestamp}</span>
                <span class="type">${this.getTypeIcon(log.type)} ${log.type.toUpperCase()}</span>
                <span class="message">${log.message}</span>
            </div>`
        ).join('');
        
        // Auto-scroll se habilitado
        if (this.config.autoScroll) {
            container.scrollTop = 0; // Scroll para o topo (logs mais recentes)
        }
    },
    
    // Ícone do tipo de log
    getTypeIcon(type) {
        const icons = {
            success: '✅',
            error: '❌',
            info: 'ℹ️',
            data: '📊'
        };
        return icons[type] || 'ℹ️';
    },
    
    // Atualizar status da conexão
    setConnectionStatus(status) {
        if (this.connectionStatus !== status) {
            this.connectionStatus = status;
            this.lastCommunication = new Date();
            this.updateConnectionUI();
            
            const statusMessages = {
                online: 'Conectado ao ESP32',
                offline: 'Desconectado do ESP32',
                connecting: 'Conectando ao ESP32...'
            };
            
            this.addLog('info', statusMessages[status] || `Status: ${status}`);
        }
    },
    
    // Atualizar UI da conexão
    updateConnectionUI() {
        const statusElement = document.getElementById('esp32-status');
        const lastCommElement = document.getElementById('last-communication');
        
        if (statusElement) {
            statusElement.className = `status-indicator ${this.connectionStatus}`;
            
            const statusTexts = {
                online: '🟢 Conectado',
                offline: '🔴 Desconectado',
                connecting: '🟡 Conectando...'
            };
            
            statusElement.textContent = statusTexts[this.connectionStatus] || this.connectionStatus;
        }
        
        if (lastCommElement && this.lastCommunication) {
            const timeAgo = this.getTimeAgo(this.lastCommunication);
            lastCommElement.textContent = `Última comunicação: ${timeAgo}`;
        }
    },
    
    // Calcular tempo decorrido
    getTimeAgo(date) {
        const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
        
        if (seconds < 60) return `${seconds}s atrás`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m atrás`;
        return `${Math.floor(seconds / 3600)}h atrás`;
    },
    
    // Atualizar informações do último envio
    updateLastSent(type, data, status) {
        const typeElement = document.getElementById('last-sent-type');
        const dataElement = document.getElementById('last-sent-data');
        const statusElement = document.getElementById('last-sent-status');
        
        if (typeElement) typeElement.textContent = type;
        if (dataElement && data) dataElement.textContent = data;
        if (statusElement) statusElement.textContent = status;
    },
    
    // Atualizar estatísticas
    updateStats() {
        const sentElement = document.getElementById('commands-sent');
        const successElement = document.getElementById('commands-success');
        const failedElement = document.getElementById('commands-failed');
        
        if (sentElement) sentElement.textContent = this.stats.commandsSent;
        if (successElement) successElement.textContent = this.stats.commandsSuccess;
        if (failedElement) failedElement.textContent = this.stats.commandsFailed;
    },
    
    // Atualizar informações do controle EC
    updateECInfo(utValue, nextDosage, activeRelays) {
        const utElement = document.getElementById('current-ut');
        const nextElement = document.getElementById('next-dosage');
        const relaysElement = document.getElementById('active-relays');
        
        if (utElement) utElement.textContent = `${utValue.toFixed(2)} ml`;
        if (nextElement) nextElement.textContent = nextDosage || '--';
        if (relaysElement) relaysElement.textContent = activeRelays || '--';
    },
    
    // Limpar logs
    clearLogs() {
        this.logs = [];
        this.updateLogDisplay();
        this.addLog('info', 'Logs limpos pelo usuário');
    },
    
    // Toggle dashboard (minimizar/expandir)
    toggleDashboard() {
        const dashboard = document.getElementById('comm-dashboard');
        const toggleBtn = document.getElementById('toggle-dashboard');
        
        if (dashboard && toggleBtn) {
            dashboard.classList.toggle('minimized');
            const isMinimized = dashboard.classList.contains('minimized');
            toggleBtn.textContent = isMinimized ? '📈 Expandir' : '📊 Minimizar';
        }
    },
    
    // Testar conexão
    async testConnection() {
        this.addLog('info', 'Testando conexão com ESP32...');
        
        try {
            const response = await fetch('/sensors');
            if (response.ok) {
                const data = await response.json();
                this.addLog('success', `Conexão OK - EC: ${data.ec}µS/cm, pH: ${data.ph.toFixed(2)}`);
                this.setConnectionStatus('online');
            } else {
                this.addLog('error', `Teste falhou - Status: ${response.status}`);
                this.setConnectionStatus('offline');
            }
        } catch (error) {
            this.addLog('error', `Teste falhou - ${error.message}`);
            this.setConnectionStatus('offline');
        }
    },
    
    // Monitoramento contínuo da conexão
    startConnectionMonitoring() {
        setInterval(() => {
            this.updateConnectionUI();
            
            // Auto-test se estiver offline por muito tempo
            if (this.connectionStatus === 'offline' && 
                this.lastCommunication && 
                (Date.now() - this.lastCommunication.getTime()) > 30000) { // 30 segundos
                this.testConnection();
            }
        }, 5000);
    },
    
    // Atualizar UI geral
    updateUI() {
        this.updateConnectionUI();
        this.updateStats();
        this.updateLogDisplay();
    },
    
    // Mostrar resumo dos dados sendo enviados
    showDataSummary() {
        const { system, nutrition, control } = globalState;
        const uptime = Math.floor((Date.now() - this.stats.startTime) / 1000);
        const uptimeText = this.formatUptime(uptime);
        
        // Calcular distribuição atual
        const distribution = calculateProportionalDistribution(1); // Usar 1ml como base
        
        let summary = `📊 RESUMO DO SISTEMA - DADOS ENVIADOS AO ESP32
        
╔════════════════════════════════════════════════════════════════╗
║                    📡 STATUS DE COMUNICAÇÃO                     ║
╠════════════════════════════════════════════════════════════════╣
║ Status ESP32: ${this.connectionStatus.toUpperCase()}                                      ║
║ Última comunicação: ${this.lastCommunication ? this.getTimeAgo(this.lastCommunication) : 'Nunca'}                        ║
║ Tempo ativo: ${uptimeText}                                      ║
║ Comandos enviados: ${this.stats.commandsSent}                                        ║
║ Sucessos: ${this.stats.commandsSuccess} | Falhas: ${this.stats.commandsFailed}                              ║
╚════════════════════════════════════════════════════════════════╝

╔════════════════════════════════════════════════════════════════╗
║                   🔧 PARÂMETROS DO SISTEMA                     ║
╠════════════════════════════════════════════════════════════════╣
║ 📊 Base Dose: ${system.baseDose} µS/cm                                    ║
║ 💧 Flow Rate: ${system.flowRate} ml/s                                     ║
║ 🪣 Volume: ${system.volume} L                                           ║
║ 🎯 EC Setpoint: ${system.ecSetpoint} µS/cm                                ║
║ 🧪 Total ml/L: ${system.totalMlPorLitro.toFixed(1)} ml/L                             ║
║ ⚡ Fator k: ${system.totalMlPorLitro > 0 ? (system.baseDose / system.totalMlPorLitro).toFixed(3) : '0.000'}                                    ║
╚════════════════════════════════════════════════════════════════╝

╔════════════════════════════════════════════════════════════════╗
║                    🧪 PLANO NUTRICIONAL                        ║
╠════════════════════════════════════════════════════════════════╣`;

        Object.keys(nutrition).forEach(nutrient => {
            const data = nutrition[nutrient];
            const quantidade = (data.mlPorLitro * system.volume).toFixed(1);
            summary += `\n║ ${nutrient.padEnd(8)}: ${data.mlPorLitro.toString().padStart(4)}ml/L → ${quantidade.padStart(6)}ml (Relé ${data.relay})  ║`;
        });

        summary += `
╚════════════════════════════════════════════════════════════════╝

╔════════════════════════════════════════════════════════════════╗
║                 🎛️ CONTROLE AUTOMÁTICO                         ║
╠════════════════════════════════════════════════════════════════╣
║ Auto EC: ${control.autoECEnabled ? 'ATIVO' : 'DESATIVADO'}                                      ║
║ EC Atual: ${control.currentECValue.toFixed(1)} µS/cm                                   ║
║ Erro atual: ${control.currentECValue > 0 ? (system.ecSetpoint - control.currentECValue).toFixed(1) : '--'} µS/cm                                ║
║ Intervalo dosagem: ${control.intervaloBetweenNutrients}s                                     ║
╚════════════════════════════════════════════════════════════════╝`;

        if (distribution.length > 0) {
            summary += `

╔════════════════════════════════════════════════════════════════╗
║                📊 DISTRIBUIÇÃO PROPORCIONAL                   ║
╠════════════════════════════════════════════════════════════════╣`;
            
            distribution.forEach(item => {
                const percent = (item.proporcao * 100).toFixed(1);
                summary += `\n║ ${item.nutriente.padEnd(8)}: ${percent.padStart(5)}% → Relé ${item.relay}                        ║`;
            });
            
            summary += `
╚════════════════════════════════════════════════════════════════╝`;
        }

        summary += `

╔════════════════════════════════════════════════════════════════╗
║                    🔄 PRÓXIMAS AÇÕES                          ║
╠════════════════════════════════════════════════════════════════╣`;

        // Calcular u(t) atual se possível
        if (window.lastControllerResult) {
            const result = window.lastControllerResult;
            summary += `
║ u(t) calculado: ${result.result.toFixed(2)} ml                                ║
║ Tempo dosagem: ${result.dosageTime.toFixed(1)}s                                   ║`;
            
            if (result.result > 0.1) {
                summary += `
║ Status: DOSAGEM NECESSÁRIA                                     ║`;
            } else {
                summary += `
║ Status: SEM DOSAGEM NECESSÁRIA                                 ║`;
            }
        } else {
            summary += `
║ Status: AGUARDANDO CÁLCULO DO CONTROLLER                       ║`;
        }

        summary += `
╚════════════════════════════════════════════════════════════════╝

📝 ÚLTIMOS LOGS:`;

        // Adicionar últimos 5 logs
        const recentLogs = this.logs.slice(0, 5);
        recentLogs.forEach(log => {
            const icon = this.getTypeIcon(log.type);
            summary += `\n${icon} [${log.timestamp}] ${log.message}`;
        });

        summary += `

✅ TODOS OS DADOS ACIMA SÃO ENVIADOS EM TEMPO REAL PARA O ESP32!
📡 Use o monitor serial do Arduino IDE para ver os logs do ESP32.`;

        alert(summary);
        this.addLog('info', 'Resumo de dados exibido para o usuário');
    },
    
    // Formatar tempo de atividade
    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (days > 0) return `${days}d ${hours}h ${minutes}m`;
        if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
        if (minutes > 0) return `${minutes}m ${secs}s`;
        return `${secs}s`;
    }
};

// Função para adicionar listeners de mudança de estado
function addStateListener(callback) {
    globalState.listeners.push(callback);
}

// Função para notificar mudanças de estado
function notifyStateChange(section, field, oldValue, newValue) {
    console.log(`🔄 Estado alterado: ${section}.${field} = ${oldValue} → ${newValue}`);
    globalState.listeners.forEach(callback => {
        try {
            callback(section, field, oldValue, newValue);
        } catch (error) {
            console.error('❌ Erro no listener de estado:', error);
        }
    });
}

// Função para atualizar estado de forma segura
function updateState(section, field, value) {
    const oldValue = globalState[section][field];
    if (oldValue !== value) {
        globalState[section][field] = value;
        notifyStateChange(section, field, oldValue, value);
        syncAllFields();
    }
}

// Função para sincronizar todos os campos da interface
function syncAllFields() {
    console.log('🔄 Sincronizando todos os campos da interface...');
    
    // Sincronizar campos da seção EC
    syncFieldValue('volume-reservoir', globalState.system.volume);
    syncFieldValue('flow-rate', globalState.system.flowRate);
    syncFieldValue('base-dose', globalState.system.baseDose);
    syncFieldValue('ec-setpoint', globalState.system.ecSetpoint);
    syncFieldValue('intervalo-dosagem', globalState.control.intervaloBetweenNutrients);
    syncFieldValue('intervalo-auto-ec', globalState.control.intervaloAutoEC);
    
    // Sincronizar tabela nutricional
    Object.keys(globalState.nutrition).forEach(nutrient => {
        const row = document.querySelector(`tr[data-nutrient="${nutrient}"]`);
        if (row) {
            const input = row.querySelector('.ml-por-litro');
            if (input) {
                syncFieldValue(input, globalState.nutrition[nutrient].mlPorLitro);
            }
        }
    });
    
    // Recalcular tudo
    calculateNutritionPlan();
    updateEquationDisplay();
}

// Função auxiliar para sincronizar valor de campo
function syncFieldValue(fieldOrId, value) {
    let element;
    if (typeof fieldOrId === 'string') {
        element = document.getElementById(fieldOrId);
    } else {
        element = fieldOrId;
    }
    
    if (element && element.value != value) {
        element.value = value;
        console.log(`📝 Campo sincronizado: ${element.id || element.className} = ${value}`);
    }
}

// Função centralizada para calcular plano nutricional
function calculateNutritionPlan() {
    console.log('🧮 Calculando plano nutricional com estado global...');
    
    const { volume, flowRate } = globalState.system;
    const { intervaloBetweenNutrients } = globalState.control;
    
    if (volume <= 0 || flowRate <= 0) {
        console.error('❌ Parâmetros inválidos:', { volume, flowRate });
        return;
    }
    
    let tempoTotal = 0;
    let mlPorLitroTotal = 0;
    
    // Calcular para cada nutriente
    Object.keys(globalState.nutrition).forEach(nutrient => {
        const nutritionData = globalState.nutrition[nutrient];
        const { mlPorLitro } = nutritionData;
        
        // Calcular quantidade e tempo
        const quantidade = mlPorLitro * volume;
        const tempo = quantidade / flowRate;
        
        // Atualizar na interface
        const row = document.querySelector(`tr[data-nutrient="${nutrient}"]`);
        if (row) {
            const quantidadeCell = row.querySelector('.quantidade');
            const tempoCell = row.querySelector('.tempo');
            
            if (quantidadeCell) quantidadeCell.textContent = quantidade.toFixed(1);
            if (tempoCell) tempoCell.textContent = tempo.toFixed(1);
        }
        
        // Somar totais
        tempoTotal += tempo;
        mlPorLitroTotal += mlPorLitro;
        
        console.log(`🧪 ${nutrient}: ${mlPorLitro}ml/L → ${quantidade.toFixed(1)}ml → ${tempo.toFixed(1)}s`);
    });
    
    // Adicionar intervalos
    const numNutrientes = Object.keys(globalState.nutrition).length;
    if (numNutrientes > 1) {
        tempoTotal += intervaloBetweenNutrients * (numNutrientes - 1);
    }
    
    // Atualizar estado global
    updateState('system', 'totalMlPorLitro', mlPorLitroTotal);
    
    // Atualizar interface
    const tempoTotalElement = document.getElementById('tempo-total');
    if (tempoTotalElement) {
        tempoTotalElement.textContent = `${tempoTotal.toFixed(1)} segundos`;
    }
    
    const totalMlElement = document.getElementById('total-ml');
    if (totalMlElement) {
        totalMlElement.value = mlPorLitroTotal.toFixed(1);
        // Disparar evento para outros listeners
        totalMlElement.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    console.log(`📊 TOTAIS: ${mlPorLitroTotal.toFixed(1)}ml/L, ${tempoTotal.toFixed(1)}s`);
}

// Função para inicializar estado global
function initializeGlobalState() {
    console.log('🚀 Inicializando estado global...');
    
    // Carregar valores dos campos existentes
    const volumeField = document.getElementById('volume-reservoir');
    const flowRateField = document.getElementById('flow-rate');
    const baseDoseField = document.getElementById('base-dose');
    const setpointField = document.getElementById('ec-setpoint');
    const intervalField = document.getElementById('intervalo-dosagem');
    const intervaloAutoField = document.getElementById('intervalo-auto-ec');
    
    if (volumeField && volumeField.value) {
        globalState.system.volume = parseFloat(volumeField.value);
    }
    if (flowRateField && flowRateField.value) {
        globalState.system.flowRate = parseFloat(flowRateField.value);
    }
    if (baseDoseField && baseDoseField.value) {
        globalState.system.baseDose = parseFloat(baseDoseField.value);
    }
    if (setpointField && setpointField.value) {
        globalState.system.ecSetpoint = parseFloat(setpointField.value);
    }
    if (intervalField && intervalField.value) {
        globalState.control.intervaloBetweenNutrients = parseInt(intervalField.value);
    }
    if (intervaloAutoField && intervaloAutoField.value) {
        globalState.control.intervaloAutoEC = parseInt(intervaloAutoField.value);
    }
    
    // Carregar valores da tabela nutricional
    document.querySelectorAll('tr[data-nutrient]').forEach(row => {
        const nutrient = row.getAttribute('data-nutrient');
        const mlInput = row.querySelector('.ml-por-litro');
        const relay = parseInt(row.getAttribute('data-relay'));
        
        if (mlInput && globalState.nutrition[nutrient]) {
            globalState.nutrition[nutrient].mlPorLitro = parseFloat(mlInput.value) || 0;
            globalState.nutrition[nutrient].relay = relay;
        }
    });
    
    console.log('✅ Estado global inicializado:', globalState);
}

// Listeners para mudanças de estado
addStateListener((section, field, oldValue, newValue) => {
    // Quando system.volume ou system.flowRate mudam, recalcular plano
    if ((section === 'system' && (field === 'volume' || field === 'flowRate')) ||
        (section === 'control' && field === 'intervaloBetweenNutrients')) {
        setTimeout(() => calculateNutritionPlan(), 50);
    }
    
    // Quando qualquer parâmetro muda, atualizar equação
    if (section === 'system') {
        setTimeout(() => updateEquationDisplay(), 100);
    }
});

// Variáveis para a tabela de nutrição (agora usando valores da seção EC)
// Removidas as variáveis locais, agora usa os valores dos inputs da seção EC

// Variáveis para controle de EC
let ecControlEnabled = false;
let currentECSetpoint = 1200;
let lastDosage = 0;

// Definir nomes dos relés
const relayNames = {
    1: "Bomba pH-",
    2: "Bomba pH+",
    3: "Bomba A",
    4: "Bomba B",
    5: "Bomba C",
    6: "Bomba CalMag",
    7: "Luz UV",
    8: "Aerador"
};

// Mapeamento de nutrientes para relés
const nutrientRelayMap = {
    "pH-": 1,
    "pH+": 2,
    "Grow": 3,
    "Micro": 4,
    "Bloom": 5,
    "CalMag": 6
};

// Objeto para armazenar parâmetros salvos
let savedECParameters = {
    baseDose: 0,        // removido valor padrão
    flowRate: 0,        // removido valor padrão
    volume: 0,          // removido valor padrão
    totalMlPorLitro: 0,
    setpoint: 0,        // removido valor padrão
    timestamp: null
};

function initializeChart() {
    const ctx = document.getElementById('sensorChart').getContext('2d');
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: timeLabels,
            datasets: [{
                label: 'pH',
                data: phData,
                borderColor: 'rgb(75, 192, 192)',
                tension: 0.4,
                yAxisID: 'y-ph'
            }, {
                label: 'EC (µS/cm)',
                data: ecData,
                borderColor: 'rgb(153, 102, 255)',
                tension: 0.4,
                yAxisID: 'y-ec'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
                'y-ph': {
                    type: 'linear',
                    position: 'left',
                    min: 4,
                    max: 7,
                    grid: {
                        color: 'rgba(255,255,255,0.1)'
                    },
                    ticks: {
                        color: 'white'
                    }
                },
                'y-ec': {
                    type: 'linear',
                    position: 'right',
                    min: 0,
                    max: 500,
                    grid: {
                        color: 'rgba(255,255,255,0.1)'
                    },
                    ticks: {
                        color: 'white'
                    }
                },
                x: {
                    ticks: {
                        color: 'white'
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: 'white'
                    }
                }
            }
        }
    });
}

function updateClock() {
    const now = new Date();
    document.getElementById('current-time').textContent = now.toLocaleTimeString();
}

function updateWiFiStrength(rssi) {
    const wifiText = document.getElementById('wifi-strength');
    let strength;
    let icon;
    
    if (rssi >= -50) {
        strength = 'Excelente';
        icon = '📶';
    } else if (rssi >= -70) {
        strength = 'Bom';
        icon = '📶';
    } else {
        strength = 'Fraco';
        icon = '📶';
    }
    
    wifiText.innerHTML = `${icon} WiFi: ${strength}`;
}

function updateChartScales() {
    if (ecData.length > 0 && phData.length > 0) {
        // Calcula limites para EC
        const maxEC = Math.max(...ecData) * 1.2;  
        const minEC = Math.min(...ecData) * 0.8;  

        // Calcula limites para pH
        const maxPH = Math.max(...phData) * 1.1;  
        const minPH = Math.max(0, Math.min(...phData) * 0.9);  

        // Atualiza as escalas
        chart.options.scales['y-ec'].max = maxEC;
        chart.options.scales['y-ec'].min = minEC;
        chart.options.scales['y-ph'].max = maxPH;
        chart.options.scales['y-ph'].min = minPH;
    }
}

function updateChart(ph, ec) {
    const now = new Date().toLocaleTimeString();
    
    timeLabels.push(now);
    phData.push(ph);
    ecData.push(ec);
    
    if (timeLabels.length > maxDataPoints) {
        timeLabels.shift();
        phData.shift();
        ecData.shift();
    }
    
    updateChartScales();
    chart.update('none');
}

function fetchSensorData() {
    fetch('/sensors')
        .then(response => response.json())
        .then(data => {
            // Atualizar valores
            document.getElementById('temp-value').textContent = data.temperature.toFixed(1);
            document.getElementById('ph-value').textContent = data.ph.toFixed(2);
            document.getElementById('ec-value').textContent = data.ec.toFixed(0);
            document.getElementById('tds-value').textContent = data.tds.toFixed(0);
            
            // Atualizar status do controle EC
            updateECStatus(data.ec);
            
            // Atualizar gráfico
            updateChart(data.ph, data.ec);
            
            // ===== ATUALIZAR TOGGLES DOS RELÉS =====
            if (data.relayStates && Array.isArray(data.relayStates)) {
                updateRelayToggles(data.relayStates);
            }
        })
        .catch(error => {
            console.error('Erro ao buscar dados:', error);
        });
}

function toggleRelay(relay, seconds = 0) {
    const relayNumber = relay + 1;
    const url = `/toggle${relayNumber}${seconds > 0 ? `?seconds=${seconds}` : ''}`;
    
    console.log(`🔄 Alternando relé ${relayNumber}${seconds > 0 ? ` por ${seconds}s` : ''}`);
    
    fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error('Erro ao controlar relé');
            }
            console.log(`✅ Relé ${relayNumber} alternado com sucesso`);
            
            // Atualizar estado visual imediatamente
            const toggleSwitch = document.getElementById(`relay-${relayNumber}-toggle`);
            const statusText = document.getElementById(`relay-${relayNumber}-status`);
            
            if (toggleSwitch && statusText) {
                const isCurrentlyActive = toggleSwitch.classList.contains('active');
                
                if (seconds > 0) {
                    // Ativar temporariamente
                    toggleSwitch.classList.add('active');
                    statusText.textContent = `ON (${seconds}s)`;
                    statusText.className = 'relay-status active';
                    
                    // Desativar após o tempo especificado
                    setTimeout(() => {
                        toggleSwitch.classList.remove('active');
                        statusText.textContent = 'OFF';
                        statusText.className = 'relay-status';
                    }, seconds * 1000);
                } else {
                    // Toggle simples
                    if (isCurrentlyActive) {
                        toggleSwitch.classList.remove('active');
                        statusText.textContent = 'OFF';
                        statusText.className = 'relay-status';
                    } else {
                        toggleSwitch.classList.add('active');
                        statusText.textContent = 'ON';
                        statusText.className = 'relay-status active';
                    }
                }
            }
            
            // Buscar estados atuais após um pequeno delay
            setTimeout(() => {
                fetchSensorData();
            }, 500);
        })
        .catch(error => {
            console.error(`❌ Erro ao alternar relé ${relayNumber}:`, error);
            alert(`Erro ao controlar relé ${relayNumber}: ${error.message}`);
        });
}

// Adicionar função para resetar o gráfico
function resetChart() {
    timeLabels.length = 0;
    phData.length = 0;
    ecData.length = 0;
    
    chart.data.labels = timeLabels;
    chart.data.datasets[0].data = phData;
    chart.data.datasets[1].data = ecData;
    
    chart.update('none');
    
    console.log('📈 Gráfico resetado');
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Inicializando sistema hidropônico com estado global...');
    
    // ===== INICIALIZAR SISTEMA DE MONITORAMENTO PRIMEIRO =====
    communicationMonitor.init();
    communicationMonitor.interceptFetch(); // Interceptar todas as comunicações
    
    initializeChart();
    fetchSensorData();
    fetchRelayStates();
    
    // Aguardar um pouco para garantir que o DOM está completamente carregado
    setTimeout(() => {
        // Inicializar estado global primeiro
        initializeGlobalState();
        
        // Configurar listeners baseados no estado global
        setupGlobalStateListeners();
        
        // Configurar outros listeners (botões, etc.)
        setupOtherEventListeners();
        
        // Carregar parâmetros salvos (vai sincronizar com estado global)
        loadSavedECParameters();
        
        // Calcular plano inicial
        calculateNutritionPlan();
        
        console.log('✅ Sistema inicializado com estado global!');
        communicationMonitor.addLog('success', 'Sistema hidropônico totalmente inicializado');
    }, 100);
    
    // Teste final dos listeners após 2 segundos
    setTimeout(() => {
        console.log('🔍 Executando teste final do estado global...');
        testGlobalStateIntegration();
    }, 2000);
    
    // Atualizar sensores a cada 5 segundos
    setInterval(fetchSensorData, 5000);
    
    // Atualizar equação a cada 5 segundos (mais frequente)
    setInterval(() => {
        updateEquationDisplay().then(result => {
            if (result && result.result !== undefined) {
                // Atualizar info do controle EC no dashboard
                const nextDosage = globalState.control.autoECEnabled ? 
                    (result.result > 0.1 ? 'Dosagem necessária' : 'Sem dosagem necessária') : 
                    'Auto EC desativado';
                
                // Simular relés ativos (baseado no último resultado)
                const activeRelays = result.distribution && result.distribution.length > 0 ?
                    result.distribution.filter(d => d.utNutriente > 0.01).map(d => d.relay).join(', ') :
                    'Nenhum';
                
                communicationMonitor.updateECInfo(result.result, nextDosage, activeRelays);
            }
        });
    }, 5000);
    
    // Atualizar erro atual a cada 3 segundos (ainda mais frequente)
    setInterval(() => {
        const currentECElement = document.getElementById('ec-value');
        const currentEC = currentECElement ? parseFloat(currentECElement.textContent) || 0 : 0;
        
        // Atualizar estado global com EC atual
        if (currentEC > 0) {
            globalState.control.currentECValue = currentEC;
        }
        
        // Atualizar apenas o erro se temos dados válidos
        if (currentEC > 0) {
            const setpoint = globalState.system.ecSetpoint;
            const errorSpan = document.getElementById('ec-error');
            
            if (setpoint > 0 && errorSpan) {
                const error = setpoint - currentEC;
                errorSpan.textContent = `${error.toFixed(0)} µS/cm`;
                
                // Código de cores para o erro
                if (Math.abs(error) > 100) {
                    errorSpan.className = 'status-value error';
                } else if (Math.abs(error) > 50) {
                    errorSpan.className = 'status-value warning';
                } else {
                    errorSpan.className = 'status-value';
                }
            }
        }
    }, 3000);
    
    console.log('✅ Sistema de controle EC inicializado com estado global');
    console.log('🔧 Distribuição proporcional ativa');
    console.log('📡 Sistema de monitoramento ativo');
    console.log('⏱️ Atualizações: Sensores 5s, Equação 5s, Erro 3s');
});

// Função para configurar outros event listeners (botões, etc.)
function setupOtherEventListeners() {
    console.log('🔧 Configurando outros event listeners...');
    
    // Event listener para o botão de salvar parâmetros EC
    const saveBtn = document.getElementById('save-ec-params');
    if (saveBtn) {
        saveBtn.removeEventListener('click', saveECParametersFromGlobalState);
        saveBtn.addEventListener('click', saveECParametersFromGlobalState);
        console.log('✅ Listener do botão salvar configurado');
    }
    
    // Event listener para toggle do auto EC
    const toggleBtn = document.getElementById('toggle-auto-ec');
    if (toggleBtn) {
        toggleBtn.removeEventListener('click', handleToggleAutoEC);
        toggleBtn.addEventListener('click', handleToggleAutoEC);
        console.log('✅ Listener do botão toggle Auto EC configurado');
    }
    
    // Event listener para cancelar Auto EC
    const cancelBtn = document.getElementById('cancel-auto-ec');
    if (cancelBtn) {
        cancelBtn.removeEventListener('click', handleCancelAutoEC);
        cancelBtn.addEventListener('click', handleCancelAutoEC);
        console.log('✅ Listener do botão cancelar Auto EC configurado');
    }
    
    // ===== 🚨 EVENT LISTENER PARA RESET EMERGENCIAL =====
    const emergencyResetBtn = document.getElementById('emergency-reset');
    if (emergencyResetBtn) {
        emergencyResetBtn.removeEventListener('click', handleEmergencyReset);
        emergencyResetBtn.addEventListener('click', handleEmergencyReset);
        console.log('✅ Listener do botão RESET EMERGENCIAL configurado');
    }
    
    // COMENTADO - BOTÃO DOSAGEM PROPORCIONAL REMOVIDO
    /*
    // Event listener para dosagem proporcional manual
    const dosageBtn = document.getElementById('executar-dosagem-proporcional');
    if (dosageBtn) {
        dosageBtn.removeEventListener('click', handleDosagemProporcional);
        dosageBtn.addEventListener('click', handleDosagemProporcional);
        console.log('✅ Listener do botão dosagem proporcional configurado');
    }
    */
    
    // ===== NOVOS BOTÕES LIMPAR VALORES =====
    
    // Event listener para botão Limpar Valores EC
    const clearECBtn = document.getElementById('clear-ec-values');
    if (clearECBtn) {
        clearECBtn.removeEventListener('click', handleClearECValues);
        clearECBtn.addEventListener('click', handleClearECValues);
        console.log('✅ Listener do botão limpar valores EC configurado');
    }
    
    // Event listener para botão Limpar Plano Nutricional
    const clearNutritionBtn = document.getElementById('clear-nutrition-plan');
    if (clearNutritionBtn) {
        clearNutritionBtn.removeEventListener('click', handleClearNutritionPlan);
        clearNutritionBtn.addEventListener('click', handleClearNutritionPlan);
        console.log('✅ Listener do botão limpar plano nutricional configurado');
    }
}

// Função para testar integração do estado global
function testGlobalStateIntegration() {
    console.log('🧪 Testando integração do estado global...');
    
    // Verificar se campos estão sincronizados
    const volumeField = document.getElementById('volume-reservoir');
    const flowRateField = document.getElementById('flow-rate');
    const nutritionInputs = document.querySelectorAll('.ml-por-litro');
    
    if (!volumeField || !flowRateField) {
        console.error('❌ Campos principais não encontrados');
        return false;
    }
    
    if (nutritionInputs.length === 0) {
        console.error('❌ Inputs de nutrição não encontrados');
        return false;
    }
    
    console.log(`✅ Volume field: ${volumeField.value} (estado: ${globalState.system.volume})`);
    console.log(`✅ Flow rate field: ${flowRateField.value} (estado: ${globalState.system.flowRate})`);
    console.log(`✅ Nutrition inputs: ${nutritionInputs.length} encontrados`);
    console.log(`✅ Estado global nutrition:`, globalState.nutrition);
    
    // Teste de sincronização: mudar valor no estado e ver se atualiza interface
    console.log('🔧 Testando sincronização automática...');
    syncAllFields();
    
    console.log('✅ Teste de integração do estado global concluído!');
    return true;
}

// Função para calcular distribuição proporcional do u(t) entre nutrientes
function calculateProportionalDistribution(totalUt) {
    console.log('🧮 Calculando distribuição proporcional com ALTA PRECISÃO (3 casas decimais)...');
    console.log(`💧 Total u(t): ${totalUt.toFixed(3)} ml`);
    
    const volume = globalState.system.volume;
    const flowRate = globalState.system.flowRate;
    
    console.log(`🎯 Parâmetros: Volume=${volume}L, FlowRate=${flowRate.toFixed(3)}ml/s`);
    
    let distribution = [];
    let totalProportion = 0;
    
    // Calcular proporções baseadas no estado global
    Object.keys(globalState.nutrition).forEach(nutrient => {
        const nutritionData = globalState.nutrition[nutrient];
        const mlPorLitro = nutritionData.mlPorLitro;
        
        if (mlPorLitro > 0) {
            totalProportion += mlPorLitro;
        }
    });
    
    console.log(`📊 Total ml/L: ${totalProportion.toFixed(3)} ml/L`);
    console.log('\n=== DISTRIBUIÇÃO PROPORCIONAL (ESTADO GLOBAL) ===');
    
    // Criar distribuição proporcional
    Object.keys(globalState.nutrition).forEach(nutrient => {
        const nutritionData = globalState.nutrition[nutrient];
        const mlPorLitro = nutritionData.mlPorLitro;
        
        if (mlPorLitro > 0 && totalProportion > 0) {
            // PRECISÃO DE 3 CASAS DECIMAIS
            const proporcao = mlPorLitro / totalProportion;
        const utNutriente = totalUt * proporcao;
            const tempoDosagem = utNutriente / flowRate;
        
            console.log(`🧪 ${nutrient}: ${mlPorLitro.toFixed(3)} ml/L (${(proporcao * 100).toFixed(1)}%) → u(t)=${utNutriente.toFixed(3)} ml → ${tempoDosagem.toFixed(3)}s`);
        
        distribution.push({
                nutriente: nutrient,
                relay: nutritionData.relay,
                mlPorLitro: parseFloat(mlPorLitro.toFixed(3)),
                proporcao: parseFloat(proporcao.toFixed(6)), // 6 decimais para proporção
                utNutriente: parseFloat(utNutriente.toFixed(3)),
                tempoDosagem: parseFloat(tempoDosagem.toFixed(3)) // ALTA PRECISÃO!
            });
        }
    });
    
    console.log('============================================');
    
    return distribution;
}

// Função moderna para atualizar a exibição da equação usando estado global
function updateEquationDisplay() {
    console.log('🧮 Atualizando equação com estado global...');
    
    // Usar valores do estado global
    const { volume, flowRate, baseDose, totalMlPorLitro, ecSetpoint } = globalState.system;
    
    // Verificar se todos os parâmetros são válidos
    if (volume <= 0 || flowRate <= 0 || baseDose <= 0 || totalMlPorLitro <= 0 || ecSetpoint <= 0) {
        // Mostrar valores do estado global mesmo se incompletos
        document.getElementById('eq-volume').textContent = `${volume} L`;
        document.getElementById('eq-k-value').textContent = '0.000';
        document.getElementById('eq-flow-rate').textContent = `${flowRate} ml/s`;
        document.getElementById('eq-error').textContent = '-- µS/cm';
        document.getElementById('eq-result').textContent = '-- ml';
        document.getElementById('eq-time').textContent = '-- segundos';
        
        console.log('⚠️ Parâmetros incompletos no estado global');
        return Promise.resolve({ result: 0, dosageTime: 0, k: 0, error: 0, distribution: [] });
    }
    
    // Usar o controller real do ESP32 para calcular u(t)
    const data = {
        baseDose: baseDose,
        flowRate: flowRate,
        volume: volume,
        totalMlPorLitro: totalMlPorLitro,
        ecSetpoint: ecSetpoint
    };
    
    // Atualizar indicador de status para loading
    const indicator = document.getElementById('controller-indicator');
    if (indicator) {
        indicator.textContent = '🔄 Calculando com Controller ESP32...';
        indicator.className = 'controller-status-text loading';
    }
    
    // Fazer requisição para o controller real
    return fetch('/ec-calculate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Falha ao calcular u(t) no controller');
        }
        return response.json();
    })
    .then(controllerResult => {
        // Atualizar indicador de status
        const indicator = document.getElementById('controller-indicator');
        if (indicator) {
        indicator.textContent = '✅ Controller ESP32 Conectado';
        indicator.className = 'controller-status-text connected';
        }
        
        // Usar os resultados do controller real
        const volumeML = controllerResult.utResult;  // u(t) é VOLUME em ml (resultado da equação)
        const dosageTimeConverted = controllerResult.dosageTime; // Tempo: volume × flowRate_s/ml
        const error = controllerResult.error;
        const k = controllerResult.k;
        const ecAtual = controllerResult.ecAtual;
        
        // Calcular tempo real baseado no volume: tempo = volume × flowRate_s/ml
        const tempoSegundos = volumeML * flowRate;  // ml × s/ml = segundos
        
        // ===== NOVA EQUAÇÃO DE ACCURACY =====
        // EC(∞) = EC(0) + (k × q/v) × Kp × e  → equação proporcional
        const A = ((k * flowRate) / (volume * 1000)) * error;  // CORRIGIDO: Dinâmica!
        const Kp = 1.0; // Ganho proporcional
        const ecFinalPrevisto = ecAtual + A  * Kp * error;  // CORRIGIDO: Sem duplicação
        
        // Atualizar estado global com EC atual
        globalState.control.currentECValue = ecAtual;
        
        // Atualizar parâmetros na interface
        document.getElementById('eq-volume').textContent = `${volume} L`;
        document.getElementById('eq-k-value').textContent = k.toFixed(3);
        document.getElementById('eq-flow-rate').textContent = `${flowRate} ml/s`;
        document.getElementById('eq-error').textContent = `${error.toFixed(0)} µS/cm`;
        
        // MANTER INTERFACE VISUAL: u(t) mostrado como "segundos" mas internamente é volume
        const resultElement = document.getElementById('eq-result');
        const timeElement = document.getElementById('eq-time');
        const ecGainElement = document.getElementById('eq-ec-gain');
        
        // INTERFACE VISUAL MANTIDA: mostra tempo calculado
        if (resultElement) resultElement.textContent = `${tempoSegundos.toFixed(1)}`;  // Tempo calculado
        if (timeElement) timeElement.textContent = `${flowRate.toFixed(3)} s/ml`;  // FlowRate correto
        
        // Calcular ganho físico real do sistema: (k * volume_ml) / volume_total
        let physicalGain = 0;
        if (volume > 0 && k > 0) {
            physicalGain = (k * volumeML) / volume;
        }
        
        // ===== CORRETO: MOSTRAR GANHO FÍSICO EM µS/cm =====
        if (ecGainElement) {
            ecGainElement.textContent = `${physicalGain.toFixed(1)}`;  // CORRETO: Ganho físico em µS/cm
            
            // Destacar se o ganho físico for significativo (mais que 10 µS/cm)
            if (physicalGain > 10) {
                ecGainElement.classList.add('highlight');
            } else {
                ecGainElement.classList.remove('highlight');
            }
        }
        
        // Destacar resultado se for significativo
        if (tempoSegundos > 0.1) {
            if (resultElement) resultElement.classList.add('highlight');
            if (timeElement) timeElement.classList.add('highlight');
        } else {
            if (resultElement) resultElement.classList.remove('highlight');
            if (timeElement) timeElement.classList.remove('highlight');
        }
        
        // Calcular distribuição proporcional usando o VOLUME calculado
        const distribution = calculateProportionalDistribution(volumeML);
        
        // Log para debug com distribuição detalhada - CORRIGIDO
        console.log(`\n=== EQUAÇÃO EC CONTROLLER REAL (CORRIGIDO) ===`);
        console.log(`u(t) volume calculado: ${volumeML.toFixed(3)} ml`);
        console.log(`Tempo equivalente: ${tempoSegundos.toFixed(3)} segundos`);
        console.log(`k: ${k.toFixed(3)} (${baseDose}/${totalMlPorLitro})`);
        console.log(`EC Atual: ${ecAtual.toFixed(1)} µS/cm`);
        console.log(`EC Setpoint: ${ecSetpoint} µS/cm`);
        console.log(`Erro: ${error.toFixed(1)} µS/cm`);
        console.log(`FlowRate: ${flowRate.toFixed(3)} s/ml`);
        console.log(`\n=== EQUAÇÃO DE ACCURACY ===`);
        console.log(`EC(∞) = EC(0) + (k × q/v) × Kp × e`);
        console.log(`EC(∞) = ${ecAtual.toFixed(1)} + (${k.toFixed(3)} × ${flowRate}/${volume}) × 1.0 × ${error.toFixed(1)}`);
        console.log(`Incremento Δ = ${A.toFixed(2)} µS/cm`);
        console.log(`EC(∞) previsto = ${ecAtual.toFixed(1)} + ${A.toFixed(2)} = ${ecFinalPrevisto.toFixed(1)} µS/cm`);
        console.log(`Ganho físico: ${physicalGain.toFixed(1)} µS/cm`);
        console.log(`\n=== DISTRIBUIÇÃO PROPORCIONAL (ESTADO GLOBAL) ===`);
        
        // ===== ATUALIZAR INTERFACE DE ACCURACY =====
        updateAccuracySection(A, ecAtual, ecFinalPrevisto);
        
        distribution.forEach(item => {
            console.log(`${item.nutriente}: ${item.mlPorLitro} ml/L (${(item.proporcao * 100).toFixed(1)}%) → dosagem=${item.utNutriente.toFixed(3)} ml → tempo=${item.tempoDosagem.toFixed(2)}s`);
        });
        
        // ===== ENVIAR PROPORÇÕES PARA ESP32 =====
        sendNutrientProportionsToESP32(distribution);
        
        // Salvar resultado para uso em outras funções - CORRIGIDO
        window.lastControllerResult = { 
            result: volumeML,        // Volume em ML para distribuição proporcional
            utSegundos: tempoSegundos,  // u(t) em segundos (tempo de atuação)
            dosageTime: dosageTimeConverted,  // Conversão s/ml
            A: A,                    // Equação de accuracy
            ecFinalPrevisto: ecFinalPrevisto, // EC final previsto
            k, error, distribution, ecAtual 
        };
        
        return { 
            result: volumeML,        // Volume em ML para distribuição
            utSegundos: tempoSegundos,  // u(t) em segundos
            dosageTime: dosageTimeConverted,  // Conversão
            A: A,                    // Accuracy
            ecFinalPrevisto: ecFinalPrevisto, // EC final
            k, error, distribution 
        };
    })
    .catch(error => {
        console.error('❌ Erro ao calcular u(t) no controller:', error);
        
        // Atualizar indicador de status para erro
        const indicator = document.getElementById('controller-indicator');
        if (indicator) {
        indicator.textContent = '❌ Controller ESP32 Desconectado - Usando Cálculo Local';
        indicator.className = 'controller-status-text disconnected';
        }
        
        // Fallback: calcular localmente se o controller falhar
        const k = totalMlPorLitro > 0 ? baseDose / totalMlPorLitro : 0;
        const currentECValue = globalState.control.currentECValue || 0;
        const errorLocal = ecSetpoint - currentECValue;
        
        let volumeMLLocal = 0;    // u(t) é VOLUME em ml (resultado da equação)
        let tempoSegundosLocal = 0;  // Tempo calculado a partir do volume
        
        if (k > 0 && flowRate > 0) {
            // Equação correta: u(t) = (V / k × q) × e = VOLUME em ml
            volumeMLLocal = (volume / (k * flowRate)) * errorLocal;
            
            // Aplicar limitações (como no Controller.cpp)
            if (volumeMLLocal < 0) volumeMLLocal = 0;
            // REMOVIDO: if (volumeMLLocal > 10.0) volumeMLLocal = 10.0;
            
            // Calcular tempo: tempo = volume × flowRate_s/ml
            tempoSegundosLocal = volumeMLLocal * flowRate;
        }
        
        // ===== EQUAÇÃO DE ACCURACY LOCAL (DINÂMICA) =====
        const ALocal = (k * flowRate * errorLocal) / (volume * 1000);  // CORRIGIDO: Dinâmica!
        const KpLocal = 1.0;
        const ecFinalPrevistoLocal = currentECValue + ALocal * KpLocal * errorLocal;  // NOVA FÓRMULA: A × Kp × error
        
        // Calcular distribuição proporcional usando volume calculado
        const distribution = calculateProportionalDistribution(volumeMLLocal);
        
        // Atualizar interface com cálculo local - MANTENDO VISUAL
        document.getElementById('eq-volume').textContent = `${volume} L`;
        document.getElementById('eq-k-value').textContent = k.toFixed(3);
        document.getElementById('eq-flow-rate').textContent = `${flowRate} ml/s`;
        document.getElementById('eq-error').textContent = `${errorLocal.toFixed(0)} µS/cm`;
        document.getElementById('eq-result').textContent = `${tempoSegundosLocal.toFixed(3)}`;  // Tempo calculado
        document.getElementById('eq-time').textContent = `${flowRate.toFixed(3)} s/ml`;  // FlowRate correto
        
        // Calcular ganho físico real do sistema também no fallback
        let physicalGainLocal = 0;
        if (volume > 0 && k > 0) {
            physicalGainLocal = (k * volumeMLLocal) / volume;
        }
        
        const ecGainElement = document.getElementById('eq-ec-gain');
        if (ecGainElement) {
            ecGainElement.textContent = `${physicalGainLocal.toFixed(1)}`;  // CORRETO: Ganho físico em µS/cm
            
            // Destacar se o ganho físico for significativo (mais que 10 µS/cm)
            if (physicalGainLocal > 10) {
                ecGainElement.classList.add('highlight');
            } else {
                ecGainElement.classList.remove('highlight');
            }
        }
        
        console.log('🔧 CÁLCULO LOCAL (corrigido):');
        console.log(`   u(t) volume: ${volumeMLLocal.toFixed(3)} ml`);
        console.log(`   Tempo equivalente: ${tempoSegundosLocal.toFixed(3)} segundos`);
        console.log(`   k: ${k.toFixed(3)}, erro: ${errorLocal.toFixed(1)} µS/cm`);
        console.log(`   FlowRate: ${flowRate.toFixed(3)} s/ml`);
        console.log(`   === EQUAÇÃO DE ACCURACY LOCAL ===`);
        console.log(`   EC(∞) = EC(0) + (k × q/v) × Kp × e`);
        console.log(`   EC(∞) = ${currentECValue.toFixed(1)} + (${k.toFixed(3)} × ${flowRate}/${volume}) × 1.0 × ${errorLocal.toFixed(1)}`);
        console.log(`   Incremento Δ = ${ALocal.toFixed(2)} µS/cm`);
        console.log(`   EC(∞) previsto = ${currentECValue.toFixed(1)} + ${ALocal.toFixed(2)} = ${ecFinalPrevistoLocal.toFixed(1)} µS/cm`);
        console.log(`   Ganho físico: ${physicalGainLocal.toFixed(1)} µS/cm`);
        
        // ===== ATUALIZAR INTERFACE DE ACCURACY LOCAL =====
        updateAccuracySection(ALocal, currentECValue, ecFinalPrevistoLocal);
        
        return Promise.resolve({ 
            result: volumeMLLocal,      // Volume em ML para distribuição
            utSegundos: tempoSegundosLocal, // u(t) em segundos
            dosageTime: flowRate,   // Conversão s/ml
            A: ALocal,                  // Accuracy
            ecFinalPrevisto: ecFinalPrevistoLocal, // EC final
            k, 
            error: errorLocal, 
            distribution 
        });
    });
}

// Atualizar a função updateECStatus para incluir a equação
function updateECStatus(currentEC) {
    const errorSpan = document.getElementById('ec-error');
    const lastDosageSpan = document.getElementById('last-dosage');
    
    // Sempre calcular e mostrar o erro atual, independente do Auto EC estar ativo
    const setpoint = parseFloat(document.getElementById('ec-setpoint').value) || 0;
    
    if (setpoint > 0) {
        const error = setpoint - currentEC;
        errorSpan.textContent = `${error.toFixed(0)} µS/cm`;
        
        // Código de cores para o erro
        if (Math.abs(error) > 100) {
            errorSpan.className = 'status-value error';
        } else if (Math.abs(error) > 50) {
            errorSpan.className = 'status-value warning';
        } else {
            errorSpan.className = 'status-value';
        }
        
        // Atualizar currentECSetpoint para outras funções
        currentECSetpoint = setpoint;
    } else {
        errorSpan.textContent = '-- µS/cm';
        errorSpan.className = 'status-value';
    }
    
    // Atualizar última dosagem
    if (lastDosage > 0) {
        lastDosageSpan.textContent = `${lastDosage.toFixed(2)} ml`;
    } else {
        lastDosageSpan.textContent = '-- ml';
    }
    
    // Atualizar exibição da equação sempre que há novos dados dos sensores
    updateEquationDisplay();
}

// Função para carregar status do controle EC
function loadECStatus() {
    fetch('/ec-status')
        .then(response => response.json())
        .then(data => {
            document.getElementById('base-dose').value = data.baseDose;
            document.getElementById('flow-rate').value = data.flowRate;
            document.getElementById('volume-reservoir').value = data.volume;
            // document.getElementById('total-ml').value = data.totalMl; // Agora calculado automaticamente
            document.getElementById('ec-setpoint').value = data.setpoint;
            
            ecControlEnabled = data.autoEnabled;
            currentECSetpoint = data.setpoint;
            
            updateECControlUI();
            
            // Recalcular o plano nutricional com os novos valores
            calcularQuantidadeETempo();
            
            // Atualizar exibição da equação
            updateEquationDisplay();
        })
        .catch(error => {
            console.error('Erro ao carregar status EC:', error);
        });
}

// Função para carregar parâmetros salvos
function loadSavedECParameters() {
    // Tentar carregar do localStorage primeiro
    const localSaved = localStorage.getItem('hydroponicECParameters');
    if (localSaved) {
        try {
            const params = JSON.parse(localSaved);
            
            // Aplicar aos campos
            document.getElementById('base-dose').value = params.baseDose || 1525;
            document.getElementById('flow-rate').value = params.flowRate || 0.974;
            document.getElementById('volume-reservoir').value = params.volume || 100;
            document.getElementById('ec-setpoint').value = params.setpoint || 1200;
            
            savedECParameters = params;
            
            console.log('✅ Parâmetros EC carregados do localStorage');
        } catch (e) {
            console.log('❌ Erro ao carregar parâmetros do localStorage:', e);
        }
    }
    
    // Tentar carregar do servidor
    fetch('/ec-config')
        .then(response => response.json())
        .then(data => {
            if (data.baseDose !== undefined) {
                document.getElementById('base-dose').value = data.baseDose;
            }
            if (data.flowRate !== undefined) {
                document.getElementById('flow-rate').value = data.flowRate;
            }
            if (data.volume !== undefined) {
                document.getElementById('volume-reservoir').value = data.volume;
            }
            if (data.totalMl !== undefined) {
                // Nota: totalMl do servidor não substitui o calculado
                // Apenas para histórico
            }
            
            console.log('✅ Parâmetros EC carregados do servidor');
            
            // Recalcular tudo
            calcularQuantidadeETempo();
            updateEquationDisplay();
        })
        .catch(error => {
            console.log('⚠️ Não foi possível carregar parâmetros do servidor:', error);
        });
}

// Função para implementar dosagem automática proporcional
function executarDosagemProporcional(totalUt) {
    console.log('🚀 Executando dosagem proporcional com ALTA PRECISÃO...');
    
    const distribution = calculateProportionalDistribution(totalUt);
    const intervalo = globalState.control.intervaloBetweenNutrients;
    
    if (distribution.length === 0) {
        alert('❌ Nenhum nutriente configurado para dosagem!');
        return;
    }
    
    console.log('\n=== ENVIANDO PARA ESP32 (ALTA PRECISÃO) ===');
    console.log(`📊 Total u(t): ${totalUt.toFixed(3)} ml`);
    console.log(`⏱️  Intervalo: ${intervalo} segundos`);
    console.log(`🧪 Nutrientes: ${distribution.length}`);
    
    distribution.forEach(item => {
        console.log(`   • ${item.nutriente}: ${item.utNutriente.toFixed(3)}ml → ${item.tempoDosagem.toFixed(3)}s → Relé ${item.relay}`);
    });
    
    const data = {
        totalUt: parseFloat(totalUt.toFixed(3)), // PRECISÃO 3 DECIMAIS
        distribution: distribution,
        intervalo: intervalo
    };
    
    communicationMonitor.addLog('data', `Iniciando dosagem: ${totalUt.toFixed(3)}ml distribuída em ${distribution.length} nutrientes`);
    
    fetch('/dosagem-proporcional', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Falha na comunicação com ESP32');
        }
        console.log('✅ Dosagem proporcional enviada com sucesso para ESP32');
        communicationMonitor.addLog('success', `Dosagem enviada: ${distribution.length} nutrientes com precisão de 3 decimais`);
        
        alert(`🚀 DOSAGEM PROPORCIONAL INICIADA!

📊 DISTRIBUIÇÃO DE ALTA PRECISÃO:
${distribution.map(item => 
    `• ${item.nutriente}: ${item.utNutriente.toFixed(3)}ml (${item.tempoDosagem.toFixed(3)}s)`
).join('\n')}

⏱️  Intervalo entre doses: ${intervalo}s
🎯 Total u(t): ${totalUt.toFixed(3)}ml

✅ Sistema sequencial ativo no ESP32!`);
        
        // Atualizar interface
        communicationMonitor.updateECInfo(totalUt, `${distribution.length} nutrientes`, distribution.map(d => d.relay).join(','));
        
    })
    .catch(error => {
        console.error('❌ Erro na dosagem proporcional:', error);
        communicationMonitor.addLog('error', `Falha na dosagem: ${error.message}`);
        alert(`❌ ERRO NA DOSAGEM PROPORCIONAL

Falha na comunicação com ESP32:
${error.message}

Verifique a conexão e tente novamente.`);
    });
}

// Função para salvar parâmetros do controlador EC usando estado global
function saveECParametersFromGlobalState() {
    console.log('💾 Salvando parâmetros EC do estado global...');
    communicationMonitor.addLog('info', 'Iniciando salvamento de parâmetros EC');
    
    const { system } = globalState;
    const { baseDose, flowRate, volume, totalMlPorLitro, ecSetpoint } = system;
    
    console.log('📊 Parâmetros do estado global:');
    console.log(`   • Base dose: ${baseDose} µS/cm`);
    console.log(`   • Flow rate: ${flowRate} ml/s`);
    console.log(`   • Volume: ${volume} L`);
    console.log(`   • Total ml/L: ${totalMlPorLitro} ml/L`);
    console.log(`   • Setpoint: ${ecSetpoint} µS/cm`);
    
    if (isNaN(baseDose) || isNaN(flowRate) || isNaN(volume) || isNaN(totalMlPorLitro) || isNaN(ecSetpoint)) {
        const errorMsg = `❌ ERRO: Parâmetros inválidos no estado global!

Por favor, verifique os seguintes campos:
• Base dose: ${isNaN(baseDose) ? '❌ INVÁLIDO' : '✅ ' + baseDose + ' µS/cm'}
• Taxa de vazão: ${isNaN(flowRate) ? '❌ INVÁLIDO' : '✅ ' + flowRate + ' ml/s'}
• Volume: ${isNaN(volume) ? '❌ INVÁLIDO' : '✅ ' + volume + ' L'}
• Soma ml/L: ${isNaN(totalMlPorLitro) ? '❌ INVÁLIDO' : '✅ ' + totalMlPorLitro + ' ml/L'}
• Setpoint: ${isNaN(setpoint) ? '❌ INVÁLIDO' : '✅ ' + ecSetpoint + ' µS/cm'}

⚠️ O campo "Soma ml por Litro" é calculado automaticamente.
Se estiver zerado, verifique se os valores ml/L na tabela nutricional estão preenchidos.`;
        
        alert(errorMsg);
        console.error('❌ Validação falhou:', system);
        communicationMonitor.addLog('error', 'Salvamento cancelado: parâmetros inválidos');
            return;
        }
        
    // Salvar no objeto de parâmetros salvos (compatibilidade)
    savedECParameters = {
        baseDose: baseDose,
        flowRate: flowRate,
        volume: volume,
        totalMlPorLitro: totalMlPorLitro,
        setpoint: ecSetpoint,
        timestamp: new Date().toLocaleString('pt-BR')
    };
    
    // Salvar no localStorage também
    localStorage.setItem('hydroponicECParameters', JSON.stringify(savedECParameters));
    console.log('💾 Parâmetros salvos no localStorage');
    communicationMonitor.addLog('success', 'Parâmetros salvos localmente');
    
    const data = {
        baseDose: parseFloat(baseDose.toFixed(6)),        // 6 decimais para maior precisão
        flowRate: parseFloat(flowRate.toFixed(6)),        // 6 decimais para flowRate preciso
        volume: parseFloat(volume.toFixed(3)),            // 3 decimais para volume
        totalMl: parseFloat(totalMlPorLitro.toFixed(6)),  // 6 decimais para cálculo k preciso
        intervaloAutoEC: globalState.control.intervaloAutoEC // Novo campo
    };
    
    console.log('📡 Enviando dados ALTA PRECISÃO para o ESP32...');
    console.log(`   • baseDose: ${data.baseDose} µS/cm (6 decimais)`);
    console.log(`   • flowRate: ${data.flowRate} ml/s (6 decimais)`);  
    console.log(`   • volume: ${data.volume} L (3 decimais)`);
    console.log(`   • totalMl: ${data.totalMl} ml/L (6 decimais)`);
    console.log(`   • k calculado: ${(data.baseDose / data.totalMl).toFixed(6)}`);
    communicationMonitor.addLog('data', `Enviando ALTA PRECISÃO: k=${(data.baseDose/data.totalMl).toFixed(3)}, Flow=${data.flowRate}ml/s`);
    
    fetch('/ec-config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
        body: JSON.stringify(data)
        })
        .then(response => {
        if (!response.ok) {
            throw new Error('Falha ao salvar parâmetros no ESP32');
        }
        console.log('✅ Parâmetros enviados com sucesso para o ESP32');
        communicationMonitor.addLog('success', 'Parâmetros salvos no ESP32 com sucesso');
        
        // Calcular k para mostrar no alert
        const k = totalMlPorLitro > 0 ? baseDose / totalMlPorLitro : 0;
        
        console.log('🧮 Calculando resultado com controller...');
        
        // Calcular u(t) atual usando o controller real
        updateEquationDisplay().then(() => {
            const controllerResult = window.lastControllerResult;
            
            let alertMessage = `✅ PARÂMETROS EC SALVOS COM SUCESSO!

🔧 CONFIGURAÇÃO SALVA (ESTADO GLOBAL SINCRONIZADO):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 📊 Base de dose: ${baseDose} µS/cm
• 💧 Taxa de vazão: ${flowRate} ml/s  
• 🪣 Volume reservatório: ${volume} L
• 🧪 Soma ml por Litro: ${totalMlPorLitro.toFixed(1)} ml/L
• 🎯 EC Setpoint: ${ecSetpoint} µS/cm
• ⏱️  Intervalo Auto EC: ${globalState.control.intervaloAutoEC}s (anti-precipitação)
• ⚡ Fator k calculado: ${k.toFixed(3)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

            if (controllerResult && controllerResult.result !== undefined) {
                // CORREÇÃO: Usar nomenclatura correta
                const volumeML = controllerResult.result; // Volume em ml (resultado da equação)
                const utSegundos = controllerResult.dosageTime; // u(t) tempo em segundos
                
                alertMessage += `

🎯 RESULTADO DO CONTROLLER ESP32:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📐 Equação: u(t) = (V / k × q) × e
📊 Cálculo: u(t) = (${volume} / ${k.toFixed(3)} × ${flowRate}) × ${controllerResult.error.toFixed(1)}

📊 Volume dosagem: ${volumeML.toFixed(3)} ml (quantidade a dosar)
⏱️  u(t) tempo: ${utSegundos.toFixed(2)} segundos (tempo de atuação)

📈 Status Atual:
• EC Atual: ${controllerResult.ecAtual.toFixed(1)} µS/cm
• EC Setpoint: ${ecSetpoint} µS/cm
• Erro: ${controllerResult.error.toFixed(1)} µS/cm
• Ganho físico: ${((k * volumeML) / volume).toFixed(1)} µS/cm
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
                
                communicationMonitor.addLog('data', `Controller ESP32: volume=${volumeML.toFixed(3)}ml, u(t)=${utSegundos.toFixed(2)}s, erro=${controllerResult.error.toFixed(1)}µS/cm`);
            } else {
                alertMessage += `

⚠️ CONTROLLER ESP32 OFFLINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📐 Equação: u(t) = (V / k × q) × e
📊 Cálculo: u(t) = (${volume} / ${k.toFixed(3)} × ${flowRate}) × erro
🔌 Status: Conecte o ESP32 para cálculo preciso!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
                
                communicationMonitor.addLog('error', 'Controller ESP32 não respondeu para cálculo u(t)');
            }

            alertMessage += `

🕐 TIMESTAMP: ${savedECParameters.timestamp}

🚀 SISTEMA INTEGRADO PRONTO!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Estado global sincronizado
✅ Distribuição proporcional ativa
✅ Todos os parâmetros validados
✅ Sistema sincronizado com ESP32
✅ Plano nutricional integrado com controle EC

📋 PLANO NUTRICIONAL ATUAL (ESTADO GLOBAL):`;

            // Adicionar informações do plano nutricional do estado global
            Object.keys(globalState.nutrition).forEach(nutrient => {
                const nutritionData = globalState.nutrition[nutrient];
                const quantidade = (nutritionData.mlPorLitro * volume).toFixed(1);
                alertMessage += `\n• ${nutrient}: ${nutritionData.mlPorLitro}ml/L → ${quantidade}ml (Relé ${nutritionData.relay})`;
            });
            
            alert(alertMessage.trim());
            console.log('✅ Mensagem de confirmação exibida');
            communicationMonitor.addLog('success', 'Configuração salva e confirmada pelo usuário');
        });
        
        // Feedback visual no botão
        const btn = document.getElementById('save-ec-params');
        if (btn) {
            const originalText = btn.textContent;
            btn.textContent = '✅ Salvo!';
            btn.style.backgroundColor = '#4CAF50';
            
                setTimeout(() => {
                btn.textContent = originalText;
                btn.style.backgroundColor = '';
            }, 2000);
        }
    })
    .catch(error => {
        console.error('❌ Erro ao salvar parâmetros:', error);
        communicationMonitor.addLog('error', `Falha ao salvar no ESP32: ${error.message}`);
        alert(`❌ ERRO AO SALVAR PARÂMETROS

Falha na comunicação com o ESP32:
${error.message}

Os parâmetros foram salvos localmente no estado global, mas não foram enviados para o controlador.
Verifique a conexão com o ESP32 e tente novamente.`);
    });
}

// Função centralizada para lidar com mudanças nos inputs
function handleInputChange(event) {
    const element = event.target;
    const value = parseFloat(element.value) || 0;
    const fieldId = element.id;
    const isNutritionInput = element.classList.contains('ml-por-litro');
    
    console.log(`📝 Input alterado: ${fieldId || element.className} = ${value}`);
    
    // Atualizar estado global baseado no tipo de campo
    if (fieldId === 'volume-reservoir') {
        updateState('system', 'volume', value);
    } else if (fieldId === 'flow-rate') {
        updateState('system', 'flowRate', value);
    } else if (fieldId === 'base-dose') {
        updateState('system', 'baseDose', value);
    } else if (fieldId === 'ec-setpoint') {
        updateState('system', 'ecSetpoint', value);
        // Atualizar erro imediatamente para setpoint
        const currentECElement = document.getElementById('ec-value');
        const currentEC = currentECElement ? parseFloat(currentECElement.textContent) || 0 : 0;
        updateECStatus(currentEC);
    } else if (fieldId === 'intervalo-dosagem') {
        updateState('control', 'intervaloBetweenNutrients', parseInt(value));
    } else if (fieldId === 'intervalo-auto-ec') {
        updateState('control', 'intervaloAutoEC', parseInt(value));
    } else if (isNutritionInput) {
        // Para inputs ml-por-litro, encontrar o nutriente
        const row = element.closest('tr[data-nutrient]');
        if (row) {
            const nutrient = row.getAttribute('data-nutrient');
            if (globalState.nutrition[nutrient]) {
                // Atualizar estado do nutriente específico
                const oldValue = globalState.nutrition[nutrient].mlPorLitro;
                globalState.nutrition[nutrient].mlPorLitro = value;
                
                console.log(`🧪 Nutriente ${nutrient}: ${oldValue} → ${value} ml/L`);
                
                // Recalcular plano nutricional
                calculateNutritionPlan();
                
                // Atualizar equação
                updateEquationDisplay();
            }
        }
    }
}

// Função para configurar listeners inteligentes baseados no estado global
function setupGlobalStateListeners() {
    console.log('🔧 Configurando listeners baseados no estado global...');
    
    // Lista de todos os campos que devem ser monitorados
    const fieldsToMonitor = [
        'volume-reservoir',
        'flow-rate', 
        'base-dose',
        'ec-setpoint',
        'intervalo-dosagem',
        'intervalo-auto-ec'
    ];
    
    // Configurar listeners para campos da seção EC
    fieldsToMonitor.forEach(fieldId => {
        const element = document.getElementById(fieldId);
        if (element) {
            // Remover listeners antigos
            element.removeEventListener('input', handleInputChange);
            element.removeEventListener('change', handleInputChange);
            
            // Adicionar novos listeners
            element.addEventListener('input', handleInputChange);
            element.addEventListener('change', handleInputChange);
            
            console.log(`✅ Listener configurado para: ${fieldId}`);
            } else {
            console.warn(`⚠️ Campo não encontrado: ${fieldId}`);
        }
    });
    
    // Configurar listeners para inputs ml-por-litro da tabela nutricional
    document.querySelectorAll('.ml-por-litro').forEach((input, index) => {
        // Remover listeners antigos
        input.removeEventListener('input', handleInputChange);
        input.removeEventListener('change', handleInputChange);
        
        // Adicionar novos listeners
        input.addEventListener('input', handleInputChange);
        input.addEventListener('change', handleInputChange);
        
        const row = input.closest('tr[data-nutrient]');
        const nutrient = row ? row.getAttribute('data-nutrient') : `input-${index}`;
        console.log(`✅ Listener nutricional configurado para: ${nutrient}`);
    });
    
    console.log('🎯 Todos os listeners de estado global configurados!');
}

// Função para buscar estados dos relés
function fetchRelayStates() {
    console.log('📡 Buscando estados dos relés e criando toggles...');
    
    // Criar toggles dos relés se não existirem
    createRelayToggles();
    
    // Buscar estados atuais dos relés
    fetch('/sensors')
        .then(response => response.json())
        .then(data => {
            if (data.relayStates && Array.isArray(data.relayStates)) {
                console.log('✅ Estados dos relés recebidos:', data.relayStates);
                updateRelayToggles(data.relayStates);
            }
        })
        .catch(error => {
            console.error('❌ Erro ao buscar estados dos relés:', error);
        });
}

// ===== FUNÇÃO PARA CRIAR TOGGLES DOS RELÉS =====
function createRelayToggles() {
    const buttonsContainer = document.getElementById('buttons');
    if (!buttonsContainer) {
        console.error('❌ Container de botões não encontrado');
        return;
    }
    
    // Limpar container se já tiver conteúdo
    buttonsContainer.innerHTML = '';
    
    console.log('🔧 Criando toggles dos relés...');
    
    // Criar 8 toggles para os relés
    for (let i = 0; i < 8; i++) {
        const relayNumber = i + 1;
        
        // Container do relé
        const relayContainer = document.createElement('div');
        relayContainer.className = 'relay-control';
        relayContainer.id = `relay-${relayNumber}-container`;
        
        // Label do relé
        const label = document.createElement('label');
        label.className = 'relay-label';
        label.textContent = `Relé ${relayNumber}`;
        
        // Toggle switch
        const toggleContainer = document.createElement('div');
        toggleContainer.className = 'toggle-container';
        
        const toggleSwitch = document.createElement('div');
        toggleSwitch.className = 'toggle-switch';
        toggleSwitch.id = `relay-${relayNumber}-toggle`;
        toggleSwitch.setAttribute('data-relay', relayNumber);
        
        const toggleSlider = document.createElement('div');
        toggleSlider.className = 'toggle-slider';
        
        const toggleButton = document.createElement('div');
        toggleButton.className = 'toggle-button';
        
        // Status text
        const statusText = document.createElement('span');
        statusText.className = 'relay-status';
        statusText.id = `relay-${relayNumber}-status`;
        statusText.textContent = 'OFF';
        
        // Montar estrutura
        toggleSlider.appendChild(toggleButton);
        toggleSwitch.appendChild(toggleSlider);
        toggleContainer.appendChild(toggleSwitch);
        
        relayContainer.appendChild(label);
        relayContainer.appendChild(toggleContainer);
        relayContainer.appendChild(statusText);
        
        // Event listener para o toggle
        toggleSwitch.addEventListener('click', () => {
            const currentState = toggleSwitch.classList.contains('active');
            toggleRelay(i, 0); // Toggle simples
            console.log(`🔄 Toggle relé ${relayNumber}: ${currentState ? 'OFF' : 'ON'}`);
        });
        
        buttonsContainer.appendChild(relayContainer);
    }
    
    console.log('✅ Toggles dos relés criados com sucesso!');
}

// ===== FUNÇÃO PARA ATUALIZAR ESTADOS DOS TOGGLES =====
function updateRelayToggles(relayStates) {
    for (let i = 0; i < 8; i++) {
        const relayNumber = i + 1;
        const toggleSwitch = document.getElementById(`relay-${relayNumber}-toggle`);
        const statusText = document.getElementById(`relay-${relayNumber}-status`);
        
        if (toggleSwitch && statusText) {
            const isActive = relayStates[i];
            
            if (isActive) {
                toggleSwitch.classList.add('active');
                statusText.textContent = 'ON';
                statusText.className = 'relay-status active';
            } else {
                toggleSwitch.classList.remove('active');
                statusText.textContent = 'OFF';
                statusText.className = 'relay-status';
            }
        }
    }
}

// ===== FUNÇÃO PARA CANCELAR AUTO EC =====
async function handleCancelAutoEC() {
    try {
        console.log('🛑 Cancelando Auto EC...');
        
        // Mostrar confirmação
        if (!confirm('⚠️ Tem certeza que deseja CANCELAR o Auto EC?\n\nIsso irá:\n• Parar a dosagem em andamento\n• Desativar o controle automático\n• Desligar todos os relés')) {
            return;
        }
        
        const response = await fetch('/cancel-auto-ec', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'cancel',
                timestamp: Date.now()
            })
        });
        
        if (response.ok) {
            console.log('✅ Auto EC cancelado com sucesso');
            
            // Atualizar interface - desativar Auto EC
            updateState('control', 'autoECEnabled', false);
            
            // Atualizar UI
            updateECControlUI();
            
            // Mostrar notificação
            showNotification('🛑 Auto EC Cancelado', 'Sistema parado e controle automático desativado', 'warning');
            
        } else {
            console.error('❌ Falha ao cancelar Auto EC:', response.status);
            showNotification('❌ Erro', 'Falha ao cancelar Auto EC', 'error');
        }
    } catch (error) {
        console.error('❌ Erro ao cancelar Auto EC:', error);
        showNotification('❌ Erro de Conexão', 'Não foi possível cancelar o Auto EC', 'error');
    }
}

// ===== 🚨 FUNÇÃO PARA RESET EMERGENCIAL TOTAL =====
async function handleEmergencyReset() {
    try {
        console.log('🚨 INICIANDO RESET EMERGENCIAL...');
        
        // Confirmação dupla para emergência
        if (!confirm('🚨 ATENÇÃO - RESET EMERGENCIAL TOTAL! 🚨\n\n⚠️ Esta ação irá PARAR TUDO IMEDIATAMENTE:\n\n• Todos os 8 relés serão DESLIGADOS\n• Auto EC será DESATIVADO\n• Dosagem em curso será CANCELADA\n• Todos os estados serão RESETADOS\n• Sistema voltará ao estado IDLE\n\n🚨 TEM CERTEZA ABSOLUTA?')) {
            return;
        }
        
        // Segunda confirmação para emergência crítica
        if (!confirm('🚨 CONFIRMAÇÃO FINAL 🚨\n\nEsta é uma EMERGÊNCIA TOTAL que vai PARAR TODO O SISTEMA.\n\nAperte OK apenas se for uma EMERGÊNCIA REAL.\n\n⚠️ CONTINUAR?')) {
            return;
        }
        
        console.log('🚨 Executando RESET EMERGENCIAL TOTAL...');
        
        // Enviar comando de emergência
        const response = await fetch('/emergency-reset', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'emergency-reset-total',
                timestamp: Date.now(),
                source: 'web-interface'
            })
        });
        
        if (response.ok) {
            console.log('✅ RESET EMERGENCIAL executado com sucesso');
            
            // RESETAR INTERFACE COMPLETAMENTE
            // 1. Resetar Auto EC
            updateState('control', 'autoECEnabled', false);
            updateState('control', 'lastDosage', 0);
            updateState('control', 'currentECValue', 0);
            
            // 2. Resetar todos os parâmetros
            updateState('system', 'ecSetpoint', 0);
            
            // 3. Atualizar todas as interfaces
            updateECControlUI();
            
            // 4. Mostrar notificação de emergência
            alert('🚨 RESET EMERGENCIAL EXECUTADO! 🚨\n\n✅ SISTEMA TOTALMENTE PARADO:\n\n• Todos os relés: DESLIGADOS\n• Auto EC: DESATIVADO\n• Dosagem: CANCELADA\n• Estados: RESETADOS\n• Status: IDLE SEGURO\n\n🟢 Sistema pronto para nova configuração');
            
            // 5. Log no monitor de comunicação
            communicationMonitor.addLog('emergency', '🚨 RESET EMERGENCIAL TOTAL executado com sucesso');
            
        } else {
            const errorText = await response.text();
            console.error('❌ Falha no RESET EMERGENCIAL:', response.status, errorText);
            alert('❌ FALHA NO RESET EMERGENCIAL!\n\nErro: ' + response.status + '\n\nTente novamente ou use o botão físico de emergência.');
        }
        
    } catch (error) {
        console.error('❌ Erro crítico no RESET EMERGENCIAL:', error);
        alert('❌ ERRO CRÍTICO!\n\nNão foi possível executar o RESET EMERGENCIAL.\n\nUSE O BOTÃO FÍSICO DE EMERGÊNCIA ou reinicie o ESP32 manualmente!');
        
        // Log crítico
        communicationMonitor.addLog('error', '🚨 FALHA CRÍTICA no Reset Emergencial: ' + error.message);
    }
}

// Função para mostrar notificações (se não existir)
function showNotification(title, message, type = 'info') {
    // Implementação simples com alert por enquanto
    alert(`${title}\n\n${message}`);
}

async function handleToggleAutoEC() {
    const button = document.getElementById('toggle-auto-ec');
    const statusSpan = document.getElementById('auto-ec-status');
    const currentEnabled = globalState.control.autoECEnabled;
    
    if (!button || !statusSpan) {
        console.error('❌ Elementos do Auto EC não encontrados');
        communicationMonitor.addLog('error', 'Elementos UI do Auto EC não encontrados');
        return;
    }
    
    if (!currentEnabled) {
        // ===== VALIDAÇÃO ANTES DE ATIVAR AUTO EC =====
        const validationResult = validateECParameters();
        if (!validationResult.valid) {
            showParameterValidationAlert(validationResult.errors);
            return; // Não ativar se houver erros
        }
        
        // ===== MOSTRAR CONFIRMAÇÃO DETALHADA =====
        const confirmationResult = await showAutoECConfirmation();
        if (!confirmationResult) {
            return; // Usuário cancelou
        }
    }
    
    // Alternar estado
    const newState = !currentEnabled;
    updateState('control', 'autoECEnabled', newState);
    
    // Preparar dados para envio
    const data = {
        setpoint: globalState.system.ecSetpoint,
        autoEnabled: newState
    };
    
    console.log(`🎛️ Alterando Auto EC para: ${newState ? 'ATIVO' : 'INATIVO'}`);
    communicationMonitor.addLog('info', `Alterando Auto EC para: ${newState ? 'ATIVO' : 'INATIVO'}`);
    
    // Enviar para ESP32
    fetch('/ec-control', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Falha ao alterar controle Auto EC');
        }
        
        // Atualizar interface
        updateECControlUI();
        
        console.log(`✅ Auto EC ${newState ? 'ativado' : 'desativado'} com sucesso`);
        communicationMonitor.addLog('success', `Auto EC ${newState ? 'ativado' : 'desativado'} no ESP32`);
        
        // Log adicional com setpoint
        communicationMonitor.addLog('data', `Setpoint configurado: ${globalState.system.ecSetpoint}µS/cm`);
    })
    .catch(error => {
        console.error('❌ Erro ao alterar Auto EC:', error);
        communicationMonitor.addLog('error', `Falha ao alterar Auto EC: ${error.message}`);
        alert(`Erro ao alterar controle automático: ${error.message}`);
        
        // Reverter estado em caso de erro
        updateState('control', 'autoECEnabled', !newState);
    });
}

// ===== NOVAS FUNÇÕES DOS BOTÕES LIMPAR VALORES =====

// Função para limpar todos os valores da seção Controle Automático de EC
function handleClearECValues() {
    console.log('🗑️ Limpando valores do Controle Automático de EC...');
    
    if (confirm('🗑️ LIMPAR VALORES - CONTROLE AUTOMÁTICO DE EC\n\n⚠️ Esta ação irá:\n• Limpar todos os campos da seção EC\n• Resetar o estado global do sistema\n• Desativar o controle automático\n\n⚠️ Deseja continuar?')) {
        
        // Limpar campos da interface
        const ecFields = [
            'base-dose',
            'flow-rate', 
            'volume-reservoir',
            'total-ml',
            'ec-setpoint',
            'intervalo-auto-ec'
        ];
        
        ecFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.value = '';
                console.log(`✅ Campo limpo: ${fieldId}`);
            }
        });
        
        // Resetar estado global - seção system
        updateState('system', 'volume', 0);
        updateState('system', 'flowRate', 0);
        updateState('system', 'baseDose', 0);
        updateState('system', 'ecSetpoint', 0);
        updateState('system', 'totalMlPorLitro', 0);
        
        // Resetar estado global - seção control
        updateState('control', 'autoECEnabled', false);
        updateState('control', 'intervaloAutoEC', 0);
        updateState('control', 'lastDosage', 0);
        updateState('control', 'currentECValue', 0);
        
        // Resetar parâmetros salvos
        savedECParameters = {
            baseDose: 0,
            flowRate: 0,
            volume: 0,
            totalMlPorLitro: 0,
            setpoint: 0,
            timestamp: null
        };
        
        // Limpar localStorage
        localStorage.removeItem('hydroponicECParameters');
        
        // Atualizar interface Auto EC
        updateECControlUI();
        
        // Limpar exibição da equação
        document.getElementById('eq-volume').textContent = '0 L';
        document.getElementById('eq-k-value').textContent = '0.000';
        document.getElementById('eq-flow-rate').textContent = '0 ml/s';
        document.getElementById('eq-error').textContent = '-- µS/cm';
        document.getElementById('eq-result').textContent = '-- ml';
        document.getElementById('eq-time').textContent = '-- segundos';
        
        // Atualizar indicador do controller
        const indicator = document.getElementById('controller-indicator');
        if (indicator) {
            indicator.textContent = '🔄 Parâmetros EC vazios - Configure para conectar';
            indicator.className = 'controller-status-text loading';
        }
        
        // Log de monitoramento
        communicationMonitor.addLog('info', '🗑️ Valores do Controle EC limpos com sucesso');
        
        console.log('✅ Valores do Controle Automático de EC limpos com sucesso!');
        alert('✅ VALORES LIMPOS COM SUCESSO!\n\n🧹 Controle Automático de EC:\n• Todos os campos foram limpos\n• Estado global resetado\n• Auto EC desativado\n• Parâmetros salvos removidos\n\n💡 Configure novos valores para reativar o sistema.');
    } else {
        console.log('❌ Limpeza cancelada pelo usuário');
    }
}

// Função para limpar todos os valores do Plano Nutricional
function handleClearNutritionPlan() {
    console.log('🗑️ Limpando valores do Plano Nutricional...');
    
    if (confirm('🗑️ LIMPAR PLANO NUTRICIONAL\n\n⚠️ Esta ação irá:\n• Limpar todos os valores ml/L dos nutrientes\n• Resetar quantidades e tempos calculados\n• Limpar intervalo entre nutrientes\n• Resetar o estado global da nutrição\n\n⚠️ Deseja continuar?')) {
        
        // Limpar todos os inputs ml-por-litro
        const nutritionInputs = document.querySelectorAll('.ml-por-litro');
        nutritionInputs.forEach((input, index) => {
            input.value = '';
            console.log(`✅ Input nutricional ${index + 1} limpo`);
        });
        
        // Limpar campo intervalo entre nutrientes
        const intervalField = document.getElementById('intervalo-dosagem');
        if (intervalField) {
            intervalField.value = '';
            console.log('✅ Campo intervalo dosagem limpo');
        }
        
        // Resetar estado global - seção nutrition
        Object.keys(globalState.nutrition).forEach(nutrient => {
            updateState('nutrition', nutrient, { mlPorLitro: 0, relay: globalState.nutrition[nutrient].relay });
        });
        
        // Resetar estado global - seção control
        updateState('control', 'intervaloBetweenNutrients', 0);
        
        // Atualizar quantidades e tempos calculados na tabela
        const quantidadeCells = document.querySelectorAll('.quantidade');
        const tempoCells = document.querySelectorAll('.tempo');
        
        quantidadeCells.forEach(cell => {
            cell.textContent = '0.0';
        });
        
        tempoCells.forEach(cell => {
            cell.textContent = '0.0';
        });
        
        // Resetar tempo total
        const tempoTotalElement = document.getElementById('tempo-total');
        if (tempoTotalElement) {
            tempoTotalElement.textContent = '0 segundos';
        }
        
        // Recalcular plano nutricional (que agora será zero)
        calculateNutritionPlan();
        
        // Atualizar equação (se os parâmetros EC estiverem configurados)
        updateEquationDisplay();
        
        // Log de monitoramento
        communicationMonitor.addLog('info', '🗑️ Plano nutricional limpo com sucesso');
        
        console.log('✅ Plano Nutricional limpo com sucesso!');
        alert('✅ PLANO NUTRICIONAL LIMPO!\n\n🧹 Plano Nutricional:\n• Todos os valores ml/L zerados\n• Quantidades e tempos resetados\n• Intervalo entre nutrientes limpo\n• Estado global da nutrição resetado\n\n💡 Configure novos valores para definir seu plano nutricional.');
    } else {
        console.log('❌ Limpeza cancelada pelo usuário');
    }
}

// ===== FUNÇÃO DE SIMULAÇÃO DA ACCURACY =====
function simularAccuracy(ecSetpoint, ecAtual, volume, flowRate, baseDose, totalMlPorLitro) {
    console.log('\n🧪 ===== SIMULAÇÃO DE ACCURACY =====');
    console.log(`📊 Parâmetros de entrada:`);
    console.log(`   • EC Setpoint: ${ecSetpoint} µS/cm`);
    console.log(`   • EC Atual: ${ecAtual} µS/cm`);
    console.log(`   • Volume: ${volume} L`);
    console.log(`   • Flow Rate: ${flowRate} ml/s`);
    console.log(`   • Base Dose: ${baseDose} µS/cm`);
    console.log(`   • Total ml/L: ${totalMlPorLitro} ml/L`);
    
    // Calcular parâmetros
    const k = totalMlPorLitro > 0 ? baseDose / totalMlPorLitro : 0;
    const error = ecSetpoint - ecAtual;
    const Kp = 1.0;
    
    console.log(`\n🔧 Cálculos intermediários:`);
    console.log(`   • k = ${baseDose}/${totalMlPorLitro} = ${k.toFixed(3)}`);
    console.log(`   • error = ${ecSetpoint} - ${ecAtual} = ${error.toFixed(1)} µS/cm`);
    console.log(`   • Kp = ${Kp}`);
    
    // Calcular A (incremento de accuracy)
    const A = (k * flowRate * error) / (volume * 1000);
    
    console.log(`\n⚡ Cálculo de A:`);
    console.log(`   • A = (k × flowRate × error) / (volume × 1000)`);
    console.log(`   • A = (${k.toFixed(3)} × ${flowRate} × ${error.toFixed(1)}) / (${volume} × 1000)`);
    console.log(`   • A = ${A.toFixed(6)} µS/cm`);
    
    // NOVA FÓRMULA: EC(∞) = EC(0) + A × Kp × error
    const ecFinalPrevisto = ecAtual + A * Kp * error;
    
    console.log(`\n🎯 NOVA FÓRMULA DE ACCURACY:`);
    console.log(`   • EC(∞) = EC(0) + A × Kp × error`);
    console.log(`   • EC(∞) = ${ecAtual} + ${A.toFixed(6)} × ${Kp} × ${error.toFixed(1)}`);
    console.log(`   • EC(∞) = ${ecAtual} + ${(A * Kp * error).toFixed(2)}`);
    console.log(`   • EC(∞) = ${ecFinalPrevisto.toFixed(1)} µS/cm`);
    
    const incrementoTotal = ecFinalPrevisto - ecAtual;
    console.log(`\n📈 Resultado final:`);
    console.log(`   • Incremento total: ${incrementoTotal.toFixed(2)} µS/cm`);
    console.log(`   • EC inicial: ${ecAtual} µS/cm`);
    console.log(`   • EC final previsto: ${ecFinalPrevisto.toFixed(1)} µS/cm`);
    console.log(`   • Diferença do setpoint: ${Math.abs(ecFinalPrevisto - ecSetpoint).toFixed(1)} µS/cm`);
    
    console.log('🧪 ===== FIM DA SIMULAÇÃO =====\n');
    
    return {
        A: A,
        ecFinalPrevisto: ecFinalPrevisto,
        incrementoTotal: incrementoTotal,
        k: k,
        error: error
    };
}

// ===== FUNÇÃO PARA ATUALIZAR SEÇÃO DE ACCURACY =====
function updateAccuracySection(A, ecAtual, ecFinalPrevisto) {
    const accuracyValueElement = document.getElementById('accuracy-value');
    const ecAtualDisplayElement = document.getElementById('ec-atual-display');
    const accuracyGainElement = document.getElementById('accuracy-gain');
    const ecFinalPrevistoElement = document.getElementById('ec-final-previsto');
    
    // Atualizar valores individuais com verificação robusta
    if (accuracyValueElement) accuracyValueElement.textContent = `${A.toFixed(2)} µS/cm`;
    if (accuracyGainElement) accuracyGainElement.textContent = `${A.toFixed(2)}`;
    if (ecAtualDisplayElement) ecAtualDisplayElement.textContent = `${ecAtual.toFixed(1)}`;
    if (ecFinalPrevistoElement) ecFinalPrevistoElement.textContent = `${ecFinalPrevisto.toFixed(1)} µS/cm`;
    
    // Destacar valores significativos na accuracy
    if (Math.abs(A) > 20) { // Threshold para accuracy significativa
        if (accuracyValueElement) accuracyValueElement.classList.add('highlight');
        if (accuracyGainElement) accuracyGainElement.classList.add('highlight');
    } else {
        if (accuracyValueElement) accuracyValueElement.classList.remove('highlight');
        if (accuracyGainElement) accuracyGainElement.classList.remove('highlight');
    }
    
    // Destacar EC final se diferença for significativa
    const diferencaEC = Math.abs(ecFinalPrevisto - ecAtual);
    if (diferencaEC > 50) { // Threshold para mudança significativa de EC
        if (ecFinalPrevistoElement) ecFinalPrevistoElement.classList.add('highlight');
    } else {
        if (ecFinalPrevistoElement) ecFinalPrevistoElement.classList.remove('highlight');
    }
    
    console.log(`📈 ACCURACY ATUALIZADA: A=${A.toFixed(2)}, EC atual=${ecAtual.toFixed(1)}, EC(∞)=${ecFinalPrevisto.toFixed(1)}`);
}

// ===== SISTEMA DE TIMERS DE RELÉS EM TEMPO REAL ===== //

const RelayTimerSystem = {
    // Estado do sistema
    state: {
        activeTimers: new Map(),
        sequence: [],
        currentIndex: 0,
        totalDuration: 0,
        startTime: null,
        isRunning: false,
        completedNutrients: 0
    },
    
    // Configurações
    config: {
        updateInterval: 100, // Atualização a cada 100ms para precisão
        soundEnabled: true,
        showProgressBars: true
    },
    
    // Inicializar sistema
    init() {
        console.log('⏱️ Inicializando sistema de timers em tempo real...');
        this.setupEventListeners();
        this.hideTimerSection();
        console.log('✅ Sistema de timers iniciado');
    },
    
    // Event listeners
    setupEventListeners() {
        // Interceptar execução de dosagem proporcional
        const originalExecute = window.executarDosagemProporcional;
        if (originalExecute) {
            window.executarDosagemProporcional = (totalUt) => {
                // Preparar timers antes da execução
                this.prepareDosageTimers(totalUt);
                // Chamar função original
                originalExecute(totalUt);
            };
        }
    },
    
    // Preparar timers para dosagem
    prepareDosageTimers(totalUt) {
        console.log('🎯 Preparando timers para dosagem proporcional...');
        
        // Calcular distribuição usando função existente
        const distribution = calculateProportionalDistribution(totalUt);
        const intervalo = globalState.control.intervaloBetweenNutrients;
        
        if (distribution.length === 0) {
            console.warn('⚠️ Nenhum nutriente para dosagem');
            return;
        }
        
        // Criar sequência de timers
        this.state.sequence = distribution.map((item, index) => ({
            id: `timer-${item.relay}`,
            nutrientName: item.nutriente,
            relay: item.relay,
            duration: item.tempoDosagem, // tempo em segundos
            volume: item.utNutriente, // volume em ml
            startDelay: index * (intervalo * 1000), // delay em ms
            status: 'waiting'
        }));
        
        // Calcular duração total
        this.state.totalDuration = this.state.sequence.reduce((total, timer) => {
            return Math.max(total, timer.startDelay + (timer.duration * 1000));
        }, 0);
        
        console.log(`📊 Sequência preparada: ${this.state.sequence.length} nutrientes, duração total: ${(this.state.totalDuration/1000).toFixed(1)}s`);
        
        // Mostrar seção e criar timers visuais
        this.showTimerSection();
        this.createTimerElements();
        this.updateProgressStats();
        
        // Aguardar 2 segundos e iniciar
        setTimeout(() => {
            this.startTimerSequence();
        }, 2000);
    },
    
    // Mostrar seção de timers
    showTimerSection() {
        const section = document.getElementById('relay-timers-section');
        if (section) {
            section.style.display = 'block';
            section.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Efeito de fade in
            section.style.opacity = '0';
            section.style.transform = 'translateY(20px)';
            
            setTimeout(() => {
                section.style.transition = 'all 0.5s ease';
                section.style.opacity = '1';
                section.style.transform = 'translateY(0)';
            }, 100);
        }
    },
    
    // Esconder seção de timers
    hideTimerSection() {
        const section = document.getElementById('relay-timers-section');
        if (section) {
            section.style.display = 'none';
        }
    },
    
    // Criar elementos visuais dos timers
    createTimerElements() {
        const container = document.getElementById('timers-container');
        if (!container) return;
        
        container.innerHTML = '';
        
        this.state.sequence.forEach((timer, index) => {
            const timerElement = this.createTimerElement(timer, index);
            container.appendChild(timerElement);
        });
        
        console.log(`🎨 Criados ${this.state.sequence.length} elementos de timer`);
    },
    
    // Criar elemento individual do timer
    createTimerElement(timer, index) {
        const div = document.createElement('div');
        div.className = 'relay-timer waiting';
        div.id = timer.id;
        
        div.innerHTML = `
            <div class="timer-header">
                <h3 class="nutrient-name">${timer.nutrientName}</h3>
                <span class="relay-number">Relé ${timer.relay}</span>
            </div>
            
            <div class="timer-display">
                <span class="timer-value" id="${timer.id}-value">${timer.duration.toFixed(1)}</span>
                <span class="timer-unit">s</span>
            </div>
            
            <div class="timer-progress">
                <div class="timer-progress-fill" id="${timer.id}-progress"></div>
            </div>
            
            <div class="timer-details">
                <div class="timer-info">
                    <div>Volume: ${timer.volume.toFixed(2)} ml</div>
                    <div>Início em: ${(timer.startDelay/1000).toFixed(1)}s</div>
                </div>
                <span class="timer-status waiting" id="${timer.id}-status">Aguardando</span>
            </div>
        `;
        
        return div;
    },
    
    // Iniciar sequência de timers
    startTimerSequence() {
        if (this.state.isRunning) {
            console.warn('⚠️ Sequência já está rodando');
            return;
        }
        
        console.log('🚀 Iniciando sequência de timers em tempo real!');
        
        this.state.isRunning = true;
        this.state.startTime = Date.now();
        this.state.currentIndex = 0;
        this.state.completedNutrients = 0;
        
        // Resetar todos os timers
        this.state.activeTimers.clear();
        
        // Programar cada timer
        this.state.sequence.forEach((timer, index) => {
            // Timer para iniciar dosagem
            setTimeout(() => {
                this.startIndividualTimer(timer);
            }, timer.startDelay);
            
            // Timer para finalizar dosagem
            setTimeout(() => {
                this.completeIndividualTimer(timer);
            }, timer.startDelay + (timer.duration * 1000));
        });
        
        // Timer para finalizar sequência completa
        setTimeout(() => {
            this.completeSequence();
        }, this.state.totalDuration + 1000);
        
        // Iniciar loop de atualização
        this.startUpdateLoop();
        
        // Log e notificação
        communicationMonitor.addLog('success', `Timers iniciados: ${this.state.sequence.length} nutrientes em sequência`);
        
        // Tocar som de início (se habilitado)
        this.playSound('start');
    },
    
    // Iniciar timer individual
    startIndividualTimer(timer) {
        console.log(`▶️ Iniciando timer: ${timer.nutrientName} (Relé ${timer.relay}) - ${timer.duration.toFixed(1)}s`);
        
        // Atualizar estado do timer
        timer.status = 'active';
        timer.realStartTime = Date.now();
        
        // Adicionar ao mapa de timers ativos
        this.state.activeTimers.set(timer.id, timer);
        
        // Atualizar UI
        this.updateTimerUI(timer, 'active');
        
        // Log
        communicationMonitor.addLog('data', `▶️ RELÉ ${timer.relay} ATIVADO: ${timer.nutrientName} por ${timer.duration.toFixed(1)}s`);
        
        // Som de ativação
        this.playSound('relay_start');
    },
    
    // Completar timer individual
    completeIndividualTimer(timer) {
        console.log(`✅ Completando timer: ${timer.nutrientName} (Relé ${timer.relay})`);
        
        // Atualizar estado
        timer.status = 'completed';
        this.state.completedNutrients++;
        
        // Remover dos timers ativos
        this.state.activeTimers.delete(timer.id);
        
        // Atualizar UI
        this.updateTimerUI(timer, 'completed');
        this.updateProgressStats();
        
        // Log
        communicationMonitor.addLog('success', `✅ RELÉ ${timer.relay} FINALIZADO: ${timer.nutrientName} - ${timer.volume.toFixed(2)}ml dosados`);
        
        // Som de finalização
        this.playSound('relay_complete');
    },
    
    // Atualizar UI do timer
    updateTimerUI(timer, status) {
        const timerElement = document.getElementById(timer.id);
        const valueElement = document.getElementById(`${timer.id}-value`);
        const progressElement = document.getElementById(`${timer.id}-progress`);
        const statusElement = document.getElementById(`${timer.id}-status`);
        
        if (!timerElement) return;
        
        // Atualizar classe CSS
        timerElement.className = `relay-timer ${status}`;
        
        // Atualizar status text
        if (statusElement) {
            statusElement.className = `timer-status ${status}`;
            statusElement.textContent = this.getStatusText(status);
        }
        
        // Se for ativo, adicionar classe de countdown
        if (status === 'active' && valueElement) {
            valueElement.classList.add('countdown');
        } else if (valueElement) {
            valueElement.classList.remove('countdown');
        }
        
        // Atualizar progresso inicial
        if (progressElement) {
            if (status === 'completed') {
                progressElement.style.width = '100%';
            } else if (status === 'active') {
                progressElement.style.width = '0%';
            }
        }
    },
    
    // Obter texto do status
    getStatusText(status) {
        const statusTexts = {
            'waiting': 'Aguardando',
            'active': 'Dosando',
            'completed': 'Concluído',
            'error': 'Erro'
        };
        return statusTexts[status] || 'Desconhecido';
    },
    
    // Loop de atualização em tempo real
    startUpdateLoop() {
        const updateInterval = setInterval(() => {
            if (!this.state.isRunning) {
                clearInterval(updateInterval);
                return;
            }
            
            const now = Date.now();
            const elapsedTotal = now - this.state.startTime;
            
            // Atualizar cada timer ativo
            this.state.activeTimers.forEach((timer) => {
                this.updateActiveTimer(timer, now);
            });
            
            // Atualizar progresso geral
            this.updateOverallProgress(elapsedTotal);
            
        }, this.config.updateInterval);
    },
    
    // Atualizar timer ativo
    updateActiveTimer(timer, now) {
        if (!timer.realStartTime) return;
        
        const elapsed = now - timer.realStartTime;
        const remaining = Math.max(0, (timer.duration * 1000) - elapsed);
        const progress = Math.min(100, (elapsed / (timer.duration * 1000)) * 100);
        
        // Atualizar valor
        const valueElement = document.getElementById(`${timer.id}-value`);
        if (valueElement) {
            valueElement.textContent = (remaining / 1000).toFixed(1);
        }
        
        // Atualizar barra de progresso
        const progressElement = document.getElementById(`${timer.id}-progress`);
        if (progressElement) {
            progressElement.style.width = `${progress}%`;
        }
    },
    
    // Atualizar progresso geral
    updateOverallProgress(elapsedTotal) {
        const progressFill = document.getElementById('overall-progress-fill');
        const progressText = document.getElementById('overall-progress-text');
        const remainingNutrients = document.getElementById('remaining-nutrients');
        const totalEstimatedTime = document.getElementById('total-estimated-time');
        
        if (progressFill && progressText) {
            const overallProgress = Math.min(100, (elapsedTotal / this.state.totalDuration) * 100);
            progressFill.style.width = `${overallProgress}%`;
            progressText.textContent = `${overallProgress.toFixed(0)}% Concluído`;
        }
        
        if (remainingNutrients) {
            const remaining = this.state.sequence.length - this.state.completedNutrients;
            remainingNutrients.textContent = remaining;
        }
        
        if (totalEstimatedTime) {
            const remainingTime = Math.max(0, this.state.totalDuration - elapsedTotal);
            totalEstimatedTime.textContent = `${(remainingTime/1000).toFixed(0)}s`;
        }
    },
    
    // Atualizar estatísticas de progresso
    updateProgressStats() {
        const remainingNutrients = document.getElementById('remaining-nutrients');
        const totalEstimatedTime = document.getElementById('total-estimated-time');
        
        if (remainingNutrients) {
            const remaining = this.state.sequence.length - this.state.completedNutrients;
            remainingNutrients.textContent = remaining;
        }
        
        if (totalEstimatedTime) {
            totalEstimatedTime.textContent = `${(this.state.totalDuration/1000).toFixed(0)}s`;
        }
    },
    
    // Completar sequência
    completeSequence() {
        console.log('🎉 Sequência de dosagem completada!');
        
        this.state.isRunning = false;
        
        // Atualizar progresso final
        const progressFill = document.getElementById('overall-progress-fill');
        const progressText = document.getElementById('overall-progress-text');
        
        if (progressFill && progressText) {
            progressFill.style.width = '100%';
            progressText.textContent = '100% Concluído';
        }
        
        // Log final
        communicationMonitor.addLog('success', `🎉 DOSAGEM COMPLETA: ${this.state.completedNutrients}/${this.state.sequence.length} nutrientes processados`);
        
        // Som de finalização
        this.playSound('sequence_complete');
        
        // Auto-ocultar após 10 segundos
        setTimeout(() => {
            this.hideTimerSection();
        }, 10000);
        
        // Notificação visual
        this.showCompletionNotification();
    },
    
    // Mostrar notificação de conclusão
    showCompletionNotification() {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #4CAF50, #8BC34A);
            color: white;
            padding: 20px 30px;
            border-radius: 10px;
            font-size: 18px;
            font-weight: bold;
            z-index: 10000;
            box-shadow: 0 4px 20px rgba(76, 175, 80, 0.4);
            animation: slideInRight 0.5s ease;
        `;
        
        notification.innerHTML = `
            🎉 <strong>DOSAGEM COMPLETA!</strong><br>
            <small>${this.state.completedNutrients} nutrientes processados com sucesso</small>
        `;
        
        document.body.appendChild(notification);
        
        // Remover após 5 segundos
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.5s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 500);
        }, 5000);
    },
    
    // Tocar sons (simulado - pode ser expandido)
    playSound(type) {
        if (!this.config.soundEnabled) return;
        
        console.log(`🔊 Som: ${type}`);
        
        // Aqui poderia implementar sons reais usando Web Audio API
        // Por enquanto, apenas log para debugar
        const soundMessages = {
            'start': '🎵 Som de início da sequência',
            'relay_start': '🔊 Som de ativação do relé',
            'relay_complete': '✅ Som de finalização do relé',
            'sequence_complete': '🎉 Som de conclusão da sequência'
        };
        
        communicationMonitor.addLog('info', soundMessages[type] || `🔊 Som: ${type}`);
    },
    
    // Parar sistema de emergência
    emergencyStop() {
        console.log('🛑 PARADA DE EMERGÊNCIA dos timers!');
        
        this.state.isRunning = false;
        this.state.activeTimers.clear();
        
        // Atualizar todos os timers para erro
        this.state.sequence.forEach(timer => {
            if (timer.status === 'active' || timer.status === 'waiting') {
                timer.status = 'error';
                this.updateTimerUI(timer, 'error');
            }
        });
        
        communicationMonitor.addLog('error', '🛑 PARADA DE EMERGÊNCIA ativada - todos os timers interrompidos');
    }
};

// Inicializar sistema de timers quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', function() {
    // Aguardar um pouco para garantir que outros sistemas estejam prontos
    setTimeout(() => {
        RelayTimerSystem.init();
    }, 1000);
});

// Adicionar sistema de timers ao escopo global para debugging
window.RelayTimerSystem = RelayTimerSystem;

// ===== FUNÇÃO PARA ENVIAR PROPORÇÕES AO ESP32 =====
async function sendNutrientProportionsToESP32(distribution) {
    try {
        // Extrair proporções dos nutrientes
        const proportions = {
            grow: 0,
            micro: 0,
            bloom: 0,
            calmag: 0
        };
        
        // Mapear distribuição para proporções
        distribution.forEach(item => {
            const name = item.nutriente.toLowerCase();
            if (proportions.hasOwnProperty(name)) {
                proportions[name] = item.proporcao;
            }
        });
        
        console.log('📤 Enviando proporções para ESP32:', proportions);
        
        const response = await fetch('/nutrient-proportions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(proportions)
        });
        
        if (response.ok) {
            console.log('✅ Proporções enviadas com sucesso ao ESP32');
        } else {
            console.warn('⚠️ Falha ao enviar proporções:', response.status);
        }
    } catch (error) {
        console.error('❌ Erro ao enviar proporções ao ESP32:', error);
    }
}

// Atualizar função updateECControlUI para usar estado global
function updateECControlUI() {
    const button = document.getElementById('toggle-auto-ec');
    const statusSpan = document.getElementById('auto-ec-status');
    const cancelRow = document.getElementById('cancel-auto-ec-row');
    
    if (!button || !statusSpan) {
        console.warn('⚠️ Elementos da interface Auto EC não encontrados');
        return;
    }
    
    const isEnabled = globalState.control.autoECEnabled;
    
    if (isEnabled) {
        button.textContent = '🤖 Desativar Auto EC';
        button.classList.add('active');
        statusSpan.textContent = 'Ativo';
        statusSpan.className = 'status-value active';
        
        // Mostrar botão de cancelar quando ativo
        if (cancelRow) {
            cancelRow.style.display = 'block';
        }
    } else {
        button.textContent = '🤖 Ativar Auto EC';
        button.classList.remove('active');
        statusSpan.textContent = 'Desativado';
        statusSpan.className = 'status-value';
        
        // Esconder botão de cancelar quando inativo
        if (cancelRow) {
            cancelRow.style.display = 'none';
        }
    }
}

// ===== FUNÇÃO DE VALIDAÇÃO DE PARÂMETROS EC =====
function validateECParameters() {
    const errors = [];
    
    // Verificar campos obrigatórios
    const baseDose = parseFloat(document.getElementById('base-dose').value) || 0;
    const flowRate = parseFloat(document.getElementById('flow-rate').value) || 0;
    const volume = parseFloat(document.getElementById('volume-reservoir').value) || 0;
    const ecSetpoint = parseFloat(document.getElementById('ec-setpoint').value) || 0;
    const totalMl = parseFloat(document.getElementById('total-ml').value) || 0;
    
    // Validar cada campo
    if (baseDose <= 0) {
        errors.push('• Base de dose (EC µS/cm) deve ser maior que 0');
    }
    
    if (flowRate <= 0) {
        errors.push('• Taxa de vazão peristáltica deve ser maior que 0');
    }
    
    if (volume <= 0) {
        errors.push('• Volume do reservatório deve ser maior que 0');
    }
    
    if (ecSetpoint <= 0) {
        errors.push('• EC Setpoint deve ser maior que 0');
    }
    
    if (totalMl <= 0) {
        errors.push('• Soma ml por Litro deve ser maior que 0 (configure o plano nutricional)');
    }
    
    // Validar se há pelo menos um nutriente configurado
    let hasNutrients = false;
    const nutritionInputs = document.querySelectorAll('.ml-por-litro');
    nutritionInputs.forEach(input => {
        if (parseFloat(input.value) > 0) {
            hasNutrients = true;
        }
    });
    
    if (!hasNutrients) {
        errors.push('• Configure pelo menos um nutriente no plano nutricional');
    }
    
    return {
        valid: errors.length === 0,
        errors: errors
    };
}

// ===== FUNÇÃO PARA MOSTRAR ALERTA DE VALIDAÇÃO =====
function showParameterValidationAlert(errors) {
    const errorMessage = `⚠️ NÃO É POSSÍVEL ATIVAR AUTO EC\n\nCampos obrigatórios não preenchidos:\n\n${errors.join('\n')}\n\n📋 AÇÃO NECESSÁRIA:\n1. Preencha todos os campos obrigatórios\n2. Configure o plano nutricional\n3. Clique em "Salvar Parâmetros"\n4. Tente ativar o Auto EC novamente`;
    
    alert(errorMessage);
    
    // Log no console para debug
    console.error('❌ Validação falhou - Parâmetros obrigatórios:', errors);
    
    // Destacar campos com erro (opcional)
    highlightEmptyFields();
}

// ===== FUNÇÃO PARA DESTACAR CAMPOS VAZIOS =====
function highlightEmptyFields() {
    const fieldsToCheck = [
        'base-dose',
        'flow-rate', 
        'volume-reservoir',
        'ec-setpoint'
    ];
    
    fieldsToCheck.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        const value = parseFloat(field.value) || 0;
        
        if (value <= 0) {
            field.style.borderColor = '#e74c3c';
            field.style.backgroundColor = '#fdf2f2';
            
            // Remover destaque após 3 segundos
            setTimeout(() => {
                field.style.borderColor = '';
                field.style.backgroundColor = '';
            }, 3000);
        }
    });
    
    // Verificar total-ml também
    const totalMlField = document.getElementById('total-ml');
    const totalMlValue = parseFloat(totalMlField.value) || 0;
    if (totalMlValue <= 0) {
        totalMlField.style.borderColor = '#e74c3c';
        totalMlField.style.backgroundColor = '#fdf2f2';
        
        setTimeout(() => {
            totalMlField.style.borderColor = '';
            totalMlField.style.backgroundColor = '';
        }, 3000);
    }
}

// ===== FUNÇÃO PARA MOSTRAR CONFIRMAÇÃO DETALHADA DO AUTO EC =====
async function showAutoECConfirmation() {
    try {
        // Obter valores atuais dos campos
        const baseDose = parseFloat(document.getElementById('base-dose').value);
        const flowRate = parseFloat(document.getElementById('flow-rate').value);
        const volume = parseFloat(document.getElementById('volume-reservoir').value);
        const ecSetpoint = parseFloat(document.getElementById('ec-setpoint').value);
        const totalMl = parseFloat(document.getElementById('total-ml').value);
        const intervalo = parseFloat(document.getElementById('intervalo-auto-ec').value) || 3;
        
        // Calcular u(t) atual usando o controller
        const calculationResult = await updateEquationDisplay();
        
        // Obter EC atual (simulado ou real)
        const ecAtual = globalState.control.currentECValue || 400; // Valor de exemplo
        const erro = ecSetpoint - ecAtual;
        
        // Preparar dados dos cálculos
        let utVolume = 0;
        let tempoSegundos = 0;
        let ganhoFisico = 0;
        
        if (calculationResult && calculationResult.result !== undefined) {
            utVolume = calculationResult.result;
            tempoSegundos = calculationResult.utSegundos;
            
            // Calcular ganho físico previsto
            const k = totalMl > 0 ? baseDose / totalMl : 0;
            ganhoFisico = volume > 0 ? (k * utVolume) / volume : 0;
        }
        
        // Criar mensagem de confirmação detalhada
        const confirmationMessage = `🤖 ATIVAÇÃO DO AUTO EC
        
✅ PARÂMETROS EC CONFIGURADOS:

📊 Base de dose: ${baseDose} µS/cm
💧 Taxa de vazão: ${flowRate} ml/s  
🪣 Volume reservatório: ${volume} L
🧪 Soma ml por Litro: ${totalMl} ml/L
⏱️ Intervalo entre doses: ${intervalo} segundos

🎯 CONTROLE AUTOMÁTICO:

📈 EC Atual: ${ecAtual.toFixed(0)} µS/cm
🎯 EC Setpoint: ${ecSetpoint} µS/cm
⚡ Erro: ${erro.toFixed(0)} µS/cm

📊 CÁLCULOS AUTOMÁTICOS:

💧 u(t) Volume a dosar: ${utVolume.toFixed(3)} ml
⏱️ Tempo de dosagem: ${tempoSegundos.toFixed(2)} segundos
⚡ Ganho físico previsto: ${ganhoFisico.toFixed(1)} µS/cm

🔄 PROPORÇÕES DINÂMICAS:
${await getNutrientProportionsText()}

⚠️ IMPORTANTE:
• O sistema dosará AUTOMATICAMENTE quando necessário
• Verificação a cada 30 segundos
• Tolerância: ±50 µS/cm
• Você pode cancelar a qualquer momento

🤖 Deseja ATIVAR o controle automático?`;

        return confirm(confirmationMessage);
        
    } catch (error) {
        console.error('❌ Erro ao preparar confirmação:', error);
        
        // Fallback com confirmação simples
        const simpleConfirmation = `🤖 ATIVAR AUTO EC?
        
⚠️ Isso iniciará o controle automático de EC.
O sistema dosará nutrientes automaticamente quando necessário.

Deseja continuar?`;
        
        return confirm(simpleConfirmation);
    }
}

// ===== FUNÇÃO AUXILIAR PARA OBTER TEXTO DAS PROPORÇÕES =====
async function getNutrientProportionsText() {
    try {
        const lastResult = window.lastControllerResult;
        if (lastResult && lastResult.distribution) {
            let proportionsText = '';
            lastResult.distribution.forEach(item => {
                if (item.utNutriente > 0.001) {
                    proportionsText += `  • ${item.nutriente}: ${item.utNutriente.toFixed(2)}ml (${(item.proporcao * 100).toFixed(1)}%)\n`;
                }
            });
            return proportionsText || '  • Nenhuma proporção configurada';
        }
        return '  • Proporções serão calculadas automaticamente';
    } catch (error) {
        return '  • Erro ao obter proporções';
    }
}

// ===== FUNÇÃO DE VALIDAÇÃO DE PARÂMETROS EC =====