# whats-L 🤖

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