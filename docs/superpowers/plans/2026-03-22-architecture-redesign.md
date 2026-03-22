# Architecture Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar a estrutura do projeto `whats-L` para uma arquitetura em camadas, isolando lógica de negócio (Obsidian) da interface (WhatsApp).

**Architecture:** Layered Architecture (Config, Lib, Services, Handlers, Utils). Handlers traduzem mensagens do WhatsApp para chamadas em Services, que por sua vez utilizam instâncias de clientes em Lib.

**Tech Stack:** Node.js, whatsapp-web.js, filesystem (Obsidian vault).

---

### Task 1: Preparação e Backup

**Files:**
- Modify: `.gitignore` (ensure `data/` and `docs/` are handled correctly)
- Create: `src/config/env.js`
- Create: `src/utils/logger.js`

- [ ] **Step 1: Backup de Segurança**
  Copiar a pasta `data/` e o vault do Obsidian para um local seguro fora do projeto.

- [ ] **Step 2: Criar Config de Ambiente**
  Criar `src/config/env.js` centralizando `process.env`.
  ```javascript
  require('dotenv').config();
  module.exports = {
    GROUP_ID: process.env.GROUP_ID,
    GROUP_NAME: process.env.GROUP_NAME,
    VAULT: process.env.VAULT,
    DAILY_FOLDER: process.env.DAILY_FOLDER,
    BACKFILL_LIMIT: Number(process.env.BACKFILL_LIMIT ?? 500),
    FORWARD_SOURCE_NUMBERS: (process.env.FORWARD_SOURCE_NUMBERS || "").split(",").map(n => n.trim()),
    DORMIR_MADRUGADA_ATE: process.env.DORMIR_MADRUGADA_ATE
  };
  ```

- [ ] **Step 3: Criar Logger**
  Criar `src/utils/logger.js` com níveis `info`, `warn`, `error`.

- [ ] **Step 4: Commit**
  ```bash
  git add src/config/env.js src/utils/logger.js
  git commit -m "chore: setup infrastructure (config and logger)"
  ```

---

### Task 2: Camada de Utilitários e Clientes (Lib)

**Files:**
- Create: `src/utils/parse.js` (copy from core)
- Create: `src/utils/duration.js` (copy from core)
- Create: `src/lib/obsidianClient.js`
- Create: `src/lib/whatsappClient.js`

- [ ] **Step 1: Migrar Utils**
  Copiar `src/core/parse.js` e `src/core/duration.js` para `src/utils/`.

- [ ] **Step 2: Criar Obsidian Client**
  Extrair caminhos de `src/services/obsidian.js`.

- [ ] **Step 3: Criar WhatsApp Client**
  Extrair inicialização de `src/services/whatsapp.js`.

- [ ] **Step 4: Commit**
  ```bash
  git add src/utils/ src/lib/
  git commit -m "chore: migrate utils and extract clients to lib"
  ```

---

### Task 3: Camada de Serviços e Harness de Teste

**Files:**
- Create: `scripts/test-metric.js` (Test Harness)
- Create: `src/services/obsidianService.js`
- Create: `src/services/metricService.js`
- Create: `src/services/dedupeService.js`
- Create: `src/services/syncService.js`

- [ ] **Step 1: Criar Harness de Teste**
  Criar `scripts/test-metric.js` para validar serviços sem o WhatsApp.

- [ ] **Step 2: Implementar Obsidian Service**
  Mover lógica de `src/services/obsidian.js`.
  **Verificação**: Rodar `scripts/test-metric.js` para validar escrita no Obsidian.

- [ ] **Step 3: Implementar Metric Service**
  Criar interface genérica para métricas.
  **Verificação**: Rodar `scripts/test-metric.js` com uma métrica de teste.

- [ ] **Step 4: Implementar Dedupe e Sync Services**
  Mover lógica de `src/core/dedupe.js` e `src/services/whatsapp.js`.
  **Verificação Crítica**: Garantir que `data/checkpoint.json` é lido e atualizado corretamente.

- [ ] **Step 5: Commit**
  ```bash
  git add src/services/ scripts/test-metric.js
  git commit -m "feat: implement business logic services with verification"
  ```

---

### Task 4: Migração de Handlers (Interface)

**Files:**
- Create: `src/handlers/*.js` (11 arquivos)

- [ ] **Step 1: Migrar Handlers 1-5 (Básicos)**
  Migrar: `ansiedade`, `alimentacao`, `exercicio`, `games`, `leitura`.
  **Verificação**: Usar `scripts/test-metric.js` adaptado para chamar o `handle` de cada um.

- [ ] **Step 2: Migrar Handlers 6-11 (Complexos)**
  Migrar: `sono`, `tempo-tela`, `procrastinacao`, `lazer`, `file-forwarder`, `header-sync`.

- [ ] **Step 3: Garantir Paridade**
  Verificar se todos os 11 comandos originais em `src/features/` estão presentes em `src/handlers/`.

- [ ] **Step 4: Commit**
  ```bash
  git add src/handlers/
  git commit -m "feat: migrate all 11 handlers to the new layer"
  ```

---

### Task 5: Integração Final e Limpeza

**Files:**
- Create: `src/main.js`
- Delete: `src/core/`, `src/features/`, `src/main/`, `src/services/obsidian.js`, `src/services/whatsapp.js`

- [ ] **Step 1: Criar Novo Main**
  Implementar o orquestrador na raiz de `src/`. Registrar os 11 handlers manualmente no array `handlers`.

- [ ] **Step 2: Teste de fumaça Real**
  Rodar `node src/main.js` e enviar um comando via WhatsApp (ex: `!ansiedade 5`).

- [ ] **Step 3: Limpeza Final**
  Remover pastas e arquivos antigos agora que tudo está em `src/handlers`, `src/services`, etc.

- [ ] **Step 4: Commit Final**
  ```bash
  git rm -r src/core src/features src/main
  git rm src/services/obsidian.js src/services/whatsapp.js
  git add src/main.js
  git commit -m "refactor: complete architecture redesign and cleanup old structure"
  ```
