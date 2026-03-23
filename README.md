# whats-L 🤖

WhatsApp bot for automatic life metrics tracking in Obsidian. Log sleep, nutrition, exercise, reading and more — directly from a WhatsApp conversation. Also forwards files from specific numbers to a group and syncs `.md` header changes to a group.

## Features

### Life Metrics
- **Sleep** — `#dormi` / `#acordei`
- **Nutrition** — `#cafe` / `#almoco` / `#janta` / `#lanche`
- **Exercise** — `#exercicio` (yes/no)
- **Games** — `#games <time>` (e.g. `#games 2h 30m`)
- **Screen Time** — `#tempo <time>`
- **Reading** — `#leitura` (yes/no)
- **Leisure** — `#lazer` (yes/no)
- **Anxiety** — `#ansiedade <0-10>`
- **Procrastination** — `#procrastinacao <0-10>`
- **Override** — add `correção` (or `force`) to any command to overwrite the existing value

### File Forwarder
Automatically forwards any file or media sent from a configured list of phone numbers to a target WhatsApp group. Useful for aggregating receipts, bank statements, or any document sent to a personal number into a shared group.

Trigger: any media message from a whitelisted number is forwarded with its caption.

### Header Sync
Keeps a WhatsApp group in sync with the `### Section` headers of a Markdown note. When a header's content changes in the `.md` file, the bot sends the updated text to the configured group. Comments (`<!-- ... -->`) are ignored. Only changed headers trigger a message.

---

## Architecture

Layered Architecture following the pattern: `WhatsApp → Handlers → Services → Lib`.

```
src/
├── main.js                 # Orchestrator — entry point
├── config/
│   └── env.js             # Validated environment variables
├── utils/
│   ├── logger.js          # INFO, WARN, ERROR
│   ├── parse.js           # parseCommand, hasForceFlag
│   └── duration.js        # parseDurationToISO
├── lib/
│   ├── obsidianClient.js   # Vault access + time helpers
│   └── whatsappClient.js   # wweb.js client
├── services/
│   ├── metricService.js    # Business logic — system brain
│   ├── obsidianService.js  # Delegation to obsidianClient
│   ├── dedupeService.js    # Checkpoint (data/checkpoint.json)
│   ├── syncService.js      # Checkpoint-based message sync
│   └── headerSyncService.js
└── handlers/               # 11 WhatsApp-specific adapters
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

**Separation of concerns:**
- `lib/` — external clients (no business logic)
- `services/` — pure business logic
- `handlers/` — WhatsApp adapters (match + delegation only)

---

## Setup

```bash
npm install
cp .env.example .env
# Edit .env with your values
```

### Environment Variables

```env
OBSIDIAN_VAULT_PATH=/path/to/vault
DAILY_FOLDER=Diary
GROUP_NAME=My WhatsApp Group
DORMIR_MADRUGADA_ATE=8
BACKFILL_LIMIT=500

# File Forwarder
FORWARD_SOURCE_NUMBERS=number1@c.us,number2@c.us
TARGET_FORWARD_GROUP_NAME=Target Group

# Header Sync
HEADER_SYNC_FILE=/path/to/note.md
HEADER_SYNC_GROUP_ID=groupid@g.us
```

---

## Usage

```powershell
# Start
.\scripts\start.ps1

# Stop
.\scripts\stop.ps1
```

Or with npm:

```bash
npm start
```

PowerShell aliases (if configured):
- `oli` — start
- `olf` — stop

### Tests

```bash
# Tests metricService without WhatsApp (writes metrics to Obsidian)
npm test
```

---

## PM2 (production)

```bash
pm2 start src/main.js --name whats-L
pm2 save
pm2 logs whats-L
```

---

## License

MIT

---

# whats-L 🤖 (Português)

Bot de WhatsApp para registro automático de métricas de vida no Obsidian. Registre sono, alimentação, exercício, leitura e mais — direto de uma conversa de WhatsApp. Também encaminha arquivos de números específicos para um grupo e sincroniza mudanças de headers `.md` com um grupo.

## Funcionalidades

### Métricas de Vida
- **Sono** — `#dormi` / `#acordei`
- **Alimentação** — `#cafe` / `#almoco` / `#janta` / `#lanche`
- **Exercício** — `#exercicio` (sim/não)
- **Games** — `#games <tempo>` (ex: `#games 2h 30m`)
- **Tempo de tela** — `#tempo <tempo>`
- **Leitura** — `#leitura` (sim/não)
- **Lazer** — `#lazer` (sim/não)
- **Ansiedade** — `#ansiedade <0-10>`
- **Procrastinação** — `#procrastinacao <0-10>`
- **Correção** — adicione `correção` (ou `force`) a qualquer comando para sobrescrever o valor existente

### File Forwarder
Encaminha automaticamente qualquer arquivo ou mídia enviada de uma lista configurada de números de telefone para um grupo de WhatsApp de destino. Útil para agregar recibos, extratos bancários ou qualquer documento enviado a um número pessoal em um grupo compartilhado.

Gatilho: qualquer mensagem de mídia de um número whitelistado é encaminhada com sua legenda.

### Header Sync
Mantém um grupo de WhatsApp sincronizado com os cabeçalhos `### Sessão` de uma nota Markdown. Quando o conteúdo de um header muda no arquivo `.md`, o bot envia o texto atualizado para o grupo configurado. Comentários (`<!-- ... -->`) são ignorados. Apenas headers alterados disparam uma mensagem.

---

## Arquitetura

Arquitetura em camadas seguindo o padrão: `WhatsApp → Handlers → Services → Lib`.

```
src/
├── main.js                 # Orquestrador — ponto de entrada
├── config/
│   └── env.js             # Variáveis de ambiente validadas
├── utils/
│   ├── logger.js          # INFO, WARN, ERROR
│   ├── parse.js           # parseCommand, hasForceFlag
│   └── duration.js        # parseDurationToISO
├── lib/
│   ├── obsidianClient.js   # Acesso ao vault + helpers de tempo
│   └── whatsappClient.js   # Cliente wweb.js
├── services/
│   ├── metricService.js    # Lógica de negócio — cérebro do sistema
│   ├── obsidianService.js  # Delegação ao obsidianClient
│   ├── dedupeService.js    # Checkpoint (data/checkpoint.json)
│   ├── syncService.js      # Sync por checkpoint
│   └── headerSyncService.js
└── handlers/               # 11 adaptadores específicos do WhatsApp
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

**Separação de responsabilidades:**
- `lib/` — clientes externos (sem lógica de negócio)
- `services/` — lógica de negócio pura
- `handlers/` — adaptadores WhatsApp (match + delegação)

---

## Setup

```bash
npm install
cp .env.example .env
# Edite o .env com seus valores
```

### Variáveis de Ambiente

```env
OBSIDIAN_VAULT_PATH=/path/to/vault
DAILY_FOLDER=Diario
GROUP_NAME=My WhatsApp Group
DORMIR_MADRUGADA_ATE=8
BACKFILL_LIMIT=500

# File Forwarder
FORWARD_SOURCE_NUMBERS=number1@c.us,number2@c.us
TARGET_FORWARD_GROUP_NAME=Target Group

# Header Sync
HEADER_SYNC_FILE=/path/to/note.md
HEADER_SYNC_GROUP_ID=groupid@g.us
```

---

## Uso

```powershell
# Iniciar
.\scripts\start.ps1

# Parar
.\scripts\stop.ps1
```

Ou com npm:

```bash
npm start
```

Aliases do PowerShell (se configurados):
- `oli` — iniciar
- `olf` — parar

### Testes

```bash
# Testa metricService sem WhatsApp (grava métricas no Obsidian)
npm test
```

---

## PM2 (produção)

```bash
pm2 start src/main.js --name whats-L
pm2 save
pm2 logs whats-L
```

---

## License

MIT
