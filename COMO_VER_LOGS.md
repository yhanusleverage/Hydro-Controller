# 🔍 COMO VER OS LOGS DO SISTEMA HIDROPÔNICO

## 📱 **LOGS NA INTERFACE WEB (Navegador)**

### **1. Abrir Console do Navegador:**

#### **Chrome/Edge/Brave:**
- Pressione `F12` OU
- `Ctrl+Shift+I` OU
- Botão direito → "Inspecionar" → aba "Console"

#### **Firefox:**
- Pressione `F12` OU
- `Ctrl+Shift+K` OU
- Menu → "Desenvolvedor" → "Console Web"

#### **Safari (Mac):**
- `Cmd+Option+I` OU
- Menu "Desenvolver" → "Mostrar Console Web"

### **2. O que você verá no Console:**

```
🧮 Iniciando cálculo de quantidades e tempos...
📊 Parâmetros base: Volume=100L, Taxa=0.974ml/s
🧪 Grow: 2.0ml/L → 200.0ml → 205.3s
🧪 Micro: 2.0ml/L → 200.0ml → 205.3s
✅ Tempo total atualizado na interface: 847.2s
🔄 Campo total-ml atualizado: 8.0 → 8.1
📡 Evento 'input' disparado para total-ml
✅ Cálculo de quantidades e tempos concluído
```

### **3. Tipos de Logs:**
- 🧮 = Cálculos
- 📊 = Dados/Parâmetros
- ✅ = Sucesso
- ❌ = Erro
- ⚠️ = Aviso
- 🔄 = Processamento
- 💾 = Salvamento

---

## 🔌 **LOGS NO ESP32 (Serial Monitor)**

### **1. Como Conectar:**

#### **Arduino IDE:**
1. Abra Arduino IDE
2. Menu `Tools` → `Serial Monitor`
3. Configure para `115200 baud`
4. Conecte o ESP32 via USB

#### **PlatformIO:**
1. Terminal integrado do VSCode
2. Execute: `pio device monitor`
3. Ou clique no ícone 🔌 "Serial Monitor"

#### **Putty/Terminal:**
1. Identifique a porta COM (ex: COM3)
2. Configure: 115200 baud, 8-N-1
3. Conecte à porta

### **2. O que você verá no Serial:**

#### **Na Inicialização:**
```
################################################################################
🌱 SISTEMA HIDROPÔNICO IoT INICIALIZADO COM SUCESSO!
################################################################################
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

#### **Quando Salvar Parâmetros:**
```
================================================================================
📊 PARÂMETROS EC RECEBIDOS DA INTERFACE WEB
================================================================================
• 📊 Base Dose: 1525.0 µS/cm
• 💧 Flow Rate: 0.974 ml/s
• 🪣 Volume: 100.0 L
• 🧪 Total ML (soma ml/L): 8.1 ml/L
--------------------------------------------------------------------------------
⚡ Fator k calculado: 188.271
✅ PARÂMETROS CONFIGURADOS NO CONTROLLER ESP32
```

#### **Quando Auto EC Ativar:**
```
**********************************************************************
🤖 DOSAGEM AUTOMÁTICA EC INICIADA
**********************************************************************
📊 EC Atual: 1150 µS/cm
🎯 EC Setpoint: 1200 µS/cm
⚡ Erro: 50 µS/cm
----------------------------------------------------------------------
💧 Dosagem calculada: 2.67 ml
⏱️  Tempo de dosagem: 2.7 segundos
🔧 Relé usado: 3 (Bomba A)
----------------------------------------------------------------------
⚙️  EXECUTANDO DOSAGEM...
✅ COMANDO ENVIADO PARA RELÉ
```

### **3. Status dos Sensores (a cada 5 segundos):**
```
=== Status do Sistema ===
Temperatura: 22.5°C
pH: 6.20
TDS: 575 ppm
EC: 1150 uS/cm
Estado dos Relés:
Relé 1: OFF
Relé 2: OFF
Relé 3: OFF
=====================
```

---

## 🛠️ **DICAS DE TROUBLESHOOTING**

### **Console Web não mostra logs:**
1. Verifique se está na aba "Console"
2. Limpe o cache do navegador (Ctrl+Shift+R)
3. Recarregue a página

### **Serial Monitor não conecta:**
1. Verifique se a porta COM está correta
2. Feche outros programas que usam a porta
3. Verifique se o baud rate é 115200
4. Pressione o botão RESET no ESP32

### **Logs aparecem "estranhos":**
1. Configure encoding para UTF-8
2. Verifique se o baud rate está correto
3. Limpe o buffer do serial

---

## 📚 **INTERPRETANDO OS LOGS**

### **Cálculo de u(t):**
```
Equação: u(t) = (V / k × q) × e
Onde:
- V = Volume do reservatório (L)
- k = Fator EC (Base Dose ÷ Soma ml/L)
- q = Taxa de vazão (ml/s)
- e = Erro EC (Setpoint - Atual)
```

### **Estados do Sistema:**
- `Auto EC: ATIVO` = Dosagem automática ligada
- `Auto EC: INATIVO` = Apenas monitoramento
- `Controller ESP32 Conectado` = Cálculos precisos
- `Controller ESP32 Desconectado` = Usando cálculo local

### **Códigos de Status:**
- ✅ = Operação bem-sucedida
- ❌ = Erro que precisa atenção
- ⚠️ = Aviso/situação normal mas importante
- ℹ️ = Informação geral
- 🤖 = Ação automática do sistema

---

**💡 Dica:** Mantenha ambos os logs abertos durante o uso para monitoramento completo! 