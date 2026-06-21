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

### Requirements
- Node.js v18.0.0 or higher
- Python 3.9+ (recommended to use virtualenv)
- ffmpeg (required for audio processing)
- whisper (if you want run full local)

### Installation

#### JavaScript dependencies

```bash
npm install whatsapp-web.js
# or
yarn add whatsapp-web.js
# or
pnpm add whatsapp-web.js
```

#### Python dependencies
```bash
pip install openai-whisper
```

#### ffmpeg installation
```bash
Ubuntu/Debian: sudo apt-get install ffmpeg
```
```bash
macOS: brew install ffmpeg
```

Windows: download from ffmpeg.org/download.html

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

First, install PM2 globally:
```bash
npm install -g pm2
```

Then start the application:
```bash
pm2 start src/main.js --name whats-L
pm2 save
pm2 logs whats-L
```



---

## Outbound API

The bot exposes a tiny HTTP bridge on `127.0.0.1` so external tools (skills, scripts, agents) can send messages through the already-authenticated WhatsApp session. No external network exposure — localhost only + token auth.

### Configuration

Add to `.env`:

```env
WHATS_OUTBOUND_PORT=5454
WHATS_OUTBOUND_TOKEN=<random hex, generate with: node -e "console.log(require('crypto').randomBytes(24).toString('hex'))">
```

The bridge starts automatically on the `ready` event (after WhatsApp warmup) and shuts down on SIGINT/SIGTERM. Look for `[OUTBOUND] bridge escutando em http://127.0.0.1:<port>` in the logs.

### Endpoints

All responses are JSON. Requests (except `/health`) require header `X-Whats-Token: <WHATS_OUTBOUND_TOKEN>`.

| Method | Path | Body | Returns |
|---|---|---|---|
| `GET` | `/health` | — | `{ok:true, service:"whats-L-outbound"}` |
| `POST` | `/send` | `{to, text}` **or** `{to, file, caption?}` | `{ok:true, messageId, to, name, kind, ...}` |
| `GET` | `/groups` | — | `{ok:true, count, groups:[{id,name}]}` |
| `GET` | `/chats` | — | `{ok:true, count, chats:[{id,name,isGroup,timestamp}]}` |

### `/send` body

Two modes (mutually exclusive):

**Text:**
```json
{ "to": "5511999999999", "text": "Olá" }
```

**File (path on local filesystem — bot reads it directly):**
```json
{ "to": "5511999999999", "file": { "path": "C:\\Docs\\rel.pdf" }, "caption": "Relatório" }
```

**File (inline base64):**
```json
{ "to": "5511999999999", "file": { "data": "<base64>", "mimetype": "image/jpeg", "filename": "foto.jpg" }, "caption": "..." }
```

Limits:
- `text`: 65KB
- `file` (path): 50MB max, MIME inferred from extension or checked against allowlist (image/audio/video/pdf/text/Office/zip)
- Inline JSON body: 25MB max

### `to` resolution

The bridge resolves the `to` field in this order:
1. Raw chatId (`<number>@c.us`, `<number>@g.us`, `...@lid`) — direct lookup.
2. Plain digits — normalized to `<digits>@c.us` and looked up.
3. Non-numeric string — matched against `client.getChats()` by name (exact, then includes; case-insensitive). First match wins.

### Errors

| Status | Error | Cause |
|---|---|---|
| 401 | `unauthorized` | Missing/invalid `X-Whats-Token` |
| 400 | `missing_to` / `missing_text_or_file` / `invalid_json` / `invalid_body` / `invalid_file_spec` / `not_a_file` | Bad request |
| 404 | `chat_not_found` / `file_not_found` | `to` didn't resolve, or `--file` path missing |
| 413 | `text_too_long` / `file_too_large` / `payload_too_large` | Exceeded size limits |
| 415 | `unsupported_media_type` | MIME not in allowlist |
| 502 | `send_failed` | WhatsApp rejected the send |

### Companion skill

The `whats-s` skill in `G:\Lucas\.agents\skills\whats-s\` and `G:\Franklin\.agents\skills\whats-s\` wraps this API in a Node CLI:

```powershell
node ".agents/skills/whats-s/scripts/whats-send.mjs" send --to "5511999999999" --text "Olá"
node ".agents/skills/whats-s/scripts/whats-send.mjs" send --to "5511999999999" --file "C:\Docs\rel.pdf" --caption "Relatório"
node ".agents/skills/whats-s/scripts/whats-send.mjs" groups
```

> ⚠️ Same ban warning as above: this API is for personal use. Mass messaging may result in a WhatsApp ban.

---

## License

MIT

## Acknowledgements

This project makes use of the following open-source libraries:

- [whatsapp-web.js](https://github.com/wwebjs/whatsapp-web.js) — A powerful Node.js library for interacting with the WhatsApp Web API.
- [OpenAI Whisper](https://github.com/openai/whisper) — An automatic speech recognition (ASR) system for audio transcription.

