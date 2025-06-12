#ifndef HYDROCONTROL_H
#define HYDROCONTROL_H

#include <Arduino.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ArduinoJson.h>
#include "TDSReaderSerial.h"
#include "phSensor.h"
#include "PCF8574.h"
#include "ThingSpeakManager.h"
#include "Controller.h"

// ===== ESTRUTURA PARA CONTROLE SEQUENCIAL DE DOSAGEM =====
struct DosageSchedule {
    String nutrientName;
    int relayIndex;
    float dosageML;
    int durationMs;           // Duração em milissegundos para ALTA PRECISÃO
    bool isActive;
    bool isCompleted;
    unsigned long startTime;
    unsigned long endTime;
};

// ===== SISTEMA SEQUENCIAL SIMPLES (SEM ARRAY) =====
enum SequentialState {
    IDLE,           // Parado
    DOSING,         // Dosando nutriente atual
    WAITING         // Aguardando intervalo
};

struct SimpleNutrient {
    String name;
    int relay;
    float dosageML;
    int durationMs;
};

// ===== PROPORÇÕES DINÂMICAS DA INTERFACE =====
struct NutrientProportion {
    String name;
    int relay;
    float ratio;      // Proporção (0.0 - 1.0)
    bool active;      // Se está ativo na interface
};

class HydroControl {
public:
    HydroControl(); //construtor
    void begin(); //inicializar o sistema   
    void update();  // Atualiza tudo
    void showMessage(String msg); //mostrar mensagens
    
    // Controle dos relés
    void toggleRelay(int relay, int durationMs = 0); //ligar e desligar os relés com duração em ms
    bool* getRelayStates() { return relayStates; } //obter os estados dos relés
    
    // ===== NOVO SISTEMA SEQUENCIAL SIMPLES =====
    void startSimpleSequentialDosage(float totalML, float ecSetpoint, float ecActual);
    void executeWebDosage(JsonArray distribution, int intervalo);
    
    // ===== FUNÇÕES DE COMPATIBILIDADE =====
    void clearDosageQueue();
    void addToDosageQueue(String nutrientName, int relayIndex, float dosageML, int durationMs);
    void processSequentialDosage();
    void activateRelay(int relayIndex, int durationMs);
    void deactivateRelay(int relayIndex);
    bool isAnyRelayActive();
    void logDosageProgress();
    void executeDosageFromWebInterface(JsonArray distribution, int intervalo);
    void scheduleRelay(int relayIndex, int seconds, unsigned long delayMs);
    
    // Getters dos sensores
    float& getTemperature() { return temperature; }
    float& getpH() { return pH; }
    float& getTDS() { return tds; }
    float& getEC() { return ec; }
    
    // Controle automático de EC
    void setECSetpoint(float setpoint) { ecSetpoint = setpoint; }
    float getECSetpoint() const { return ecSetpoint; }
    void enableAutoEC(bool enable) { autoECEnabled = enable; }
    bool isAutoECEnabled() const { return autoECEnabled; }
    void setAutoECInterval(int intervalSeconds) { autoECIntervalSeconds = intervalSeconds; }
    int getAutoECInterval() const { return autoECIntervalSeconds; }
    
    // Configuração do controlador EC
    ECController& getECController() { return ecController; }
    
    // ===== FUNÇÕES PÚBLICAS DE CONTROLE =====
    void setNutrientProportions(const String& growRatio, const String& microRatio, 
                               const String& bloomRatio, const String& calmagRatio);
    void updateProportionsFromWeb(JsonArray proportions);
    void startDynamicSequentialDosage(float totalML, float ecSetpoint, float ecActual);
    
    // ===== FUNÇÕES DE EMERGÊNCIA E CANCELAMENTO =====
    void cancelCurrentDosage();        // Cancelar dosagem em andamento
    void emergencyStopAllRelays();     // Parar todos os relés imediatamente
    void emergencySystemReset();       // 🚨 RESET EMERGENCIAL TOTAL - Para tudo e resetea estados
    bool isDosageActive() const;       // Verificar se há dosagem ativa

private:
    static const int NUM_RELAYS = 8;  // Total de relés
    PCF8574 pcf1;  // Primeiro PCF8574 (0x20)
    PCF8574 pcf2;  // Segundo PCF8574 (0x24)
    
    // Pinos e configurações
    static const int PH_PIN = 35; //pino do pH
    static const int TEMP_PIN = 32; //pino da temperatura
    static const int TDS_PIN = 34; //pino do TDS
    
    // Objetos dos sensores
    LiquidCrystal_I2C lcd; //display
    OneWire oneWire; //sensor de temperatura
    DallasTemperature sensors; //sensor de temperatura
    TDSReaderSerial* tdsSensor; //sensor de TDS
    phSensor* pHSensor; //sensor de pH
    
    // Estados dos relés
    bool relayStates[8];
    unsigned long startTimes[8]; //tempo de início
    int timerSeconds[8]; //tempo de duração
    
    // ===== NOVO SISTEMA SEQUENCIAL SIMPLES =====
    static const int MAX_DOSAGE_QUEUE = 10;
    DosageSchedule dosageQueue[MAX_DOSAGE_QUEUE];
    int currentDosageIndex;
    int totalScheduledDosages;
    bool sequentialDosageActive;
    unsigned long lastSequenceCheck;
    int intervalBetweenDosages; // segundos
    unsigned long intervalStartTime;
    bool waitingInterval;
    
    // ===== SISTEMA SEQUENCIAL SIMPLES (SEM ARRAY) =====
    SequentialState currentState = IDLE;
    SimpleNutrient nutrients[6];  // Máximo 6 nutrientes: Grow, Micro, Bloom, CalMag, pH+, pH-
    int totalNutrients = 0;
    int currentNutrientIndex;
    unsigned long stateStartTime;
    int intervalSeconds;
    
    // Valores dos sensores
    float temperature; //temperatura
    float pH; //pH
    float tds; //TDS
    float ec; //EC
    
    // Controle automático de EC
    ECController ecController;
    float ecSetpoint;
    bool autoECEnabled;
    unsigned long lastECCheck;
    static const unsigned long EC_CHECK_INTERVAL = 30000; // 30 segundos
    int autoECIntervalSeconds;
    
    // ===== PROPORÇÕES DINÂMICAS DA INTERFACE =====
    NutrientProportion dynamicProportions[6]; // Máximo 6 nutrientes
    int activeDynamicNutrients = 4;           // Quantos estão ativos
    
    // Funções internas
    void updateSensors(); //atualizar os sensores
    void updateDisplay(); //atualizar o display
    void checkRelayTimers(); //verificar os relés
    void checkAutoEC(); //verificar controle automático de EC
    
    // ===== FUNÇÃO SIMPLES PARA CONTROLE SEQUENCIAL =====
    void processSimpleSequential(); // Processar máquina de estados simples
    
    ThingSpeakManager thingSpeak;
};

#endif