# Script de exemplo - Copie e ajuste para seu ambiente
$ErrorActionPreference = "Stop"

# === CONFIGURAÇÃO ===
$ProjectDir = "C:\caminho\para\seu\projeto"  # <- Altere aqui
$ProjectName = "whats-L"                       # <- Nome do projeto no PM2

Set-Location $ProjectDir

pm2 status | Out-Null

$exists = (pm2 jlist | ConvertFrom-Json -AsHashTable | Where-Object { $_["name"] -eq $ProjectName }).Count -gt 0

if ($exists) {
  pm2 restart $ProjectName --update-env
} else {
  pm2 start src/main/main.js --name $ProjectName
}

pm2 save
pm2 status