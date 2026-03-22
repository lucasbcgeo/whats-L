# Design Spec: Arquitetura em Camadas para o whats-L

**Data:** 2026-03-22
**Status:** Em Revisão
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

### Fase 1: Preparação (Infraestrutura)
- Criar a estrutura de pastas.
- **Config**: Criar `src/config/env.js` exportando um objeto com todas as variáveis validadas.
- **Logger**: Criar `src/utils/logger.js` para padronizar as saídas no terminal.

### Fase 2: Serviços e Clientes (Core)
- **WhatsApp**: Mover lógica de `src/services/whatsapp.js` para `src/lib/whatsappClient.js` (apenas o cliente) e criar `src/services/syncService.js` (para a lógica de sincronização).
- **Obsidian**: Separar `src/services/obsidian.js` em `src/lib/obsidianClient.js` (configuração do path) e `src/services/obsidianService.js` (métodos `upsertRootKey`, `saveMetric`).
- **Dedupe**: Mover `src/core/dedupe.js` para `src/services/dedupeService.js`.

### Fase 3: Handlers e Refatoração (Interface)
- Converter cada `src/features/*/index.js` em um arquivo individual em `src/handlers/`.
- Cada handler deve importar o `metricService` para salvar dados.
- Mover o `main.js` para a raiz de `src/` e atualizar os imports.

### Fase 4: Validação e Limpeza
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
- **Funcional:** Comandos via WhatsApp devem continuar funcionando exatamente como hoje.
- **Isolamento:** Criar um script `scripts/test-metric-service.js` que grava uma métrica fixa (ex: teste-ansiedade) no Obsidian sem iniciar o WhatsApp.
- **Regressão:** Verificar se o checkpoint de mensagens continua sendo lido/escrito corretamente em `data/checkpoint.json`.


---
