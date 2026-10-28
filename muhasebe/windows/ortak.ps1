# Shared settings for the Windows scripts.
$ErrorActionPreference = 'Stop'
$Here = $PSScriptRoot
$App = Split-Path $Here -Parent
$Port = 3000
$Hidden = Join-Path $Here 'gizli-baslat.vbs'

function Stop-Muhasebe {
  $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  foreach ($c in $conns) {
    $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
    if ($p -and $p.ProcessName -eq 'node') { Stop-Process -Id $p.Id -Force; Start-Sleep -Milliseconds 500 }
  }
}

function Start-Muhasebe {
  Start-Process -FilePath 'wscript.exe' -ArgumentList ('"' + $Hidden + '"') -WorkingDirectory $Here
  for ($i = 0; $i -lt 30; $i++) {
    try {
      Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "http://127.0.0.1:$Port/api/auth/state" | Out-Null
      return $true
    } catch { Start-Sleep -Seconds 1 }
  }
  return $false
}

function Pause-Exit([int]$code) {
  Write-Host ''
  Read-Host 'Kapatmak için Enter''a basın' | Out-Null
  exit $code
}
