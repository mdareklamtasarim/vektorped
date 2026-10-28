# Downloads the newest version from GitHub and installs it over this folder.
# Data (data\) and backups (yedekler\) are never touched.
. (Join-Path $PSScriptRoot 'ortak.ps1')
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$url = 'https://github.com/mdareklamtasarim/vektorped/archive/refs/heads/muhasebe-stok.zip'
$tmp = Join-Path $env:TEMP ('muhasebe-guncelleme-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  Write-Host 'Yeni sürüm indiriliyor...'
  Invoke-WebRequest -UseBasicParsing $url -OutFile (Join-Path $tmp 'paket.zip')
  Expand-Archive (Join-Path $tmp 'paket.zip') -DestinationPath $tmp
  $src = Get-ChildItem $tmp -Directory | ForEach-Object { Join-Path $_.FullName 'muhasebe' } | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $src) { throw 'İndirilen pakette muhasebe klasörü bulunamadı.' }

  Stop-Muhasebe

  # Extra safety copy of the database before replacing the program files.
  $stamp = Get-Date -Format 'yyyy-MM-dd-HHmm'
  $backup = Join-Path $App 'yedekler'
  New-Item -ItemType Directory -Force -Path $backup | Out-Null
  foreach ($f in 'muhasebe.db', 'muhasebe.db-wal', 'muhasebe.db-shm') {
    $p = Join-Path $App "data\$f"
    if (Test-Path $p) { Copy-Item $p (Join-Path $backup "guncelleme-oncesi-$stamp-$f") }
  }

  robocopy $src $App /E /XD data yedekler /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "Dosyalar kopyalanamadı (robocopy $LASTEXITCODE)." }

  if (Start-Muhasebe) { Write-Host 'Güncelleme tamamlandı, program çalışıyor.' -ForegroundColor Green }
  else { Write-Host 'Güncellendi ama program başlamadı. windows\sunucu-kayit.txt dosyasına bakın.' -ForegroundColor Red }
} catch {
  Write-Host ('Güncelleme yapılamadı: ' + $_.Exception.Message) -ForegroundColor Red
  Start-Muhasebe | Out-Null
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
Pause-Exit 0
