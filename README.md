# whats-L 🤖

- WhatsApp bot for automatic habit tracking in Obsidian.
- Send messages to a WhatsApp group/contact from a .md file whenever the file is updated.
- Automatic file forwarding from specific numbers to another contact.

## Summary

- [Features](#features)
- [Structure](#structure)
- [Setup](#setup)
- [Environment Variables](#environment-variables)
- [Usage](#usage)
- [PM2 (production)](#pm2-production)

## Features

- **Sleep** - `#dormi` / `#acordei`
- **Nutrition** - `#cafe` / `#almoco` / `#janta` / `#lanche`
- **Exercise** - `#exercicio` (yes/no)
- **Games** - `#games <time>`
- **Screen Time** - `#tempo <time>`
- **Reading** - `#leitura` (yes/no)
- **Leisure** - `#lazer` (yes/no)
- **Anxiety** - `#ansiedade <0-10>`
- **Procrastination** - `#procrastinacao <0-10>`
- **File Forwarder** - Automatically forwards files from specific numbers to a configured group.
- **Header Sync** - Sends updates from a .md note to a WhatsApp group when specific headers are modified.

## Structure

```
src/
├── main/          # Entry point
├── core/          # Pure logic (parse, dedupe, duration)
├── features/     # Command handlers
└── services/     # Integrations (WhatsApp, Obsidian)
scripts/          # Start/stop scripts
data/             # Checkpoint and processing
```

## Setup

```bash
# Install dependencies
npm install

# Configure .env (copy from .env.example)
cp .env.example .env
```

### Environment Variables

```env
OBSIDIAN_VAULT_PATH=Path/to/vault
DAILY_FOLDER=02_Notes/Journal
GROUP_NAME=WhatsApp group name
DORMIR_MADRUGADA_ATE=08

# File Forwarder
FORWARD_SOURCE_NUMBERS=5511999910621@c.us,556199099705@c.us
TARGET_FORWARD_GROUP_NAME=Target Group

# Header Sync
HEADER_SYNC_FILE=Path/to/note.md
HEADER_SYNC_GROUP_ID=GroupID@group.id
```

## Usage

```powershell
# Start
.\scripts\start.ps1

# Stop
.\scripts\stop.ps1
```

Or use PowerShell aliases (if configured):
- `oli` - start
- `olf` - stop

## PM2 (production)

```bash
pm2 start src/main/main.js --name whats-L
pm2 save
```

---

# whats-L 🤖 (Versão em Português)

 - Bot de WhatsApp para registro automático de hábitos no Obsidian 
 - Envio de mensagens para um grupo/contato de whatsapp a partir de um arquivo .md sempre que o arquivo for atualizado. 
 - Encaminhamento automático de arquivos de números específicos para outro contato.

## Sumário

- [Funcionalidades](#funcionalidades)
- [Estrutura](#estrutura)
- [Setup](#setup)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Uso](#uso)
- [PM2 (produção)](#pm2-produção)

## Funcionalidades

- **Sono** - `#dormi` / `#acordei`
- **Alimentação** - `#cafe` / `#almoco` / `#janta` / `#lanche`
- **Exercício** - `#exercicio` (sim/não)
- **Games** - `#games <tempo>`
- **Tempo de tela** - `#tempo <tempo>`
- **Leitura** - `#leitura` (sim/não)
- **Lazer** - `#lazer` (sim/não)
- **Ansiedade** - `#ansiedade <0-10>`
- **Procrastinação** - `#procrastinacao <0-10>`
- **File Forwarder** - Encaminha automaticamente arquivos de números específicos para um grupo configurado.
- **Header Sync** - Envia atualizações de uma nota .md para um grupo de whatsapp quando headers específicos são alterados.

## Estrutura

```
src/
├── main/          # Entry point
├── core/          # Lógica pura (parse, dedupe, duration)
├── features/     # Handlers de comandos
└── services/     # Integrações (WhatsApp, Obsidian)
scripts/          # Scripts de start/stop
data/             # Checkpoint e processamento
```

## Setup

```bash
# Instalar dependências
npm install

# Configurar .env (copie de .env.example)
cp .env.example .env
```

### Variáveis de Ambiente

```env
OBSIDIAN_VAULT_PATH=Caminho/para/vault
DAILY_FOLDER=02_Notas/Jornada
GROUP_NAME=Nome do grupo WhatsApp
DORMIR_MADRUGADA_ATE=08

# File Forwarder
FORWARD_SOURCE_NUMBERS=5511999910621@c.us,556199099705@c.us
TARGET_FORWARD_GROUP_NAME=Grupo Destino

# Header Sync
HEADER_SYNC_FILE=Caminho/para/nota.md
HEADER_SYNC_GROUP_ID=GrupoID@group.id
```

## Uso

```powershell
# Iniciar
.\scripts\start.ps1

# Parar
.\scripts\stop.ps1
```

Ou use os aliases do PowerShell (se configurados):
- `oli` - iniciar
- `olf` - parar

## PM2 (produção)

```bash
pm2 start src/main/main.js --name whats-L
pm2 save
```

## License

MIT