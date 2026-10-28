# One-time setup: checks Node.js, makes the program start with Windows, starts it now
# and shares it over Tailscale with an HTTPS address for the phone.
. (Join-Path $PSScriptRoot 'ortak.ps1')

Write-Host '== Ön Muhasebe & Stok kurulumu ==' -ForegroundColor Cyan
Write-Host "Program klasörü: $App"

# 1. Node.js 22.13 or newer
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host 'Node.js kurulu değil. İndirme sayfası açılıyor: "LTS" sürümünü kurun, sonra bu dosyayı tekrar çalıştırın.' -ForegroundColor Yellow
  Start-Process 'https://nodejs.org/'
  Pause-Exit 1
}
$ver = [version]((& node -p 'process.versions.node').Trim())
if ($ver -lt [version]'22.13.0') {
  Write-Host "Node.js $ver eski. 22.13 veya üstü gerekli; nodejs.org'dan LTS sürümünü kurun." -ForegroundColor Yellow
  Start-Process 'https://nodejs.org/'
  Pause-Exit 1
}
Write-Host "Node.js $ver bulundu."

# 2. Start automatically when Windows starts (shortcut in the Startup folder)
$startup = [Environment]::GetFolderPath('Startup')
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut((Join-Path $startup 'Muhasebe.lnk'))
$lnk.TargetPath = 'wscript.exe'
$lnk.Arguments = '"' + $Hidden + '"'
$lnk.WorkingDirectory = $Here
$lnk.Description = 'Ön Muhasebe & Stok sunucusu'
$lnk.Save()
Write-Host 'Bilgisayar açılınca otomatik başlama ayarlandı.'

# 3. Start (or restart) the program
Stop-Muhasebe
if (Start-Muhasebe) {
  Write-Host "Program çalışıyor: http://localhost:$Port" -ForegroundColor Green
} else {
  Write-Host 'Program başlatılamadı. Ayrıntı için windows\sunucu-kayit.txt dosyasına bakın.' -ForegroundColor Red
  Pause-Exit 1
}

# 4. Tailscale: HTTPS address that the phone can reach from anywhere
$ts = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'
if (Test-Path $ts) {
  Write-Host ''
  Write-Host 'Tailscale ile telefon adresi hazırlanıyor. Bir bağlantı gösterilirse açıp "Enable" deyin.' -ForegroundColor Cyan
  & $ts serve --bg $Port
  Write-Host ''
  & $ts serve status
  Write-Host ''
  Write-Host 'Telefonda yukarıdaki https://....ts.net adresini açın (telefonda da Tailscale açık olmalı).' -ForegroundColor Green
} else {
  Write-Host ''
  Write-Host 'Tailscale kurulu değil. Telefondan erişim için kurun, aynı hesapla giriş yapın ve bu dosyayı tekrar çalıştırın.' -ForegroundColor Yellow
  Start-Process 'https://tailscale.com/download/windows'
}

Start-Process "http://localhost:$Port"
Pause-Exit 0
