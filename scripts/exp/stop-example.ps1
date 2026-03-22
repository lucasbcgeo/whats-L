# Script de exemplo - Copie e ajuste para seu ambiente
$ErrorActionPreference = "Stop"
Set-Location "C:\caminho\para\seu\projeto"  # <- Altere aqui

pm2 stop whats-L
pm2 save
pm2 status