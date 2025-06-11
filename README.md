# 🌱 Hydro-Controller - Sistema Hidropônico IoT Avançado

[![ESP32](https://img.shields.io/badge/ESP32-Development-blue.svg)](https://github.com/espressif/arduino-esp32)
[![PlatformIO](https://img.shields.io/badge/PlatformIO-Compatible-orange.svg)](https://platformio.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Status](https://img.shields.io/badge/Status-Production%20Ready-brightgreen.svg)]()

## 🚀 **Sistema Hidropônico IoT Completo com Controle Automático EC**

Sistema avançado de automação hidropônica baseado em ESP32 com interface web responsiva, controle automático proporcional de EC, monitoramento em tempo real e dosagem automatizada de nutrientes.

### ✨ **Principais Características**

- 🎛️ **Controle Automático EC** com algoritmo proporcional avançado
- 📊 **Interface Web Moderna** com dashboard em tempo real
- 🧪 **Dosagem Proporcional** de nutrientes automática
- 📡 **Monitoramento de Comunicação** ESP32 ↔ Interface
- 🔄 **Estado Global Sincronizado** entre todos os componentes
- 📈 **Gráficos em Tempo Real** de pH, EC e temperatura
- 🔧 **8 Relés Controlados** via I2C (PCF8574)
- 🌐 **ThingSpeak Integration** para IoT na nuvem

---

## 🏗️ **Arquitetura do Sistema**

```
┌─────────────────────────────────────────────────────────────┐
│                    HYDRO-CONTROLLER                        │
├─────────────────────────────────────────────────────────────┤
│  🌐 Interface Web (React-like)  │  📡 ESP32 Controller      │
│  • Estado Global Sincronizado   │  • Sensores pH/EC/Temp    │
│  • Dashboard Comunicação        │  • 8 Relés I2C           │
│  • Monitoramento Real-time      │  • Controle Automático    │
│  • Dosagem Proporcional         │  • ThingSpeak IoT         │
└─────────────────────────────────────────────────────────────┘
          │                                    │
          ▼                                    ▼
┌─────────────────────┐              ┌─────────────────────┐
│   Frontend (Web)    │◄────HTTP────►│   Backend (ESP32)   │
│                     │              │                     │
│ • HTML5/CSS3        │              │ • C++/Arduino       │
│ • JavaScript ES6+   │              │ • AsyncWebServer    │
│ • Chart.js          │              │ • ArduinoJson       │
│ • Real-time Updates │              │ • Sensor Libraries  │
└─────────────────────┘              └─────────────────────┘
```

---

## 🛠️ **Hardware Necessário**

### **Componentes Principais**
- **ESP32** - Microcontrolador principal
- **2x PCF8574** - Expansores I2C para 8 relés
- **Sensor pH** - Medição de acidez
- **Sensor TDS/EC** - Condutividade elétrica
- **DS18B20** - Sensor de temperatura
- **Display LCD I2C** - Interface local
- **8x Relés 5V** - Controle de bombas

### **Pinagem ESP32**
```cpp
// Sensores
#define PH_PIN      35    // Sensor pH analógico
#define TDS_PIN     34    // Sensor TDS analógico  
#define TEMP_PIN    33    // DS18B20 OneWire

// I2C
#define SDA_PIN     21    // Dados I2C
#define SCL_PIN     22    // Clock I2C

// Endereços I2C
#define LCD_ADDR    0x27  // Display LCD
#define PCF1_ADDR   0x20  // PCF8574 #1 (Relés 1-4)
#define PCF2_ADDR   0x24  // PCF8574 #2 (Relés 5-8)
```

### **Mapeamento de Relés**
| Relé | Função | PCF8574 | Pino |
|------|--------|---------|------|
| 1 | Bomba pH- | PCF1 | P0 |
| 2 | Bomba pH+ | PCF1 | P1 |  
| 3 | Bomba Grow | PCF1 | P2 |
| 4 | Bomba Micro | PCF1 | P3 |
| 5 | Bomba Bloom | PCF2 | P0 |
| 6 | Bomba CalMag | PCF2 | P1 |
| 7 | Luz UV | PCF2 | P2 |
| 8 | Aerador | PCF2 | P3 |

---

## 🧮 **Algoritmo de Controle EC**

### **Equação Proporcional**
```
u(t) = (V / k × q) × e

Onde:
• u(t) = Volume de dosagem (ml)
• V = Volume do reservatório (L)  
• k = Fator de concentração (EC_base / ml_por_litro_total)
• q = Taxa de vazão da bomba (ml/s)
• e = Erro (EC_setpoint - EC_atual)
```

### **Distribuição Proporcional Automática**
- **Grow**: 35% da dosagem total
- **Micro**: 35% da dosagem total  
- **Bloom**: 25% da dosagem total
- **CalMag**: 5% da dosagem total

---

## 🚀 **Instalação e Configuração**

### **1. Preparar Ambiente**
```bash
# Instalar PlatformIO
pip install platformio

# Clonar repositório
git clone https://github.com/yhanusleverage/Hydro-Controller.git
cd Hydro-Controller
```

### **2. Configurar Hardware**
- Conectar ESP32 conforme pinagem
- Instalar sensores e relés
- Configurar rede WiFi no código

### **3. Compilar e Upload**
```bash
# Compilar projeto
pio run

# Upload para ESP32
pio run --target upload

# Upload sistema de arquivos (interface web)
pio run --target uploadfs

# Monitor serial
pio device monitor
```

### **4. Configuração WiFi**
```cpp
// Em main.cpp, configure sua rede:
const char* ssid = "SUA_REDE_WIFI";
const char* password = "SUA_SENHA_WIFI";
```

---

## 🌐 **Interface Web - Funcionalidades**

### **📊 Dashboard Principal**
- Monitoramento em tempo real de pH, EC, TDS e temperatura
- Gráficos interativos com histórico de 30 pontos
- Status de conexão WiFi e timestamp

### **🎛️ Controle Automático EC**
- Configuração de parâmetros do controlador
- Equação proporcional visual com cálculos em tempo real
- Ativação/desativação do controle automático
- Status do erro atual e última dosagem

### **🧪 Plano Nutricional Integrado**
- Tabela editável de nutrientes (ml/L)
- Cálculo automático de quantidades e tempos
- Execução manual ou automática
- Sincronização com controle EC

### **📡 Dashboard de Comunicação**
- **Monitor em tempo real** de todas as comunicações ESP32
- **Log detalhado** com filtros e timestamps
- **Status de conexão** e estatísticas
- **Resumo de dados** enviados ao backend
- **Teste de conectividade** automático

---

## 🔧 **Funcionalidades Avançadas**

### **Estado Global Sincronizado**
```javascript
const globalState = {
    system: {
        volume: 100,
        flowRate: 0.974,
        baseDose: 1525,
        ecSetpoint: 1200,
        totalMlPorLitro: 0
    },
    nutrition: { /* configurações nutrientes */ },
    control: { /* status automação */ }
};
```

### **Interceptação de Comunicações**
- Todas as requisições são monitoradas automaticamente
- Logs detalhados com tempo de resposta
- Detecção automática de falhas
- Reconexão inteligente

### **Dosagem Proporcional Inteligente**
- Cálculo baseado no erro atual de EC
- Distribuição automática entre nutrientes
- Execução sequencial com intervalos configuráveis
- Feedback visual em tempo real

---

## 📡 **API Endpoints ESP32**

### **Sensores**
```http
GET /sensors
Response: {
  "temperature": 22.5,
  "ph": 6.2,
  "tds": 850,
  "ec": 1700,
  "rssi": -45,
  "relayStates": [false, true, ...]
}
```

### **Controle EC**
```http
POST /ec-config
Body: {
  "baseDose": 1525,
  "flowRate": 0.974,
  "volume": 100,
  "totalMl": 7.5
}

POST /ec-control  
Body: {
  "setpoint": 1200,
  "autoEnabled": true
}
```

### **Dosagem Proporcional**
```http
POST /dosagem-proporcional
Body: {
  "totalUt": 2.67,
  "distribution": [
    {
      "nutriente": "Grow",
      "relay": 3,
      "utNutriente": 1.07,
      "tempoDosagem": 1.1
    }
  ],
  "intervalo": 5
}
```

### **Controle de Relés**
```http
GET /toggle1?seconds=10    # Liga relé 1 por 10 segundos
POST /relay               # Controle avançado
Body: {
  "relay": 3,
  "state": 1,
  "duration": 5000
}
```

---

## 📊 **Monitoramento e Logs**

### **Logs do ESP32**
```
🌱 SISTEMA HIDROPÔNICO IoT INICIALIZADO COM SUCESSO!
📋 COMPONENTES ATIVOS:
  ✅ ESP32 Controller
  ✅ Display LCD I2C (0x27)  
  ✅ PCF8574 #1 (0x20) - Relés 1-4
  ✅ PCF8574 #2 (0x24) - Relés 5-8
  ✅ Sensor DS18B20 (Temperatura)
  ✅ Sensor pH
  ✅ Sensor TDS/EC
  ✅ ThingSpeak IoT
```

### **Ver Logs em Tempo Real**
Consulte [COMO_VER_LOGS.md](COMO_VER_LOGS.md) para instruções detalhadas sobre:
- Browser Developer Console (F12)
- Arduino IDE Serial Monitor
- PlatformIO Monitor  
- Putty para Windows

---

## 🔄 **Fluxo de Operação**

### **Modo Automático**
1. **Sensores** coletam dados a cada 5 segundos
2. **Controller EC** verifica se ajuste é necessário (±50µS/cm tolerância)  
3. **Algoritmo** calcula dosagem usando equação proporcional
4. **Distribuição** automática entre nutrientes (35% Grow, 35% Micro, 25% Bloom, 5% CalMag)
5. **Execução** sequencial com intervalos configuráveis
6. **Feedback** visual e logs detalhados

### **Modo Manual**
1. **Usuário** configura parâmetros na interface
2. **Sistema** calcula u(t) em tempo real
3. **Botão** "Executar Dosagem Proporcional" disponível
4. **Confirmação** com preview da distribuição
5. **Execução** no ESP32 com feedback visual

---

## 🛡️ **Recursos de Segurança**

- **Validação de parâmetros** antes do envio
- **Timeout de comunicação** com recuperação automática
- **Limitações de dosagem** (máximo 10ml por ciclo)
- **Logs completos** de todas as operações
- **Estado de emergência** para interrupção manual

---

## 🌍 **Integração IoT**

### **ThingSpeak**
- Upload automático de dados dos sensores
- Dashboards online para monitoramento remoto
- Histórico de dados na nuvem
- Alertas e notificações

### **WiFi**
- Reconexão automática
- Indicador de força do sinal
- Status de conectividade em tempo real

---

## 🔧 **Desenvolvimento**

### **Estrutura do Projeto**
```
Hydro-Controller/
├── src/                    # Código fonte ESP32
│   ├── main.cpp           # Programa principal
│   ├── HydroControl.cpp   # Controle principal
│   ├── WebServerManager.cpp # Servidor web
│   ├── Controller.cpp     # Algoritmo EC
│   └── [sensores].cpp     # Bibliotecas sensores
├── include/               # Headers (.h)
├── data/                  # Interface web
│   ├── index.html        # Página principal
│   ├── style.css         # Estilos modernos  
│   └── script.js         # Lógica JavaScript
├── platformio.ini        # Configuração PlatformIO
└── README.md            # Documentação
```

### **Bibliotecas Utilizadas**
```ini
lib_deps =
    AsyncTCP @ ^1.1.1
    ESP Async WebServer @ ^1.2.3
    DallasTemperature
    OneWire  
    LiquidCrystal_I2C @ ^1.1.4
    PCF8574 @ ^0.3.9
    ThingSpeak @ ^2.0.0
    ArduinoJson @ ^6.21.3
```

---

## 🤝 **Contribuindo**

1. **Fork** o projeto
2. **Crie** uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. **Commit** suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. **Push** para a branch (`git push origin feature/AmazingFeature`)
5. **Abra** um Pull Request

---

## 📝 **Changelog**

### **v4.0 - Sistema Integrado Completo**
- ✅ Controle automático EC com algoritmo proporcional
- ✅ Interface web moderna com estado global sincronizado
- ✅ Dashboard de comunicação em tempo real  
- ✅ Dosagem proporcional automática
- ✅ Sistema de logs avançado
- ✅ Integração completa frontend ↔ backend

### **Funcionalidades Implementadas**
- 🎛️ Controle automático EC baseado em erro proporcional
- 🧪 Dosagem sequencial de nutrientes com intervalos
- 📊 Interface reativa com Chart.js
- 📡 Monitoramento de comunicação ESP32
- 🔄 Estado global sincronizado
- 📈 Gráficos em tempo real
- 🌐 ThingSpeak IoT integration
- 🔧 8 relés I2C controlados

---

## 📄 **Licença**

Este projeto está licenciado sob a Licença MIT - veja o arquivo [LICENSE](LICENSE) para detalhes.

---

## 👥 **Autores**

- **Equipe de Desenvolvimento** - *Desenvolvimento e Implementação* - [yhanusleverage](https://github.com/yhanusleverage)

---

## 🙏 **Agradecimentos**

- Comunidade ESP32 e Arduino
- Bibliotecas open source utilizadas
- Contribuidores e testadores do projeto

---

## 📞 **Suporte**

Para dúvidas, sugestões ou problemas:
- **Issues**: [GitHub Issues](https://github.com/yhanusleverage/Hydro-Controller/issues)
- **Documentação**: [Wiki do Projeto](https://github.com/yhanusleverage/Hydro-Controller/wiki)

---

**🌱 Hidroponia inteligente para o futuro da agricultura! 🚀**
