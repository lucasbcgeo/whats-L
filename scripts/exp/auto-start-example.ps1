# Script de exemplo - Copie e ajuste para seu ambiente
$ProjectDir = "C:\caminho\para\seu\projeto"  # <- Altere aqui
$LogDir = Join-Path $ProjectDir "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$LogFile = Join-Path $LogDir ("autostart-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log")

Start-Transcript -Path $LogFile -Append

try {
  Set-Location $ProjectDir
  $Pm2 = (Get-Command pm2.cmd -ErrorAction Stop).Source

  # Se não existir no PM2, cria
  cmd /c "`"$Pm2`" describe whats-L >nul 2>nul"
  $exists = ($LASTEXITCODE -eq 0)

  if (-not $exists) {
    & $Pm2 start src/main/main.js --name whats-L
  }

  # Se existe (mesmo stopped), garante que está ONLINE
  & $Pm2 start whats-L

  & $Pm2 save
  & $Pm2 status
}
catch {
  Write-Host "ERRO:"
  Write-Host $_.Exception.Message
  Write-Host $_.Exception.StackTrace
  throw
}
finally {
  Stop-Transcript
}