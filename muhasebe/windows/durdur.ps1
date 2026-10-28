# Stops the program (it starts again with Windows or with KUR / BASLAT).
. (Join-Path $PSScriptRoot 'ortak.ps1')
Stop-Muhasebe
Write-Host 'Program durduruldu.'
Pause-Exit 0
