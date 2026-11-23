# À charger avec « . » par les scripts .ps1 : garantit la présence du Node.js local.
# Modifie uniquement le PATH du processus PowerShell courant.
$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent $ScriptDir
$Version = (Get-Content -Raw (Join-Path $Root 'scripts/node-version.txt')).Trim()
switch ($env:PROCESSOR_ARCHITECTURE) {
  'AMD64' { $Arch = 'x64' }
  'ARM64' { $Arch = 'arm64' }
  default { throw "[DIGITAL LIFE] Architecture non prise en charge : $($env:PROCESSOR_ARCHITECTURE)" }
}
$DLNode = Join-Path $Root ".tools/node/versions/$Version-win-$Arch/node.exe"
if (-not (Test-Path $DLNode) -or -not (Test-Path (Join-Path $Root 'node_modules'))) {
  Write-Host '[DIGITAL LIFE] Premier lancement ou dépendances manquantes : bootstrap…'
  & (Join-Path $ScriptDir 'bootstrap.ps1')
}
$env:PATH = "$(Split-Path -Parent $DLNode);$env:PATH"
