#ifndef WEBSERVERMANAGER_H
#define WEBSERVERMANAGER_H

#include <ESPAsyncWebServer.h>
#include <SPIFFS.h>
#include <ArduinoJson.h>

// Forward declaration
class HydroControl;

class WebServerManager {
public:
    WebServerManager();
    void begin();
    void setupServer(
        float& currentTemp,
        float& currentPH,
        float& currentTDS,
        bool* relayStates,
        void (*callback)(int, int),
        HydroControl* hydroControl = nullptr
    );
    
private:
    AsyncWebServer server;
    void (*relayCallback)(int, int);
    HydroControl* hydroControlRef;
    void initSPIFFS();
};

// ===== FUNÇÃO GLOBAL PARA DOSAGEM SEQUENCIAL =====
void executeDosageSequence(JsonArray distribution, int intervalo, void (*toggleRelay)(int, int));

#endif