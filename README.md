# whats-L 🤖

WhatsApp bot for personal productivity — life metrics logging, file forwarding, and document syncing.

> ⚠️ Recommended for personal use. Mass messaging may result in a WhatsApp ban.

## Features

### File Forwarder

- **Auto Forward**: Automatically forwards media from whitelisted phone numbers to a target group. Configurable per-number label and frequency (e.g., every 30 or 90 days).
- **Manual Forward**: Forward files from vault sources or WhatsApp contacts to any destination via `#encaminhar arquivo para: destino de: fonte`. If no destination is specified, files are sent to the current chat.

### Header Watcher

Monitors a Markdown file for changes. When `### Section` content changes, the updated text is sent to a configured WhatsApp group. Runs independently as a background service — no manual trigger needed.

### Life Metrics
Automatic logging to Obsidian notes via WhatsApp commands.

| Command | Trigger | Type |
|---|---|---|
| Tasks | `tarefa`, `afazer`, `todo` | text |
| Meals | `cafe`, `almoco`, `janta`, `lanche` | meal |
| Sleep | `dormi`, `acordei` | time |
| Exercise | `exercicio`, `treino`, `academia` | yes/no |
| Screen Time | `tempo`, `tela`, `celular` | duration |
| Games | `games`, `jogo` | duration |
| Reading | `leitura`, `li`, `livro` | yes/no |
| Leisure | `lazer`, `passeio` | yes/no |
| Anxiety | `ansiedade`, `nervoso` | 0-10 |
| Procrastination | `procrastinacao`, `enrolei` | 0-10 |

**Override**: add `correção` or `force` to any command to overwrite an existing value. Or simply delete the WhatsApp message.


---

## Architecture

All bot behavior is configured in `data/config.json`. The hierarchy:

```
profiles → features → commands → handlers
```

### Commands

Each command maps a text trigger to a handler module. The command key is an English identifier, `handler` points to the JS module, `key` is the Obsidian frontmatter field (in Portuguese), and `triggers` are the words users type.

```json
"mealLog": {
  "handler": "food",
  "key": "alimentacao",
  "triggers": {
    "cafe": { "variations": ["cafe", "cafezinho"] },
    "almoco": { "variations": ["almoco", "almocei"] }
  }
}
```

- User types `cafe` → trigger resolved → `food` handler executes → writes to `alimentacao` frontmatter field
- Commands without triggers (like `audioProcessing`) run automatically when conditions are met

### Features

Features group commands into permission bundles. Profiles reference features by name.

```json
"features": {
  "packadmin": {
    "commands": ["dailyTasks", "mealLog", "sleepLog", "manualForward", "autoForward", "audioProcessing"]
  },
  "manualForward": {
    "commands": ["manualForward", "audioProcessing"]
  }
}
```

- `packadmin` gives access to all commands
- `manualForward` gives access only to the file forwarding command (plus audio processing for voice commands)

### Sources

Data sources where the bot reads/writes files. Each has triggers for text lookup and paths for storage.

```json
"sources": {
  "vault1": {
    "triggers": ["vault1", "vault1 doc"],
    "db": "/path/to/vault1.db",
    "attachments": "/path/to/attachments1"
  }
}
```

### Destinations

WhatsApp groups that can receive forwarded content.

```json
"destinations": {
  "Destination1": { "groupName": "Target Group A" },
  "HeaderSyncDest": { "groupName": "Sync Group" }
}
```

### Profiles

Define who can do what. Each profile has:

- **match**: how the profile activates (`groupName`, `numbers`, `number`, or `file`)
- **features**: which features are available
- **forwardMeta** *(optional)*: auto-forward config (label, frequency, destination)
- **allowedDestinations** *(optional)*: restrict where a user can forward to (`"self"` = own chat)
- **allowedSources** *(optional)*: restrict which sources a user can search

```json
"profiles": {
  "admin": {
    "match": { "groupName": "Your WhatsApp Group" },
    "features": ["packadmin"]
  },
  "source1": {
    "match": { "numbers": ["number1@c.us"] },
    "features": ["autoForward"],
    "forwardMeta": { "label": "Source 1", "frequencyDays": 30, "destination": "Destination1" }
  },
  "member1": {
    "match": { "numbers": ["number3@c.us"], "groups": ["Group A", "Group B"] },
    "features": ["manualForward"],
    "allowedDestinations": ["Destination1", "Destination2", "self"],
    "allowedSources": ["vault1", "vault2"]
  },
  "secretary": {
    "match": { "file": "/path/to/note.md" },
    "features": ["headerWatch"],
    "forwardMeta": { "destination": "HeaderSyncDest" }
  }
}
```

**Matching logic:**
- `groupName` — activates when a message comes from that group
- `numbers` / `number` — activates when a message comes from those phone numbers
- `groups` — restricts which groups the profile can operate in
- `file` — activates a file watcher on that path (background service)

**Permission flow:**
1. Incoming message → `resolveProfile()` matches by group or number
2. Profile found → `isGroupAllowed()` checks group restriction
3. Handler tries to match → `isHandlerAllowed()` checks if the handler's command is in the profile's features
4. Forward action → `isDestinationAllowed()` / `isSourceAllowed()` enforce restrictions

---

## Setup

```bash
npm install
cp .env.example .env
cp data/config.json.example data/config.json
# Edit .env and config.json with your values
```

### Environment Variables

```env
# Obsidian vault path
OBSIDIAN_VAULT_PATH=/path/to/vault
DAILY_FOLDER=Diary
DAILY_LOG_CUTOFF=8

# Timezone
TIMEZONE=America/Sao_Paulo

# Deduplication
DEDUPE_TTL=259200

# Audio transcription (Whisper)
WHISPER_MODEL_PATH=medium

```

---

## Usage

### Start

```bash
npm start
```

Or with PowerShell scripts:
```powershell
.\scripts\start.ps1   # start
.\scripts\stop.ps1    # stop
```

### PM2 (production)

```bash
pm2 start src/main.js --name whats-L
pm2 save
pm2 logs whats-L
```

### Tests

```bash
npm test
```

---

## License

MIT
