. "$PSScriptRoot/ensure-node.ps1"
& $DLNode (Join-Path $Root 'scripts/build.mjs') @args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
