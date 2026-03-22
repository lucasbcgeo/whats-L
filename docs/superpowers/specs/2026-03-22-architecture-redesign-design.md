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
2. **`src/lib/`**: Inicialização de clientes externos (`whatsappClient.js`, `obsidianClient.js`).
3. **`src/services/`**: Lógica de negócio pura. Ex: `metricService.js` (gerencia como métricas são processadas) e `dedupeService.js`.
4. **`src/handlers/`**: Adaptadores para o WhatsApp. Traduzem mensagens em chamadas para os `services`.
5. **`src/utils/`**: Funções puras e genéricas (`parse.js`, `duration.js`, `logger.js`).
6. **`src/main.js`**: Ponto de entrada que inicializa o bot e conecta os Handlers ao Cliente.

## 4. Plano de Migração

### Fase 1: Preparação
- Criar a estrutura de pastas.
- Centralizar configurações em `src/config/env.js`.
- Criar `src/utils/logger.js`.

### Fase 2: Serviços e Clientes
- Mover a inicialização do `whatsapp-web.js` para `src/lib/whatsappClient.js`.
- Mover a inicialização do Obsidian para `src/lib/obsidianClient.js`.
- Extrair a lógica de escrita de métricas para `src/services/obsidianService.js`.

### Fase 3: Handlers e Refatoração
- Converter cada `src/features/*/index.js` em um arquivo individual em `src/handlers/`.
- Simplificar os handlers para que usem apenas os `services` e `utils`.
- Mover o `main.js` para a raiz de `src/`.

### Fase 4: Limpeza
- Remover pastas `core` e `features` após a validação.

## 5. Mapeamento de Arquivos

| Origem | Destino |
| :--- | :--- |
| `src/core/parse.js` | `src/utils/parse.js` |
| `src/core/duration.js` | `src/utils/duration.js` |
| `src/core/dedupe.js` | `src/services/dedupeService.js` |
| `src/features/*/index.js` | `src/handlers/*.js` |
| `src/services/obsidian.js` | `src/lib/obsidianClient.js` + `src/services/obsidianService.js` |
| `src/services/whatsapp.js` | `src/lib/whatsappClient.js` |
| `src/main/main.js` | `src/main.js` |

## 6. Validação e Testes
- **Funcional:** Comandos via WhatsApp devem continuar funcionando exatamente como hoje.
- **Isolamento:** Criar um script `scripts/test-obsidian-service.js` que grava uma métrica sem iniciar o WhatsApp.
- **Regressão:** Verificar se o checkpoint de mensagens (deduplicação) continua íntegro em `data/checkpoint.json`.

---
