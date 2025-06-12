#include <Arduino.h>
#include "HydroControl.h"
#include <WiFi.h>
#include "WebServerManager.h"

// Credenciais WiFi
const char* ssid = "YAGO_2.4";
const char* password = "fox8gqyb34";

// Objetos principais
HydroControl hydroControl;
WebServerManager webServer;

// ===== SISTEMA DE TIMING NÃO-BLOQUEANTE =====
unsigned long lastUpdate = 0;
const unsigned long UPDATE_INTERVAL = 100; // 100ms em vez de 1000ms
unsigned long lastSensorUpdate = 0;
const unsigned long SENSOR_INTERVAL = 250; // Sensores a cada 250ms

// ===== TIMER NÃO-BLOQUEANTE PARA REDUZIR LATÊNCIA =====
unsigned long lastMainUpdate = 0;

void setup() {
    Serial.begin(115200);
    
    // Inicializar o sistema hidropônico
    hydroControl.begin();
    
    // Conectar ao WiFi
    WiFi.begin(ssid, password);
    while (WiFi.status() != WL_CONNECTED) {
        delay(1000);
        Serial.println("Conectando ao WiFi...");
        hydroControl.showMessage("Conectando WiFi..");
    }
    
    Serial.println("Conectado ao WiFi");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
    
    // Mostrar IP no LCD
    hydroControl.showMessage("IP: " + WiFi.localIP().toString());
    delay(2000);

    // Inicializar servidor web
    webServer.begin();
    webServer.setupServer(
        hydroControl.getTemperature(),
        hydroControl.getpH(),
        hydroControl.getTDS(),
        hydroControl.getRelayStates(),
        [](int relay, int seconds) {
            hydroControl.toggleRelay(relay, seconds);
        },
        &hydroControl  // Passar referência do HydroControl
    );

    Serial.println("Sistema inicializado!");
    Serial.println("🚀 LATÊNCIA OTIMIZADA: delay(1000) → millis()");
}

void loop() {
    // ===== SUBSTITUIR delay(1000) POR TIMER NÃO-BLOQUEANTE =====
    unsigned long currentTime = millis();
    
    if (currentTime - lastMainUpdate >= 200) {  // 200ms em vez de 1000ms
        lastMainUpdate = currentTime;
        
        // Atualiza sensores, display e timers dos relés
        hydroControl.update();
    }
    
    // ===== SEM delay(1000) BLOQUEANTE =====
    // Sistema agora responde 5x mais rápido (200ms vs 1000ms)
}