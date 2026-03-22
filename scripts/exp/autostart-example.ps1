# Script de exemplo - Copie e ajuste para seu ambiente
# Este script cria uma tarefa agendada para iniciar o PM2 ao ligar o PC
$ErrorActionPreference = "Stop"
$TaskName = "PM2 - SeuProjeto"  # <- Altere aqui
$User = "$env:UserDomain\$env:UserName"
$Pm2Cmd = (Get-Command pm2.cmd -ErrorAction Stop).Source
$Action = New-ScheduledTaskAction -Execute $Pm2Cmd -Argument "resurrect"
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Principal = New-ScheduledTaskPrincipal -UserId $User -RunLevel Highest
$Settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings
Write-Host "✅ Tarefa criada: $TaskName"
Write-Host "Teste agora com:  schtasks /Run /TN `"$TaskName`""