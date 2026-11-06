# Sends the latest VektorPad cut job (ABDOPQR.pdf + ABDOPQR.plt) to CutArtist, the same way the Saga plug-in for CorelDRAW does:
#  - CutArtist closed:  CutArtist.exe -f <pdf> <plt>
#  - CutArtist open:    copy the files to ...\CommonPlugin and broadcast the "SAGA_FILE_UPDATE" window message.
# If newer *-saga.plt / *-saga.pdf files are in Downloads (saved from the browser or an iPad), those are used.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
function Say($t) { [System.Windows.Forms.MessageBox]::Show($t, 'VektorPad -> CutArtist') | Out-Null }
try {
  $docs = [Environment]::GetFolderPath('CommonDocuments')
  $saga = Join-Path $docs 'SagaCommonPlugin'
  $common = Join-Path $docs 'CommonPlugin'
  New-Item -ItemType Directory -Force $saga, $common | Out-Null
  $pdf = Join-Path $saga 'ABDOPQR.pdf'
  $plt = Join-Path $saga 'ABDOPQR.plt'

  # a newer job in Downloads wins
  $dl = Join-Path $env:USERPROFILE 'Downloads'
  $newPlt = Get-ChildItem $dl -Filter '*-saga.plt' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($newPlt -and (-not (Test-Path $plt) -or $newPlt.LastWriteTime -gt (Get-Item $plt).LastWriteTime)) {
    Copy-Item $newPlt.FullName $plt -Force
    $newPdf = Join-Path $dl ($newPlt.BaseName + '.pdf')
    if (Test-Path $newPdf) { Copy-Item $newPdf $pdf -Force }
  }
  if (-not (Test-Path $plt)) { Say 'Gonderilecek kesim isi yok. Once VektorPad''de Eklentiler > Saga Standart > CutArtist''e Gonder deyin.'; exit 1 }

  $exe = $null
  try { $exe = (Get-ItemProperty 'HKCU:\SOFTWARE\Saga\Saga' -ErrorAction Stop).path } catch { }
  if (-not $exe -or -not (Test-Path $exe)) { $exe = Join-Path $env:USERPROFILE 'IFENTA\CutArtist\CutArtist.exe' }

  if (Get-Process CutArtist -ErrorAction SilentlyContinue) {
    Copy-Item $plt (Join-Path $common 'ABDOPQR.plt') -Force
    if (Test-Path $pdf) { Copy-Item $pdf (Join-Path $common 'ABDOPQR.pdf') -Force }
    Add-Type -Namespace VPSaga -Name W -MemberDefinition @'
[DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern uint RegisterWindowMessage(string s);
[DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
'@
    $m = [VPSaga.W]::RegisterWindowMessage('SAGA_FILE_UPDATE')
    [void][VPSaga.W]::PostMessage([IntPtr]0xFFFF, $m, [IntPtr]::Zero, [IntPtr]::Zero)
  } else {
    if (-not (Test-Path $exe)) { Say 'CutArtist bulunamadi.'; exit 1 }
    Start-Process -FilePath $exe -ArgumentList @('-f', ('"' + $pdf + '"'), ('"' + $plt + '"'))
  }
} catch {
  Say ('Gonderilemedi: ' + $_.Exception.Message)
  exit 1
}
