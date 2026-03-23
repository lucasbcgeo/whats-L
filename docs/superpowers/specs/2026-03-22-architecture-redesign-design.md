# Design Spec: Arquitetura em Camadas para o whats-L

**Data:** 2026-03-22
**Status:** ✅ Concluido
**Ultima Atualizacao:** 2026-03-22
**Commits:**
- `4a23947` - chore: setup infrastructure (config, utils, lib, dedupe and sync services)
- `594137e` - feat: implement business logic services with verification
- `ea242a7` - feat: migrate all 11 handlers to the new layer
- `5400efd` - refactor: complete architecture redesign and cleanup old structure
**Tópico:** Reorganização Arquitetural (Layered Architecture)

---

## 1. Contexto do Projeto
O `whats-L` é um bot de WhatsApp que processa comandos para registrar métricas de vida (ansiedade, sono, leitura, etc.) em um cofre (vault) do Obsidian. Atualmente, a lógica está organizada em `features` que misturam parsing de comandos, validação de regras de negócio e escrita no sistema de arquivos.

## 2. Objetivos
- **Padronização:** Adotar uma arquitetura de mercado (Camadas) para facilitar a manutenção e a legibilidade por IAs.
- **Reutilização:** Isolar a lógica de escrita no Obsidian para permitir o uso em scripts CLI independentes do WhatsApp.
- **Separação de Responsabilidades:** Isolar "Como recebemos" (WhatsApp) de "O que fazemos" (Lógica de Métricas) e de "Como salvamos" (Obsidian Client).

## 3. Nova Arquitetura Proposta

A estrutura seguirá o padrão de camadas em `src/`:

### Camadas e Responsabilidades:
1. **`src/config/`**: Centraliza `dotenv` e constantes de ambiente (`env.js`).
   - **Variáveis Centralizadas**: `GROUP_ID`, `GROUP_NAME`, `BACKFILL_LIMIT`, `VAULT`, `DAILY_FOLDER`, `FORWARD_SOURCE_NUMBERS`, `DORMIR_MADRUGADA_ATE`.
2. **`src/lib/`**: Inicialização e exportação de instâncias de clientes externos.
   - `whatsappClient.js`: Exporta a instância configurada do `whatsapp-web.js`.
   - `obsidianClient.js`: Exporta a instância de acesso ao sistema de arquivos/vault.
3. **`src/services/`**: A "Cérebro" do sistema. Contém a lógica de negócio pura.
   - `metricService.js`: Recebe dados brutos (tipo de métrica, valor, timestamp) e decide como processar e salvar. **Toda a lógica de cálculo (ex: duração de sono) mora aqui ou chama utils.**
   - `dedupeService.js`: Gerencia o estado de mensagens já processadas.
4. **`src/handlers/`**: Adaptadores específicos para o WhatsApp. 
   - **Responsabilidade Única**: Escutar mensagens, realizar o `match`, fazer o parse inicial e chamar o `service` correspondente. **Não contém lógica de gravação ou cálculos complexos.**
5. **`src/utils/`**: Funções puras, genéricas e sem estado (`parse.js`, `duration.js`, `logger.js`).
   - `logger.js`: Implementará níveis `INFO`, `WARN` e `ERROR`.
6. **`src/main.js`**: O orquestrador que inicializa o bot e registra os Handlers.

---

## 4. Plano de Migração

### Fase 1: Preparação (Infraestrutura) ✅
- Criar a estrutura de pastas.
- **Config**: Criar `src/config/env.js` exportando um objeto com todas as variáveis validadas.
- **Logger**: Criar `src/utils/logger.js` com níveis `INFO`, `WARN`, `ERROR`.

### Fase 2: Serviços e Clientes (Core) ✅
- **WhatsApp**: Mover lógica de `src/services/whatsapp.js` para `src/lib/whatsappClient.js` (apenas o cliente) e criar `src/services/syncService.js` (para a lógica de sincronização).
- **Obsidian**: Separar `src/services/obsidian.js` em `src/lib/obsidianClient.js` (configuração do path + `time:` helpers) e `src/services/obsidianService.js` (métodos `upsertRootKey`, delegando ao lib).
- **Dedupe**: Criar `src/services/dedupeService.js` com `{ getLastTs, setLastTs, checkpoint }` para gerenciar `checkpoint.json`.
- **Nota**: O `src/core/dedupe.js` original (processed.json) permanece em `src/core/` até Task 4 para garantir compatibilidade. Será movido/limpo na Task 5.

### Fase 3: Handlers e Refatoração (Interface) ✅
- Converter cada `src/features/*/index.js` em um arquivo individual em `src/handlers/`.
- Cada handler importa `metricService` para salvar dados.
- `src/main.js` na raiz de `src/` com imports atualizados.
- `src/services/headerSyncService.js` exporta `syncHeaders` para startup.

### Fase 4: Validação e Limpeza ✅
- Converter cada `src/features/*/index.js` em um arquivo individual em `src/handlers/`.
- Cada handler deve importar o `metricService` para salvar dados.
- Mover o `main.js` para a raiz de `src/` e atualizar os imports.

### Fase 4: Validação e Limpeza ⏳ Pendente
- Executar scripts de teste.
- Remover pastas obsoletas (`core`, `features`).

---

## 5. Contratos de Dados (Interfaces)

### Objeto de Métrica (Internal)
```javascript
{
  key: string,      // ex: "ansiedade"
  value: any,       // ex: 8
  timestamp: number,// timestamp da mensagem
  force: boolean    // se deve sobrescrever
}
```

---

## 6. Validação e Testes
- **Funcional:** ✅ Teste de fumaça — imports verificados, bot tenta inicializar corretamente.
- **Isolamento:** ✅ Script `scripts/test-metric.js` criado e executado com sucesso. Grava ansiedade, exercicio, procrastinacao, lazer e leitura no Obsidian sem WhatsApp.
- **Regressão:** ✅ `data/checkpoint.json` lido e atualizado corretamente via `dedupeService.checkpoint`.
- **Cleanup:** ✅ 1803 linhas removidas, estrutura antiga eliminada.

---

## 7. Estrutura Final (`src/`)

```
src/
├── main.js                    # Orquestrador (executável)
├── config/
│   └── env.js                 # Variáveis de ambiente validadas
├── utils/
│   ├── logger.js              # INFO, WARN, ERROR
│   ├── parse.js               # parseCommand, hasForceFlag
│   └── duration.js            # parseDurationToISO
├── lib/
│   ├── obsidianClient.js      # Acesso ao vault + time helpers
│   └── whatsappClient.js      # Cliente wweb.js + getTargetGroup/Chats
├── services/
│   ├── obsidianService.js     # upsertRootKey (delegação)
│   ├── metricService.js       # Lógica de métricas (cérebro)
│   ├── dedupeService.js       # Checkpoint (checkpoint.json)
│   ├── syncService.js         # Sync por checkpoint
│   └── headerSyncService.js   # Re-export syncHeaders
└── handlers/
    ├── index.js               # Array dos 11 handlers
    ├── ansiedade.js
    ├── alimentacao.js
    ├── exercicio.js
    ├── games.js
    ├── leitura.js
    ├── sono.js
    ├── tempo-tela.js
    ├── procrastinacao.js
    ├── lazer.js
    ├── file-forwarder.js
    └── header-sync.js
```

**Preservado:** `src/core/dedupe.js` — `isProcessed`/`markProcessed` (processed.json, TTL 72h). Não faz parte da nova arquitetura mas ainda utilizado pelo main.js.

---

## 8. Notas de Implementação

### Interfaces exportadas por camada:
- `src/config/env.js` → objeto com todas as vars validadas
- `src/lib/obsidianClient.js` → `{ vaultPath, dailyFolder, cutOff, readDaily, writeDaily, upsertRootKey, time: {...} }`
- `src/lib/whatsappClient.js` → `{ client, getTargetGroup, getTargetChats }`
- `src/services/obsidianService.js` → `{ upsertRootKey, time }` (delegação pura ao lib)
- `src/services/metricService.js` → `{ saveMetric, metricService: { saveMetric } }`
- `src/services/dedupeService.js` → `{ getLastTs, setLastTs, checkpoint: { getLastTs, setLastTs } }`
- `src/services/syncService.js` → `{ syncMissedMessagesByCheckpoint }`
- `src/utils/logger.js` → `{ INFO, WARN, ERROR }`
- `src/utils/parse.js` → `{ parseCommand, hasForceFlag }`
- `src/utils/duration.js` → `{ parseDurationToISO }`

### metricService.saveMetric` contrato:
```javascript
saveMetric({ metric, value, timestamp, dateStr, rawArgs, options: { force } })
// metric: "ansiedade"|"exercicio"|"procrastinacao"|"lazer"|"leitura"|"games"|"tempo_tela"|"alimentacao"|"sono_dormi"|"sono_acordei"
// dateStr opcional: sobrescreve a data lógica calculada
// rawArgs opcional: objeto { cmd, args } para parse interno de valor booleano/escala
// options.force: pula proteção de sobrescrita
```


---
