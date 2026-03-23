# whats-L 🤖

Bot de WhatsApp para registro automático de métricas de vida no Obsidian. Registre sono, alimentação, exercício, leitura e mais — direto de uma conversa de WhatsApp.

## Funcionalidades

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
- **File Forwarder** — encaminha automaticamente arquivos de números específicos para um grupo configurado
- **Header Sync** — envia atualizações de uma nota `.md` para um grupo quando headers `###` são alterados

---

## Arquitetura

Camadas definidas (Layered Architecture):

```
src/
├── main.js              # Orquestrador — ponto de entrada
├── config/
│   └── env.js          # Variáveis de ambiente validadas
├── utils/
│   ├── logger.js       # INFO, WARN, ERROR
│   ├── parse.js        # parseCommand, hasForceFlag
│   └── duration.js     # parseDurationToISO
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
