#include "WebServerManager.h"
#include "HydroControl.h"
#include <SPIFFS.h>

WebServerManager::WebServerManager() : server(80), hydroControlRef(nullptr) {}

void WebServerManager::begin() {
    initSPIFFS();
    server.begin();
}

void WebServerManager::initSPIFFS() {
    if (!SPIFFS.begin(true)) {
        Serial.println("Erro ao montar SPIFFS");
        return;
    }
    Serial.println("SPIFFS montado com sucesso");
    
    // Debug: listar arquivos
    File root = SPIFFS.open("/");
    File file = root.openNextFile();
    while(file) {
        Serial.printf("Arquivo: %s\n", file.name());
        file = root.openNextFile();
    }
}

void WebServerManager::setupServer(float& currentTemp, float& currentPH, float& currentTDS,
                                 bool* relayStates, void (*toggleRelay)(int, int), HydroControl* hydroControl) {
    hydroControlRef = hydroControl;
    
    // Rota principal
    server.on("/", HTTP_GET, [](AsyncWebServerRequest *request){
        request->send(SPIFFS, "/index.html", "text/html");
    });

    // Rotas para arquivos estáticos
    server.on("/style.css", HTTP_GET, [](AsyncWebServerRequest *request){
        request->send(SPIFFS, "/style.css", "text/css");
    });

    server.on("/script.js", HTTP_GET, [](AsyncWebServerRequest *request){
        request->send(SPIFFS, "/script.js", "text/javascript");
    });

    // Rota para dados dos sensores
    server.on("/sensors", HTTP_GET, [&currentTemp, &currentPH, &currentTDS, relayStates]
    (AsyncWebServerRequest *request){
        String json = "{";
        json += "\"temperature\":" + String(currentTemp, 1) + ",";
        json += "\"ph\":" + String(currentPH, 2) + ",";
        json += "\"tds\":" + String(currentTDS, 0) + ",";
        json += "\"ec\":" + String(currentTDS * 2, 0) + ",";
        json += "\"rssi\":" + String(WiFi.RSSI()) + ",";
        json += "\"relayStates\":[";
        for(int i = 0; i < 8; i++) {
            json += relayStates[i] ? "true" : "false";
            if(i < 7) json += ",";
        }
        json += "]}";
        request->send(200, "application/json", json);
    });

    // Rotas para controle dos relés
    for(int i = 0; i < 8; i++) {
        String path = "/toggle" + String(i + 1);
        server.on(path.c_str(), HTTP_GET, [i, toggleRelay](AsyncWebServerRequest *request){
            int seconds = 0;
            if(request->hasParam("seconds")) {
                seconds = request->getParam("seconds")->value().toInt();
            }
            toggleRelay(i, seconds);
            request->send(200, "text/plain", "OK");
        });
    }

    // ===== NOVA ROTA UNIFICADA PARA RELÉS =====
    server.on("/relay", HTTP_POST, [](AsyncWebServerRequest *request){
        request->send(200, "text/plain", "OK");
    }, NULL, [toggleRelay](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
        DynamicJsonDocument doc(1024);
        deserializeJson(doc, data, len);
        
        int relay = doc["relay"].as<int>();
        int state = doc["state"].as<int>();
        int duration = doc["duration"].as<int>(); // em milissegundos
        
        Serial.printf("📡 Comando relé recebido: Relé %d, Estado %d, Duração %dms\n", relay, state, duration);
        
        if (relay >= 1 && relay <= 8) {
            if (duration > 0) {
                // Converter milissegundos para segundos
                int seconds = duration / 1000;
                if (seconds < 1) seconds = 1; // Mínimo 1 segundo
                
                toggleRelay(relay - 1, seconds); // toggleRelay usa índice 0-7
                Serial.printf("✅ Relé %d ativado por %d segundos\n", relay, seconds);
            } else {
                toggleRelay(relay - 1, 0); // Toggle simples
                Serial.printf("✅ Relé %d alternado\n", relay);
            }
        } else {
            Serial.printf("❌ Relé inválido: %d\n", relay);
        }
    });

    // ===== ROTA DOSAGEM PROPORCIONAL COMENTADA - NÃO FUNCIONAL =====
    /*
    server.on("/dosagem-proporcional", HTTP_POST, [](AsyncWebServerRequest *request){
        request->send(200, "text/plain", "OK");
    }, NULL, [this, toggleRelay](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
        if (!hydroControlRef) {
            Serial.println("❌ HydroControl não disponível para dosagem proporcional");
            return;
        }
        
        DynamicJsonDocument doc(2048);
        deserializeJson(doc, data, len);
        
        float totalUt = doc["totalUt"].as<float>();
        JsonArray distribution = doc["distribution"].as<JsonArray>();
        int intervalo = doc["intervalo"].as<int>(); // segundos entre nutrientes
        
        Serial.println("\n" + String('#', 80));
        Serial.println("🚀 DOSAGEM PROPORCIONAL RECEBIDA DA INTERFACE WEB");
        Serial.println(String('#', 80));
        Serial.printf("💧 Total u(t): %.3f ml\n", totalUt);
        Serial.printf("🔄 Intervalo entre nutrientes: %d segundos\n", intervalo);
        Serial.printf("📊 Número de nutrientes: %d\n", distribution.size());
        Serial.println(String('-', 80));
        
        // Log detalhado da distribuição recebida com ALTA PRECISÃO
        for (JsonVariant item : distribution) {
            String nutriente = item["nutriente"].as<String>();
            int relay = item["relay"].as<int>();
            float mlPorLitro = item["mlPorLitro"].as<float>();
            float proporcao = item["proporcao"].as<float>();
            float utNutriente = item["utNutriente"].as<float>();
            float tempoDosagem = item["tempoDosagem"].as<float>();
            
            Serial.printf("🧪 %s: %.3fml/L (%.1f%%) → %.3fml → %.3fs → Relé %d\n", 
                nutriente.c_str(), mlPorLitro, proporcao * 100, utNutriente, tempoDosagem, relay);
        }
        
        Serial.println(String('-', 80));
        Serial.println("⚙️  INICIANDO SISTEMA SEQUENCIAL NO ESP32...");
        Serial.println(String('#', 80) + "\n");
        
        // ===== USAR NOVO SISTEMA SEQUENCIAL =====
        hydroControlRef->executeWebDosage(distribution, intervalo);
    });
    */

    // Rota para configurar parâmetros do controlador EC
    server.on("/ec-config", HTTP_POST, [this](AsyncWebServerRequest *request){
        request->send(200, "text/plain", "OK");
    }, NULL, [this](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
        if (hydroControlRef) {
            DynamicJsonDocument doc(1024);
            deserializeJson(doc, data, len);
            
            float baseDose = doc["baseDose"].as<float>();
            float flowRate = doc["flowRate"].as<float>();
            float volume = doc["volume"].as<float>();
            float totalMl = doc["totalMl"].as<float>();
            int intervaloAutoEC = doc["intervaloAutoEC"].as<int>(); // Novo parâmetro
            
            // ===== MENSAGEM DETALHADA NO SERIAL =====
            Serial.println("\n" + String('=', 80));
            Serial.println("📊 PARÂMETROS EC RECEBIDOS DA INTERFACE WEB (ALTA PRECISÃO)");
            Serial.println(String('=', 80));
            Serial.printf("• 📊 Base Dose: %.6f µS/cm\n", baseDose);
            Serial.printf("• 💧 Flow Rate: %.6f ml/s\n", flowRate);
            Serial.printf("• 🪣 Volume: %.3f L\n", volume);
            Serial.printf("• 🧪 Total ML (soma ml/L): %.6f ml/L\n", totalMl);
            Serial.printf("• ⏱️  Intervalo Auto EC: %d segundos\n", intervaloAutoEC);
            Serial.println(String('-', 80));
            
            // Calcular k para mostrar
            float k = totalMl > 0 ? baseDose / totalMl : 0;
            Serial.printf("⚡ Fator k calculado: %.6f (ALTA PRECISÃO)\n", k);
            Serial.printf("⚡ Inverso flowRate: %.6f s/ml\n", (1.0 / flowRate));
            Serial.printf("⚡ k × flowRate: %.6f µS/cm por segundo\n", (k * flowRate));
            
            // Configurar no controlador
            hydroControlRef->getECController().setParameters(baseDose, flowRate, volume, totalMl);
            
            // ===== CONFIGURAR INTERVALO NO SISTEMA SEQUENCIAL =====
            // Método temporário - depois criar setter específico
            hydroControlRef->setAutoECInterval(intervaloAutoEC);
            
            Serial.println("✅ PARÂMETROS CONFIGURADOS NO CONTROLLER ESP32");
            Serial.println(String('-', 80));
            
            // Testar cálculo com valores atuais
            float ecAtual = hydroControlRef->getEC();
            float ecSetpoint = hydroControlRef->getECSetpoint();
            float error = ecSetpoint - ecAtual;
            float utResult = hydroControlRef->getECController().calculateDosage(ecSetpoint, ecAtual);
            float dosageTime = hydroControlRef->getECController().calculateDosageTime(utResult);
            
            Serial.println("🧮 TESTE DE CÁLCULO COM NOVOS PARÂMETROS (ALTA PRECISÃO):");
            Serial.printf("• EC Atual: %.1f µS/cm\n", ecAtual);
            Serial.printf("• EC Setpoint: %.1f µS/cm\n", ecSetpoint);
            Serial.printf("• Erro: %.1f µS/cm\n", error);
            Serial.printf("• Equação: u(t) = (%.3f / %.6f × %.6f) × %.1f\n", volume, k, flowRate, error);
            Serial.printf("• Resultado u(t): %.6f ml\n", utResult);
            Serial.printf("• Tempo dosagem: %.6f segundos\n", dosageTime);
            Serial.printf("• Ganho físico: %.3f µS/cm\n", ((k * utResult) / volume));
            Serial.println(String('=', 80));
            Serial.println("💾 PARÂMETROS EC SALVOS COM SUCESSO!");
            Serial.println(String('=', 80) + "\n");
            
        } else {
            Serial.println("❌ ERRO: HydroControl não disponível para salvar parâmetros");
        }
    });

    // Rota para configurar setpoint e ativar/desativar controle automático
    server.on("/ec-control", HTTP_POST, [this](AsyncWebServerRequest *request){
        request->send(200, "text/plain", "OK");
    }, NULL, [this](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
        if (hydroControlRef) {
            DynamicJsonDocument doc(1024);
            deserializeJson(doc, data, len);
            
            float setpoint = doc["setpoint"].as<float>();
            bool autoEnabled = doc["autoEnabled"].as<bool>();
            
            // ===== MENSAGEM DETALHADA NO SERIAL =====
            Serial.println("\n" + String('=', 60));
            Serial.println("🎯 CONTROLE AUTOMÁTICO EC ALTERADO");
            Serial.println(String('=', 60));
            Serial.printf("• EC Setpoint: %.0f µS/cm\n", setpoint);
            Serial.printf("• Auto EC: %s\n", autoEnabled ? "✅ ATIVADO" : "❌ DESATIVADO");
            
            hydroControlRef->setECSetpoint(setpoint);
            hydroControlRef->enableAutoEC(autoEnabled);
            
            if (autoEnabled) {
                float ecAtual = hydroControlRef->getEC();
                float error = setpoint - ecAtual;
                Serial.println(String('-', 60));
                Serial.println("📊 STATUS ATUAL:");
                Serial.printf("• EC Atual: %.1f µS/cm\n", ecAtual);
                Serial.printf("• Erro: %.1f µS/cm\n", error);
                Serial.printf("• Tolerância: ±50 µS/cm\n");
                
                if (abs(error) > 50) {
                    Serial.println("⚠️  AJUSTE NECESSÁRIO - Controle iniciará dosagem automática");
                } else {
                    Serial.println("✅ EC DENTRO DA TOLERÂNCIA - Sem dosagem necessária");
                }
            }
            
            Serial.println(String('=', 60));
            Serial.printf("🔧 SISTEMA: Auto EC %s\n", autoEnabled ? "ATIVO" : "INATIVO");
            Serial.println(String('=', 60) + "\n");
            
        } else {
            Serial.println("❌ ERRO: HydroControl não disponível para controle EC");
        }
    });

    // Rota para obter status do controle EC
    server.on("/ec-status", HTTP_GET, [this](AsyncWebServerRequest *request){
        if (hydroControlRef) {
            String json = "{";
            json += "\"setpoint\":" + String(hydroControlRef->getECSetpoint(), 0) + ",";
            json += "\"autoEnabled\":" + String(hydroControlRef->isAutoECEnabled() ? "true" : "false") + ",";
            json += "\"baseDose\":" + String(hydroControlRef->getECController().getBaseDose(), 1) + ",";
            json += "\"flowRate\":" + String(hydroControlRef->getECController().getFlowRate(), 3) + ",";
            json += "\"volume\":" + String(hydroControlRef->getECController().getVolume(), 1) + ",";
            json += "\"totalMl\":" + String(hydroControlRef->getECController().getTotalMl(), 1);
            json += "}";
            request->send(200, "application/json", json);
        } else {
            request->send(500, "text/plain", "HydroControl not available");
        }
    });

    // Nova rota para calibrar a taxa de dosagem
    server.on("/calibrar", HTTP_POST, [](AsyncWebServerRequest *request){
        request->send(200, "text/plain", "OK");
    }, NULL, [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
        DynamicJsonDocument doc(1024);
        deserializeJson(doc, data, len);
        
        float taxaDosagem = doc["taxa"].as<float>();
        Serial.printf("Taxa de dosagem calibrada: %.2f ml/segundo\n", taxaDosagem);
    });
    
    // Nova rota para calcular u(t) usando o controller real
    server.on("/ec-calculate", HTTP_POST, [this](AsyncWebServerRequest *request){
        request->send(200, "text/plain", "OK");
    }, NULL, [this](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
        if (hydroControlRef) {
            DynamicJsonDocument doc(1024);
            deserializeJson(doc, data, len);
            
            // Receber parâmetros da interface
            float baseDose = doc["baseDose"].as<float>();
            float flowRate = doc["flowRate"].as<float>();
            float volume = doc["volume"].as<float>();
            float totalMlPorLitro = doc["totalMlPorLitro"].as<float>();
            float ecSetpoint = doc["ecSetpoint"].as<float>();
            
            // Configurar parâmetros no controller
            hydroControlRef->getECController().setParameters(baseDose, flowRate, volume, totalMlPorLitro);
            
            // Obter EC atual dos sensores
            float ecAtual = hydroControlRef->getEC();
            
            // Calcular erro (o controller faz isso internamente)
            float error = ecSetpoint - ecAtual;
            
            // Usar o controller real para calcular u(t)
            float utResult = hydroControlRef->getECController().calculateDosage(ecSetpoint, ecAtual);
            
            // Calcular tempo de dosagem
            float dosageTime = hydroControlRef->getECController().calculateDosageTime(utResult);
            
            // Calcular k para informação
            float k = totalMlPorLitro > 0 ? baseDose / totalMlPorLitro : 0;
            
            // ===== CORREÇÃO: CALCULAR TEMPO CORRETAMENTE =====
            float flowRateMLperS = 1.0 / flowRate;  // 1/1.027 = 0.974 ml/s
            float flowRateSperML = flowRate;         // 1.027 s/ml
            float tempoSegundos = utResult * flowRateSperML;  // Tempo = u(t) × s/ml
            
            // Preparar resposta JSON
            String response = "{";
            response += "\"utResult\":" + String(utResult, 3) + ",";
            response += "\"dosageTime\":" + String(dosageTime, 2) + ",";
            response += "\"error\":" + String(error, 1) + ",";
            response += "\"k\":" + String(k, 3) + ",";
            response += "\"ecAtual\":" + String(ecAtual, 1) + ",";
            response += "\"ecSetpoint\":" + String(ecSetpoint, 1) + ",";
            response += "\"baseDose\":" + String(baseDose, 1) + ",";
            response += "\"flowRate\":" + String(flowRate, 3) + ",";
            response += "\"volume\":" + String(volume, 1) + ",";
            response += "\"totalMlPorLitro\":" + String(totalMlPorLitro, 1);
            response += "}";
            
            // ===== DEBUG SERIAL COMPLETO COM AMBOS OS VALORES =====
            Serial.printf("=== CÁLCULO EC CONTROLLER (COMPLETO) ===\n");
            Serial.printf("📐 Equação: u(t) = (V / k × q) × e\n");
            Serial.printf("📊 Parâmetros: V=%.1fL, k=%.3f\n", volume, k);
            Serial.printf("🎯 EC Atual: %.1f µS/cm\n", ecAtual);
            Serial.printf("🎯 EC Setpoint: %.1f µS/cm\n", ecSetpoint);
            Serial.printf("📏 Erro (e): %.1f µS/cm\n", error);
            Serial.printf("💧 u(t) VOLUME a dosar: %.3f ml\n", utResult);
            Serial.printf("⏱️  Tempo de dosagem: %.3f segundos\n", tempoSegundos);
            Serial.printf("🔄 Vazão peristáltica: %.3f ml/s | %.3f s/ml\n", flowRateMLperS, flowRateSperML);
            Serial.printf("🧮 Cálculo: %.3f ml × %.3f s/ml = %.3f s\n", utResult, flowRateSperML, tempoSegundos);
            Serial.printf("⚡ Ganho físico previsto: %.1f µS/cm\n", ((k * utResult) / volume));
            Serial.printf("==========================================\n");
            
            // Enviar resposta
            AsyncWebServerResponse *jsonResponse = request->beginResponse(200, "application/json", response);
            jsonResponse->addHeader("Access-Control-Allow-Origin", "*");
            request->send(jsonResponse);
        } else {
            request->send(500, "text/plain", "HydroControl not available");
        }
    });

    // ===== ROTA PARA RECEBER PROPORÇÕES DINÂMICAS =====
    server.on("/nutrient-proportions", HTTP_POST, [](AsyncWebServerRequest *request){
        request->send(200, "text/plain", "OK");
    }, NULL, [this](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
        if (!hydroControlRef) {
            Serial.println("❌ HydroControl não disponível para proporções");
            return;
        }
        
        DynamicJsonDocument doc(1024);
        deserializeJson(doc, data, len);
        
        // Extrair proporções individuais
        float growRatio = doc["grow"].as<float>();
        float microRatio = doc["micro"].as<float>();
        float bloomRatio = doc["bloom"].as<float>();
        float calmagRatio = doc["calmag"].as<float>();
        
        Serial.println("\n📊 PROPORÇÕES RECEBIDAS DA INTERFACE:");
        Serial.printf("   Grow: %.3f (%.1f%%)\n", growRatio, growRatio * 100);
        Serial.printf("   Micro: %.3f (%.1f%%)\n", microRatio, microRatio * 100);
        Serial.printf("   Bloom: %.3f (%.1f%%)\n", bloomRatio, bloomRatio * 100);
        Serial.printf("   CalMag: %.3f (%.1f%%)\n", calmagRatio, calmagRatio * 100);
        
        // Atualizar proporções no HydroControl
        hydroControlRef->setNutrientProportions(
            String(growRatio, 3), String(microRatio, 3), 
            String(bloomRatio, 3), String(calmagRatio, 3)
        );
    });

    // ===== ROTA PARA CANCELAR AUTO EC =====
    server.on("/cancel-auto-ec", HTTP_POST, [](AsyncWebServerRequest *request){
        request->send(200, "text/plain", "OK");
    }, NULL, [this](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
        if (!hydroControlRef) {
            Serial.println("❌ HydroControl não disponível para cancelar Auto EC");
            return;
        }
        
        Serial.println("\n" + String('!', 80));
        Serial.println("🛑 CANCELAMENTO AUTO EC SOLICITADO PELA INTERFACE");
        Serial.println(String('!', 80));
        
        // 1. Desativar controle automático
        hydroControlRef->enableAutoEC(false);
        Serial.println("❌ Auto EC DESATIVADO");
        
        // 2. Cancelar dosagem sequencial em andamento
        hydroControlRef->cancelCurrentDosage();
        Serial.println("🛑 Dosagem sequencial CANCELADA");
        
        // 3. Desligar todos os relés por segurança
        hydroControlRef->emergencyStopAllRelays();
        Serial.println("⚡ Todos os relés DESLIGADOS por segurança");
        
        Serial.println(String('-', 80));
        Serial.println("✅ CANCELAMENTO COMPLETO - SISTEMA PARADO");
        Serial.println("📊 Status: Auto EC desativado, dosagem parada, relés desligados");
        Serial.println(String('!', 80) + "\n");
        
        // Mostrar no display
        hydroControlRef->showMessage("Auto EC Cancelado!");
    });

    // ===== 🚨 ROTA PARA RESET EMERGENCIAL TOTAL =====
    server.on("/emergency-reset", HTTP_POST, [](AsyncWebServerRequest *request){
        request->send(200, "text/plain", "EMERGENCY RESET EXECUTED");
    }, NULL, [this](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
        if (!hydroControlRef) {
            Serial.println("❌ HydroControl não disponível para RESET EMERGENCIAL");
            return;
        }
        
        Serial.println("\n🚨 EMERGÊNCIA TOTAL SOLICITADA PELA INTERFACE WEB 🚨");
        
        // EXECUTAR RESET EMERGENCIAL TOTAL
        hydroControlRef->emergencySystemReset();
        
        Serial.println("✅ RESET EMERGENCIAL EXECUTADO VIA WEB INTERFACE");
    });

    Serial.println("Servidor HTTP iniciado");
}

// Função removed: executeDosageSequence - agora implementada no HydroControl como sistema sequencial