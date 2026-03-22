# Scripts de Exemplo

Copie estes scripts para a pasta `scripts/` e ajuste os caminhos conforme seu ambiente.

## Arquivos

- `start-example.ps1` - Inicia o bot com PM2
- `auto-start-example.ps1` - Inicia o bot com logging
- `stop-example.ps1` - Para o bot
- `autostart-example.ps1` - Cria tarefa agendada para iniciar automaticamente

## Como usar

1. Copie o arquivo desejado para a pasta `../` (parent)
2. Altere `$ProjectDir` para o caminho do seu projeto
3. Execute o script

Exemplo:
```powershell
Copy-Item start-example.ps1 ..\start.ps1
# Edite o arquivo e altere os caminhos
```