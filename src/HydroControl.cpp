#include "HydroControl.h"

HydroControl::HydroControl()
    : lcd(0x27, 16, 2)
    , oneWire(TEMP_PIN)
    , sensors(&oneWire)
    , pcf1(0x20)  // Primeiro PCF8574
    , pcf2(0x24)  // Segundo PCF8574
    , thingSpeak()
    , ecController()
{
    // Inicializar variáveis dos sensores
    temperature = 0.0;
    pH = 7.0;
    tds = 0.0;
    ec = 0.0;
    
    // Inicializar estados dos relés
    for(int i = 0; i < NUM_RELAYS; i++) {
        relayStates[i] = false;
        startTimes[i] = 0;
        timerSeconds[i] = 0;
    }
    
    // ===== INICIALIZAR SISTEMA SEQUENCIAL SIMPLES =====
    currentState = IDLE;
    totalNutrients = 0;
    currentNutrientIndex = 0;
    
    stateStartTime = 0;
    intervalSeconds = 0;
    
    // Controle automático EC
    ecSetpoint = 0.0;
    autoECEnabled = false;
    lastECCheck = 0;
    autoECIntervalSeconds = 0;
}

void HydroControl::begin() {
    // Scan I2C
    Serial.println("Scanning I2C devices...");
    Wire.begin();
    for(byte i = 8; i < 120; i++) {
        Wire.beginTransmission(i);
        if (Wire.endTransmission() == 0) {
            Serial.printf("I2C device found at address 0x%02X\n", i);
        }
    }

    // Inicializar PCF8574s
    if (!pcf1.begin()) {
        Serial.println("Erro ao inicializar PCF8574 #1 (0x20)");
    } else {
        Serial.println("PCF8574 #1 inicializado com sucesso");
    }
    
    if (!pcf2.begin()) {
        Serial.println("Erro ao inicializar PCF8574 #2 (0x24)");
    } else {
        Serial.println("PCF8574 #2 inicializado com sucesso");
    }

    // Configurar todos os pinos como OUTPUT e HIGH (relés desligados)
    for (int i = 0; i < 8; i++) {
        pcf1.write(i, HIGH);
        pcf2.write(i, HIGH);
    }

    // Inicializar LCD
    lcd.init();
    lcd.backlight();
    lcd.print("Iniciando...");

    // Inicializar sensores
    sensors.begin();
    
    tdsSensor = new TDSReaderSerial(TDS_PIN, 3.3, 1.0);
    tdsSensor->begin();
    
    pHSensor = new phSensor();
    pHSensor->calibrate(2.56, 3.3, 2.05, false);

    thingSpeak.begin();
    
    // ===== MENSAGEM DE SISTEMA INICIALIZADO =====
    Serial.println("\n" + String('#', 80));
    Serial.println("🌱 SISTEMA HIDROPÔNICO IoT INICIALIZADO COM SUCESSO!");
    Serial.println(String('#', 80));
    Serial.println("📋 COMPONENTES ATIVOS:");
    Serial.println("  ✅ ESP32 Controller");
    Serial.println("  ✅ Display LCD I2C (0x27)");
    Serial.println("  ✅ PCF8574 #1 (0x20) - Relés 1-4");
    Serial.println("  ✅ PCF8574 #2 (0x24) - Relés 5-8");
    Serial.println("  ✅ Sensor DS18B20 (Temperatura)");
    Serial.println("  ✅ Sensor pH");
    Serial.println("  ✅ Sensor TDS/EC");
    Serial.println("  ✅ ThingSpeak IoT");
    Serial.println(String('-', 80));
    Serial.println("🎛️  RELÉS MAPEADOS:");
    Serial.println("  1️⃣  Bomba pH- (PCF1-P0)");
    Serial.println("  2️⃣  Bomba pH+ (PCF1-P1)");
    Serial.println("  3️⃣  Bomba A (PCF1-P2)");
    Serial.println("  4️⃣  Bomba B (PCF1-P3)");
    Serial.println("  5️⃣  Bomba C (PCF2-P0)");
    Serial.println("  6️⃣  Bomba CalMag (PCF2-P1)");
    Serial.println("  7️⃣  Luz UV (PCF2-P2)");
    Serial.println("  8️⃣  Aerador (PCF2-P3)");
    Serial.println(String('-', 80));
    Serial.println("🔧 PARÂMETROS PADRÃO:");
    Serial.printf("  • EC Setpoint: %.0f µS/cm\n", ecSetpoint);
    Serial.printf("  • Auto EC: %s\n", autoECEnabled ? "ATIVO" : "INATIVO");
    Serial.printf("  • Intervalo verificação: %lu segundos\n", EC_CHECK_INTERVAL / 1000);
    Serial.println(String('-', 80));
    Serial.println("🌐 ACESSE A INTERFACE WEB PARA CONFIGURAR!");
    Serial.println("📊 Logs detalhados de dosagem aparecerão aqui.");
    Serial.println(String('#', 80) + "\n");
}

void HydroControl::update() {
    updateSensors();
    // checkRelayTimers();  // ← DESATIVADO: Sistema concorrente que interfere com processSimpleSequential
    updateDisplay();
    checkAutoEC();
    
    // ===== PROCESSAR SISTEMA SEQUENCIAL SIMPLES =====
    processSimpleSequential();
    
    // Enviar dados para o ThingSpeak
    thingSpeak.sendData(temperature, pH, ec);
    
    // Debug status
    static unsigned long lastDebug = 0;
    if (millis() - lastDebug > 5000) {  // A cada 5 segundos
        lastDebug = millis();
        Serial.println("\n=== Status do Sistema ===");
        Serial.printf("Temperatura: %.1f°C\n", temperature);
        Serial.printf("pH: %.2f\n", pH);
        Serial.printf("TDS: %.0f ppm\n", tds);
        Serial.printf("EC: %.0f uS/cm\n", ec);
        if (autoECEnabled) {
            Serial.printf("EC Setpoint: %.0f uS/cm\n", ecSetpoint);
            Serial.printf("Auto EC: %s\n", autoECEnabled ? "ATIVO" : "INATIVO");
        }
        Serial.println("Estado dos Relés:");
        for (int i = 0; i < NUM_RELAYS; i++) {
            Serial.printf("Relé %d: %s\n", i+1, relayStates[i] ? "ON" : "OFF");
        }
        Serial.println("=====================\n");
    }
}

void HydroControl::updateSensors() {
    // Temperatura
    sensors.requestTemperatures();
    float tempReading = sensors.getTempCByIndex(0);
    if (tempReading != -127.0 && tempReading >= 0 && tempReading <= 50) {
        temperature = tempReading;
    }
    
    // pH
    float phReading = pHSensor->readPH(PH_PIN);
    if (phReading >= 0 && phReading <= 14) {
        pH = phReading;
    }
    
    // TDS e EC
    tdsSensor->updateTemperature(temperature);
    tdsSensor->readTDS();
    float tdsReading = tdsSensor->getTDSValue();
    if (tdsReading >= 0 && tdsReading <= 2000) {
        tds = tdsReading;
        ec = tdsSensor->getECValue();
    }

    // Debug
    Serial.println("\n=== Status do Sistema ===");
    Serial.printf("Temperatura: %.1f°C\n", temperature);
    Serial.printf("pH: %.2f\n", pH);
    Serial.printf("TDS: %.0f ppm\n", tds);
    Serial.printf("EC: %.0f uS/cm\n", ec);
}

void HydroControl::updateDisplay() {
    lcd.clear();
    
    // Linha 1: Temperatura centralizada
    String tempText = "Temp:" + String(temperature, 1) + char(223) + "C";
    lcd.setCursor((16 - tempText.length()) / 2, 0);
    lcd.print(tempText);
    
    // Linha 2: pH e EC
    lcd.setCursor(0, 1);
    lcd.print("pH:");
    lcd.print(pH, 2);
    
    String ecText = "EC:" + String(ec, 0);
    lcd.setCursor(16 - ecText.length(), 1);
    lcd.print(ecText);
}

void HydroControl::showMessage(String msg) {
    lcd.clear();
    lcd.print(msg);
}

void HydroControl::checkAutoEC() {
    if (!autoECEnabled) return;
    
    unsigned long currentMillis = millis();
    if (currentMillis - lastECCheck < EC_CHECK_INTERVAL) return;
    
    lastECCheck = currentMillis;
    
    // Evitar múltiplas dosagens simultâneas - USAR SISTEMA SIMPLES
    if (currentState != IDLE) {
        Serial.println("⚠️  Auto EC: Sistema simples já ativo - aguardando...");
        return;
    }
    
    // Verificar se precisa de ajuste
    if (ecController.needsAdjustment(ecSetpoint, ec)) {
        float dosageML = ecController.calculateDosage(ecSetpoint, ec);
        
        if (dosageML > 0.1) { // Só dosar se for significativo
            float dosageTime = ecController.calculateDosageTime(dosageML);
            
            // ===== MENSAGEM DETALHADA DE DOSAGEM AUTOMÁTICA =====
            Serial.println("\n" + String('*', 70));
            Serial.println("🤖 DOSAGEM AUTOMÁTICA EC INICIADA - SISTEMA SEQUENCIAL");
            Serial.println(String('*', 70));
            Serial.printf("📊 EC Atual: %.0f µS/cm\n", ec);
            Serial.printf("🎯 EC Setpoint: %.0f µS/cm\n", ecSetpoint);
            Serial.printf("⚡ Erro: %.0f µS/cm\n", (ecSetpoint - ec));
            Serial.println(String('-', 70));
            Serial.printf("💧 Dosagem calculada: %.2f ml\n", dosageML);
            Serial.printf("⏱️  Tempo de dosagem: %.1f segundos\n", dosageTime);
            Serial.println(String('-', 70));
            
            // ===== USAR SISTEMA DINÂMICO (PROPORÇÕES DA INTERFACE) =====
            Serial.println("🔄 Auto EC usando proporções dinâmicas da interface");
            startDynamicSequentialDosage(dosageML, ecSetpoint, ec);
            
            showMessage("Auto EC: Seq. Ativada");
            
            Serial.println("✅ DOSAGEM SEQUENCIAL AUTOMÁTICA INICIADA");
            Serial.println(String('*', 70) + "\n");
            
        } else {
            Serial.printf("ℹ️  Auto EC: Dosagem muito pequena (%.3f ml) - ignorada\n", dosageML);
        }
    } else {
        // Log ocasional quando não precisa ajuste
        static unsigned long lastNoAdjustLog = 0;
        if (currentMillis - lastNoAdjustLog > 60000) { // Log a cada 1 minuto
            lastNoAdjustLog = currentMillis;
            float error = abs(ecSetpoint - ec);
            Serial.printf("✅ Auto EC: Sem ajuste necessário (Erro: %.0f µS/cm, Tolerância: 50 µS/cm)\n", error);
        }
    }
}

// ===== NOVO SISTEMA DE CONTROLE SEQUENCIAL DE DOSAGEM =====

/*
// ===== SISTEMA ANTIGO COMENTADO =====
void HydroControl::startSequentialDosage(float totalML, float ecSetpoint, float ecActual) {
}
*/

// ===== FUNÇÕES DE COMPATIBILIDADE - REDIRECIONAM PARA SISTEMA SIMPLES =====

void HydroControl::clearDosageQueue() {
    // Limpar sistema antigo (compatibilidade)
    totalScheduledDosages = 0;
    currentDosageIndex = 0;
    sequentialDosageActive = false;
    waitingInterval = false;
}

void HydroControl::addToDosageQueue(String nutrientName, int relayIndex, float dosageML, int durationMs) {
    // Redirecionar para sistema simples
    if (totalNutrients < 6) {
        nutrients[totalNutrients].name = nutrientName;
        nutrients[totalNutrients].relay = relayIndex;
        nutrients[totalNutrients].dosageML = dosageML;
        nutrients[totalNutrients].durationMs = durationMs;
        totalNutrients++;
        Serial.printf("📝 Compatibilidade: %s → Sistema Simples\n", nutrientName.c_str());
    }
}

void HydroControl::processSequentialDosage() {
    // Redirecionar para sistema simples
    processSimpleSequential();
}

void HydroControl::activateRelay(int relayIndex, int durationMs) {
    // Redirecionar para toggleRelay existente
    if (relayIndex >= 0 && relayIndex < NUM_RELAYS) {
        toggleRelay(relayIndex, durationMs);
        Serial.printf("⚡ Compatibilidade: Relé %d ativado\n", relayIndex + 1);
    }
}

void HydroControl::deactivateRelay(int relayIndex) {
    // Redirecionar para toggleRelay existente
    if (relayIndex >= 0 && relayIndex < NUM_RELAYS) {
        relayStates[relayIndex] = false;
        bool state = !relayStates[relayIndex];
        
        if (relayIndex < 7) {
            pcf1.write(relayIndex, state);
        } else {
            int pcf2Pin = relayIndex - 6;
            pcf2.write(pcf2Pin, state);
        }
        
        startTimes[relayIndex] = 0;
        timerSeconds[relayIndex] = 0;
    }
}

bool HydroControl::isAnyRelayActive() {
    for (int i = 0; i < NUM_RELAYS; i++) {
        if (relayStates[i]) return true;
    }
    return false;
}

void HydroControl::logDosageProgress() {
    // Log do sistema simples
    if (currentState != IDLE) {
        Serial.printf("📊 Sistema Simples: %d/%d nutrientes\n", currentNutrientIndex + 1, totalNutrients);
    }
}

void HydroControl::executeDosageFromWebInterface(JsonArray distribution, int intervalo) {
    // Redirecionar para executeWebDosage
    Serial.println("⚠️  executeDosageFromWebInterface → executeWebDosage");
    executeWebDosage(distribution, intervalo);
}

void HydroControl::scheduleRelay(int relayIndex, int seconds, unsigned long delayMs) {
    // Usar sistema simples
    toggleRelay(relayIndex, seconds * 1000);
}

/*
void HydroControl::checkRelayTimers() {
    unsigned long currentMillis = millis();
    for(int i = 0; i < NUM_RELAYS; i++) {
        if(relayStates[i] && timerSeconds[i] > 0) {
            if((currentMillis - startTimes[i]) / 1000 >= timerSeconds[i]) {
                relayStates[i] = false;
                bool state = !relayStates[i];  // Invertido porque relés são ativos em LOW
                
                // Corrigir o mapeamento dos relés para os PCF8574s
                if (i < 7) {  // Primeiro PCF8574 (P0-P6)
                    pcf1.write(i, state);
                    Serial.printf("Timer PCF1: Relé %d -> pino P%d = %d\n", i+1, i, state);
                } else {      // Segundo PCF8574 (P1-P7)
                    int pcf2Pin = (i - 6); // Ajuste para mapear para P1-P7
                    pcf2.write(pcf2Pin, state);
                    Serial.printf("Timer PCF2: Relé %d -> pino P%d = %d\n", i+1, pcf2Pin, state);
                }
                
                timerSeconds[i] = 0;
                startTimes[i] = 0;
            }
        }
    }
}
*/

// ===== SISTEMA SIMPLES FUNCIONANDO - SEM FUNÇÕES ANTIGAS =====

void HydroControl::toggleRelay(int relay, int durationMs) {
    if (relay >= 0 && relay < NUM_RELAYS) {
        relayStates[relay] = !relayStates[relay];
        bool state = !relayStates[relay];  // Invertido porque relés são ativos em LOW
        
        // Corrigir o mapeamento dos relés para os PCF8574s
        if (relay < 7) {  // Primeiro PCF8574 (P0-P6)
            pcf1.write(relay, state);
            Serial.printf("PCF1: Relé %d -> pino P%d = %d\n", relay+1, relay, state);
        } else {          // Segundo PCF8574 (P1-P7)
            int pcf2Pin = (relay - 6); // Ajuste para mapear para P1-P7
            pcf2.write(pcf2Pin, state);
            Serial.printf("PCF2: Relé %d -> pino P%d = %d\n", relay+1, pcf2Pin, state);
        }
        
        if (durationMs > 0 && relayStates[relay]) {
            startTimes[relay] = millis();
            timerSeconds[relay] = durationMs / 1000;
            Serial.printf("Relé %d ligado por %d segundos\n", relay+1, timerSeconds[relay]);
        } else {
            startTimes[relay] = 0;
            timerSeconds[relay] = 0;
        }
    }
}

// ===== SISTEMA SEQUENCIAL SIMPLES - SEM ARRAY COMPLEXO =====

void HydroControl::processSimpleSequential() {
    if (currentState == IDLE) {
        return; // Nada para fazer
    }
    
    unsigned long currentTime = millis();
    
    if (currentState == DOSING) {
        // ===== DOSANDO NUTRIENTE ATUAL =====
        SimpleNutrient& current = nutrients[currentNutrientIndex];
        
        // Verificar se terminou a dosagem
        if (currentTime - stateStartTime >= current.durationMs) {
            // ===== DESLIGAR RELÉ =====
            relayStates[current.relay] = false;
            bool state = !relayStates[current.relay];  // Invertido - relés ativos em LOW
            
            if (current.relay < 7) {
                pcf1.write(current.relay, state);
                Serial.printf("🔴 Relé %d DESLIGADO após %.3fs\n", current.relay + 1, current.durationMs / 1000.0);
            } else {
                int pcf2Pin = current.relay - 6;
                pcf2.write(pcf2Pin, state);
                Serial.printf("🔴 Relé %d DESLIGADO após %.3fs\n", current.relay + 1, current.durationMs / 1000.0);
            }
            
            // ===== PRÓXIMO NUTRIENTE OU INTERVALO =====
            currentNutrientIndex++;
            
            if (currentNutrientIndex >= totalNutrients) {
                // ===== TERMINOU TODOS OS NUTRIENTES =====
                Serial.println("✅ SEQUÊNCIA COMPLETA - TODOS OS NUTRIENTES DOSADOS!");
                currentState = IDLE;
                totalNutrients = 0;
                currentNutrientIndex = 0;
                showMessage("Sequencia OK!");
            } else {
                // ===== AGUARDAR INTERVALO ANTES DO PRÓXIMO =====
                currentState = WAITING;
                stateStartTime = currentTime;
                Serial.printf("⏳ Aguardando %ds antes do próximo nutriente...\n", intervalSeconds);
                showMessage("Aguardando...");
            }
        }
        
    } else if (currentState == WAITING) {
        // ===== AGUARDANDO INTERVALO =====
        if (currentTime - stateStartTime >= (intervalSeconds * 1000)) {
            // ===== INICIAR PRÓXIMO NUTRIENTE =====
            SimpleNutrient& next = nutrients[currentNutrientIndex];
            
            Serial.printf("🚀 Iniciando: %s - %.3fml por %.3fs - Relé %d\n", 
                next.name.c_str(), next.dosageML, next.durationMs / 1000.0, next.relay + 1);
            
            // ===== LIGAR RELÉ =====
            relayStates[next.relay] = true;
            bool state = !relayStates[next.relay];  // Invertido - relés ativos em LOW
            
            if (next.relay < 7) {
                pcf1.write(next.relay, state);
            } else {
                int pcf2Pin = next.relay - 6;
                pcf2.write(pcf2Pin, state);
            }
            
            // ===== MUDAR PARA DOSING =====
            currentState = DOSING;
            stateStartTime = currentTime;
            
            String displayMsg = next.name + ": " + String(next.dosageML, 2) + "ml";
            showMessage(displayMsg);
        }
    }
}

void HydroControl::startSimpleSequentialDosage(float totalML, float ecSetpoint, float ecActual) {
    if (currentState != IDLE) {
        Serial.println("⚠️  Sistema já ativo - ignorando nova dosagem");
        return;
    }
    
    Serial.println("\n🔄 INICIANDO DOSAGEM SEQUENCIAL SIMPLES...");
    Serial.printf("💧 Total u(t): %.3f ml\n", totalML);
    
    // ===== DEFINIR NUTRIENTES COM PROPORÇÕES =====
    struct NutrientInfo {
        String name;
        int relay;
        float ratio;
    };
    
    NutrientInfo nutrientList[] = {
        {"Grow", 2, 0.35},    // 35% - Relé 3 (índice 2)
        {"Micro", 3, 0.35},   // 35% - Relé 4 (índice 3)
        {"Bloom", 4, 0.25},   // 25% - Relé 5 (índice 4)
        {"CalMag", 5, 0.05}   // 5%  - Relé 6 (índice 5)
    };
    
    totalNutrients = 0;
    intervalSeconds = autoECIntervalSeconds; // Usar intervalo configurado
    
    // ===== CALCULAR E ADICIONAR NUTRIENTES =====
    for (int i = 0; i < 4; i++) {
        float nutDosage = totalML * nutrientList[i].ratio;
        float nutTime = nutDosage / ecController.getFlowRate();
        int durationMs = (int)(nutTime * 1000);
        
        if (durationMs < 100) durationMs = 100; // Mínimo 100ms
        
        if (nutDosage > 0.001) {
            nutrients[totalNutrients].name = nutrientList[i].name;
            nutrients[totalNutrients].relay = nutrientList[i].relay;
            nutrients[totalNutrients].dosageML = nutDosage;
            nutrients[totalNutrients].durationMs = durationMs;
            
            Serial.printf("📝 %s: %.3fml → %dms → Relé %d\n", 
                nutrientList[i].name.c_str(), nutDosage, durationMs, nutrientList[i].relay + 1);
            
            totalNutrients++;
        }
    }
    
    if (totalNutrients > 0) {
        // ===== INICIAR PRIMEIRO NUTRIENTE IMEDIATAMENTE =====
        currentNutrientIndex = 0;
        currentState = DOSING;
        stateStartTime = millis();
        
        SimpleNutrient& first = nutrients[0];
        Serial.printf("🚀 Iniciando PRIMEIRO: %s - %.3fml por %.3fs - Relé %d\n", 
            first.name.c_str(), first.dosageML, first.durationMs / 1000.0, first.relay + 1);
        
        // ===== LIGAR PRIMEIRO RELÉ =====
        relayStates[first.relay] = true;
        bool state = !relayStates[first.relay];
        
        if (first.relay < 7) {
            pcf1.write(first.relay, state);
        } else {
            int pcf2Pin = first.relay - 6;
            pcf2.write(pcf2Pin, state);
        }
        
        String displayMsg = first.name + ": " + String(first.dosageML, 2) + "ml";
        showMessage(displayMsg);
        
        Serial.printf("✅ SISTEMA SIMPLES INICIADO: %d nutrientes, intervalo %ds\n", totalNutrients, intervalSeconds);
    } else {
        Serial.println("❌ Nenhuma dosagem significativa para executar");
        currentState = IDLE;
    }
}

void HydroControl::executeWebDosage(JsonArray distribution, int intervalo) {
    if (currentState != IDLE) {
        Serial.println("⚠️  Sistema já ativo - ignorando nova dosagem web");
        return;
    }
    
    Serial.println("\n🌐 INICIANDO DOSAGEM VIA WEB...");
    
    totalNutrients = 0;
    intervalSeconds = intervalo;
    
    // ===== PROCESSAR DADOS DA WEB =====
    for (JsonVariant nutrient : distribution) {
        String name = nutrient["name"].as<String>();
        int relay = nutrient["relay"].as<int>() - 1; // Converter para índice (1-8 → 0-7)
        float dosageML = nutrient["dosage"].as<float>();
        float durationSec = nutrient["duration"].as<float>();
        int durationMs = (int)(durationSec * 1000);
        
        if (durationMs < 100) durationMs = 100; // Mínimo 100ms
        
        Serial.printf("📦 Web: %s → %.3fml → %dms → Relé %d\n", 
            name.c_str(), dosageML, durationMs, relay + 1);
        
        nutrients[totalNutrients].name = name;
        nutrients[totalNutrients].relay = relay;
        nutrients[totalNutrients].dosageML = dosageML;
        nutrients[totalNutrients].durationMs = durationMs;
        totalNutrients++;
        
        if (totalNutrients >= 6) break; // Máximo 6 nutrientes
    }
    
    if (totalNutrients > 0) {
        // ===== INICIAR PRIMEIRO NUTRIENTE =====
        currentNutrientIndex = 0;
        currentState = DOSING;
        stateStartTime = millis();
        
        SimpleNutrient& first = nutrients[0];
        Serial.printf("🚀 Iniciando PRIMEIRO (Web): %s - %.3fml por %.3fs - Relé %d\n", 
            first.name.c_str(), first.dosageML, first.durationMs / 1000.0, first.relay + 1);
        
        // ===== LIGAR PRIMEIRO RELÉ =====
        relayStates[first.relay] = true;
        bool state = !relayStates[first.relay];
        
        if (first.relay < 7) {
            pcf1.write(first.relay, state);
        } else {
            int pcf2Pin = first.relay - 6;
            pcf2.write(pcf2Pin, state);
        }
        
        String displayMsg = first.name + ": " + String(first.dosageML, 2) + "ml";
        showMessage(displayMsg);
        
        Serial.printf("✅ SISTEMA WEB INICIADO: %d nutrientes, intervalo %ds\n", totalNutrients, intervalSeconds);
    } else {
        Serial.println("❌ Nenhum nutriente válido recebido da web");
        currentState = IDLE;
    }
}

// ===== GERENCIAMENTO DE PROPORÇÕES DINÂMICAS =====

void HydroControl::setNutrientProportions(const String& growRatio, const String& microRatio, 
                                          const String& bloomRatio, const String& calmagRatio) {
    // Definir proporções dos nutrientes baseadas na interface
    dynamicProportions[0] = {"Grow", 2, growRatio.toFloat(), true};     // Relé 3
    dynamicProportions[1] = {"Micro", 3, microRatio.toFloat(), true};   // Relé 4  
    dynamicProportions[2] = {"Bloom", 4, bloomRatio.toFloat(), true};   // Relé 5
    dynamicProportions[3] = {"CalMag", 5, calmagRatio.toFloat(), true}; // Relé 6
    
    activeDynamicNutrients = 4;
    
    Serial.println("✅ Proporções dinâmicas atualizadas:");
    Serial.printf("   Grow: %.1f%%, Micro: %.1f%%, Bloom: %.1f%%, CalMag: %.1f%%\n", 
                  growRatio.toFloat() * 100, microRatio.toFloat() * 100, 
                  bloomRatio.toFloat() * 100, calmagRatio.toFloat() * 100);
}

void HydroControl::updateProportionsFromWeb(JsonArray proportions) {
    activeDynamicNutrients = 0;
    
    for (JsonVariant prop : proportions) {
        if (activeDynamicNutrients >= 6) break;
        
        String name = prop["name"].as<String>();
        int relay = prop["relay"].as<int>() - 1;  // Converter 1-8 para 0-7
        float ratio = prop["ratio"].as<float>();
        
        dynamicProportions[activeDynamicNutrients] = {name, relay, ratio, true};
        activeDynamicNutrients++;
    }
    
    Serial.printf("✅ %d proporções dinâmicas recebidas da web\n", activeDynamicNutrients);
}

void HydroControl::startDynamicSequentialDosage(float totalML, float ecSetpoint, float ecActual) {
    if (currentState != IDLE) {
        Serial.println("⚠️  Sistema já ativo - ignorando nova dosagem dinâmica");
        return;
    }
    
    Serial.println("\n🔄 INICIANDO DOSAGEM SEQUENCIAL DINÂMICA...");
    Serial.printf("💧 Total u(t): %.3f ml\n", totalML);
    
    totalNutrients = 0;
    intervalSeconds = autoECIntervalSeconds;
    
    // ===== USAR PROPORÇÕES DINÂMICAS DA INTERFACE =====
    for (int i = 0; i < activeDynamicNutrients; i++) {
        if (!dynamicProportions[i].active) continue;
        
        float nutDosage = totalML * dynamicProportions[i].ratio;
        float nutTime = nutDosage / ecController.getFlowRate();
        int durationMs = (int)(nutTime * 1000);
        
        if (durationMs < 100) durationMs = 100; // Mínimo 100ms
        
        if (nutDosage > 0.001) {
            nutrients[totalNutrients].name = dynamicProportions[i].name;
            nutrients[totalNutrients].relay = dynamicProportions[i].relay;
            nutrients[totalNutrients].dosageML = nutDosage;
            nutrients[totalNutrients].durationMs = durationMs;
            
            Serial.printf("📝 %s: %.3fml (%.1f%%) → %dms → Relé %d\n", 
                dynamicProportions[i].name.c_str(), nutDosage, 
                dynamicProportions[i].ratio * 100, durationMs, 
                dynamicProportions[i].relay + 1);
            
            totalNutrients++;
        }
    }
    
    if (totalNutrients > 0) {
        // ===== INICIAR PRIMEIRO NUTRIENTE =====
        currentNutrientIndex = 0;
        currentState = DOSING;
        stateStartTime = millis();
        
        SimpleNutrient& first = nutrients[0];
        Serial.printf("🚀 Iniciando PRIMEIRO (Dinâmico): %s - %.3fml por %.3fs - Relé %d\n", 
            first.name.c_str(), first.dosageML, first.durationMs / 1000.0, first.relay + 1);
        
        // ===== LIGAR PRIMEIRO RELÉ =====
        relayStates[first.relay] = true;
        bool state = !relayStates[first.relay];
        
        if (first.relay < 7) {
            pcf1.write(first.relay, state);
        } else {
            int pcf2Pin = first.relay - 6;
            pcf2.write(pcf2Pin, state);
        }
        
        String displayMsg = first.name + ": " + String(first.dosageML, 2) + "ml";
        showMessage(displayMsg);
        
        Serial.printf("✅ SISTEMA DINÂMICO INICIADO: %d nutrientes, intervalo %ds\n", totalNutrients, intervalSeconds);
    } else {
        Serial.println("❌ Nenhuma dosagem dinâmica significativa para executar");
        currentState = IDLE;
    }
}

// ===== FUNÇÕES DE EMERGÊNCIA E CANCELAMENTO =====

void HydroControl::cancelCurrentDosage() {
    if (currentState != IDLE) {
        Serial.println("\n🛑 CANCELANDO DOSAGEM SEQUENCIAL EM ANDAMENTO...");
        Serial.printf("📊 Estado atual: %s\n", 
                      currentState == DOSING ? "DOSING" : 
                      currentState == WAITING ? "WAITING" : "IDLE");
        
        if (currentState == DOSING) {
            // Desligar relé atual imediatamente
            SimpleNutrient& current = nutrients[currentNutrientIndex];
            relayStates[current.relay] = false;
            bool state = !relayStates[current.relay];
            
            if (current.relay < 7) {
                pcf1.write(current.relay, state);
                Serial.printf("🔴 Relé %d CANCELADO (era %s)\n", current.relay + 1, current.name.c_str());
            } else {
                int pcf2Pin = current.relay - 6;
                pcf2.write(pcf2Pin, state);
                Serial.printf("🔴 Relé %d CANCELADO (era %s)\n", current.relay + 1, current.name.c_str());
            }
        }
        
        // Resetar sistema sequencial
        currentState = IDLE;
        totalNutrients = 0;
        currentNutrientIndex = 0;
        stateStartTime = 0;
        
        Serial.println("✅ DOSAGEM CANCELADA - Sistema resetado para IDLE");
    } else {
        Serial.println("ℹ️  Nenhuma dosagem ativa para cancelar");
    }
}

void HydroControl::emergencyStopAllRelays() {
    Serial.println("🚨 PARADA DE EMERGÊNCIA - DESLIGANDO TODOS OS RELÉS");
    
    // Desligar todos os relés imediatamente
    for (int i = 0; i < NUM_RELAYS; i++) {
        relayStates[i] = false;
        startTimes[i] = 0;
        timerSeconds[i] = 0;
        
        // Desligar nos PCF8574s
        if (i < 7) {
            pcf1.write(i, HIGH);  // HIGH = relé desligado
        } else {
            int pcf2Pin = i - 6;
            pcf2.write(pcf2Pin, HIGH);
        }
    }
    
    Serial.println("⚡ Todos os 8 relés foram DESLIGADOS por segurança");
}

bool HydroControl::isDosageActive() const {
    return (currentState != IDLE);
}