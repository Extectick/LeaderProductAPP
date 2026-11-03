#Requires -RunAsAdministrator
param([string]$HostAddress='192.168.1.76')
$ErrorActionPreference='Stop'
$appRoot=Split-Path $PSScriptRoot -Parent
$node=Join-Path (Split-Path $appRoot -Parent) '.local-tools\node-v24.22.1-win-x64\node.exe'
if(!(Test-Path -LiteralPath $node)){throw 'Project Node 24 runtime is missing'}
$address=Get-NetIPAddress -IPAddress $HostAddress -AddressFamily IPv4 -ErrorAction Stop
$name='LeaderAdminPreviewLan-8110'
if(!(Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue)){
  New-NetFirewallRule -Name $name -DisplayName 'Leader Admin preview: Metro 8110, local subnet only' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8110 -LocalAddress $HostAddress -RemoteAddress LocalSubnet -InterfaceAlias $address.InterfaceAlias -Program $node -Profile Any | Out-Null
}
Write-Output "Admin preview enabled for local subnet: http://${HostAddress}:8110"
